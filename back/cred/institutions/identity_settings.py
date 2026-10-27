from rest_framework import serializers
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsFullSession, IsInstitutionSetupAdmin, IsRegistrarOrAbove
from audit.utils import log_action
from .models import Institution


class InstitutionIdentitySerializer(serializers.ModelSerializer):
    class Meta:
        model = Institution
        fields = ["reference_logo", "reference_seal", "reference_transcript_seal"]

    def validate(self, attrs):
        for field, image in attrs.items():
            if image and (image.size > 5 * 1024 * 1024 or image.image.format not in {"JPEG", "PNG", "WEBP"}):
                raise serializers.ValidationError({field: "Upload a JPEG, PNG or WebP image up to 5 MB."})
        return attrs


class InstitutionIdentitySettingsView(APIView):
    parser_classes = [MultiPartParser, FormParser]

    def get_permissions(self):
        return [IsFullSession(), IsInstitutionSetupAdmin() if self.request.method == "PATCH" else IsRegistrarOrAbove()]

    def get(self, request):
        if not request.user.institution_id:
            return Response({"detail": "No institution linked."}, status=400)
        return Response(InstitutionIdentitySerializer(request.user.institution, context={"request": request}).data)

    def patch(self, request):
        if not request.user.institution_id:
            return Response({"detail": "No institution linked."}, status=400)
        serializer = InstitutionIdentitySerializer(request.user.institution, data=request.data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        log_action(actor=request.user, action="institution.identity.updated", target_type="Institution", target_id=str(request.user.institution_id), detail="Updated institution logo/seal references")
        return Response(serializer.data)
