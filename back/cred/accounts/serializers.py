"""accounts/serializers.py"""

import secrets

from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.exceptions import AuthenticationFailed

from .models import User, Role
from .tokens import issue_full_tokens, issue_setup_tokens
from .email_utils import send_officer_temp_password, should_return_temp_password


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()
    officer_status = serializers.ReadOnlyField()
    needs_officer_setup = serializers.ReadOnlyField()
    has_signature = serializers.ReadOnlyField()
    signature_url = serializers.SerializerMethodField()

    class Meta:
        model  = User
        fields = [
            "id", "email", "first_name", "last_name", "full_name",
            "role", "institution", "student_id", "wallet_address",
            "is_active", "date_joined",
            "must_change_password", "wallet_verified", "on_chain_authorized",
            "officer_status", "needs_officer_setup",
            "has_signature", "signature_url", "signature_set_at",
        ]
        read_only_fields = [
            "id", "date_joined",
            "must_change_password", "wallet_verified", "on_chain_authorized",
            "officer_status", "needs_officer_setup",
            "has_signature", "signature_url", "signature_set_at",
        ]

    def get_signature_url(self, obj):
        if not obj.signature_image:
            return ""
        request = self.context.get("request")
        url = obj.signature_image.url
        if request:
            return request.build_absolute_uri(url)
        return url


class UserCreateSerializer(serializers.ModelSerializer):
    """
    Create users. For VC/Chancellor: ignore client password/wallet,
    generate a temp password, email it, and leave wallet blank.
    """
    password = serializers.CharField(
        write_only=True, min_length=8, required=False, allow_blank=True
    )

    class Meta:
        model  = User
        fields = [
            "email", "password", "first_name", "last_name",
            "role", "institution", "student_id", "wallet_address",
        ]

    def validate_role(self, value):
        if value == Role.SUPER_ADMIN:
            raise serializers.ValidationError(
                "Super Admin accounts cannot be created from the application. "
                "Use Django Admin or createsuperuser."
            )
        request = self.context.get("request")
        actor = getattr(request, "user", None) if request else None
        if actor and getattr(actor, "role", None) in (
            Role.REGISTRAR, Role.INSTITUTIONAL_ADMIN
        ):
            if value not in (Role.VC, Role.CHANCELLOR, Role.STUDENT):
                raise serializers.ValidationError(
                    "Registrars may only create VC, Chancellor, or Student accounts."
                )
        return value

    def create(self, validated_data):
        request = self.context.get("request")
        actor = getattr(request, "user", None) if request else None
        role = validated_data.get("role")

        if actor and actor.institution_id and not validated_data.get("institution"):
            validated_data["institution"] = actor.institution

        # ── Officer invite (VC / Chancellor) ──────────────────────────────────
        if role in (Role.VC, Role.CHANCELLOR):
            validated_data.pop("password", None)
            validated_data["wallet_address"] = ""
            temp_password = secrets.token_urlsafe(12)
            validated_data["must_change_password"] = True
            validated_data["wallet_verified"] = False
            validated_data["on_chain_authorized"] = False
            validated_data["is_active"] = True

            user = User(**validated_data)
            user.set_password(temp_password)
            user.save()

            inst_name = ""
            if user.institution_id:
                inst_name = user.institution.name

            email_ok = send_officer_temp_password(
                officer=user,
                temp_password=temp_password,
                institution_name=inst_name,
            )
            # Stash for the view response (never persisted)
            user._temp_password_emailed = email_ok
            user._temp_password = (
                temp_password if should_return_temp_password(email_ok) else None
            )
            return user

        # ── Other roles ───────────────────────────────────────────────────────
        password = validated_data.pop("password", None)
        if not password:
            raise serializers.ValidationError({"password": "Password is required."})
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class UserUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model  = User
        fields = [
            "first_name", "last_name", "student_id", "wallet_address",
        ]


