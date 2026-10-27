"""
certify/share_code_views.py

Student-facing endpoints for managing verification share codes.

A share code lets a student pre-authorise an employer to verify a specific
certificate without requiring live consent, CAPTCHA, or the public rate-limit
gate.  The student generates the code, pastes it (or the full share URL) into
a message to the employer, and can revoke it at any time.

Endpoints
---------
POST   /api/my-certificates/<certificate_id>/share-codes/
    Generate a new share code for one of the student's issued certs.
    Body (all optional):
        label       : str  — human label e.g. "Acme Corp interview"
        single_use  : bool — invalidate after first verify (default False)
        expires_hours: int — hours until expiry (default 24; max 720).
                         Must be supplied or defaulted — a share code may
                         never be created without a closing time.
    Returns the raw code ONCE in the response — not stored.

GET    /api/my-certificates/<certificate_id>/share-codes/
    List all active (non-revoked, non-expired) share codes for this cert.

DELETE /api/my-certificates/<certificate_id>/share-codes/<code_id>/
    Revoke a specific share code.
"""

import logging

from django.conf import settings
from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsFullSession
from audit.utils import log_action
from certify.models import Certificate, CertificateStatus, VerificationShareCode

logger = logging.getLogger(__name__)

# Full-document access must always have a closing time. A share code with no
# expiry would make the encrypted bundle retrievable indefinitely, which
# defeats the point of a graduate-controlled sharing window.
DEFAULT_SHARE_EXPIRY_HOURS = 24
MAX_SHARE_EXPIRY_HOURS = 24 * 30   # 30 days


def _student_cert_or_404(certificate_id: str, user):
    """Return an ISSUED certificate that belongs to this student."""
    return get_object_or_404(
        Certificate,
        certificate_id=certificate_id,
        student=user,
        status=CertificateStatus.ISSUED,
    )


class ShareCodeListCreateView(APIView):
    """
    GET  /api/my-certificates/<certificate_id>/share-codes/
    POST /api/my-certificates/<certificate_id>/share-codes/
    """
    permission_classes = [IsFullSession]

    def get(self, request, certificate_id):
        cert = _student_cert_or_404(certificate_id, request.user)
        now  = timezone.now()

        codes = VerificationShareCode.objects.filter(
            certificate=cert,
            created_by=request.user,
            revoked=False,
        ).exclude(
            # exclude expired single-use that have been used
            used=True,
        ).order_by("-created_at")

        # Also filter out expired (non-null expires_at in the past)
        result = []
        for sc in codes:
            expired = sc.expires_at and now >= sc.expires_at
            if not expired:
                result.append({
                    "id":          str(sc.id),
                    "label":       sc.label,
                    "single_use":  sc.single_use,
                    "expires_at":  sc.expires_at,
                    "used":        sc.used,
                    "created_at":  sc.created_at,
                    # share_url is the full verification URL the employer visits
                    "share_url": _build_share_url(cert.certificate_id, ""),  # code hidden after creation
                })
        return Response(result)

    def post(self, request, certificate_id):
        cert  = _student_cert_or_404(certificate_id, request.user)
        label = (request.data.get("label") or "").strip()[:100]
        single_use = bool(request.data.get("single_use", True))
        # Full-document access always closes. Default to one day if the client
        # does not choose a window, but never accept an explicit null: that
        # would mint a share code with no expiry at all.
        raw_minutes = request.data.get("expires_minutes") if "expires_minutes" in request.data else None
        try:
            if "expires_minutes" in request.data:
                if isinstance(raw_minutes, bool) or str(raw_minutes).strip() != str(int(raw_minutes)):
                    raise ValueError
                minutes = int(raw_minutes)
            elif "expires_hours" in request.data:
                raw_hours = request.data["expires_hours"]
                if isinstance(raw_hours, bool) or str(raw_hours).strip() != str(int(raw_hours)):
                    raise ValueError
                minutes = int(raw_hours) * 60
            else:
                minutes = 15
        except (ValueError, TypeError):
            return Response({"detail": "Choose an expiry in whole minutes (minimum 15)."}, status=400)
        if not 15 <= minutes <= MAX_SHARE_EXPIRY_HOURS * 60:
            return Response({"detail": "Expiry must be between 15 minutes and 30 days."}, status=400)
        expires_at = timezone.now() + timezone.timedelta(minutes=minutes)

        sc, raw_code = VerificationShareCode.create(
            certificate=cert,
            created_by=request.user,
            label=label,
            single_use=single_use,
            expires_at=expires_at,
        )

        log_action(
            actor=request.user,
            action="share_code.created",
            target_type="Certificate",
            target_id=str(cert.id),
            detail=f"Share code created for {certificate_id}. Label: '{label}'. single_use={single_use}.",
        )

        frontend = getattr(settings, "FRONTEND_URL", "http://localhost:3000").rstrip("/")
        share_url = _build_share_url(certificate_id, raw_code, frontend)

        return Response(
            {
                "id":         str(sc.id),
                "label":      sc.label,
                "single_use": sc.single_use,
                "expires_at": sc.expires_at,
                "created_at": sc.created_at,
                # raw_code returned ONCE — not stored, cannot be recovered
                "code":       raw_code,
                "share_url":  share_url,
            },
            status=status.HTTP_201_CREATED,
        )


class ShareCodeRevokeView(APIView):
    """DELETE /api/my-certificates/<certificate_id>/share-codes/<code_id>/"""
    permission_classes = [IsFullSession]

    def delete(self, request, certificate_id, code_id):
        cert = _student_cert_or_404(certificate_id, request.user)
        sc = get_object_or_404(
            VerificationShareCode,
            id=code_id,
            certificate=cert,
            created_by=request.user,
        )
        if sc.revoked:
            return Response({"detail": "Already revoked."}, status=status.HTTP_400_BAD_REQUEST)

        sc.revoked = True
        sc.save(update_fields=["revoked"])

        log_action(
            actor=request.user,
            action="share_code.revoked",
            target_type="Certificate",
            target_id=str(cert.id),
            detail=f"Share code {code_id} revoked for {certificate_id}.",
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


def _build_share_url(certificate_id: str, raw_code: str, frontend: str = "") -> str:
    base = (frontend or "").rstrip("/")
    if raw_code:
        return f"{base}/verify/{certificate_id}?code={raw_code}"
    return f"{base}/verify/{certificate_id}"
