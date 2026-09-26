"""
certify/views.py — Certificate lifecycle with branding / dual-approval / finalize.

Lifecycle:
  Draft → prepare (dataHash) → submitForApproval on-chain → Pending VC
       → VC approve → Pending Chancellor → Chancellor approve → Pending Finalize
       → generate PDF + pin → finalizeCertificate on-chain → Issued
"""

from django.conf import settings
from django.core.files.base import ContentFile
from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework import generics, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsFullSession, IsRegistrar, IsRegistrarOrAbove, IsAdminOrAbove
from audit.utils import log_action
from institutions.branding_views import _get_or_create_template
from institutions.pdf_certificate import generate_certificate_pdf

from accounts.signature_views import snapshot_signature_to_certificate
from .ipfs import fetch_file_from_ipfs, pin_file_to_ipfs, pin_json_to_ipfs
from .encrypted_documents import (
    DocumentEncryptionError,
    decrypt_document,
    document_sha256,
    encrypt_document,
    is_encrypted_document,
)
from .models import Certificate, CertificateStatus, FlowType, StudentInviteToken
from .serializers import (
    CertificateChainUpdateSerializer,
    CertificateCreateSerializer,
    CertificateDetailSerializer,
    CertificateListSerializer,
    CertificateRevokeSerializer,
    CertificateUploadDocumentSerializer,
    CertificateUploadAnchorSerializer,
)
from .utils import (
    build_certificate_json,
    compute_sha256_bytes,
    compute_sha256_json,
    generate_certificate_id,
)


# ── Shared student account helper ─────────────────────────────────────────────

def _get_or_create_student(email: str, student_name: str = "", institution=None):
    """
    Find an active student User by email, or create one automatically.

    When a registrar issues a certificate they provide the student's email.
    If that student already has a Credence account it's returned directly.
    Otherwise a minimal student account is auto-created so the certificate
    appears in their portal as soon as they sign up / claim an invite.

    The auto-created account has no usable password — the student gains access
    via the WhatsApp invite claim link (Google OAuth flow).

    Returns (user, created: bool).
    """
    from accounts.models import User, Role

    # Try to find existing student by email (case-insensitive)
    try:
        user = User.objects.get(email__iexact=email.strip(), role=Role.STUDENT)
        if not user.is_active:
            user.is_active = True
            user.save(update_fields=["is_active"])
        return user, False
    except User.DoesNotExist:
        pass

    # Parse a first / last name from the full name string
    parts = (student_name or "").strip().split()
    first_name = parts[0] if parts else email.split("@")[0].capitalize()
    last_name  = " ".join(parts[1:]) if len(parts) > 1 else ""

    user = User(
        email=email.strip().lower(),
        first_name=first_name,
        last_name=last_name,
        role=Role.STUDENT,
        is_active=True,
        institution=institution,
    )
    user.set_unusable_password()   # login only via invite claim / Google OAuth
    user.save()
    return user, True


# ── Student issuance notification ─────────────────────────────────────────────

def notify_student_issued(cert: Certificate, *, force: bool = False) -> dict:
    """
    Called once a certificate reaches ISSUED status (or on resend).

    1. Creates a StudentInviteToken — unless an unexpired one already exists.
       An active claim link is never silently replaced: the raw token exists
       only at creation time, so minting a new one would invalidate a link the
       student may already be holding. Pass force=True (the resend endpoint)
       to rotate the link deliberately.
    2. Builds a claim URL and a wa.me share link for the registrar.

    Optionally (when WHATSAPP_ENABLED=True + Twilio configured + phone stored):
      3. Sends a WhatsApp message directly to the student's phone via Twilio.

    Returns a dict:
        {
            "claim_url":       str,   — the direct student login link
            "wa_url":          str,   — pre-composed wa.me link for the registrar
            "wa_body":         str,   — the plain-text message body
            "twilio_sent":     bool,  — True only if Twilio accepted the message
            "invite_created":  bool,  — False when an active link was kept
            "invite_expires_at": str, — ISO expiry of the token in play
        }
    Failures never raise — issuance must not be blocked.
    """
    import logging
    import urllib.parse
    logger = logging.getLogger(__name__)

    result = {
        "claim_url": "", "wa_url": "", "wa_body": "", "twilio_sent": False,
        "invite_created": False, "invite_expires_at": "",
    }

    if not cert.student_id:
        logger.info("notify_student_issued: cert %s has no student FK — skipping.", cert.certificate_id)
        return result

    student = cert.student
    if not student:
        return result

    # ── Reuse an active claim link rather than replacing it ─────────────────
    if not force:
        active = (
            StudentInviteToken.objects.filter(certificate=cert, used=False)
            .filter(expires_at__gt=timezone.now())
            .order_by("-created_at")
            .first()
        )
        if active:
            result["invite_expires_at"] = active.expires_at.isoformat()
            logger.info(
                "notify_student_issued: %s already has an active claim link until %s — kept.",
                cert.certificate_id, active.expires_at.isoformat(),
            )
            return result

    # ── Create the invite token ─────────────────────────────────────────────
    try:
        token_obj, raw_token = StudentInviteToken.create_for_certificate(cert)
    except Exception:
        logger.exception("notify_student_issued: failed to create invite token for %s", cert.certificate_id)
        return result

    result["invite_created"] = True
    result["invite_expires_at"] = token_obj.expires_at.isoformat()

    frontend  = getattr(settings, "FRONTEND_URL", "http://localhost:3000").rstrip("/")
    ttl_hours = getattr(settings, "STUDENT_INVITE_TTL_HOURS", 24)
    claim_url = f"{frontend}/student-invite?token={raw_token}"

    # ── Build the message body (used for both Twilio and wa.me) ───────────────
    body = (
        f"Hello {student.first_name},\n\n"
        f"Your *{cert.degree_title}* certificate from {cert.institution.name} "
        f"has been issued on the Credence blockchain platform.\n\n"
        f"Tap the link below to access your certificate "
        f"(valid for {ttl_hours} hours):\n"
        f"{claim_url}\n\n"
        f"After opening the link you can log in with Google to keep permanent access.\n\n"
        f"— Credence"
    )

    wa_url = f"https://wa.me/?text={urllib.parse.quote(body)}"

    result["claim_url"] = claim_url
    result["wa_url"]    = wa_url
    result["wa_body"]   = body

    # ── Optional: Twilio direct send ──────────────────────────────────────────
    phone = getattr(student, "phone_number", "").strip()
    if phone:
        from notifications.whatsapp import send_whatsapp
        sent = send_whatsapp(to=phone, body=body)
        result["twilio_sent"] = sent
        token_obj.whatsapp_sent = sent
        token_obj.save(update_fields=["whatsapp_sent"])
    else:
        logger.info(
            "notify_student_issued: no phone for %s — Twilio skipped, wa.me link available.",
            student.email,
        )

    log_action(
        actor=None,
        action="certificate.student_notified",
        target_type="Certificate",
        target_id=str(cert.id),
        detail=(
            f"Invite token created for {cert.certificate_id}. "
            f"Twilio sent={result['twilio_sent']}. "
            f"Student: {student.email}."
        ),
    )
    return result


