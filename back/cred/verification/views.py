"""
verification/views.py

Public verification endpoint — NO authentication required.
Spec §9: verification must work even if Django backend is offline
(the frontend queries the blockchain directly). This endpoint
provides the database-side metadata to complement the chain result.
"""

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework import status

from certify.models import Certificate, CertificateStatus
from audit.utils import log_action


class VerifyCertificateView(APIView):
    """
    GET /api/verify/<certificate_id>/

    Returns certificate metadata for display after the frontend has
    already confirmed on-chain validity.  Also usable as a standalone
    database check.

    Response shape:
    {
        "found": true,
        "status": "issued" | "revoked" | "pending" | "draft",
        "certificate": { ... },
        "verification_outcome": "valid" | "revoked" | "not_found"
    }
    """
    permission_classes = [AllowAny]

    def get(self, request, certificate_id):
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

        # Map status to verification outcome
        if cert.status == CertificateStatus.REVOKED:
            outcome = "revoked"
        elif cert.status == CertificateStatus.ISSUED:
            outcome = "valid"
        else:
            outcome = "not_verified"   # draft / pending — not yet on-chain

        # Log the verification attempt (anonymous)
        log_action(
            actor=None,
            action="certificate.verified",
            target_type="Certificate",
            target_id=str(cert.id),
            detail=f"Public verification attempt for {certificate_id}. Outcome: {outcome}",
            ip_address=get_client_ip(request),
        )

        payload = {
            "found":                True,
            "verification_outcome": outcome,
            "status":               cert.status,
            "certificate": {
                "certificate_id":   cert.certificate_id,
                "student_name":     cert.student_name,
                "degree_title":     cert.degree_title,
                "department":       cert.department,
                "graduation_year":  cert.graduation_year,
                "grade":            cert.grade,
                "institution_name": cert.institution.name,
                "institution_id":   cert.institution.institution_id,
                "issued_by":        cert.issued_by.full_name if cert.issued_by else "",
                "chain_issued_at":  cert.chain_issued_at,
                "tx_hash":          cert.tx_hash,
                "ipfs_cid_json":    cert.ipfs_cid_json,
                "ipfs_cid_pdf":     cert.ipfs_cid_pdf,
                "ipfs_url_pdf":     cert.ipfs_url_pdf,
                "cert_hash":        cert.cert_hash,
                "verification_url": cert.verification_url,
            },
        }

        # Include revocation info if revoked
        if cert.status == CertificateStatus.REVOKED:
            payload["certificate"]["revocation_reason"]  = cert.revocation_reason
            payload["certificate"]["revoked_at"]         = cert.revoked_at
            payload["certificate"]["revocation_tx_hash"] = cert.revocation_tx_hash

        return Response(payload)


def get_client_ip(request):
    x_forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded:
        return x_forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")
