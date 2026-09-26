"""
notifications/whatsapp.py

Thin Twilio wrapper for outbound WhatsApp messages.

Feature flag: set WHATSAPP_ENABLED=True in .env and supply the three
Twilio credentials.  When the flag is off (default) every send call is a
no-op that returns False — no exceptions, safe in development.

Twilio WhatsApp sandbox / production:
  - Sandbox:    FROM = "whatsapp:+14155238886"  (free, no approval needed)
  - Production: FROM = "whatsapp:+<your approved number>"

Usage:
    from notifications.whatsapp import send_whatsapp
    ok = send_whatsapp(to="+23276123456", body="Your certificate is ready.")
"""

import logging

from django.conf import settings

logger = logging.getLogger(__name__)


def whatsapp_is_configured() -> bool:
    return (
        getattr(settings, "WHATSAPP_ENABLED", False)
        and bool(getattr(settings, "TWILIO_ACCOUNT_SID", ""))
        and bool(getattr(settings, "TWILIO_AUTH_TOKEN", ""))
        and bool(getattr(settings, "TWILIO_WHATSAPP_FROM", ""))
    )


def send_whatsapp(*, to: str, body: str) -> bool:
    """
    Send a WhatsApp message via Twilio.

    :param to:   Recipient phone number in E.164 format e.g. +23276123456
    :param body: Plain-text message body (max ~1600 chars for WhatsApp)
    :returns:    True if Twilio accepted the message, False otherwise.
    """
    if not whatsapp_is_configured():
        logger.info(
            "WhatsApp disabled/unconfigured — skipping message to %s",
            _mask(to),
        )
        return False

    if not to or not to.startswith("+"):
        logger.warning("send_whatsapp: invalid number %s — skipping.", _mask(to))
        return False

    try:
        from twilio.rest import Client  # imported lazily so twilio is optional

        client = Client(
            settings.TWILIO_ACCOUNT_SID,
            settings.TWILIO_AUTH_TOKEN,
        )
        from_number = settings.TWILIO_WHATSAPP_FROM
        # Ensure whatsapp: prefix
        if not from_number.startswith("whatsapp:"):
            from_number = f"whatsapp:{from_number}"
        to_number = f"whatsapp:{to}" if not to.startswith("whatsapp:") else to

        msg = client.messages.create(
            from_=from_number,
            to=to_number,
            body=body,
        )
        logger.info(
            "WhatsApp sent sid=%s to=%s status=%s",
            msg.sid, _mask(to), msg.status,
        )
        return True
    except Exception as exc:
        logger.exception("WhatsApp send failed to %s: %s", _mask(to), exc)
        return False


def _mask(number: str) -> str:
    """Partially mask a phone number for safe logging."""
    if not number or len(number) < 5:
        return "***"
    return number[:3] + "***" + number[-2:]
