"""
verification/views.py

Public certificate verification endpoint.

Security layers (defence-in-depth):
  1. Rate limiting  — 20 req/min per IP (anon) / 60 req/min per user (auth).
                      Defined in verification/throttles.py, rates in settings.py.
  2. hCaptcha check — When HCAPTCHA_ENABLED=True (default: False), anonymous
                      callers must include a valid captcha token in the
                      X-Captcha-Token request header.  Authenticated callers
                      (dashboard staff, logged-in students) are exempt.
                      The check is skipped entirely in dev/test when the flag
                      is off, so no extra setup is needed locally.
  3. Share codes    — A student-generated share code (?code=<raw>) bypasses
                      both the CAPTCHA gate and rate-limit throttles.  The
                      code is validated against VerificationShareCode before
                      the lookup proceeds.  Single-use codes are consumed here.

Verification reads live commitments from the configured chain and verifies
structured metadata. Student-authorized requests additionally check documents.
This endpoint requires the backend, the configured RPC and content storage.
"""

import logging

import requests as http_requests
from django.conf import settings
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from audit.utils import log_action
from certify.models import Certificate, CertificateStatus

from .throttles import PublicVerifyAnonThrottle, PublicVerifyUserThrottle

logger = logging.getLogger(__name__)

HCAPTCHA_VERIFY_URL = "https://hcaptcha.com/siteverify"


def _verify_hcaptcha(token: str) -> bool:
    secret = getattr(settings, "HCAPTCHA_SECRET_KEY", "")
    if not secret:
        logger.warning(
            "HCAPTCHA_ENABLED=True but HCAPTCHA_SECRET_KEY is empty — "
            "treating all captcha tokens as invalid."
        )
        return False
    try:
        resp = http_requests.post(
            HCAPTCHA_VERIFY_URL,
            data={"secret": secret, "response": token},
            timeout=5,
        )
        return bool(resp.json().get("success"))
    except Exception as exc:
        logger.warning("hCaptcha verification request failed: %s", exc)
        return False


def _captcha_required(request) -> bool:
    if not getattr(settings, "HCAPTCHA_ENABLED", False):
        return False
    return not (request.user and request.user.is_authenticated)


def get_client_ip(request) -> str:
    x_forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded:
        return x_forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")


def _validate_share_code(raw: str, ip: str, *, consume: bool = True):
    """
    Validate a share code query param.
    Returns (share_code_instance | None, error_str).
    Imports lazily to avoid circular import at module load.
    """
    if not raw:
        return None, ""
    from certify.models import VerificationShareCode
    return VerificationShareCode.validate(raw.strip(), ip=ip, consume=consume)


def _build_payload(cert, outcome: str, *, shared: bool = False) -> dict:
    """Build a public-minimal or share-authorized verification response."""
    payload = {
        "found": True,
        "verification_outcome": outcome,
        "status": cert.status,
        "certificate": {
            "certificate_id":   cert.certificate_id,
            "student_name":     cert.student_name,
            "institution_name": cert.institution.name,
            "degree_title":     cert.degree_title,
            "department":       cert.department,
            "graduation_year":  cert.graduation_year,
            "is_certified":     outcome == "valid",
        },
    }
    if shared and outcome in ("valid", "tampered", "unavailable"):
        payload["verification_scope"] = "full"
        payload["certificate"].update({
            "grade": cert.grade,
            "cert_hash": cert.cert_hash,
            "certificate_document_hash": cert.authoritative_doc_hash,
            "transcript_document_hash": cert.transcript_hash,
            "documents_path": f"/api/verify/{cert.certificate_id}/documents/",
        })
    else:
        payload["verification_scope"] = "public"
    if cert.status == CertificateStatus.REVOKED:
        payload["certificate"].update({
            "revocation_reason":  cert.revocation_reason,
            "revoked_at":         cert.revoked_at,
            "revocation_tx_hash": cert.revocation_tx_hash,
        })
    return payload


