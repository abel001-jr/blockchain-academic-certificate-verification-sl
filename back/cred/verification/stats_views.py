"""
verification/stats_views.py

Public landing-page stats endpoint.
Returns aggregate counts that power the stats strip on the frontend.

No authentication required — AllowAny.
Response is safe to cache at the CDN/proxy layer (Cache-Control: public).
"""

from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from certify.models import Certificate, CertificateStatus
from audit.models import AuditLog
from institutions.models import Institution


class PublicStatsView(APIView):
    """
    GET /api/public/stats/

    Returns:
        certificates_issued  — total certificates with status="issued"
        verifications_total  — total public verification events in the audit log
        institutions_active  — institutions that are active and anchored on-chain
    """
    permission_classes = [AllowAny]
    authentication_classes = []   # skip JWT parsing for this public endpoint

    # Cache for 60 seconds — cheap for landing-page traffic, stays fresh enough
    @method_decorator(cache_page(60))
    def get(self, request):
        return Response({
            "certificates_issued": Certificate.objects.filter(
                status=CertificateStatus.ISSUED
            ).count(),
            "verifications_total": AuditLog.objects.filter(
                action="certificate.verified"
            ).count(),
            "institutions_active": Institution.objects.filter(
                is_active=True,
                is_chain_active=True,
            ).count(),
        })
