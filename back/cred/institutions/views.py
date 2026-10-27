"""institutions/views.py — Full onboarding & registrar management flow."""

import secrets
import datetime

from django.utils import timezone
from django.shortcuts import get_object_or_404

from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.parsers import MultiPartParser, FormParser

from .models import Institution, InstitutionApplication, WalletNonce
from .serializers import (
    InstitutionSerializer, InstitutionListSerializer,
    InstitutionApplicationSerializer, ApplicationReviewSerializer,
    BindWalletSerializer, AnchorOnChainSerializer, AuthorizeRegistrarSerializer,
)
from accounts.models import User, Role
from accounts.permissions import IsSuperAdmin, IsInstitutionSetupAdmin, IsInstitutionalAdmin, IsFullSession
from audit.utils import log_action


# ── Standard CRUD ─────────────────────────────────────────────────────────────

class InstitutionListCreateView(generics.ListCreateAPIView):
    queryset = Institution.objects.filter(is_active=True)

    def get_serializer_class(self):
        if self.request.method == "POST":
            return InstitutionSerializer
        return InstitutionListSerializer

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsSuperAdmin()]
        return [IsFullSession()]

    def get_queryset(self):
        # The Super Admin management screen must retain deactivated institutions
        # so they can be audited and reactivated. Other callers only see active
        # institutions by default.
        include_inactive = self.request.query_params.get("include_inactive")
        if include_inactive and self.request.user.role == Role.SUPER_ADMIN:
            qs = Institution.objects.all()
        else:
            qs = Institution.objects.filter(is_active=True)
        # Support ?is_chain_active=true/false from the anchor admin page
        chain_active_param = self.request.query_params.get("is_chain_active")
        if chain_active_param is not None:
            flag = chain_active_param.lower() in ("true", "1", "yes")
            qs = qs.filter(is_chain_active=flag)
        return qs.order_by("name")


