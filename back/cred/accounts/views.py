"""accounts/views.py"""

from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.exceptions import ValidationError
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import User, Role
from .serializers import (
    UserSerializer,
    UserCreateSerializer,
    UserUpdateSerializer,
    SelfProfileSerializer,
    UserStatusSerializer,
    ChangePasswordSerializer,
    CredenceTokenObtainSerializer,
    OfficerAdminUpdateSerializer,
)
from .permissions import IsInstitutionSetupAdmin, IsFullSession, IsRegistrar
from .tokens import is_setup_token
from audit.utils import log_action


class CredenceTokenObtainView(TokenObtainPairView):
    """
    POST /api/auth/login/
    Public login — email + password → JWT (includes role claim).
    Super Admin and all other roles use this same endpoint.
    """
    permission_classes = [AllowAny]
    authentication_classes = []  # never require an existing token to log in
    serializer_class = CredenceTokenObtainSerializer


class MeView(APIView):
    """Return the authenticated user's profile (full or setup session)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        data = UserSerializer(request.user, context={"request": request}).data
        data["token_use"] = (
            "officer_setup" if is_setup_token(request.auth) else "full"
        )
        return Response(data)

    def patch(self, request):
        if is_setup_token(request.auth):
            return Response(
                {"detail": "Profile edits are not available during officer setup."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = SelfProfileSerializer(
            request.user, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSerializer(request.user, context={"request": request}).data)


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if is_setup_token(request.auth):
            return Response(
                {"detail": "Use the officer setup password endpoint instead."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = ChangePasswordSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save()
        return Response({"detail": "Password updated successfully."})


class UserListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/users/  — Super Admin: list all users
    POST /api/users/  — Super Admin / Registrar: create a user
    """
    permission_classes = [IsInstitutionSetupAdmin]

    def get_permissions(self):
        # Registrars need signer readiness for issuance, but cannot manage users.
        if self.request.method == "GET" and getattr(self.request.user, "role", None) == Role.REGISTRAR and self.request.query_params.get("role") in (Role.VC, Role.CHANCELLOR):
            return [IsFullSession(), IsRegistrar()]
        return [IsFullSession(), IsInstitutionSetupAdmin()]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return UserCreateSerializer
        return UserSerializer

    def get_queryset(self):
        user = self.request.user
        qs = User.objects.select_related("institution").all()
        role_filter = self.request.query_params.get("role")
        if role_filter:
            qs = qs.filter(role=role_filter)
        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(
                Q(email__icontains=search)
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
            )
        active = self.request.query_params.get("is_active")
        if active in ("true", "false"):
            qs = qs.filter(is_active=active == "true")
        setup_status = self.request.query_params.get("setup_status")
        officers = (Role.REGISTRAR, Role.VC, Role.CHANCELLOR)
        if setup_status == "setup_complete":
            qs = qs.filter(role__in=officers, wallet_verified=True, must_change_password=False)
        elif setup_status == "authorized":
            qs = qs.filter(role__in=officers, on_chain_authorized=True)
        elif setup_status == "pending_authorization":
            qs = qs.filter(role__in=officers, on_chain_authorized=False, wallet_verified=True, must_change_password=False)
        elif setup_status == "wallet_pending":
            qs = qs.filter(role__in=officers, wallet_verified=False)
        elif setup_status == "password_pending":
            qs = qs.filter(role__in=officers, wallet_verified=True, must_change_password=True)
        elif setup_status == "not_authorized":
            qs = qs.filter(role__in=officers, on_chain_authorized=False)
        institution_id = self.request.query_params.get("institution")
        if institution_id:
            from uuid import UUID
            try:
                UUID(institution_id)
            except ValueError:
                raise ValidationError({"institution": "Select a valid institution."})
            qs = qs.filter(institution_id=institution_id)
        from django.db.models import Case, When, Value, IntegerField
        hierarchy = [Role.SUPER_ADMIN, Role.INSTITUTIONAL_ADMIN, Role.CHANCELLOR, Role.VC, Role.REGISTRAR, Role.STUDENT]
        qs = qs.annotate(role_rank=Case(*[When(role=value, then=Value(index)) for index, value in enumerate(hierarchy)], default=Value(99), output_field=IntegerField())).order_by("role_rank", "first_name", "last_name", "id")
        if user.role == Role.SUPER_ADMIN:
            return qs
        return qs.filter(institution=user.institution)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        # Validate officer limit: maximum 2 officers (VC + Chancellor) per institution
        creating_role = serializer.validated_data.get("role")
        if creating_role in (Role.VC, Role.CHANCELLOR):
            user = request.user
            institution = user.institution if hasattr(user, 'institution') else None
            if institution:
                existing_officers_count = User.objects.filter(
                    institution=institution,
                    role__in=[Role.VC, Role.CHANCELLOR],
                    is_active=True
                ).count()
                if existing_officers_count >= 2:
                    return Response(
                        {"detail": "Maximum of 2 active officers (VC and Chancellor) allowed per institution. Deactivate an existing officer to add a new one."},
                        status=status.HTTP_400_BAD_REQUEST
                    )
        
        user = serializer.save()
        headers = self.get_success_headers(UserSerializer(user).data)
        body = UserSerializer(user).data
        if user.is_officer:
            emailed = getattr(user, "_temp_password_emailed", False)
            body["email_sent"] = bool(emailed)
            temp_pw = getattr(user, "_temp_password", None)
            if emailed and temp_pw:
                body["temp_password"] = temp_pw
                body["detail"] = (
                    "Officer created. SMTP accepted the invite — also share this "
                    "temporary password if the inbox does not receive it."
                )
            elif emailed:
                body["detail"] = "Officer created. A temporary password was emailed."
            else:
                body["detail"] = (
                    "Officer created. Email is off — copy the temporary password "
                    "and share it with the officer (shown once)."
                )
                if temp_pw:
                    body["temp_password"] = temp_pw
            # Guarantee plaintext once at creation when email is disabled
            if not emailed and temp_pw:
                body["temp_password"] = temp_pw
        return Response(body, status=status.HTTP_201_CREATED, headers=headers)


