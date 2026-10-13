"""
verification/consent_views.py

Live employer consent flow — for cases where the student didn't pre-share a code.

Endpoints
─────────
POST /api/verify/<certificate_id>/request-consent/
    Employer submits a consent request.  No authentication required.
    Body: { verifier_name, verifier_email?, verifier_org? }
    → Creates ConsentRequest (status=pending, TTL=CONSENT_REQUEST_TTL_MINUTES)
    → Sends WhatsApp push to the student (if configured)
    → Returns { request_id, expires_at, poll_url }

GET  /api/verify/consent/<request_id>/
    Employer polls for a decision.  No authentication required.
    → Returns status + (if approved) full certificate payload.
    → Expired pending requests are flipped to "expired" on read.

POST /api/verify/consent/<request_id>/respond/
    Student approves or denies.  Requires student's own JWT.
    Body: { action: "approve" | "deny" }
    → Updates status, records responded_at.

GET  /api/verify/consent/pending/
    Student lists all their pending consent requests.  Requires JWT.
    → Returns requests where student=request.user and status=pending.
    → Auto-expires stale ones before returning.
"""

import logging

from django.conf import settings
from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from audit.utils import log_action
from certify.models import Certificate, CertificateStatus, ConsentRequest, ConsentRequestStatus
from notifications.whatsapp import send_whatsapp
from verification.views import _build_payload, get_client_ip
from accounts.permissions import IsFullSession

logger = logging.getLogger(__name__)


# ── helpers ───────────────────────────────────────────────────────────────────

def _ttl_minutes() -> int:
    return int(getattr(settings, "CONSENT_REQUEST_TTL_MINUTES", 30))


def _consent_request_data(cr: ConsentRequest, include_cert: bool = False) -> dict:
    d = {
        "id":             str(cr.id),
        "certificate_id": cr.certificate.certificate_id,
        "verifier_name":  cr.verifier_name,
        "verifier_org":   cr.verifier_org,
        "status":         cr.status,
        "expires_at":     cr.expires_at,
        "created_at":     cr.created_at,
        "responded_at":   cr.responded_at,
    }
    if include_cert and cr.status == ConsentRequestStatus.APPROVED:
        cert = cr.certificate
        if cert.status == CertificateStatus.REVOKED:
            outcome = "revoked"
        elif cert.status == CertificateStatus.ISSUED:
            outcome = "valid"
        else:
            outcome = "not_verified"
        d["certificate"] = _build_payload(cert, outcome)
    return d


def _notify_student(cr: ConsentRequest) -> bool:
    """Send a WhatsApp message to the student about the incoming consent request."""
    student = cr.student
    if not student:
        return False
    phone = getattr(student, "phone_number", "").strip()
    if not phone:
        logger.info(
            "_notify_student: no phone for %s — skipping WhatsApp for consent request %s",
            student.email, cr.id,
        )
        return False

    frontend = getattr(settings, "FRONTEND_URL", "http://localhost:3000").rstrip("/")
    approve_url = f"{frontend}/dashboard/verifications"
    ttl = _ttl_minutes()
    cert = cr.certificate

    body = (
        f"Hello {student.first_name},\n\n"
        f"{cr.verifier_name}"
        + (f" from {cr.verifier_org}" if cr.verifier_org else "")
        + f" is requesting to verify your *{cert.degree_title}* certificate "
        f"from {cert.institution.name}.\n\n"
        f"You have {ttl} minutes to approve or deny:\n"
        f"{approve_url}\n\n"
        f"If you didn't expect this request, simply deny it.\n\n"
        f"— Intelligent Academic Credentialing"
    )

    sent = send_whatsapp(to=phone, body=body)
    if sent:
        cr.whatsapp_sent = True
        cr.save(update_fields=["whatsapp_sent"])
    return sent


# ── Views ─────────────────────────────────────────────────────────────────────

