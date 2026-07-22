"""
institutions/apply_wallet.py

Prove MetaMask ownership during institution application (Step 2).
No gas — challenge / personal_sign / recover only.
"""

import secrets
from datetime import timedelta

from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework import status

from .models import WalletNonce, Institution, InstitutionApplication
from .wallet_auth import _recover_address

NONCE_TTL_MINUTES = 10


class ApplyWalletChallengeView(APIView):
    """
    POST /api/institutions/apply/wallet/challenge/
    Body: { "address": "0x...", "institution_name": "..." }
    """
    permission_classes = [AllowAny]

    def post(self, request):
        address = request.data.get("address", "").strip().lower()
        institution_name = request.data.get("institution_name", "").strip()

        if not address or not address.startswith("0x") or len(address) != 42:
            return Response(
                {"detail": "A valid Ethereum address is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not institution_name:
            return Response(
                {"detail": "institution_name is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if Institution.objects.filter(wallet_address__iexact=address).exists():
            return Response(
                {"detail": "This wallet is already registered to an institution."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        WalletNonce.objects.filter(
            address=address,
            purpose=WalletNonce.PURPOSE_APPLY,
            used=False,
            created_at__lt=timezone.now() - timedelta(minutes=NONCE_TTL_MINUTES),
        ).update(used=True)

        nonce = secrets.token_hex(32)
        timestamp = timezone.now().isoformat()
        message = (
            f"Register as admin for {institution_name}\n"
            f"address: {address}\n"
            f"nonce: {nonce}\n"
            f"timestamp: {timestamp}\n\n"
            f"This request will not trigger a blockchain transaction "
            f"or cost any fees."
        )

        WalletNonce.objects.create(
            address=address,
            nonce=nonce,
            message=message,
            purpose=WalletNonce.PURPOSE_APPLY,
            institution_hint=institution_name[:255],
        )

        return Response({"message": message, "nonce": nonce})


class ApplyWalletVerifyView(APIView):
    """
    POST /api/institutions/apply/wallet/verify/
    Body: { "address": "0x...", "signature": "0x..." }
    Marks the apply nonce as verified (consumed later on application submit).
    """
    permission_classes = [AllowAny]

    def post(self, request):
        address   = request.data.get("address", "").strip().lower()
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
                purpose=WalletNonce.PURPOSE_APPLY,
                used=False,
                verified=False,
                created_at__gte=cutoff,
            )
            .order_by("-created_at")
            .first()
        )
        if not nonce_record:
            return Response(
                {"detail": "No valid apply challenge found. Request a new one."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        recovered = _recover_address(nonce_record.message, signature)
        if recovered != address:
            return Response(
                {"detail": "Signature verification failed."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        nonce_record.verified = True
        nonce_record.save(update_fields=["verified"])

        return Response({
            "detail": "Wallet verified.",
            "wallet_address": address,
            "wallet_verified": True,
            "institution_hint": nonce_record.institution_hint,
        })