# ── List / Create ─────────────────────────────────────────────────────────────

class CertificateListCreateView(generics.ListCreateAPIView):
    """
    GET  — Registrar/Admin/VC/Chancellor: list certificates scoped to their institution
    POST — Registrar only: create a Draft certificate
    """
    def get_permissions(self):
        if self.request.method == "POST":
            return [IsRegistrar()]
        return [IsRegistrarOrAbove()]

    def get_serializer_class(self):
        return CertificateCreateSerializer if self.request.method == "POST" else CertificateListSerializer

    def get_queryset(self):
        from accounts.models import Role
        user = self.request.user
        qs   = Certificate.objects.select_related("institution", "issued_by", "student")

        if user.role != Role.SUPER_ADMIN:
            qs = qs.filter(institution=user.institution)

        status_param = self.request.query_params.get("status")
        if status_param:
            qs = qs.filter(status=status_param)

        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(certificate_id__icontains=search) | qs.filter(student_name__icontains=search)

        return qs.order_by("-created_at")

    def perform_create(self, serializer):
        user        = self.request.user
        institution = user.institution
        year        = timezone.now().year
        short       = institution.short_name or institution.institution_id

        # Generate a high-entropy, non-sequential ID.
        # Retry on the extremely unlikely collision (2^32 space per institution/year).
        for _attempt in range(5):
            cert_id = generate_certificate_id(short, year)
            if not Certificate.objects.filter(certificate_id=cert_id).exists():
                break
        else:
            # Fallback: should statistically never happen
            import secrets as _s
            cert_id = f"CR-{year}-{short.upper()}-{_s.token_hex(6).upper()}"
        template = _get_or_create_template(institution)
        registrar_name = user.full_name or user.get_full_name() or "Registrar"

        # Respect flow_type sent by the frontend (default: system_designed)
        from .models import FlowType
        flow_type = self.request.data.get("flow_type", FlowType.SYSTEM_DESIGNED)
        # Validate flow_type is one of the three supported flows
        valid_flows = (
            FlowType.SYSTEM_DESIGNED,      # Design with Credence
            FlowType.FULL_UPLOAD,          # Upload both
            FlowType.TRANSCRIPT_THEN_CERT  # Transcript first
        )
        if flow_type not in valid_flows:
            flow_type = FlowType.SYSTEM_DESIGNED

        certificate = serializer.save(
            institution=institution,
            issued_by=user,
            certificate_id=cert_id,
            status=CertificateStatus.DRAFT,
            branding_preset=template.preset,
            registrar_signer_name=registrar_name,
            flow_type=flow_type,
        )

        # Auto-link (or auto-create) the student account by email.
        # If a student with this email exists, link them. If not, create a
        # minimal account so the cert appears in their portal once they sign up.
        try:
            student_user, student_created = _get_or_create_student(
                email=certificate.student_email,
                student_name=certificate.student_name,
                institution=institution,
            )
            certificate.student = student_user
            certificate.save(update_fields=["student"])
            if student_created:
                log_action(
                    actor=user,
                    action="student.auto_created",
                    target_type="User",
                    target_id=str(student_user.id),
                    detail=(
                        f"Student account auto-created for {certificate.student_email} "
                        f"during certificate {cert_id} issuance."
                    ),
                )
        except Exception:
            pass  # never block issuance — student link is non-critical

        log_action(
            actor=user,
            action="certificate.created",
            target_type="Certificate",
            target_id=str(certificate.id),
            detail=f"Draft certificate created: {cert_id} (flow: {flow_type})",
        )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        cert = Certificate.objects.select_related(
            "institution", "institution__certificate_template", "issued_by",
        ).get(pk=serializer.instance.pk)
        return Response(
            CertificateDetailSerializer(cert, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


# ── Detail ────────────────────────────────────────────────────────────────────

class CertificateDetailView(generics.RetrieveAPIView):
    permission_classes = [IsRegistrarOrAbove]
    serializer_class   = CertificateDetailSerializer
    http_method_names  = ["get", "head", "options"]

    def get_queryset(self):
        from accounts.models import Role
        user = self.request.user
        qs = Certificate.objects.select_related(
            "institution", "institution__certificate_template", "issued_by", "student",
        )
        if user.role != Role.SUPER_ADMIN:
            qs = qs.filter(institution=user.institution)
        return qs

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["request"] = self.request
        return ctx


# ── Upload PDF (legacy — optional; final PDF is generated at finalize) ────────

class CertificateUploadDocumentView(APIView):
    """POST /api/certificates/<id>/upload-document/ — legacy optional upload."""
    permission_classes = [IsRegistrar]
    parser_classes     = [MultiPartParser, FormParser]

    def post(self, request, pk):
        cert = get_object_or_404(Certificate, pk=pk, institution=request.user.institution)
        if cert.status != CertificateStatus.DRAFT:
            return Response({"detail": "Only Draft certificates can have a document uploaded."},
                            status=status.HTTP_400_BAD_REQUEST)

        s = CertificateUploadDocumentSerializer(cert, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        pdf_bytes = s.validated_data["document_file"].read()
        encrypted = encrypt_document(pdf_bytes, cert.certificate_id, "certificate")
        cert.document_file.save(
            f"{cert.certificate_id}.pdf.enc", ContentFile(encrypted), save=False
        )
        cert.save(update_fields=["document_file", "updated_at"])

        log_action(actor=request.user, action="certificate.document_uploaded",
                   target_type="Certificate", target_id=str(cert.id),
                   detail=f"PDF uploaded for {cert.certificate_id}")

        return Response(CertificateDetailSerializer(cert, context={"request": request}).data)


# ── Prepare: dataHash only (no PDF / IPFS yet) ────────────────────────────────

class CertificatePrepareView(APIView):
    """
    POST /api/certificates/<id>/prepare/

    Renders the review document, hashes it, encrypts it and pins it. The
    review rendering carries no signature block, so its bytes are fixed here,
    before any officer approves anything.

    Returns both hashes for MetaMask submitForSealedReview(certId, dataHash,
    reviewDocHash). Officers then approve exactly the document that was
    rendered. The issued document, which adds the signature block, is produced
    and committed separately by /finalize/.
    """
    permission_classes = [IsRegistrar]

    def post(self, request, pk):
        cert = get_object_or_404(Certificate, pk=pk, institution=request.user.institution)

        if cert.status != CertificateStatus.DRAFT:
            return Response({"detail": "Only Draft certificates can be prepared."},
                            status=status.HTTP_400_BAD_REQUEST)

        template = _get_or_create_template(cert.institution)
        cert.branding_preset = template.preset

        cert_json = build_certificate_json(cert)
        cert_hash = compute_sha256_json(cert_json)

        frontend = getattr(settings, "FRONTEND_URL", "http://localhost:3000")

        try:
            review_bytes = generate_certificate_pdf(
                cert,
                template=template,
                verification_base_url=frontend,
                include_attestations=False,
            )
        except RuntimeError as e:
            return Response({"detail": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        review_hash = document_sha256(review_bytes)

        filename = f"{cert.certificate_id}-review.pdf"
        encrypted_review = encrypt_document(review_bytes, cert.certificate_id, "certificate-review")

        try:
            review_result = pin_file_to_ipfs(
                ContentFile(encrypted_review, name=f"{filename}.enc"),
                f"{filename}.enc",
                cert.certificate_id,
                content_type="application/octet-stream",
            )
            json_result = pin_json_to_ipfs(cert_json, cert.certificate_id)
        except RuntimeError as e:
            return Response(
                {"detail": f"IPFS pinning failed: {str(e)}"},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        cert.cert_hash = cert_hash
        # doc_hash is the reviewed document. It is never rewritten, so an
        # officer approval always refers to these exact bytes.
        cert.doc_hash = review_hash
        cert.ipfs_cid_pdf = review_result["cid"]
        cert.ipfs_url_pdf = review_result["ipfs_url"]
        cert.ipfs_cid_json = json_result["cid"]
        cert.ipfs_url_json = json_result["ipfs_url"]
        cert.status = CertificateStatus.PENDING_VC
        cert.save()

        log_action(
            actor=request.user,
            action="certificate.prepared",
            target_type="Certificate",
            target_id=str(cert.id),
            detail=(
                f"Review document rendered and hashed for {cert.certificate_id}. "
                f"Awaiting submitForSealedReview on-chain + VC approval."
            ),
        )

        return Response({
            "certificate_id": cert.certificate_id,
            "cert_hash":      cert_hash,
            "doc_hash":       review_hash,
            "cert_json":      cert_json,
            "branding_preset": cert.branding_preset,
            "status":         cert.status,
            "requires_seal":  True,
            "ipfs_cid_json":  json_result["cid"],
            "ipfs_cid_pdf":   review_result["cid"],
            "ipfs_url_json":  json_result["ipfs_url"],
            "ipfs_url_pdf":   review_result["ipfs_url"],
            "message": (
                "Review document rendered, hashed and pinned. Submit on-chain with "
                "submitForSealedReview, then VC and Dean approve the review copy. "
                "The issued document is sealed after both approvals."
            ),
        })


# ── Confirm on-chain submit ───────────────────────────────────────────────────

class CertificateConfirmChainView(APIView):
    """
    POST /api/certificates/<id>/confirm-chain/
    After MetaMask submitForApproval — stays Pending VC.
    """
    permission_classes = [IsRegistrar]

    def post(self, request, pk):
        cert = get_object_or_404(Certificate, pk=pk, institution=request.user.institution)

        # Allow recovery of records approved off-chain before submitForApproval
        # was made mandatory, including records left at pending_finalize.
        allowed_statuses = (
            CertificateStatus.PENDING_VC,
            CertificateStatus.PENDING,
            CertificateStatus.PENDING_FINALIZE,
        )
        if cert.flow_type in (FlowType.FULL_UPLOAD, FlowType.TRANSCRIPT_THEN_CERT):
            allowed_statuses += (CertificateStatus.DRAFT,)
        if cert.status not in allowed_statuses:
            return Response(
                {"detail": "Only certificates awaiting VC approval can record the submit tx."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        s = CertificateChainUpdateSerializer(cert, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        if not cert.tx_hash:
            # These approvals may only exist in Django from the old off-chain
            # workflow. They must be repeated against the newly submitted chain record.
            cert.vc_approved_at = None
            cert.vc_approval_tx_hash = ""
            cert.vc_approver_name = ""
            cert.vc_signature_image = None
            cert.chancellor_approved_at = None
            cert.chancellor_approval_tx_hash = ""
            cert.chancellor_approver_name = ""
            cert.chancellor_signature_image = None
        cert.tx_hash = s.validated_data.get("tx_hash", cert.tx_hash)
        if "block_number" in s.validated_data:
            cert.block_number = s.validated_data["block_number"]
        if not cert.registrar_signer_name:
            cert.registrar_signer_name = (
                request.user.full_name or request.user.get_full_name() or "Registrar"
            )
        snapshot_signature_to_certificate(request.user, cert, "registrar_signature_image")
        cert.registrar_signed_at = timezone.now()
        cert.status = CertificateStatus.PENDING_VC
        cert.save()

        log_action(
            actor=request.user,
            action="certificate.submitted_on_chain",
            target_type="Certificate",
            target_id=str(cert.id),
            detail=f"Submitted for approval on-chain. Tx: {cert.tx_hash}",
        )
        return Response(CertificateDetailSerializer(cert, context={"request": request}).data)


class CertificateConfirmVCView(APIView):
    """POST /api/certificates/<id>/confirm-vc/ — after approveAsVC MetaMask tx."""
    permission_classes = [IsFullSession]

    def post(self, request, pk):
        from accounts.models import Role
        if request.user.role != Role.VC:
            return Response({"detail": "Only VC may confirm this step."}, status=status.HTTP_403_FORBIDDEN)

        cert = get_object_or_404(Certificate, pk=pk, institution=request.user.institution)
        if not cert.tx_hash:
            return Response(
                {"detail": "Registrar must submit this certificate on-chain before VC approval."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if cert.status != CertificateStatus.PENDING_VC:
            return Response({"detail": "Certificate is not awaiting VC approval."},
                            status=status.HTTP_400_BAD_REQUEST)
        # The officer attests to a specific document. Refuse if the review copy
        # was never rendered, so an approval can never be a bare acknowledgement
        # of data with no document behind it.
        if not cert.doc_hash:
            return Response(
                {"detail": "No review document to approve. Run prepare first."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        tx_hash = request.data.get("tx_hash", "").strip()
        
        if not tx_hash:
            return Response(
                {"detail": "MetaMask transaction hash is required for attestation."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if tx_hash and (not tx_hash.startswith("0x") or len(tx_hash) != 66):
            return Response(
                {"detail": "Invalid transaction hash format. Must be 0x followed by 64 hex characters."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        cert.vc_approved_at = timezone.now()
        cert.vc_approval_tx_hash = tx_hash
        cert.vc_approver_name = request.user.full_name or request.user.get_full_name() or "Vice Chancellor"
        snapshot_signature_to_certificate(request.user, cert, "vc_signature_image")
        cert.status = CertificateStatus.PENDING_CHANCELLOR
        cert.save()

        log_action(
            actor=request.user,
            action="certificate.vc_approved",
            target_type="Certificate",
            target_id=str(cert.id),
            detail=f"VC approved {cert.certificate_id}. Tx: {tx_hash}",
        )
        return Response(CertificateDetailSerializer(cert, context={"request": request}).data)


class CertificateConfirmChancellorView(APIView):
    """
    POST /api/certificates/<id>/confirm-chancellor/ — after approveAsChancellor.
    Moves to pending_finalize (final PDF + on-chain finalize still required).
    """
    permission_classes = [IsFullSession]

    def post(self, request, pk):
        from accounts.models import Role
        if request.user.role != Role.CHANCELLOR:
            return Response({"detail": "Only Dean may confirm this step."},
                            status=status.HTTP_403_FORBIDDEN)

        cert = get_object_or_404(Certificate, pk=pk, institution=request.user.institution)
        if not cert.tx_hash:
            return Response(
                {"detail": "Registrar must submit this certificate on-chain before Dean approval."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if cert.status != CertificateStatus.PENDING_CHANCELLOR:
            return Response({"detail": "Certificate is not awaiting Dean approval."},
                            status=status.HTTP_400_BAD_REQUEST)

        tx_hash = request.data.get("tx_hash", "").strip()
        
        if not tx_hash:
            return Response(
                {"detail": "MetaMask transaction hash is required for attestation."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if tx_hash and (not tx_hash.startswith("0x") or len(tx_hash) != 66):
            return Response(
                {"detail": "Invalid transaction hash format. Must be 0x followed by 64 hex characters."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Verify VC has already approved with MetaMask
        if not cert.vc_approved_at:
            return Response(
                {"detail": "VC must approve with MetaMask attestation before Dean approval."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not cert.doc_hash:
            return Response(
                {"detail": "No review document to approve. Run prepare first."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        cert.chancellor_approved_at = timezone.now()
        cert.chancellor_approval_tx_hash = tx_hash
        cert.chancellor_approver_name = (
            request.user.full_name or request.user.get_full_name() or "Dean"
        )
        snapshot_signature_to_certificate(request.user, cert, "chancellor_signature_image")
        cert.status = CertificateStatus.PENDING_FINALIZE
        cert.save()

        log_action(
            actor=request.user,
            action="certificate.dean_approved",
            target_type="Certificate",
            target_id=str(cert.id),
            detail=(
                f"Dean approved {cert.certificate_id}. "
                f"Awaiting final PDF + finalizeCertificate. Tx: {tx_hash}"
            ),
        )
        return Response(CertificateDetailSerializer(cert, context={"request": request}).data)


# ── Finalize: generate PDF, hash, pin, return payload for MetaMask ────────────

class CertificateFinalizeView(APIView):
    """
    POST /api/certificates/<id>/finalize/

    After dual approval: render the issued document, which is the review copy
    with the signature block filled in, hash it, encrypt it and pin it. The
    reviewed document is left untouched.

    Returns payload for MetaMask finalizeWithSealedDocument(certId, sealedHash).
    """
    permission_classes = [IsRegistrar]

    def post(self, request, pk):
        cert = get_object_or_404(Certificate, pk=pk, institution=request.user.institution)

        if cert.status != CertificateStatus.PENDING_FINALIZE:
            return Response(
                {"detail": "Certificate must be pending finalize (both approvals done)."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not cert.cert_hash:
            return Response({"detail": "Missing dataHash — prepare the certificate first."},
                            status=status.HTTP_400_BAD_REQUEST)
        if not cert.doc_hash:
            return Response(
                {"detail": "No review document on record — prepare the certificate first."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        template = _get_or_create_template(cert.institution)
        frontend = getattr(settings, "FRONTEND_URL", "http://localhost:3000")

        try:
            pdf_bytes = generate_certificate_pdf(
                cert,
                template=template,
                verification_base_url=frontend,
                include_attestations=True,
            )
        except RuntimeError as e:
            return Response({"detail": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        sealed_hash = document_sha256(pdf_bytes)
        # The sealed document is a distinct rendering of the same credential, so
        # its hash must differ from the reviewed one. Equal hashes would mean the
        # signature block was dropped somewhere.
        if sealed_hash == cert.doc_hash:
            return Response(
                {"detail": "Issued document is byte-identical to the review copy. "
                           "Check that the officers' signatures are present."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # Persist the issued PDF locally as the document of record.
        filename = f"{cert.certificate_id}.pdf"
        encrypted_pdf = encrypt_document(pdf_bytes, cert.certificate_id, "certificate")
        cert.document_file.save(
            f"{filename}.enc", ContentFile(encrypted_pdf), save=False
        )

        try:
            pdf_result = pin_file_to_ipfs(
                ContentFile(encrypted_pdf, name=f"{filename}.enc"),
                f"{filename}.enc",
                cert.certificate_id,
                content_type="application/octet-stream",
            )
        except RuntimeError as e:
            return Response(
                {"detail": f"IPFS pinning failed: {str(e)}"},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        cert.sealed_doc_hash = sealed_hash
        cert.ipfs_cid_sealed_pdf = pdf_result["cid"]
        cert.ipfs_url_sealed_pdf = pdf_result["ipfs_url"]
        cert.save()

        log_action(
            actor=request.user,
            action="certificate.sealed_off_chain",
            target_type="Certificate",
            target_id=str(cert.id),
            detail=(
                f"Issued document rendered & pinned for {cert.certificate_id}. "
                f"Awaiting finalizeWithSealedDocument on-chain."
            ),
        )

        return Response({
            "certificate_id": cert.certificate_id,
            "cert_hash":      cert.cert_hash,
            "doc_hash":       cert.doc_hash,
            "sealed_doc_hash": sealed_hash,
            "ipfs_cid_sealed_pdf": pdf_result["cid"],
            "ipfs_url_sealed_pdf": pdf_result["ipfs_url"],
            "status":         cert.status,
            "requires_seal":  True,
            "message": (
                "Issued document ready. Sign finalizeWithSealedDocument with "
                "MetaMask to anchor the sealed hash and issue."
            ),
        })


class CertificateConfirmFinalizeView(APIView):
    """
    POST /api/certificates/<id>/confirm-finalize/ — after the final anchoring tx.

    System-designed flow: the anchored hash is the sealed one, so that is what
    must exist here. Upload-based flows anchor the document that was reviewed.
    """
    permission_classes = [IsRegistrar]

    def post(self, request, pk):
        cert = get_object_or_404(Certificate, pk=pk, institution=request.user.institution)

        if cert.status != CertificateStatus.PENDING_FINALIZE:
            return Response(
                {"detail": "Certificate is not awaiting on-chain finalize."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        
        if not cert.vc_approval_tx_hash or not cert.chancellor_approval_tx_hash:
            return Response(
                {"detail": "Both VC and Dean MetaMask attestations are required before finalization."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if cert.requires_sealed_document:
            if not cert.sealed_doc_hash or not cert.ipfs_cid_sealed_pdf:
                return Response(
                    {"detail": "Run finalize (render and pin the issued document) "
                               "before confirming the chain tx."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        elif not cert.doc_hash or not cert.ipfs_cid_pdf:
            return Response(
                {"detail": "Run finalize (generate PDF + pin) before confirming the chain tx."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        tx_hash = request.data.get("tx_hash", "").strip()
        
        # Validate finalize tx_hash
        if not tx_hash:
            return Response(
                {"detail": "MetaMask transaction hash is required for finalization."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not tx_hash.startswith("0x") or len(tx_hash) != 66:
            return Response(
                {"detail": "Invalid transaction hash format. Must be 0x followed by 64 hex characters."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        block_number = request.data.get("block_number")
        cert.finalize_tx_hash = tx_hash
        if block_number is not None:
            cert.block_number = block_number
        cert.status = CertificateStatus.ISSUED
        cert.chain_issued_at = timezone.now()
        cert.save()

        log_action(
            actor=request.user,
            action="certificate.issued",
            target_type="Certificate",
            target_id=str(cert.id),
            detail=f"Finalized on-chain — issued {cert.certificate_id}. Tx: {tx_hash}",
        )

        # Notify student — always creates invite token + wa.me link; Twilio if configured
        notify_student_issued(cert)

        return Response(CertificateDetailSerializer(cert, context={"request": request}).data)


# ── Upload & Anchor (external-upload flow) ───────────────────────────────────

class CertificateUploadAndAnchorView(APIView):
    """
    POST /api/certificates/<id>/upload-and-anchor/

    Upload-based flows only (flow_type in full_upload, transcript_then_cert).

    Accepts a pre-signed PDF, then:
      1. Saves the file locally and to the certificate record.
      2. Computes SHA-256 of the PDF (doc_hash).
      3. Computes SHA-256 of the canonical JSON (cert_hash / dataHash).
      4. Pins PDF + JSON to IPFS.
      5. Moves status to pending_vc.
      6. Returns payload for the registrar's MetaMask submit.

    The returned hashes are what the registrar commits on-chain, so the officers
    review these exact bytes. With a transcript this is submitCredentialForApproval
    (the paired path) and finalizeCredential; without one it is
    submitDocumentForApproval and finalizeCertificate. The document hashes are
    already final — an upload cannot be edited after this point — so they never
    change again, and the contract rejects a finalize that supplies a different
    hash.

    Both officers still approve: the upload is not a shortcut around VC and Dean
    review. Only after both sign does the registrar run the final anchoring
    transaction and POST /confirm-finalize/.
    """
    permission_classes = [IsRegistrar]
    parser_classes     = [MultiPartParser, FormParser]

    def post(self, request, pk):
        cert = get_object_or_404(Certificate, pk=pk, institution=request.user.institution)

        # Allow upload for the two upload-based flows
        allowed_flows = ("full_upload", "transcript_then_cert")
        if cert.flow_type not in allowed_flows:
            return Response(
                {"detail": f"This endpoint is only for upload-based certificates ({', '.join(allowed_flows)}). "
                           "Use /prepare/ for system-designed certificates."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if cert.status != CertificateStatus.DRAFT:
            return Response(
                {"detail": "Only Draft certificates can be uploaded."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        s = CertificateUploadAnchorSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        if cert.flow_type == "full_upload" and not s.validated_data.get("transcript_file"):
            return Response(
                {"detail": "Full Upload requires both a certificate PDF and a transcript PDF."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        pdf_file = s.validated_data["document_file"]
        pdf_bytes = pdf_file.read()
        
        # Handle optional transcript file for full_upload flow
        transcript_file = s.validated_data.get("transcript_file")
        transcript_cid = None
        transcript_url = None
        transcript_hash = None
        
        if transcript_file and cert.flow_type == "full_upload":
            transcript_bytes = transcript_file.read()
            transcript_hash = document_sha256(transcript_bytes)
            transcript_filename = f"{cert.certificate_id}-transcript.pdf.enc"
            encrypted_transcript = encrypt_document(
                transcript_bytes, cert.certificate_id, "transcript"
            )
            # Pin transcript to IPFS
            try:
                transcript_result = pin_file_to_ipfs(
                    ContentFile(encrypted_transcript, name=transcript_filename),
                    transcript_filename,
                    cert.certificate_id,
                    content_type="application/octet-stream",
                )
                transcript_cid = transcript_result["cid"]
                transcript_url = transcript_result["ipfs_url"]
            except RuntimeError as e:
                return Response(
                    {"detail": f"Transcript IPFS pinning failed: {str(e)}"},
                    status=status.HTTP_502_BAD_GATEWAY,
                )

        # Compute hashes
        doc_hash  = document_sha256(pdf_bytes)
        cert_json = build_certificate_json(cert)
        cert_hash = compute_sha256_json(cert_json)

        # Save the uploaded file
        filename = f"{cert.certificate_id}-uploaded.pdf"
        encrypted_pdf = encrypt_document(pdf_bytes, cert.certificate_id, "certificate")
        cert.document_file.save(
            f"{filename}.enc", ContentFile(encrypted_pdf), save=False
        )

        # Pin to IPFS
        try:
            pdf_result  = pin_file_to_ipfs(
                ContentFile(encrypted_pdf, name=f"{filename}.enc"),
                f"{filename}.enc",
                cert.certificate_id,
                content_type="application/octet-stream",
            )
            json_result = pin_json_to_ipfs(cert_json, cert.certificate_id)
        except RuntimeError as e:
            return Response(
                {"detail": f"IPFS pinning failed: {str(e)}"},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        # Update certificate record
        cert.cert_hash        = cert_hash
        cert.doc_hash         = doc_hash
        cert.ipfs_cid_pdf     = pdf_result["cid"]
        cert.ipfs_url_pdf     = pdf_result["ipfs_url"]
        cert.ipfs_cid_json    = json_result["cid"]
        cert.ipfs_url_json    = json_result["ipfs_url"]
        if transcript_cid and transcript_url:
            cert.transcript_hash = transcript_hash
            cert.ipfs_cid_transcript = transcript_cid
            cert.ipfs_url_transcript = transcript_url
        cert.branding_preset  = "external_upload"
        # Documents are prepared, but the registrar has not yet submitted the
        # certificate on-chain. Keep it as Draft until confirm-chain.
        # Let officers review the uploaded credential before its final chain
        # anchor; do not leave it stuck waiting for registrar MetaMask.
        cert.status = CertificateStatus.PENDING_VC
        cert.save()

        log_action(
            actor=request.user,
            action="certificate.uploaded_and_hashed",
            target_type="Certificate",
            target_id=str(cert.id),
            detail=(
                f"Upload documents pinned for {cert.certificate_id}. "
                f"Ready for registrar submission on-chain, then VC and Dean review."
            ),
        )

        response_data = {
            "certificate_id": cert.certificate_id,
            "cert_hash":      cert_hash,
            "doc_hash":       doc_hash,
            "ipfs_cid_json":  json_result["cid"],
            "ipfs_cid_pdf":   pdf_result["cid"],
            "ipfs_url_json":  json_result["ipfs_url"],
            "ipfs_url_pdf":   pdf_result["ipfs_url"],
            "status":         cert.status,
            "message": (
                "Certificate and transcript uploaded and pinned to IPFS. "
                "The files are pinned. Submit the credential on-chain before VC and Dean approval."
            ),
        }
        
        # Add transcript info if present. The transcript hash has to reach the
        # client: the registrar submits the hash pair on-chain so the officers
        # approve the exact documents, and submitCredentialForApproval needs it.
        if transcript_cid and transcript_url:
            response_data.update({
                "transcript_hash":    transcript_hash,
                "ipfs_cid_transcript": transcript_cid,
                "ipfs_url_transcript": transcript_url,
            })

        return Response(response_data)


class CertificateUploadTranscriptView(APIView):
    """Attach a missing transcript to a certificate that has not been issued.

    The transcript hash has to be committed on-chain with the rest of the
    document pair, otherwise the officers approve a credential that does not
    include the transcript and the issued credential carries a document no one
    reviewed and no hash ever anchored. So a transcript may only be attached
    before the certificate has been submitted on-chain; the document set is
    frozen at that point.
    """
    permission_classes = [IsRegistrar]
    parser_classes     = [MultiPartParser, FormParser]

    def post(self, request, pk):
        cert = get_object_or_404(Certificate, pk=pk, institution=request.user.institution)
        transcript_allowed_statuses = (
            CertificateStatus.PENDING,
            CertificateStatus.DRAFT,
            CertificateStatus.PENDING_VC,
            CertificateStatus.PENDING_CHANCELLOR,
            CertificateStatus.PENDING_FINALIZE,
        )
        if cert.status not in transcript_allowed_statuses:
            return Response({"detail": "A transcript can only be attached before the credential is issued."}, status=status.HTTP_400_BAD_REQUEST)
        if cert.transcript_hash:
            return Response({"detail": "This credential already has a transcript."}, status=status.HTTP_400_BAD_REQUEST)
        if cert.tx_hash:
            return Response(
                {
                    "detail": (
                        "This certificate was already submitted on-chain, so the reviewed "
                        "document set is fixed. Attaching a transcript now would issue a "
                        "document the VC and Dean never approved and whose hash is not "
                        "anchored. Attach the transcript first, then submit the certificate "
                        "on-chain."
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        transcript_file = request.FILES.get("transcript_file")
        if not transcript_file:
            return Response({"detail": "Choose a transcript PDF to upload."}, status=status.HTTP_400_BAD_REQUEST)
        if transcript_file.size > 20 * 1024 * 1024 or not transcript_file.name.lower().endswith(".pdf"):
            return Response({"detail": "Transcript must be a PDF under 20 MB."}, status=status.HTTP_400_BAD_REQUEST)

        transcript_bytes = transcript_file.read()
        filename = f"{cert.certificate_id}-transcript.pdf"
        encrypted_transcript = encrypt_document(
            transcript_bytes, cert.certificate_id, "transcript"
        )
        try:
            result = pin_file_to_ipfs(
                ContentFile(encrypted_transcript, name=f"{filename}.enc"),
                f"{filename}.enc",
                cert.certificate_id,
                content_type="application/octet-stream",
            )
        except RuntimeError as e:
            return Response({"detail": f"Transcript IPFS pinning failed: {str(e)}"}, status=status.HTTP_502_BAD_GATEWAY)

        cert.transcript_hash = document_sha256(transcript_bytes)
        cert.ipfs_cid_transcript = result["cid"]
        cert.ipfs_url_transcript = result["ipfs_url"]
        cert.save(update_fields=["transcript_hash", "ipfs_cid_transcript", "ipfs_url_transcript", "updated_at"])
        log_action(actor=request.user, action="certificate.transcript_attached", target_type="Certificate", target_id=str(cert.id), detail=f"Transcript attached to {cert.certificate_id}")
        return Response(CertificateDetailSerializer(cert, context={"request": request}).data)


# ── Revoke ────────────────────────────────────────────────────────────────────

class CertificateRevokeView(APIView):
    """POST /api/certificates/<id>/revoke/"""
    permission_classes = [IsRegistrarOrAbove]

    def post(self, request, pk):
        from accounts.models import Role
        cert = get_object_or_404(Certificate, pk=pk)

        if request.user.role != Role.SUPER_ADMIN and cert.institution != request.user.institution:
            return Response(status=status.HTTP_403_FORBIDDEN)
        if cert.status == CertificateStatus.REVOKED:
            return Response({"detail": "Certificate is already revoked."},
                            status=status.HTTP_400_BAD_REQUEST)
        if cert.status != CertificateStatus.ISSUED:
            return Response({"detail": "Only Issued certificates can be revoked."},
                            status=status.HTTP_400_BAD_REQUEST)

        s = CertificateRevokeSerializer(data=request.data)
        s.is_valid(raise_exception=True)

        cert.status             = CertificateStatus.REVOKED
        cert.revoked_by         = request.user
        cert.revocation_reason  = s.validated_data["reason"]
        cert.revocation_tx_hash = s.validated_data["revocation_tx_hash"]
        cert.revoked_at         = timezone.now()
        cert.save()

        log_action(
            actor=request.user,
            action="certificate.revoked",
            target_type="Certificate",
            target_id=str(cert.id),
            detail=f"Certificate {cert.certificate_id} revoked. Reason: {cert.revocation_reason}",
        )
        return Response(CertificateDetailSerializer(cert, context={"request": request}).data)


# ── Student portal ────────────────────────────────────────────────────────────

class StudentCertificatesView(generics.ListAPIView):
    """GET /api/my-certificates/"""
    permission_classes = [IsFullSession]
    serializer_class   = CertificateListSerializer

    def get_queryset(self):
        return Certificate.objects.filter(
            student=self.request.user,
            status__in=[CertificateStatus.ISSUED, CertificateStatus.REVOKED],
        ).select_related("institution")


# ── Resend student invite ─────────────────────────────────────────────────────

class CertificateResendInviteView(APIView):
    """
    POST /api/certify/certificates/<id>/resend-invite/

    Registrar: invalidate the previous invite token, create a fresh one,
    re-send the WhatsApp message.  This is the explicit rotation path — it
    forces a new token even when the previous one is still valid.  Use it
    when the student missed the original notification, reports the link did
    not arrive, or the 24-hour window has expired.

    Only works on ISSUED certificates that have a student FK.
    """
    permission_classes = [IsAdminOrAbove]

    def post(self, request, pk):
        from accounts.models import Role
        cert = get_object_or_404(Certificate, pk=pk)

        # Scope: non-super-admins can only resend for their own institution
        if request.user.role != Role.SUPER_ADMIN and cert.institution != request.user.institution:
            return Response(status=status.HTTP_403_FORBIDDEN)

        if cert.status != CertificateStatus.ISSUED:
            return Response(
                {"detail": "Invite can only be resent for issued certificates."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not cert.student_id:
            return Response(
                {"detail": "This certificate has no student account linked."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        sent = notify_student_issued(cert, force=True)

        log_action(
            actor=request.user,
            action="certificate.invite_resent",
            target_type="Certificate",
            target_id=str(cert.id),
            detail=(
                f"Registrar resent student invite for {cert.certificate_id}. "
                f"Twilio sent={sent.get('twilio_sent', False)}."
            ),
        )
        return Response({
            "detail":       "Invite token created.",
            "twilio_sent":  sent.get("twilio_sent", False),
            "claim_url":    sent.get("claim_url", ""),
            "wa_url":       sent.get("wa_url", ""),
            "wa_body":      sent.get("wa_body", ""),
            "invite_expires_at": sent.get("invite_expires_at", ""),
        })


# ── Link student to certificate ───────────────────────────────────────────────

class CertificateLinkStudentView(APIView):
    """
    POST /api/certify/certificates/<id>/link-student/

    Registrar links (or re-links) a student account to a certificate.

    If the student already has a Credence account the FK is set directly.
    If no account exists, one is auto-created (no usable password — student
    gains access via WhatsApp invite claim / Google OAuth).

    Body (at least one of):
        student_email : str  — find or create by email
        student_id    : uuid — link directly by User PK (must exist)

    Returns the updated CertificateDetailSerializer payload.
    """
    permission_classes = [IsAdminOrAbove]

    def post(self, request, pk):
        from accounts.models import Role as _Role

        cert = get_object_or_404(Certificate, pk=pk)

        # Scope: non-super-admins can only modify their own institution's certs
        if request.user.role not in (_Role.SUPER_ADMIN,) and cert.institution != request.user.institution:
            return Response(status=status.HTTP_403_FORBIDDEN)

        student_email = (request.data.get("student_email") or "").strip().lower()
        student_id    = (request.data.get("student_id") or "").strip()

        if not student_email and not student_id:
            return Response(
                {"detail": "Provide student_email or student_id."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        student_created = False

        if student_id:
            # Direct UUID lookup — must already exist
            try:
                student_user = User.objects.get(pk=student_id, role=_Role.STUDENT)
            except User.DoesNotExist:
                return Response(
                    {"detail": "No student account found with that ID."},
                    status=status.HTTP_404_NOT_FOUND,
                )
        else:
            # Find or create by email, using the cert's name as the display name
            student_user, student_created = _get_or_create_student(
                email=student_email,
                student_name=cert.student_name,
                institution=cert.institution,
            )

        cert.student = student_user
        cert.save(update_fields=["student"])

        if student_created:
            log_action(
                actor=request.user,
                action="student.auto_created",
                target_type="User",
                target_id=str(student_user.id),
                detail=(
                    f"Student account auto-created for {student_email} "
                    f"while linking to {cert.certificate_id}."
                ),
            )

        log_action(
            actor=request.user,
            action="certificate.student_linked",
            target_type="Certificate",
            target_id=str(cert.id),
            detail=(
                f"Student {student_user.email} "
                f"({'created & ' if student_created else ''}linked) "
                f"to {cert.certificate_id} by {request.user.email}."
            ),
        )

        return Response({
            **CertificateDetailSerializer(cert, context={"request": request}).data,
            "student_created": student_created,
        })
