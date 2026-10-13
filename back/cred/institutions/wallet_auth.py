"""
institutions/wallet_auth.py

SIWE-style (Sign-In With Ethereum) challenge-response authentication.
Spec §5 — wallet-based auth for Institutional Admin, Registrar, Chancellor roles.

Flow:
  1. POST /api/auth/wallet/challenge/  → returns a nonce-embedded message to sign
  2. POST /api/auth/wallet/verify/     → verifies signature, returns JWT
"""

import secrets
import hashlib
from datetime import timedelta

from django.utils import timezone
from django.conf import settings

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework import status

from .models import WalletNonce
from accounts.models import User, Role
from audit.utils import log_action

# How long a nonce is valid before expiry
NONCE_TTL_MINUTES = 5


def _recover_address(message: str, signature: str) -> str | None:
    """
    Recover the signer address from a personal_sign signature using eth_account.
    Returns lowercase 0x-prefixed address, or None on failure.
    """
    try:
        from eth_account import Account
        from eth_account.messages import encode_defunct
        msg = encode_defunct(text=message)
        recovered = Account.recover_message(msg, signature=signature)
        return recovered.lower()
    except Exception:
        return None


class WalletChallengeView(APIView):
    """
    POST /api/auth/wallet/challenge/
    Body: { "address": "0x..." }
    Returns a challenge message the client must sign with MetaMask.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        address = request.data.get("address", "").strip().lower()
        if not address or not address.startswith("0x") or len(address) != 42:
            return Response(
                {"detail": "A valid Ethereum address is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Invalidate any unused nonces for this address older than TTL
        WalletNonce.objects.filter(
            address=address,
            purpose=WalletNonce.PURPOSE_LOGIN,
            used=False,
            created_at__lt=timezone.now() - timedelta(minutes=NONCE_TTL_MINUTES),
        ).update(used=True)

        nonce = secrets.token_hex(32)
        timestamp = timezone.now().isoformat()

        message = (
            f"Sign in to INTELLIGENT ACADEMIC CREDENTIALING\n"
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
            purpose=WalletNonce.PURPOSE_LOGIN,
        )

        return Response({"message": message, "nonce": nonce})


class WalletVerifyView(APIView):
    """
    POST /api/auth/wallet/verify/
    Body: { "address": "0x...", "signature": "0x..." }

    Verifies the signature, checks on-chain authorization status,
    issues JWT tokens.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        address   = request.data.get("address",   "").strip().lower()
        signature = request.data.get("signature", "").strip()

        if not address or not signature:
            return Response(
                {"detail": "address and signature are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ── 1. Find the most recent valid nonce for this address ──────────────
        cutoff = timezone.now() - timedelta(minutes=NONCE_TTL_MINUTES)
        nonce_record = (
            WalletNonce.objects
            .filter(address=address, purpose=WalletNonce.PURPOSE_LOGIN, used=False, created_at__gte=cutoff)
            .order_by("-created_at")
            .first()
        )

        if not nonce_record:
            return Response(
                {"detail": "No valid challenge found. Request a new one."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ── 2. Recover signer from signature ─────────────────────────────────
        recovered = _recover_address(nonce_record.message, signature)

        if recovered != address:
            return Response(
                {"detail": "Signature verification failed."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # ── 3. Mark nonce as used (single-use enforcement) ───────────────────
        nonce_record.used = True
        nonce_record.save()

        # ── 4. Look up Django user by wallet address ──────────────────────────
        try:
            user = User.objects.get(wallet_address__iexact=address)
        except User.DoesNotExist:
            return Response(
                {"detail": "No account is associated with this wallet address."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        if not user.is_active:
            return Response(
                {"detail": "Your account is not yet active. Contact your administrator."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Wallet auth for institutional roles
        wallet_roles = [
            Role.SUPER_ADMIN, Role.INSTITUTIONAL_ADMIN, Role.REGISTRAR,
            Role.VC, Role.CHANCELLOR,
        ]
        if user.role not in wallet_roles:
            return Response(
                {"detail": "Wallet authentication is not available for this role."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Registrar / legacy admin may sign in only after on-chain anchor
        if user.role in (Role.INSTITUTIONAL_ADMIN, Role.REGISTRAR):
            inst = user.institution
            if not inst or not inst.is_chain_active:
                return Response(
                    {
                        "detail": (
                            "Your institution is not active on-chain yet. "
                            "Wait for Super Admin to Approve & Anchor, then try again."
                        )
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

        if user.role in (Role.VC, Role.CHANCELLOR):
            inst = user.institution
            if not inst or not inst.is_chain_active:
                return Response(
                    {"detail": "Institution is not active on-chain yet."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if not user.wallet_verified or not user.wallet_address:
                return Response(
                    {
                        "detail": (
                            "Complete officer setup first (temp password login → "
                            "verify wallet → set permanent password)."
                        )
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )
            if not user.on_chain_authorized:
                return Response(
                    {
                        "detail": (
                            "Wallet verified — pending on-chain authorization by "
                            "your Registrar. You cannot access the dashboard yet."
                        )
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

        # ── 5. Issue full JWT ─────────────────────────────────────────────────
        from accounts.tokens import issue_full_tokens

        tokens = issue_full_tokens(user, wallet=address)

        log_action(
            actor=user,
            action="user.wallet_login",
            target_type="User",
            target_id=str(user.id),
            detail=f"Wallet sign-in: {address}",
            ip_address=_get_ip(request),
        )

        return Response({
            **tokens,
            "setup_required": False,
            "user": {
                "id":          str(user.id),
                "full_name":   user.full_name,
                "email":       user.email,
                "role":        user.role,
                "wallet":      address,
                "institution": str(user.institution_id) if user.institution_id else None,
            },
        })


def _get_ip(request):
    x_forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded:
        return x_forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")