class ConsentRequestCreateView(APIView):
    """
    POST /api/verify/<certificate_id>/request-consent/

    Public — no auth required (employer doesn't have an Intelligent Academic Credentialing account).
    Rate-limited via the global anon throttle (60/min).

    Body:
        verifier_name   str  required
        verifier_email  str  optional
        verifier_org    str  optional
    """
    permission_classes = [AllowAny]

    def post(self, request, certificate_id):
        # Validate certificate exists and is issued
        cert = get_object_or_404(
            Certificate,
            certificate_id=certificate_id,
            status=CertificateStatus.ISSUED,
        )

        verifier_name  = (request.data.get("verifier_name") or "").strip()
        verifier_email = (request.data.get("verifier_email") or "").strip()
        verifier_org   = (request.data.get("verifier_org") or "").strip()

        if not verifier_name:
            return Response(
                {"detail": "verifier_name is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ip  = get_client_ip(request)
        ttl = _ttl_minutes()

        cr = ConsentRequest.objects.create(
            certificate    = cert,
            student        = cert.student,
            verifier_name  = verifier_name[:200],
            verifier_email = verifier_email[:254],
            verifier_org   = verifier_org[:200],
            verifier_ip    = ip or None,
            expires_at     = timezone.now() + timezone.timedelta(minutes=ttl),
        )

        # Push WhatsApp notification to student
        _notify_student(cr)

        log_action(
            actor=None,
            action="consent_request.created",
            target_type="Certificate",
            target_id=str(cert.id),
            detail=(
                f"Consent request {cr.id} from '{verifier_name}' "
                f"({verifier_org or 'no org'}) for {certificate_id}. IP: {ip}."
            ),
            ip_address=ip,
        )

        frontend = getattr(settings, "FRONTEND_URL", "http://localhost:3000").rstrip("/")
        return Response(
            {
                "request_id": str(cr.id),
                "status":     cr.status,
                "expires_at": cr.expires_at,
                "ttl_minutes": ttl,
                "poll_url":   f"{frontend}/verify/{certificate_id}?consent={cr.id}",
                "message": (
                    f"Consent request sent to the certificate holder. "
                    f"Poll this endpoint or revisit the verify page. "
                    f"Request expires in {ttl} minutes."
                ),
            },
            status=status.HTTP_201_CREATED,
        )


class ConsentRequestPollView(APIView):
    """
    GET /api/verify/consent/<request_id>/

    Public — employer polls for decision.
    Returns status.  If approved, includes full certificate payload.
    Expired pending requests are auto-resolved on read.
    """
    permission_classes = [AllowAny]

    def get(self, request, request_id):
        cr = get_object_or_404(
            ConsentRequest.objects.select_related("certificate__institution", "certificate__issued_by"),
            id=request_id,
        )
        # Auto-expire
        cr.resolve_expired()

        include_cert = cr.status == ConsentRequestStatus.APPROVED
        return Response(_consent_request_data(cr, include_cert=include_cert))


class ConsentRequestRespondView(APIView):
    """
    POST /api/verify/consent/<request_id>/respond/
    Body: { "action": "approve" | "deny" }

    Student only — must be the certificate owner.
    """
    permission_classes = [IsFullSession]

    def post(self, request, request_id):
        cr = get_object_or_404(
            ConsentRequest.objects.select_related("certificate"),
            id=request_id,
            student=request.user,         # student can only respond to their own
        )

        # Auto-expire check before acting
        cr.resolve_expired()
        if cr.status != ConsentRequestStatus.PENDING:
            return Response(
                {"detail": f"This request is already {cr.status}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        action = (request.data.get("action") or "").strip().lower()
        if action not in ("approve", "deny"):
            return Response(
                {"detail": "action must be 'approve' or 'deny'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        cr.status       = (ConsentRequestStatus.APPROVED
                           if action == "approve"
                           else ConsentRequestStatus.DENIED)
        cr.responded_at = timezone.now()
        cr.save(update_fields=["status", "responded_at", "updated_at"])

        log_action(
            actor=request.user,
            action=f"consent_request.{cr.status}",
            target_type="ConsentRequest",
            target_id=str(cr.id),
            detail=(
                f"Student {action}d consent for "
                f"{cr.certificate.certificate_id} "
                f"requested by {cr.verifier_name}."
            ),
        )

        return Response(_consent_request_data(cr))


class ConsentRequestPendingListView(APIView):
    """
    GET /api/verify/consent/pending/

    Student lists their own pending consent requests.
    Expired ones are resolved before returning.
    """
    permission_classes = [IsFullSession]

    def get(self, request):
        qs = (
            ConsentRequest.objects
            .filter(student=request.user)
            .select_related("certificate__institution")
            .order_by("-created_at")
        )

        result = []
        for cr in qs:
            cr.resolve_expired()
            if cr.status == ConsentRequestStatus.PENDING:
                result.append(_consent_request_data(cr))

        return Response(result)
