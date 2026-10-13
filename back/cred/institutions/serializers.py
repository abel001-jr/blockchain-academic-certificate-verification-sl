"""institutions/serializers.py"""

from rest_framework import serializers
from .models import Institution, InstitutionApplication, WalletNonce


class InstitutionSerializer(serializers.ModelSerializer):
    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get("request")
        if self.instance is not None:
            for name in ("institution_id", "wallet_address"):
                if name in fields:
                    fields[name].read_only = True
            if request and request.user.role == "institutional_admin":
                editable = {"name", "short_name", "country", "address", "website", "email", "phone", "logo_url"}
                for name, field in fields.items():
                    if name not in editable:
                        field.read_only = True
        return fields

    def validate_email_domain(self, value):
        import re
        value = value.strip().lower().lstrip(".@")
        if value and not re.fullmatch(r"(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}", value):
            raise serializers.ValidationError("Enter a domain such as central.edu.sl, without an email name or web address.")
        return value
    class Meta:
        model  = Institution
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at", "is_chain_active", "anchor_tx_hash"]


class InstitutionEmailSettingsSerializer(InstitutionSerializer):
    class Meta:
        model = Institution
        fields = ["email", "email_domain"]


class InstitutionListSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Institution
        fields = [
            "id", "institution_id", "name", "short_name",
            "wallet_address", "is_active", "is_chain_active",
        ]


class InstitutionApplicationSerializer(serializers.ModelSerializer):
    def _validate_letters_name(self, value):
        import unicodedata
        value = value.strip()
        if not any(character.isalpha() for character in value) or any(character != " " and unicodedata.category(character)[0] not in ("L", "M") for character in value):
            raise serializers.ValidationError("Use letters and spaces only; numbers are not allowed.")
        return value

    def validate_institution_name(self, value):
        return self._validate_letters_name(value)

    def validate_admin_first_name(self, value):
        return self._validate_letters_name(value)

    def validate_admin_last_name(self, value):
        return self._validate_letters_name(value)

    def validate_contact_email(self, value):
        if "." not in value.rpartition("@")[2]:
            raise serializers.ValidationError("Enter a complete email address, such as you@institution.edu.")
        return value

    def validate_admin_email(self, value):
        return self.validate_contact_email(value)

    def validate_contact_phone(self, value):
        if value and (not value.isascii() or not value.isdigit()):
            raise serializers.ValidationError("Contact phone must contain numbers only.")
        if value and (not 7 <= len(value) <= 15 or value.startswith("0")):
            raise serializers.ValidationError("Include the country calling code and phone number, using 7–15 digits.")
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        phone = attrs.get("contact_phone", "")
        code = self.initial_data.get("contact_calling_code", "")
        if phone:
            if not isinstance(code, str) or not code.isascii() or not code.isdigit() or not 1 <= len(code) <= 3 or code.startswith("0"):
                raise serializers.ValidationError({"contact_phone": "Provide a valid country calling code."})
            if not phone.startswith(code) or not 8 <= len(phone[len(code):]) <= 15 - len(code):
                raise serializers.ValidationError({"contact_phone": "Use at least 8 phone digits and at most 15 digits including the calling code."})
        return attrs

    def validate_country(self, value):
        import json
        from pathlib import Path
        countries = json.loads(Path(__file__).with_name("countries.json").read_text(encoding="utf-8"))
        if value not in {country["name"] for country in countries}:
            raise serializers.ValidationError("Select a valid country.")
        return value

    class Meta:
        model  = InstitutionApplication
        fields = [
            "id", "institution_name", "accreditation_body", "registration_number",
            "country", "contact_email", "contact_phone", "supporting_document",
            "admin_first_name", "admin_last_name", "admin_email",
            "wallet_address", "wallet_verified",
            "status", "rejection_reason", "institution",
            "submitted_at", "updated_at",
        ]
        read_only_fields = [
            "id", "wallet_verified", "status", "rejection_reason",
            "institution", "submitted_at", "updated_at",
        ]

    def validate_wallet_address(self, value):
        value = (value or "").strip().lower()
        if not value:
            raise serializers.ValidationError("Wallet address is required.")
        if not value.startswith("0x") or len(value) != 42:
            raise serializers.ValidationError("Invalid Ethereum address.")
        from accounts.models import User
        if User.objects.filter(wallet_address__iexact=value).exists():
            raise serializers.ValidationError("This wallet is already assigned to an account. Use a different MetaMask account.")
        if Institution.objects.filter(wallet_address__iexact=value).exists():
            raise serializers.ValidationError("Wallet already bound to another institution.")
        if InstitutionApplication.objects.filter(
            wallet_address__iexact=value, wallet_verified=True
        ).exclude(status="rejected").exists():
            raise serializers.ValidationError(
                "This wallet is already used on another pending/approved application."
            )
        return value

    def create(self, validated_data):
        wallet = validated_data.get("wallet_address", "").lower()
        # Must have a recent verified apply-proof for this wallet
        from django.utils import timezone
        from datetime import timedelta
        cutoff = timezone.now() - timedelta(minutes=30)
        proof = (
            WalletNonce.objects
            .filter(
                address=wallet,
                purpose=WalletNonce.PURPOSE_APPLY,
                verified=True,
                used=False,
                created_at__gte=cutoff,
            )
            .order_by("-created_at")
            .first()
        )
        if not proof:
            raise serializers.ValidationError({
                "wallet_address": (
                    "Wallet ownership was not verified. "
                    "Connect MetaMask and sign the challenge on Step 2."
                )
            })
        validated_data["wallet_verified"] = True
        application = super().create(validated_data)
        proof.used = True
        proof.save(update_fields=["used"])
        return application


class ApplicationReviewSerializer(serializers.Serializer):
    """Used by Super Admin to approve or reject an application."""
    action           = serializers.ChoiceField(choices=["approve", "reject"])
    rejection_reason = serializers.CharField(required=False, allow_blank=True)
    institution_id   = serializers.CharField(required=False, help_text="Required when action=approve")

    def validate(self, data):
        if data["action"] == "approve" and not data.get("institution_id"):
            raise serializers.ValidationError({"institution_id": "Required when approving."})
        if data["action"] == "reject" and not data.get("rejection_reason"):
            raise serializers.ValidationError({"rejection_reason": "Reason required when rejecting."})
        return data


class BindWalletSerializer(serializers.Serializer):
    """Legacy path — prefer wallet verified at application time."""
    wallet_address = serializers.CharField(max_length=42)

    def validate_wallet_address(self, value):
        value = value.lower()
        if not value.startswith("0x") or len(value) != 42:
            raise serializers.ValidationError("Invalid Ethereum address.")
        if Institution.objects.filter(wallet_address__iexact=value).exists():
            raise serializers.ValidationError("Wallet already bound to another institution.")
        return value


class AnchorOnChainSerializer(serializers.Serializer):
    """Super Admin records the on-chain anchor transaction hash."""
    tx_hash = serializers.CharField(max_length=66)

    def validate_tx_hash(self, value):
        if not value.startswith("0x") or len(value) != 66:
            raise serializers.ValidationError("Invalid transaction hash.")
        return value


class AuthorizeRegistrarSerializer(serializers.Serializer):
    """Institutional Admin records on-chain registrar authorization."""
    registrar_id = serializers.UUIDField(help_text="Django user UUID of the registrar")
    tx_hash      = serializers.CharField(max_length=66)

    def validate_tx_hash(self, value):
        if not value.startswith("0x") or len(value) != 66:
            raise serializers.ValidationError("Invalid transaction hash.")
        return value
