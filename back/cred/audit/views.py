"""audit/views.py"""

from rest_framework import generics
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

from .models import AuditLog
from .serializers import AuditLogSerializer
from accounts.permissions import IsRegistrarOrAbove
from accounts.models import Role


class AuditLogListView(generics.ListAPIView):
    """
    GET /api/audit-logs/
    Registrar and above can view audit logs.
    Super Admin sees all; others see only their institution's logs.
    """
    serializer_class   = AuditLogSerializer
    permission_classes = [IsRegistrarOrAbove]
    filter_backends    = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields   = ["action", "target_type"]
    search_fields      = ["actor_email", "detail", "target_id"]
    ordering_fields    = ["timestamp"]

    def get_queryset(self):
        user = self.request.user
        qs   = AuditLog.objects.select_related("actor")

        # Super Admin sees everything
        if user.role == Role.SUPER_ADMIN:
            return qs

        # Others see only logs for their institution's certificates
        from certificates.models import Certificate
        cert_ids = Certificate.objects.filter(
            institution=user.institution
        ).values_list("id", flat=True)

        return qs.filter(
            target_type="Certificate",
            target_id__in=[str(cid) for cid in cert_ids],
        )