class InstitutionDetailView(generics.RetrieveUpdateAPIView):
    queryset           = Institution.objects.all()
    serializer_class   = InstitutionSerializer
    permission_classes = [IsInstitutionSetupAdmin]

    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [IsFullSession()]
        return [IsFullSession(), IsInstitutionSetupAdmin()]

    def get_queryset(self):
        if self.request.user.role == Role.SUPER_ADMIN:
            return Institution.objects.all()
        return Institution.objects.filter(pk=self.request.user.institution_id)

    def update(self, request, *args, **kwargs):
        """Require and audit a reason for an institution status change."""
        instance = self.get_object()
        new_is_active = request.data.get("is_active")
        status_changing = isinstance(new_is_active, bool) and new_is_active != instance.is_active

        if status_changing:
            reason = str(request.data.get("reason", "")).strip()
            if not reason:
                return Response(
                    {"detail": "A reason is required to activate or deactivate an institution."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        response = super().update(request, *args, **kwargs)

        if status_changing:
            log_action(
                actor=request.user,
                action="institution.activated" if new_is_active else "institution.deactivated",
                target_type="Institution",
                target_id=str(instance.id),
                detail=f"{instance.name}: {reason}",
                ip_address=request.META.get("REMOTE_ADDR"),
            )
        return response


# ── Phase 1: Application submission (public) ──────────────────────────────────

class InstitutionApplyView(APIView):
    """
    POST /api/institutions/apply/
    Public endpoint. Anyone can submit an onboarding application.
    Creates a pending InstitutionApplication record.
    """
    permission_classes = [AllowAny]
    parser_classes     = [MultiPartParser, FormParser]

    def post(self, request):
        serializer = InstitutionApplicationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Prevent duplicate applications for same admin email
        if InstitutionApplication.objects.filter(
            admin_email=serializer.validated_data["admin_email"]
        ).exclude(status="rejected").exists():
            return Response(
                {"detail": "An application for this email already exists."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        application = serializer.save()

        log_action(
            actor=None,
            action="institution.application_submitted",
            target_type="InstitutionApplication",
            target_id=str(application.id),
            detail=f"Application submitted: {application.institution_name}",
        )

        return Response(serializer.data, status=status.HTTP_201_CREATED)


# ── Phase 2: Super Admin review ───────────────────────────────────────────────

class PendingApplicationsView(generics.ListAPIView):
    """GET /api/admin/institutions/pending/"""
    serializer_class   = InstitutionApplicationSerializer
    permission_classes = [IsSuperAdmin]

    def get_queryset(self):
        return InstitutionApplication.objects.filter(status="pending")


class ReviewApplicationView(APIView):
    """
    POST /api/admin/institutions/<id>/review/
    Super Admin approves or rejects an application.
    """
    permission_classes = [IsSuperAdmin]

    def post(self, request, pk):
        application = get_object_or_404(InstitutionApplication, pk=pk, status="pending")
        serializer  = ApplicationReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if data["action"] == "reject":
            application.status           = "rejected"
            application.rejection_reason = data["rejection_reason"]
            application.reviewed_by      = request.user
            application.reviewed_at      = timezone.now()
            application.save()

            log_action(
                actor=request.user,
                action="institution.application_rejected",
                target_type="InstitutionApplication",
                target_id=str(application.id),
                detail=f"Rejected: {data['rejection_reason']}",
            )

            return Response({"detail": "Application rejected."})

        # Approve: create Institution + Institutional Admin with pre-verified wallet
        if not application.wallet_verified or not application.wallet_address:
            return Response(
                {"detail": "Application has no verified wallet — cannot approve."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        wallet = application.wallet_address.lower()

        institution = Institution.objects.create(
            institution_id=data["institution_id"],
            name=application.institution_name,
            country=application.country,
            email=application.contact_email,
            phone=application.contact_phone,
            wallet_address=wallet,
            is_active=True,
        )

        admin_user = User.objects.create_user(
            email=application.admin_email,
            password=secrets.token_urlsafe(16),  # wallet auth is primary
            first_name=application.admin_first_name,
            last_name=application.admin_last_name,
            role=Role.INSTITUTIONAL_ADMIN,
            institution=institution,
            wallet_address=wallet,
            wallet_verified=True,
        )

        application.status      = "approved"
        application.institution = institution
        application.reviewed_by = request.user
        application.reviewed_at = timezone.now()
        application.save()

        log_action(
            actor=request.user,
            action="institution.application_approved",
            target_type="InstitutionApplication",
            target_id=str(application.id),
            detail=(
                f"Approved. Institution {institution.institution_id} created. "
                f"Admin: {admin_user.email}. Wallet: {wallet}"
            ),
        )

        return Response({
            "detail": "Approved. Ready to anchor on-chain.",
            "institution": {
                "id": str(institution.id),
                "institution_id": institution.institution_id,
                "name": institution.name,
                "wallet_address": institution.wallet_address,
            },
            "admin_user_id": str(admin_user.id),
        })


# ── Phase 3a: Institutional Admin binds wallet ───────────────────────────────

class BindWalletView(APIView):
    """
    POST /api/institutions/<id>/bind-wallet/
    Institutional Admin submits their MetaMask wallet address after approval.
    """
    permission_classes = [IsFullSession]

    def post(self, request, pk):
        institution = get_object_or_404(Institution, pk=pk)

        # Only the admin of this institution can bind a wallet
        if request.user.institution_id != institution.id:
            return Response(status=status.HTTP_403_FORBIDDEN)
        if request.user.role != Role.INSTITUTIONAL_ADMIN:
            return Response(status=status.HTTP_403_FORBIDDEN)

        if institution.wallet_address or institution.is_chain_active:
            return Response({"detail": "Contact the system admin to change an existing institution wallet."}, status=status.HTTP_403_FORBIDDEN)

        serializer = BindWalletSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        wallet = serializer.validated_data["wallet_address"]
        institution.wallet_address = wallet
        institution.save()

        # Also update the user's wallet
        request.user.wallet_address = wallet
        request.user.save()

        log_action(
            actor=request.user,
            action="institution.wallet_bound",
            target_type="Institution",
            target_id=str(institution.id),
            detail=f"Wallet {wallet} bound.",
        )

        return Response({"detail": "Wallet bound.", "wallet_address": wallet})


# ── Phase 3b: Super Admin records on-chain anchor ────────────────────────────

class AnchorOnChainView(APIView):
    """
    POST /api/institutions/<id>/anchor/
    Super Admin records the tx_hash after calling registerIssuer() via MetaMask.
    Django state follows the chain.
    """
    permission_classes = [IsSuperAdmin]

    def post(self, request, pk):
        institution = get_object_or_404(Institution, pk=pk)
        serializer  = AnchorOnChainSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        institution.is_chain_active = True
        institution.anchor_tx_hash  = serializer.validated_data["tx_hash"]
        institution.save()

        # Flip linked application to active (on-chain)
        try:
            app = institution.application
            app.status = "active"
            app.save(update_fields=["status", "updated_at"])
        except InstitutionApplication.DoesNotExist:
            pass

        from .catalog_seed import seed_default_grade_classifications
        seed_default_grade_classifications(institution)

        log_action(
            actor=request.user,
            action="institution.anchored_on_chain",
            target_type="Institution",
            target_id=str(institution.id),
            detail=f"On-chain anchor tx: {institution.anchor_tx_hash}",
        )

        return Response({"detail": "Institution anchored on-chain.", "tx_hash": institution.anchor_tx_hash})


# ── Phase 4: Registrar invitation + on-chain authorization ───────────────────

class InviteRegistrarView(APIView):
    """
    POST /api/institutions/registrars/invite/
    Institutional Admin creates a pending Registrar profile.
    """
    permission_classes = [IsInstitutionSetupAdmin]

    def post(self, request):
        domain = getattr(request.user.institution, "email_domain", "").strip().lower()
        if not domain:
            return Response({"detail": "Configure the institution email domain in Settings before adding officers."}, status=400)
        if request.data.get("email", "").strip().lower().rpartition("@")[2] != domain:
            return Response({"detail": f"Use the institution's @{domain} domain."}, status=400)
        data = request.data
        email      = data.get("email", "").strip()
        first_name = data.get("first_name", "").strip()
        last_name  = data.get("last_name", "").strip()

        if not email:
            return Response({"detail": "Email is required."}, status=status.HTTP_400_BAD_REQUEST)

        if User.objects.filter(email=email).exists():
            return Response({"detail": "User with this email already exists."}, status=status.HTTP_400_BAD_REQUEST)

        registrar = User.objects.create_user(
            email=email,
            password=secrets.token_urlsafe(16),
            first_name=first_name,
            last_name=last_name,
            role=Role.REGISTRAR,
            institution=request.user.institution,
            is_active=False,  # inactive until wallet bound + on-chain authorized
        )

        log_action(
            actor=request.user,
            action="registrar.invited",
            target_type="User",
            target_id=str(registrar.id),
            detail=f"Registrar invited: {email}",
        )

        from accounts.serializers import UserSerializer
        return Response(UserSerializer(registrar).data, status=status.HTTP_201_CREATED)


class AuthorizeRegistrarOnChainView(APIView):
    """
    POST /api/institutions/registrars/authorize/
    Institutional Admin records the tx_hash after calling authorizeRegistrar()
    via MetaMask. Activates the registrar in Django.
    """
    permission_classes = [IsInstitutionSetupAdmin]

    def post(self, request):
        serializer = AuthorizeRegistrarSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        registrar = get_object_or_404(
            User,
            pk=data["registrar_id"],
            role=Role.REGISTRAR,
            institution=request.user.institution,
        )

        registrar.is_active = True
        registrar.save()

        log_action(
            actor=request.user,
            action="registrar.authorized_on_chain",
            target_type="User",
            target_id=str(registrar.id),
            detail=f"Authorized on-chain. Tx: {data['tx_hash']}",
        )

        from accounts.serializers import UserSerializer
        return Response({
            "detail":   "Registrar authorized on-chain.",
            "registrar": UserSerializer(registrar).data,
            "tx_hash":   data["tx_hash"],
        })


class RevokeRegistrarOnChainView(APIView):
    """
    POST /api/institutions/registrars/<user_id>/revoke/
    Records the on-chain revocation and deactivates in Django.
    """
    permission_classes = [IsInstitutionSetupAdmin]

    def post(self, request, pk):
        registrar = get_object_or_404(
            User, pk=pk, role=Role.REGISTRAR, institution=request.user.institution
        )

        tx_hash = request.data.get("tx_hash", "")

        registrar.is_active = False
        registrar.save()

        log_action(
            actor=request.user,
            action="registrar.revoked_on_chain",
            target_type="User",
            target_id=str(registrar.id),
            detail=f"Revoked on-chain. Tx: {tx_hash}",
        )

        return Response({"detail": "Registrar revoked.", "tx_hash": tx_hash})
