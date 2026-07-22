"""Certificate branding API — GET/PATCH institution template."""

from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsFullSession, IsRegistrar, IsRegistrarOrAbove
from audit.utils import log_action

from .branding_serializers import CertificateTemplateSerializer
from .models import CertificateTemplate


def _get_or_create_template(institution):
    template, _ = CertificateTemplate.objects.get_or_create(institution=institution)
    return template


class CertificateBrandingView(APIView):
    """
    GET  /api/certificate-branding/  — registrar/officers: current template + presets
    PATCH /api/certificate-branding/ — registrar: update preset and/or logo
    """
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_permissions(self):
        if self.request.method == "PATCH":
            return [IsFullSession(), IsRegistrar()]
        return [IsFullSession(), IsRegistrarOrAbove()]

    def get(self, request):
        if not request.user.institution_id:
            return Response({"detail": "No institution linked."}, status=400)
        template = _get_or_create_template(request.user.institution)
        return Response(
            CertificateTemplateSerializer(template, context={"request": request}).data
        )

    def patch(self, request):
        if not request.user.institution_id:
            return Response({"detail": "No institution linked."}, status=400)
        template = _get_or_create_template(request.user.institution)
        clear_logo = str(request.data.get("clear_logo", "")).lower() in ("1", "true", "yes")

        data = {}
        if "preset" in request.data:
            data["preset"] = request.data.get("preset")
        if "logo" in request.FILES:
            data["logo"] = request.FILES["logo"]

        serializer = CertificateTemplateSerializer(
            template, data=data, partial=True, context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()

        if clear_logo and "logo" not in request.FILES:
            if template.logo:
                template.logo.delete(save=False)
            template.logo = None
            template.save(update_fields=["logo", "updated_at"])

        log_action(
            actor=request.user,
            action="certificate_branding.updated",
            target_type="CertificateTemplate",
            target_id=str(template.institution_id),
            detail=f"Preset={template.preset}",
        )
        template.refresh_from_db()
        return Response(
            CertificateTemplateSerializer(template, context={"request": request}).data
        )
