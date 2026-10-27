"""Google student sign-in and authenticated account linking.

POST /api/auth/google/ signs in using a verified Google subject.
POST /api/auth/google/link/ binds Google to the claimed student without
changing the institution email or credential ownership. All Google ID tokens
must pass audience, issuer, expiry and verified-email checks.
"""

import logging

import requests as http_requests
from django.conf import settings
from django.db import transaction, IntegrityError
from django.utils import timezone
from rest_framework.exceptions import AuthenticationFailed, ValidationError
from .permissions import IsFullSession
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


def verified_google_identity(request):
    raw = request.data.get("id_token")
    if not isinstance(raw, str) or not raw.strip():
        raise ValidationError({"detail": "id_token is required."})
    payload = _verify_google_id_token(raw.strip())
    if not isinstance(payload, dict):
        raise AuthenticationFailed("Google token verification failed. Please try again.")
    audiences = set(getattr(settings, "GOOGLE_CLIENT_IDS", []))
    if getattr(settings, "GOOGLE_CLIENT_ID", ""):
        audiences.add(settings.GOOGLE_CLIENT_ID)
    if not audiences or payload.get("aud") not in audiences:
        raise AuthenticationFailed("Google token audience mismatch.")
    try:
        expired = int(payload.get("exp", 0)) <= timezone.now().timestamp()
    except (ValueError, TypeError):
        expired = True
    if expired or payload.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        raise AuthenticationFailed("Google token is expired or has an invalid issuer.")
    if str(payload.get("email_verified", "")).lower() != "true":
        raise AuthenticationFailed("Choose a Google account with a verified email address.")
    email = str(payload.get("email") or "").strip().lower()
    subject = payload.get("sub")
    if not email or not isinstance(subject, str) or not subject or len(subject) > 255:
        raise AuthenticationFailed("Google did not provide a valid account identity.")
    return payload, email, subject


def bind_google_identity(user, email, subject):
    user.google_subject = subject
    user.google_email = email
    user.google_linked_at = user.google_linked_at or timezone.now()
    user.save(update_fields=["google_subject", "google_email", "google_linked_at", "updated_at"])


class GoogleAuthView(APIView):
    """Sign in by stable Google subject, with verified-email support for legacy accounts."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        payload, email, subject = verified_google_identity(request)
        created = False
        try:
            with transaction.atomic():
                user = User.objects.select_for_update().filter(google_subject=subject).first()
                if user is None:
                    user = User.objects.select_for_update().filter(email__iexact=email).first()
                if user is None:
                    user = User(email=email, first_name=str(payload.get("given_name") or email.split("@")[0])[:100],
                                last_name=str(payload.get("family_name") or "")[:100], role=Role.STUDENT)
                    user.set_unusable_password()
                    user.save()
                    created = True
                if not user.is_student or not user.is_active:
                    return Response({"detail": "Google sign-in is available only for active student accounts."}, status=403)
                if user.google_subject and user.google_subject != subject:
                    return Response({"detail": "Sign in with the Google account already linked to this student."}, status=409)
                bind_google_identity(user, email, subject)
                tokens = issue_full_tokens(user)
        except IntegrityError:
            return Response({"detail": "This Google account is already linked. Try signing in again."}, status=409)
        log_action(actor=user, action="user.google_register" if created else "user.google_login",
                   target_type="User", target_id=str(user.id), detail="Student signed in with Google.")
        return Response({**tokens, "user": UserSerializer(user, context={"request": request}).data, "created": created})


class GoogleAccountLinkView(APIView):
    """Attach a verified Google identity to the currently authenticated student."""
    permission_classes = [IsFullSession]

    def post(self, request):
        if not request.user.is_student or not request.user.is_active:
            return Response({"detail": "Only active students can link a Google account."}, status=403)
        _, email, subject = verified_google_identity(request)
        try:
            with transaction.atomic():
                user = User.objects.select_for_update().get(pk=request.user.pk)
                if user.google_subject and user.google_subject != subject:
                    return Response({"detail": "A different Google account is already linked to your profile."}, status=409)
                if User.objects.exclude(pk=user.pk).filter(google_subject=subject).exists() or User.objects.exclude(pk=user.pk).filter(email__iexact=email).exists():
                    return Response({"detail": "This Google account belongs to another student account. Choose another Google account or contact your institution."}, status=409)
                bind_google_identity(user, email, subject)
                log_action(actor=user, action="student.google_linked", target_type="User", target_id=str(user.id),
                           detail="Student linked a verified Google account.")
        except IntegrityError:
            return Response({"detail": "This Google account is already linked to another student."}, status=409)
        return Response({"user": UserSerializer(user, context={"request": request}).data})
