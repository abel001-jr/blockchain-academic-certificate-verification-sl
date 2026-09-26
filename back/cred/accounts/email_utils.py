"""Send transactional email via configured SMTP (Brevo). Optional for demos."""

import logging
import re

from django.conf import settings
from django.core.mail import EmailMessage

logger = logging.getLogger(__name__)


def email_is_configured() -> bool:
    """True when EMAIL_ENABLED and SMTP credentials are present."""
    if not getattr(settings, "EMAIL_ENABLED", False):
        return False
    return bool(
        getattr(settings, "EMAIL_HOST_USER", "")
        and getattr(settings, "EMAIL_HOST_PASSWORD", "")
    )


def _from_address() -> str:
    raw = getattr(settings, "DEFAULT_FROM_EMAIL", "") or ""
    # Brevo SMTP login (@smtp-brevo.com) is NOT a deliverable From — mail is accepted
    # then often dropped. Prefer a verified sender from Brevo → Senders & IP.
    if "@smtp-brevo.com" in raw.lower():
        logger.warning(
            "DEFAULT_FROM_EMAIL uses @smtp-brevo.com (%s). "
            "Brevo may accept SMTP then silently drop delivery. "
            "Set DEFAULT_FROM_EMAIL to an email verified in Brevo Senders.",
            raw,
        )
    return raw


def send_officer_temp_password(*, officer, temp_password: str, institution_name: str = "") -> bool:
    """
    Email the officer their temporary password and setup instructions.
    Returns True if SMTP accepted the message (not a guarantee of inbox delivery).
    """
    if not email_is_configured():
        logger.info(
            "Email disabled/unconfigured — skip invite mail for %s",
            officer.email,
        )
        return False

    subject = "CREDENCE — Your temporary officer login"
    from_email = _from_address()
    frontend = getattr(settings, "FRONTEND_URL", "http://localhost:3000").rstrip("/")
    login_url = f"{frontend}/login"
    role_label = "Vice Chancellor" if officer.role == "vc" else "Dean"
    inst = institution_name or (
        officer.institution.name if officer.institution_id else "your institution"
    )

    body = (
        f"Hello {officer.first_name},\n\n"
        f"You have been invited as {role_label} for {inst} on CREDENCE.\n\n"
        f"Sign in with this temporary password (one-time setup):\n\n"
        f"  Email:    {officer.email}\n"
        f"  Password: {temp_password}\n\n"
        f"Login: {login_url}\n\n"
        f"After sign-in you must:\n"
        f"  1. Connect MetaMask and sign a challenge to prove wallet ownership\n"
        f"  2. Set a permanent password (this temporary password is then retired)\n\n"
        f"Your Registrar will then authorize your wallet on-chain. After that, "
        f"you sign in with MetaMask only.\n\n"
        f"— CREDENCE\n"
    )

    try:
        msg = EmailMessage(
            subject=subject,
            body=body,
            from_email=from_email,
            to=[officer.email],
        )
        # Helps some providers; still requires From to be a verified Brevo sender
        msg.extra_headers = {
            "X-Mailer": "CREDENCE",
            "X-CREDENCE-Purpose": "officer-invite",
        }
        sent = msg.send(fail_silently=False)
        logger.info(
            "Officer invite SMTP accepted=%s to=%s from=%s smtp_user=%s",
            sent,
            officer.email,
            from_email,
            getattr(settings, "EMAIL_HOST_USER", ""),
        )
        return sent > 0
    except Exception as exc:
        logger.exception(
            "Officer invite email failed for %s (SMTP user=%s from=%s): %s",
            officer.email,
            getattr(settings, "EMAIL_HOST_USER", ""),
            from_email,
            exc,
        )
        return False


def should_return_temp_password(email_ok: bool) -> bool:
    """Whether API responses should include the one-time temp password."""
    if not email_ok:
        return True
    return getattr(settings, "EMAIL_ALWAYS_RETURN_TEMP_PASSWORD", True)
