"""Chain config API — GET/PATCH the deployment-wide blockchain coordinates.

Read by any authenticated user so the dashboard can tell an admin which network
and which registry it is pointed at before they sign anything. Writable only by a
the system admin, because it changes where the application reads from.
"""

from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsFullSession, IsSuperAdmin
from audit.utils import log_action

from .chain_config_serializers import ChainConfigSerializer
from .models import ChainConfig
from accounts.permissions import IsRegistrarOrAbove
from django.shortcuts import get_object_or_404
from certify.models import Certificate


class CertificateChainConfigView(APIView):
    permission_classes = [IsFullSession, IsRegistrarOrAbove]

    def get(self, request):
        records = Certificate.objects.all()
        if request.user.role != "super_admin":
            records = records.filter(institution_id=request.user.institution_id)
        cert = get_object_or_404(records, certificate_id=request.query_params.get("certificate_id", ""))
        config = cert.chain_config_snapshot
        if not config.get("certificate_registry_address"):
            config = ChainConfigSerializer(ChainConfig.load()).data
        return Response(config)


class ChainConfigView(APIView):
    """
    GET   /api/chain-config/  — any authenticated, fully set-up user
    PATCH /api/chain-config/  — system administrator only
    """

    def get_permissions(self):
        if self.request.method in ("PATCH", "PUT", "POST"):
            return [IsFullSession(), IsSuperAdmin()]
        return [IsFullSession()]

    def get(self, request):
        config = ChainConfig.load()
        return Response(ChainConfigSerializer(config).data)

    def patch(self, request):
        config = ChainConfig.load()
        serializer = ChainConfigSerializer(config, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(updated_by=request.user)

        config.refresh_from_db()
        log_action(
            actor=request.user,
            action="chain_config.updated",
            target_type="ChainConfig",
            target_id=str(config.pk),
            detail=(
                f"chain_id={config.chain_id} "
                f"issuer={config.issuer_registry_address} "
                f"expected_owner={config.expected_owner_address or 'unset'}"
            ),
        )
        return Response(ChainConfigSerializer(config).data)