def _apply_report(payload, report, *, shared):
    payload.update(report)
    from .report_feedback import enrich_report
    enrich_report(payload)
    payload["verification_scope"] = "full" if shared else "public"
    chain = report.get("blockchain", {})
    payload["status"] = chain.get("status", "unknown")
    if shared and chain.get("exists"):
        payload["certificate"].update({
            "cert_hash": chain["data_hash"],
            "certificate_document_hash": chain["certificate_hash"],
            "transcript_document_hash": chain["transcript_hash"],
            "chain_issued_at": chain.get("issued_at"),
        })
    if chain.get("status") == "revoked":
        payload["certificate"]["revocation_reason"] = chain.get("revocation_reason", "")
    if not shared and chain:
        payload["blockchain"] = {key: value for key, value in chain.items()
                                 if key not in ("data_hash", "certificate_hash", "transcript_hash")}
    return payload


class VerifyCertificateView(APIView):
    """
    GET /api/verify/<certificate_id>/

    Optional query param:
        ?code=<share_code>  — student-generated employer share code.
                              A valid code bypasses CAPTCHA and rate limits.

    Response shape:
    {
        "found": true,
        "status": "issued" | "revoked" | "pending" | "draft",
        "certificate": { ... },
        "verification_outcome": "valid" | "revoked" | "not_found" | "not_verified"
    }

    Error shapes:
        429  — throttled
        403  — captcha required / failed
        404  — certificate not found
    """

    permission_classes = [AllowAny]
    throttle_classes   = [PublicVerifyAnonThrottle, PublicVerifyUserThrottle]

    def get(self, request, certificate_id):
        ip          = get_client_ip(request)
        raw_code    = request.query_params.get("code", "").strip()
        share_code  = None
        used_code   = False

        # ── Share-code fast path (bypasses CAPTCHA + throttle) ───────────────
        if raw_code:
            sc, sc_error = _validate_share_code(raw_code, ip=ip, consume=False)
            if sc_error:
                return Response({"detail": sc_error}, status=403)
                # Invalid code — fall through to normal CAPTCHA/throttle path
                # so we don't leak whether a code exists
                logger.info("Invalid share code attempt for %s from %s: %s",
                            certificate_id, ip, sc_error)
            else:
                if sc.certificate.certificate_id == certificate_id:
                    share_code = sc
                    used_code  = True
                    # Skip throttle check entirely for a valid code for this ID.
                    self.throttle_classes = []

        # ── CAPTCHA gate (skipped for valid share code or authenticated user) ─
        if not used_code:
            if _captcha_required(request):
                token = request.headers.get("X-Captcha-Token", "").strip()
                if not token:
                    return Response(
                        {
                            "detail":           "CAPTCHA token required.",
                            "captcha_required": True,
                        },
                        status=status.HTTP_403_FORBIDDEN,
                    )
                if not _verify_hcaptcha(token):
                    return Response(
                        {
                            "detail":           "CAPTCHA verification failed. Please try again.",
                            "captcha_required": True,
                        },
                        status=status.HTTP_403_FORBIDDEN,
                    )

        # ── Certificate lookup ───────────────────────────────────────────────
        try:
            cert = Certificate.objects.select_related(
                "institution", "issued_by"
            ).get(certificate_id=certificate_id)
        except Certificate.DoesNotExist:
            from .integrity import read_chain_record, VerificationUnavailable
            try:
                chain = read_chain_record(certificate_id)
            except VerificationUnavailable as exc:
                return Response({"found": False, "verification_outcome": "unavailable", "message": str(exc)})
            if not chain["exists"]:
                return Response({"found": False, "verification_outcome": "not_found",
                                 "message": "No credential found in the registry or on the configured blockchain."}, status=404)
            chain = {key: value for key, value in chain.items()
                     if key not in ("data_hash", "certificate_hash", "transcript_hash")}
            response = Response({
                "found": True, "verification_scope": "public", "status": chain["status"],
                "verification_outcome": "revoked" if chain["status"] == "revoked" else "unavailable",
                "message": "An on-chain record exists, but its metadata and document references are missing from the application registry. Full verification could not complete.",
                "certificate": {"certificate_id": certificate_id, "is_certified": False}, "blockchain": chain,
                "checks": {"blockchain": {"status": "matched"}, "data": {"status": "unavailable"},
                           "certificate": {"status": "not_checked"}, "transcript": {"status": "not_checked"}},
            })
            response["Cache-Control"] = "private, no-store"
            return response

        # ── Outcome mapping ──────────────────────────────────────────────────
        from .integrity import verify_record
        supplied = {}
        for kind in ("certificate", "transcript"):
            file = request.FILES.get(kind)
            if file:
                if file.size > 20 * 1024 * 1024:
                    return Response({"detail": "Each verification PDF must be 20 MB or smaller."}, status=400)
                supplied[kind] = file.read()
        report = verify_record(cert, include_documents=bool(share_code or supplied), supplied_documents=supplied,
                               supplied_only=bool(supplied))
        # Complete checks first. Unavailable services should not spend access.
        consumed = False
        if share_code and report["verification_outcome"] != "unavailable":
            share_code, access_error = _validate_share_code(raw_code, ip=ip, consume=True)
            if access_error:
                return Response({"detail": access_error}, status=403)
            consumed = bool(share_code.single_use)
        report["access_consumed"] = consumed
        outcome = report["verification_outcome"]

        # ── Audit log ────────────────────────────────────────────────────────
        log_action(
            actor=None,
            action="certificate.verified",
            target_type="Certificate",
            target_id=str(cert.id),
            detail=(
                f"Public verification for {certificate_id}. "
                f"Outcome: {outcome}. "
                f"IP: {ip}. "
                f"Auth: {'yes' if (request.user and request.user.is_authenticated) else 'no'}. "
                f"ShareCode: {'yes' if used_code else 'no'}."
            ),
            ip_address=ip,
        )

        payload = _build_payload(cert, outcome, shared=bool(share_code))
        _apply_report(payload, report, shared=bool(share_code))
        response = Response(payload)
        response["Cache-Control"] = "private, no-store"
        return response

    def post(self, request, certificate_id):
        """Compare supplied original PDFs under the same CAPTCHA/share-code rules."""
        return self.get(request, certificate_id)


