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

from accounts.permissions import IsFullSession, IsRegistrar, IsRegistrarOrAbove
from audit.utils import log_action
from institutions.branding_views import _get_or_create_template
from institutions.pdf_certificate import generate_certificate_pdf

from accounts.signature_views import snapshot_signature_to_certificate
from .ipfs import pin_file_to_ipfs, pin_json_to_ipfs
from .models import Certificate, CertificateStatus
from .serializers import (
    CertificateChainUpdateSerializer,
    CertificateCreateSerializer,
    CertificateDetailSerializer,
    CertificateListSerializer,
    CertificateRevokeSerializer,
    CertificateUploadDocumentSerializer,
)
from .utils import (
    build_certificate_json,
    compute_sha256_bytes,
    compute_sha256_json,
    generate_certificate_id,
)


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
        prefix      = f"CR-{year}-{short.upper()}-"

        # Find the highest existing sequence for this institution+year prefix
        # to avoid collisions regardless of deletions or prior failed inserts.
        last = (
            Certificate.objects
            .filter(institution=institution, certificate_id__startswith=prefix)
            .order_by("-certificate_id")
            .values_list("certificate_id", flat=True)
            .first()
        )
        if last:
            try:
                sequence = int(last[len(prefix):]) + 1
            except ValueError:
                sequence = Certificate.objects.filter(institution=institution).count() + 1
        else:
            sequence = 1

        cert_id = generate_certificate_id(short, year, sequence)
        template = _get_or_create_template(institution)
        registrar_name = user.full_name or user.get_full_name() or "Registrar"
        certificate = serializer.save(
            institution=institution,
            issued_by=user,
            certificate_id=cert_id,
            status=CertificateStatus.DRAFT,
            branding_preset=template.preset,
            registrar_signer_name=registrar_name,
        )
        log_action(
            actor=user,
            action="certificate.created",
            target_type="Certificate",
            target_id=str(certificate.id),
            detail=f"Draft certificate created: {cert_id}",
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

class CertificateDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsRegistrarOrAbove]
    serializer_class   = CertificateDetailSerializer
    http_method_names  = ["get", "delete", "head", "options"]

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

    def destroy(self, request, *args, **kwargs):
        from accounts.models import Role
        if request.user.role not in (Role.REGISTRAR, Role.INSTITUTIONAL_ADMIN, Role.SUPER_ADMIN):
            return Response({"detail": "Only the Registrar can delete drafts."},
                            status=status.HTTP_403_FORBIDDEN)
        cert = self.get_object()
        if cert.status != CertificateStatus.DRAFT:
            return Response(
                {"detail": "Only Draft certificates can be deleted."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        cert_id = cert.certificate_id
        pk = str(cert.id)
        self.perform_destroy(cert)
        log_action(
            actor=request.user,
            action="certificate.deleted",
            target_type="Certificate",
            target_id=pk,
            detail=f"Draft certificate deleted: {cert_id}",
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


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
        s.save()

        log_action(actor=request.user, action="certificate.document_uploaded",
                   target_type="Certificate", target_id=str(cert.id),
                   detail=f"PDF uploaded for {cert.certificate_id}")

        return Response(CertificateDetailSerializer(cert, context={"request": request}).data)


# ── Prepare: dataHash only (no PDF / IPFS yet) ────────────────────────────────

class CertificatePrepareView(APIView):
    """
    POST /api/certificates/<id>/prepare/

    Computes SHA-256 of structured academic JSON (dataHash / cert_hash).
    Does NOT require a PDF and does NOT pin to IPFS — that happens at finalize.
    Returns payload for MetaMask submitForApproval(certificateId, dataHash).
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

        cert.cert_hash = cert_hash
        cert.status = CertificateStatus.PENDING_VC
        cert.save()

        log_action(
            actor=request.user,
            action="certificate.prepared",
            target_type="Certificate",
            target_id=str(cert.id),
            detail=(
                f"dataHash computed for {cert.certificate_id}. "
                f"Awaiting submitForApproval on-chain + VC approval."
            ),
        )

        return Response({
            "certificate_id": cert.certificate_id,
            "cert_hash":      cert_hash,
            "cert_json":      cert_json,
            "branding_preset": cert.branding_preset,
            "status":         cert.status,
            "message": (
                "Certificate data hashed. Submit on-chain with submitForApproval, "
                "then VC and Chancellor must approve before final PDF generation."
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

        if cert.status not in (CertificateStatus.PENDING_VC, CertificateStatus.PENDING):
            return Response(
                {"detail": "Only certificates awaiting VC approval can record the submit tx."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        s = CertificateChainUpdateSerializer(cert, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        cert.tx_hash = s.validated_data.get("tx_hash", cert.tx_hash)
        if "block_number" in s.validated_data:
            cert.block_number = s.validated_data["block_number"]
        if not cert.registrar_signer_name:
            cert.registrar_signer_name = (
                request.user.full_name or request.user.get_full_name() or "Registrar"
            )
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
        if cert.status != CertificateStatus.PENDING_VC:
            return Response({"detail": "Certificate is not awaiting VC approval."},
                            status=status.HTTP_400_BAD_REQUEST)

        tx_hash = request.data.get("tx_hash", "")
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
            return Response({"detail": "Only Chancellor may confirm this step."},
                            status=status.HTTP_403_FORBIDDEN)

        cert = get_object_or_404(Certificate, pk=pk, institution=request.user.institution)
        if cert.status != CertificateStatus.PENDING_CHANCELLOR:
            return Response({"detail": "Certificate is not awaiting Chancellor approval."},
                            status=status.HTTP_400_BAD_REQUEST)

        tx_hash = request.data.get("tx_hash", "")
        cert.chancellor_approved_at = timezone.now()
        cert.chancellor_approval_tx_hash = tx_hash
        cert.chancellor_approver_name = (
            request.user.full_name or request.user.get_full_name() or "Chancellor"
        )
        snapshot_signature_to_certificate(request.user, cert, "chancellor_signature_image")
        cert.status = CertificateStatus.PENDING_FINALIZE
        cert.save()

        log_action(
            actor=request.user,
            action="certificate.chancellor_approved",
            target_type="Certificate",
            target_id=str(cert.id),
            detail=(
                f"Chancellor approved {cert.certificate_id}. "
                f"Awaiting final PDF + finalizeCertificate. Tx: {tx_hash}"
            ),
        )
        return Response(CertificateDetailSerializer(cert, context={"request": request}).data)


# ── Finalize: generate PDF, hash, pin, return payload for MetaMask ────────────

class CertificateFinalizeView(APIView):
    """
    POST /api/certificates/<id>/finalize/

    After dual approval: generate branded PDF (signatures + QR), hash it,
    pin PDF + JSON to IPFS. Returns payload for MetaMask finalizeCertificate.
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

        template = _get_or_create_template(cert.institution)
        frontend = getattr(settings, "FRONTEND_URL", "http://localhost:3000")

        try:
            pdf_bytes = generate_certificate_pdf(
                cert,
                template=template,
                verification_base_url=frontend,
            )
        except RuntimeError as e:
            return Response({"detail": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        doc_hash = compute_sha256_bytes(pdf_bytes)
        cert_json = build_certificate_json(cert)

        # Persist generated PDF locally (also used if re-pin needed)
        filename = f"{cert.certificate_id}.pdf"
        cert.document_file.save(filename, ContentFile(pdf_bytes), save=False)

        try:
            pdf_result = pin_file_to_ipfs(
                ContentFile(pdf_bytes, name=filename),
                filename,
                cert.certificate_id,
            )
            json_result = pin_json_to_ipfs(cert_json, cert.certificate_id)
        except RuntimeError as e:
            return Response(
                {"detail": f"IPFS pinning failed: {str(e)}"},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        cert.doc_hash = doc_hash
        cert.ipfs_cid_pdf = pdf_result["cid"]
        cert.ipfs_url_pdf = pdf_result["ipfs_url"]
        cert.ipfs_cid_json = json_result["cid"]
        cert.ipfs_url_json = json_result["ipfs_url"]
        cert.save()

        log_action(
            actor=request.user,
            action="certificate.finalized_off_chain",
            target_type="Certificate",
            target_id=str(cert.id),
            detail=(
                f"Final PDF generated & pinned for {cert.certificate_id}. "
                f"Awaiting finalizeCertificate on-chain."
            ),
        )

        return Response({
            "certificate_id": cert.certificate_id,
            "cert_hash":      cert.cert_hash,
            "doc_hash":       doc_hash,
            "ipfs_cid_json":  json_result["cid"],
            "ipfs_cid_pdf":   pdf_result["cid"],
            "ipfs_url_json":  json_result["ipfs_url"],
            "ipfs_url_pdf":   pdf_result["ipfs_url"],
            "cert_json":      cert_json,
            "status":         cert.status,
            "message": (
                "Final PDF ready. Sign finalizeCertificate with MetaMask to issue on-chain."
            ),
        })


class CertificateConfirmFinalizeView(APIView):
    """POST /api/certificates/<id>/confirm-finalize/ — after finalizeCertificate tx."""
    permission_classes = [IsRegistrar]

    def post(self, request, pk):
        cert = get_object_or_404(Certificate, pk=pk, institution=request.user.institution)

        if cert.status != CertificateStatus.PENDING_FINALIZE:
            return Response(
                {"detail": "Certificate is not awaiting on-chain finalize."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not cert.doc_hash or not cert.ipfs_cid_pdf:
            return Response(
                {"detail": "Run finalize (generate PDF + pin) before confirming the chain tx."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        tx_hash = request.data.get("tx_hash", "")
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