class UserDetailView(generics.RetrieveUpdateAPIView):
    """GET / PATCH a specific user. Records are deactivated, never deleted."""
    permission_classes = [IsInstitutionSetupAdmin]

    def get_serializer_class(self):
        if self.request.method in ("PATCH", "PUT"):
            if "is_active" in self.request.data:
                return UserStatusSerializer
            obj = self.get_object()
            if obj.is_officer:
                return OfficerAdminUpdateSerializer
            return UserUpdateSerializer
        return UserSerializer

    def get_queryset(self):
        user = self.request.user
        if user.role == Role.SUPER_ADMIN:
            return User.objects.all()
        return User.objects.filter(institution=user.institution)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        new_is_active = request.data.get("is_active")
        status_changing = isinstance(new_is_active, bool) and new_is_active != instance.is_active
        if status_changing:
            reason = str(request.data.get("reason", "")).strip()
            if not reason:
                raise ValidationError("A reason is required to activate or deactivate a user.")
            if not new_is_active and instance.pk == request.user.pk:
                raise ValidationError("You cannot deactivate your own Super Admin account.")
        if (
            instance.role == Role.SUPER_ADMIN
            and new_is_active is False
            and User.objects.filter(role=Role.SUPER_ADMIN, is_active=True)
                .exclude(pk=instance.pk).count() == 0
        ):
            raise ValidationError("Cannot deactivate the last Super Admin.")
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        if status_changing:
            log_action(
                actor=request.user,
                action="user.activated" if new_is_active else "user.deactivated",
                target_type="User",
                target_id=str(user.id),
                detail=f"{user.full_name} ({user.email}): {reason}",
                ip_address=request.META.get("REMOTE_ADDR"),
            )
        body = UserSerializer(user).data
        if user.is_officer:
            emailed = getattr(user, "_temp_password_emailed", False)
            temp_pw = getattr(user, "_temp_password", None)
            if temp_pw is not None or emailed:
                body["email_sent"] = bool(emailed)
                if temp_pw:
                    body["temp_password"] = temp_pw
                if emailed and temp_pw:
                    body["detail"] = (
                        "Officer updated. SMTP accepted invite — use this temp "
                        "password if mail does not arrive."
                    )
                elif emailed:
                    body["detail"] = "Officer updated. Temporary password emailed."
                elif temp_pw:
                    body["detail"] = (
                        "Officer updated. Share this temporary password manually "
                        "(email skipped or failed)."
                    )
                else:
                    body["detail"] = "Officer updated."
        return Response(body)



