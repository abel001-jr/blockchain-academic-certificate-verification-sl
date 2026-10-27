from types import SimpleNamespace

from django.shortcuts import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsFullSession, IsRegistrarOrAbove
from institutions.models import ChainConfig
from verification.integrity import read_chain_record, VerificationUnavailable
from .models import Certificate


class CertificateChainStatusView(APIView):
    permission_classes = [IsFullSession, IsRegistrarOrAbove]

    def get(self, request, pk):
        records = Certificate.objects.all()
        if request.user.role != "super_admin":
            records = records.filter(institution_id=request.user.institution_id)
        cert = get_object_or_404(records, pk=pk)
        snapshot = cert.chain_config_snapshot or {}
        current = ChainConfig.load()
        config = SimpleNamespace(
            rpc_url=snapshot.get("rpc_url") or current.rpc_url,
            chain_id=snapshot.get("chain_id") or current.chain_id,
            certificate_registry_address=snapshot.get("certificate_registry_address") or current.certificate_registry_address,
        )
        try:
            record = read_chain_record(cert.certificate_id, config=config)
        except VerificationUnavailable as exc:
            return Response({"detail": str(exc), "code": "chain_unavailable"}, status=503)
        response = Response({key: record[key] for key in ("exists", "status", "chain_id", "contract_address", "block_number") if key in record})
        response["Cache-Control"] = "private, no-store"
        return response