class OfficerAdminUpdateSerializer(serializers.ModelSerializer):
    """
    Registrar may edit officer identity while setup is incomplete
    (before on-chain authorization / MetaMask full access).
    """
    email = serializers.EmailField(required=False)
    reset_temp_password = serializers.BooleanField(
        required=False, default=False, write_only=True
    )

    class Meta:
        model  = User
        fields = [
            "first_name", "last_name", "email", "role",
            "reset_temp_password",
        ]

    def validate(self, attrs):
        officer = self.instance
        if not officer or not officer.is_officer:
            raise serializers.ValidationError("Only VC / Chancellor officers can be edited here.")
        # Lock once MetaMask wallet ownership is proven (or fully authorized)
        if officer.wallet_verified or officer.on_chain_authorized:
            raise serializers.ValidationError(
                "This officer has already verified a wallet with MetaMask. "
                "Identity can no longer be edited."
            )
        return attrs

    def validate_role(self, value):
        if value not in (Role.VC, Role.CHANCELLOR):
            raise serializers.ValidationError("Role must be vc or chancellor.")
        return value

    def validate_email(self, value):
        value = (value or "").strip().lower()
        qs = User.objects.filter(email__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Another account already uses this email.")
        return value

    def update(self, instance, validated_data):
        import secrets
        from .email_utils import send_officer_temp_password

        reset = validated_data.pop("reset_temp_password", False)
        email_changed = (
            "email" in validated_data
            and validated_data["email"].lower() != (instance.email or "").lower()
        )

        for key, value in validated_data.items():
            setattr(instance, key, value)

        temp_password = None
        # New email or explicit reset → new temp password while still in invite/setup
        if (reset or email_changed) and not instance.on_chain_authorized:
            if not instance.wallet_verified or instance.must_change_password:
                temp_password = secrets.token_urlsafe(12)
                instance.set_password(temp_password)
                instance.must_change_password = True

        instance.save()

        emailed = False
        if temp_password:
            inst_name = instance.institution.name if instance.institution_id else ""
            emailed = send_officer_temp_password(
                officer=instance,
                temp_password=temp_password,
                institution_name=inst_name,
            )
            instance._temp_password_emailed = emailed
            instance._temp_password = (
                temp_password if should_return_temp_password(emailed) else None
            )
        else:
            instance._temp_password_emailed = False
            instance._temp_password = None

        return instance


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_old_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Old password is incorrect.")
        return value


class CredenceTokenObtainSerializer(TokenObtainPairSerializer):
    """
    Login: email + password.
    Officers get a limited setup JWT until wallet+password setup is done;
    after that password login is disabled (MetaMask only once authorized).
    """

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"]        = user.role
        token["full_name"]   = user.full_name
        token["institution"] = str(user.institution_id) if user.institution_id else None
        token["token_use"]   = "full"
        return token

    def validate(self, attrs):
        email = (attrs.get(self.username_field) or "").strip().lower()
        attrs[self.username_field] = email

        try:
            data = super().validate(attrs)
        except AuthenticationFailed:
            user = User.objects.filter(email__iexact=email).first()
            if user and not user.is_active:
                raise AuthenticationFailed(
                    "This account is inactive. Ask a Super Admin to reactivate it.",
                    code="user_inactive",
                )
            raise AuthenticationFailed(
                "No active account found with the given credentials.",
                code="no_active_account",
            )

        user = self.user

        # ── Officer gating ────────────────────────────────────────────────────
        if user.is_officer:
            if user.needs_officer_setup:
                tokens = issue_setup_tokens(user)
                return {
                    **tokens,
                    "setup_required": True,
                    "user": {
                        "id": str(user.id),
                        "email": user.email,
                        "full_name": user.full_name,
                        "role": user.role,
                        "wallet_verified": user.wallet_verified,
                        "must_change_password": user.must_change_password,
                    },
                }

            if not user.on_chain_authorized:
                raise AuthenticationFailed(
                    "Wallet verified — waiting for your Registrar to authorize "
                    "you on-chain. You cannot sign in until then.",
                    code="pending_authorization",
                )

            raise AuthenticationFailed(
                "Officers sign in with MetaMask after on-chain authorization. "
                "Password login is no longer available.",
                code="wallet_only",
            )

        # Ensure full-session claim on access token from parent
        refresh = self.get_token(user)
        data["refresh"] = str(refresh)
        data["access"] = str(refresh.access_token)
        data["setup_required"] = False
        return data
