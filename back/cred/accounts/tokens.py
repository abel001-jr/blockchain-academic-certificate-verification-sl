"""JWT helpers — full session vs limited officer-setup session."""

from datetime import timedelta

from rest_framework_simplejwt.tokens import RefreshToken

TOKEN_USE_FULL = "full"
TOKEN_USE_OFFICER_SETUP = "officer_setup"


def _base_claims(token, user):
    token["role"] = user.role
    token["full_name"] = user.full_name
    token["institution"] = str(user.institution_id) if user.institution_id else None
    return token


def issue_full_tokens(user, *, wallet: str | None = None) -> dict:
    refresh = RefreshToken.for_user(user)
    _base_claims(refresh, user)
    refresh["token_use"] = TOKEN_USE_FULL
    if wallet:
        refresh["wallet"] = wallet.lower()

    access = refresh.access_token
    access["token_use"] = TOKEN_USE_FULL
    access["role"] = user.role
    access["full_name"] = user.full_name
    access["institution"] = str(user.institution_id) if user.institution_id else None
    if wallet:
        access["wallet"] = wallet.lower()

    return {"access": str(access), "refresh": str(refresh)}


def issue_setup_tokens(user) -> dict:
    """
    Limited JWT: only officer setup endpoints + /auth/me/.
    Short-lived; cannot reach the real dashboard APIs.
    """
    refresh = RefreshToken.for_user(user)
    _base_claims(refresh, user)
    refresh["token_use"] = TOKEN_USE_OFFICER_SETUP
    refresh.set_exp(lifetime=timedelta(hours=2))

    access = refresh.access_token
    access["token_use"] = TOKEN_USE_OFFICER_SETUP
    access["role"] = user.role
    access["full_name"] = user.full_name
    access["institution"] = str(user.institution_id) if user.institution_id else None
    access.set_exp(lifetime=timedelta(hours=2))

    return {"access": str(access), "refresh": str(refresh)}


def is_setup_token(token) -> bool:
    if token is None:
        return False
    try:
        return token.get("token_use") == TOKEN_USE_OFFICER_SETUP
    except Exception:
        return False
