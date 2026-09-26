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

Spec §9: verification must work even if Django backend is offline (the
frontend queries the blockchain directly). This endpoint provides the
database-side metadata to complement the on-chain result.
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
            "is_certified":     cert.status == CertificateStatus.ISSUED,
        },
    }
    if shared and cert.status == CertificateStatus.ISSUED:
        payload["verification_scope"] = "full"
        payload["certificate"].update({
            "degree_title": cert.degree_title,
            "department": cert.department,
            "graduation_year": cert.graduation_year,
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
            return Response(
                {
                    "found":                False,
                    "verification_outcome": "not_found",
                    "message":              "No certificate found with this ID.",
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        # ── Outcome mapping ──────────────────────────────────────────────────
        if cert.status == CertificateStatus.REVOKED:
            outcome = "revoked"
        elif cert.status == CertificateStatus.ISSUED:
            outcome = "valid"
        else:
            outcome = "not_verified"

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

        return Response(_build_payload(cert, outcome, shared=bool(share_code)))