class ValidateEmployerAccessView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [PublicVerifyAnonThrottle, PublicVerifyUserThrottle]

    def post(self, request, certificate_id):
        raw = request.data.get("code", "")
        if not isinstance(raw, str) or not raw.strip():
            return Response({"detail": "Paste the student's share link or code."}, status=400)
        share, error = _validate_share_code(raw, ip=get_client_ip(request), consume=False)
        if error or not share or share.certificate.certificate_id != certificate_id:
            return Response({"detail": "This access link is invalid, expired, used, or belongs to another credential."}, status=403)
        response = Response({"access_valid": True, "certificate_id": certificate_id,
                             "expires_at": share.expires_at, "single_use": share.single_use, "access_consumed": False})
        response["Cache-Control"] = "private, no-store"
        return response


class EmployerDocumentVerificationView(VerifyCertificateView):
    def get(self, request, certificate_id):
        return Response({"detail": "Upload your certificate using Verify documents."}, status=405)

    def post(self, request, certificate_id):
        raw = request.query_params.get("code", "").strip()
        share, error = _validate_share_code(raw, ip=get_client_ip(request), consume=False)
        if error or not share or share.certificate.certificate_id != certificate_id:
            return Response({"detail": "A valid student share link for this credential is required."}, status=403)
        if "certificate" not in request.FILES:
            return Response({"detail": "Upload the original certificate PDF. Transcript is optional."}, status=400)
        import pymupdf as fitz
        for kind in ("certificate", "transcript"):
            upload = request.FILES.get(kind)
            if upload is None:
                continue
            if not 0 < upload.size <= 20 * 1024 * 1024:
                return Response({"detail": "Each PDF must be nonempty and at most 20 MB."}, status=400)
            try:
                with fitz.open(stream=upload.read(), filetype="pdf") as pdf:
                    if not pdf.is_pdf or pdf.needs_pass or pdf.page_count < 1:
                        raise ValueError
            except Exception:
                return Response({"detail": f"Upload a readable, unencrypted {kind} PDF."}, status=400)
            finally:
                upload.seek(0)
        return super().get(request, certificate_id)
