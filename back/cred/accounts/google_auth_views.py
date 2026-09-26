"""
accounts/google_auth_views.py

POST /api/auth/google/

Accepts a Google ID token from the mobile app (obtained via expo-auth-session)
or the web frontend.  Verifies the token against Google's tokeninfo endpoint,
then either:
  - Finds the matching Credence user by email → issues JWT (login)
  - Creates a new student account if none exists → issues JWT (registration)

This is the only way students link their Google identity to Credence.
Officers (VC, Chancellor) use their existing email+password+MetaMask flow;
this endpoint is intentionally restricted to student / unassigned accounts.

Security:
  - Token is verified server-side against https://oauth2.googleapis.com/tokeninfo
  - Audience claim is checked against GOOGLE_CLIENT_ID from settings
  - Token must not be expired (Google returns 400 for expired tokens)
  - No password is set on auto-created accounts; only Google auth works for them
"""

import logging

import requests as http_requests
from django.conf import settings
from django.db import transaction
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from audit.utils import log_action
from .models import User, Role
from .tokens import issue_full_tokens
from .serializers import UserSerializer

logger = logging.getLogger(__name__)

GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"


def _verify_google_id_token(id_token: str) -> dict | None:
    """
    Verify a Google ID token by calling Google's tokeninfo endpoint.
    Returns the token payload dict on success, None on any failure.

    We use the tokeninfo endpoint rather than the google-auth library to
    keep dependencies minimal.  It adds one HTTP round-trip but is
    perfectly reliable for server-side verification.
    """
    try:
        resp = http_requests.get(
            GOOGLE_TOKENINFO_URL,
            params={"id_token": id_token},
            timeout=8,
        )
        if not resp.ok:
            logger.warning(
                "Google tokeninfo rejected token (status %s): %s",
                resp.status_code,
                resp.text[:200],
            )
            return None
        return resp.json()
    except Exception as exc:
        logger.exception("Google tokeninfo request failed: %s", exc)
        return None


class GoogleAuthView(APIView):
    """
    POST /api/auth/google/

    Body:
        id_token  str  required — Google ID token from the client

    Success (200):
        {
            "access":  "<jwt>",
            "refresh": "<jwt>",
            "user":    { ...UserSerializer... },
            "created": bool   — true if a new account was auto-created
        }

    Errors:
        400 — missing id_token
        401 — invalid / expired / wrong-audience token
        403 — matched account is an officer (officers must use MetaMask)
    """

    permission_classes     = [AllowAny]
    authentication_classes = []

    def post(self, request):
        id_token = (request.data.get("id_token") or "").strip()
        if not id_token:
            return Response(
                {"detail": "id_token is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ── Verify with Google ────────────────────────────────────────────────
        payload = _verify_google_id_token(id_token)
        if not payload:
            return Response(
                {"detail": "Google token verification failed. Please try again."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Check audience matches our client ID
        expected_client_id = getattr(settings, "GOOGLE_CLIENT_ID", "")
        aud = payload.get("aud", "")
        if expected_client_id and aud != expected_client_id:
            logger.warning(
                "Google token audience mismatch: expected=%s got=%s",
                expected_client_id, aud,
            )
            return Response(
                {"detail": "Google token audience mismatch."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        email      = (payload.get("email") or "").strip().lower()
        first_name = payload.get("given_name", "").strip()
        last_name  = payload.get("family_name", "").strip()
        sub        = payload.get("sub", "")  # Google user ID

        if not email:
            return Response(
                {"detail": "Google account has no email address."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # ── Find or create user ───────────────────────────────────────────────
        created = False
        with transaction.atomic():
            try:
                user = User.objects.get(email=email)
            except User.DoesNotExist:
                # Auto-create a student account
                user = User(
                    email=email,
                    first_name=first_name or email.split("@")[0].capitalize(),
                    last_name=last_name or "",
                    role=Role.STUDENT,
                    is_active=True,
                )
                # Set unusable password — account can only log in via Google
                user.set_unusable_password()
                user.save()
                created = True

        # ── Block officer accounts ────────────────────────────────────────────
        if user.is_officer:
            return Response(
                {
                    "detail": (
                        "Officer accounts use MetaMask wallet authentication. "
                        "Google sign-in is not available for this account."
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        if not user.is_active:
            return Response(
                {"detail": "This account is inactive. Contact your institution."},
                status=status.HTTP_403_FORBIDDEN,
            )

        tokens = issue_full_tokens(user)

        log_action(
            actor=user,
            action="user.google_login" if not created else "user.google_register",
            target_type="User",
            target_id=str(user.id),
            detail=(
                f"Google {'registration' if created else 'login'} for {email}. "
                f"Google sub: {sub[:12]}…"
            ),
        )

        return Response(
            {
                **tokens,
                "user":    UserSerializer(user, context={"request": request}).data,
                "created": created,
            },
            status=status.HTTP_200_OK,
        )