class ResendOfficerInviteView(APIView):
    """
    POST /api/users/<uuid>/resend-invite/
    Regenerate temporary credentials for an officer not yet authorized on-chain.
    """
    permission_classes = [IsInstitutionSetupAdmin]

    def post(self, request, pk):
        import secrets
        from .email_utils import send_officer_temp_password, should_return_temp_password

        qs = User.objects.filter(role__in=(Role.REGISTRAR, Role.VC, Role.CHANCELLOR))
        if request.user.role != Role.SUPER_ADMIN:
            qs = qs.filter(institution=request.user.institution)
        officer = get_object_or_404(qs, pk=pk)

        if officer.on_chain_authorized:
            return Response(
                {"detail": "Officer is already authorized — invite no longer applies."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        temp_password = secrets.token_urlsafe(12)
        officer.set_password(temp_password)
        officer.must_change_password = True
        officer.save(update_fields=["password", "must_change_password", "updated_at"])

        inst_name = officer.institution.name if officer.institution_id else ""
        emailed = send_officer_temp_password(
            officer=officer,
            temp_password=temp_password,
            institution_name=inst_name,
        )

        log_action(
            actor=request.user,
            action="officer.invite_resent",
            target_type="User",
            target_id=str(officer.id),
            detail=f"Invite resent to {officer.email}; emailed={emailed}",
        )

        body = {
            "detail": (
                "Temporary password emailed (SMTP accepted). "
                "If Gmail is empty, use the temp_password below — verify your "
                "sender in Brevo → Senders & IP."
                if emailed
                else "Temporary password regenerated (email skipped or failed)."
            ),
            "email_sent": emailed,
            "officer": UserSerializer(officer).data,
        }
        if should_return_temp_password(emailed):
            body["temp_password"] = temp_password
        return Response(body)

class AuthorizeOfficerOnChainView(APIView):
    """
    POST /api/users/<uuid>/authorize-on-chain/
    Body: { "tx_hash": "0x..." }

    Registrar records MetaMask authorizeVC / authorizeChancellor result.
    Officer may then obtain a full JWT via wallet sign-in.
    """
    permission_classes = [IsInstitutionSetupAdmin]

    def post(self, request, pk):
        tx_hash = (request.data.get("tx_hash") or "").strip()
        if not tx_hash.startswith("0x") or len(tx_hash) < 10:
            return Response(
                {"detail": "A valid tx_hash is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        qs = User.objects.filter(role__in=(Role.REGISTRAR, Role.VC, Role.CHANCELLOR))
        if request.user.role != Role.SUPER_ADMIN:
            qs = qs.filter(institution=request.user.institution)
        officer = get_object_or_404(qs, pk=pk)

        if not officer.wallet_verified or not officer.wallet_address:
            return Response(
                {
                    "detail": (
                        "Officer must complete wallet verification before "
                        "on-chain authorization."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if officer.must_change_password:
            return Response(
                {
                    "detail": (
                        "Officer must set a permanent password before "
                        "on-chain authorization."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        officer.on_chain_authorized = True
        officer.is_active = True
        officer.save(update_fields=["on_chain_authorized", "is_active", "updated_at"])

        log_action(
            actor=request.user,
            action="officer.authorized_on_chain",
            target_type="User",
            target_id=str(officer.id),
            detail=f"Authorized {officer.role} on-chain. Tx: {tx_hash}",
        )

        return Response({
            "detail": "Officer authorized on-chain.",
            "tx_hash": tx_hash,
            "officer": UserSerializer(officer).data,
        })


class RevokeOfficerOnChainView(APIView):
    """
    POST /api/users/<uuid>/revoke-on-chain/
    Body: { "tx_hash": "0x..." }

    After MetaMask revokeVC / revokeChancellor.
    """
    permission_classes = [IsInstitutionSetupAdmin]

    def post(self, request, pk):
        tx_hash = (request.data.get("tx_hash") or "").strip()
        if not tx_hash.startswith("0x") or len(tx_hash) < 10:
            return Response(
                {"detail": "A valid tx_hash is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        qs = User.objects.filter(role__in=(Role.REGISTRAR, Role.VC, Role.CHANCELLOR))
        if request.user.role != Role.SUPER_ADMIN:
            qs = qs.filter(institution=request.user.institution)
        officer = get_object_or_404(qs, pk=pk)

        if not officer.on_chain_authorized:
            return Response(
                {"detail": "Officer is not currently authorized on-chain."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        officer.on_chain_authorized = False
        officer.is_active = False
        officer.save(update_fields=["on_chain_authorized", "is_active", "updated_at"])

        log_action(
            actor=request.user,
            action="officer.revoked_on_chain",
            target_type="User",
            target_id=str(officer.id),
            detail=f"Revoked {officer.role} on-chain. Tx: {tx_hash}",
        )

        return Response({
            "detail": "Officer revoked on-chain.",
            "tx_hash": tx_hash,
            "officer": UserSerializer(officer).data,
        })
