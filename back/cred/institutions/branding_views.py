"""Certificate branding API — GET/PATCH institution template."""

from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsFullSession, IsRegistrar, IsRegistrarOrAbove
from audit.utils import log_action

from .branding_serializers import CertificateTemplateSerializer
from .models import CertificateTemplate
from .serializers import InstitutionEmailSettingsSerializer
from accounts.permissions import IsAdminOrAbove, IsInstitutionSetupAdmin


def _get_or_create_template(institution):
    template, _ = CertificateTemplate.objects.get_or_create(institution=institution)
    return template


class InstitutionEmailSettingsView(APIView):
    permission_classes = [IsFullSession, IsInstitutionSetupAdmin]

    def get(self, request):
        if not request.user.institution_id:
            return Response({"detail": "No institution linked."}, status=400)
        return Response(InstitutionEmailSettingsSerializer(request.user.institution).data)

    def patch(self, request):
        if not request.user.institution_id:
            return Response({"detail": "No institution linked."}, status=400)
        serializer = InstitutionEmailSettingsSerializer(request.user.institution, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        log_action(actor=request.user, action="institution.email_settings.updated", target_type="Institution", target_id=str(request.user.institution_id), detail="Updated contact email / graduate email domain")
        return Response(serializer.data)


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
        data = CertificateTemplateSerializer(template, context={"request": request}).data
        data["active_revision_id"] = str(template.active_revision_id) if template.active_revision_id else None
        data["email_domain"] = request.user.institution.email_domain
        data["required_signers"] = ["registrar", "vc", "chancellor"]
        return Response(data)


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
