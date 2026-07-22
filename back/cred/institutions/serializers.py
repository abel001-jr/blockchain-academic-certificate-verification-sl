"""institutions/serializers.py"""

from rest_framework import serializers
from .models import Institution, InstitutionApplication, WalletNonce


class InstitutionSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Institution
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at", "is_chain_active", "anchor_tx_hash"]


class InstitutionListSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Institution
        fields = [
            "id", "institution_id", "name", "short_name",
            "wallet_address", "is_active", "is_chain_active",
        ]


class InstitutionApplicationSerializer(serializers.ModelSerializer):
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
