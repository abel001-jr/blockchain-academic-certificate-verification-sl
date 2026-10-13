"""
Officer setup gate — limited session only.

  POST /api/auth/officer-setup/wallet/challenge/
  POST /api/auth/officer-setup/wallet/verify/
  POST /api/auth/officer-setup/password/
"""

import secrets
from datetime import timedelta

from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status

from institutions.models import WalletNonce
from institutions.wallet_auth import _recover_address
from audit.utils import log_action
from .permissions import IsOfficerSetupSession
from .models import User


NONCE_TTL_MINUTES = 5


class OfficerSetupWalletChallengeView(APIView):
    """
    POST { "address": "0x..." }
    Issue a nonce the officer must sign to prove key ownership.
    """
    permission_classes = [IsAuthenticated, IsOfficerSetupSession]

    def post(self, request):
        address = request.data.get("address", "").strip().lower()
        if not address or not address.startswith("0x") or len(address) != 42:
            return Response(
                {"detail": "A valid Ethereum address is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Wallet must not already belong to another account
        taken = User.objects.filter(wallet_address__iexact=address).exclude(pk=request.user.pk)
        if taken.exists():
            return Response(
                {"detail": "This wallet is already linked to another INTELLIGENT ACADEMIC CREDENTIALING account."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        WalletNonce.objects.filter(
            address=address,
            purpose=WalletNonce.PURPOSE_SETUP,
            used=False,
            created_at__lt=timezone.now() - timedelta(minutes=NONCE_TTL_MINUTES),
        ).update(used=True)

        nonce = secrets.token_hex(32)
        timestamp = timezone.now().isoformat()
        message = (
            f"INTELLIGENT ACADEMIC CREDENTIALING officer wallet verification\n"
            f"address: {address}\n"
            f"email: {request.user.email}\n"
            f"nonce: {nonce}\n"
            f"timestamp: {timestamp}\n\n"
            f"This proves you control this wallet. No transaction or gas fees."
        )

        WalletNonce.objects.create(
            address=address,
            nonce=nonce,
            message=message,
            purpose=WalletNonce.PURPOSE_SETUP,
        )

        return Response({"message": message, "nonce": nonce})


class OfficerSetupWalletVerifyView(APIView):
    """
    POST { "address": "0x...", "signature": "0x..." }
    Verify signature and bind wallet to the officer (still pending on-chain auth).
    """
    permission_classes = [IsAuthenticated, IsOfficerSetupSession]

    def post(self, request):
        address = request.data.get("address", "").strip().lower()
        signature = request.data.get("signature", "").strip()

        if not address or not signature:
            return Response(
                {"detail": "address and signature are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        cutoff = timezone.now() - timedelta(minutes=NONCE_TTL_MINUTES)
        nonce_record = (
            WalletNonce.objects
            .filter(
                address=address,
                purpose=WalletNonce.PURPOSE_SETUP,
                used=False,
                created_at__gte=cutoff,
            )
            .order_by("-created_at")
            .first()
        )
        if not nonce_record:
            return Response(
                {"detail": "No valid challenge found. Request a new one."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        recovered = _recover_address(nonce_record.message, signature)
        if recovered != address:
            return Response(
                {"detail": "Signature verification failed."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        nonce_record.used = True
        nonce_record.verified = True
        nonce_record.save()

        taken = User.objects.filter(wallet_address__iexact=address).exclude(pk=request.user.pk)
        if taken.exists():
            return Response(
                {"detail": "This wallet is already linked to another INTELLIGENT ACADEMIC CREDENTIALING account."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = request.user
        user.wallet_address = address
        user.wallet_verified = True
        user.save(update_fields=["wallet_address", "wallet_verified", "updated_at"])

        log_action(
            actor=user,
            action="officer.wallet_verified",
            target_type="User",
            target_id=str(user.id),
            detail=f"Officer verified wallet {address}",
        )

        from .serializers import UserSerializer
        return Response({
            "detail": "Wallet verified.",
            "user": UserSerializer(user).data,
        })


class OfficerSetupPasswordView(APIView):
    """
    POST { "password": "..." }
    Set permanent password and retire the temporary one.
    Requires wallet_verified first.
    """
    permission_classes = [IsAuthenticated, IsOfficerSetupSession]

    def post(self, request):
        user = request.user
        password = request.data.get("password", "")

        if not user.wallet_verified or not user.wallet_address:
            return Response(
                {"detail": "Connect and verify your wallet before setting a password."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not password or len(password) < 8:
            return Response(
                {"detail": "Password must be at least 8 characters."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(password)
        user.must_change_password = False
        user.save(update_fields=["password", "must_change_password", "updated_at"])

        log_action(
            actor=user,
            action="officer.password_set",
            target_type="User",
            target_id=str(user.id),
            detail="Officer set permanent password; temp password retired.",
        )

        from .serializers import UserSerializer
        return Response({
            "detail": (
                "Setup complete. Your temporary password is retired. "
                "Wait for your institution administrator to authorize your wallet on-chain, "
                "then sign in with MetaMask."
            ),
            "setup_complete": True,
            "pending_authorization": not user.on_chain_authorized,
            "user": UserSerializer(user).data,
        })
