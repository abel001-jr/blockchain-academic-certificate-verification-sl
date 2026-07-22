"""Certificate branding (Settings → Certificate Branding)."""

from rest_framework import serializers

from .branding import CERT_PRESETS
from .models import CertificateTemplate


class CertificateTemplateSerializer(serializers.ModelSerializer):
    logo_url = serializers.SerializerMethodField()
    presets = serializers.SerializerMethodField()
    institution_name = serializers.CharField(source="institution.name", read_only=True)

    class Meta:
        model = CertificateTemplate
        fields = [
            "preset",
            "logo",
            "logo_url",
            "presets",
            "institution_name",
            "updated_at",
        ]
        read_only_fields = ["logo_url", "presets", "institution_name", "updated_at"]
        extra_kwargs = {
            "logo": {"write_only": True, "required": False},
        }

    def get_logo_url(self, obj):
        if not obj.logo:
            return ""
        request = self.context.get("request")
        url = obj.logo.url
        if request:
            return request.build_absolute_uri(url)
        return url

    def get_presets(self, obj):
        return list(CERT_PRESETS.values())

    def validate_preset(self, value):
        if value not in CERT_PRESETS:
            raise serializers.ValidationError(
                f"Unknown preset. Choose one of: {', '.join(CERT_PRESETS)}"
            )
        return value
