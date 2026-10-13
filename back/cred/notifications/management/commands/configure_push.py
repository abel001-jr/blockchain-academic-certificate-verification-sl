"""Generate once, store in the ignored .env, and never print private keys."""
import base64
from email.utils import parseaddr
from pathlib import Path
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from dotenv import dotenv_values, set_key


class Command(BaseCommand):
    help = "Configure stable VAPID keys in the local ignored .env. Does not rotate existing keys."

    def add_arguments(self, parser):
        parser.add_argument("--contact", help="Contact email for push service operators.")

    def handle(self, *args, **options):
        path = Path(settings.BASE_DIR) / ".env"
        values = dotenv_values(path)
        existing = [bool(values.get(name)) for name in ("WEB_PUSH_PRIVATE_KEY", "WEB_PUSH_PUBLIC_KEY")]
        if any(existing):
            if not all(existing):
                raise CommandError("Incomplete VAPID key pair. Restore the matching key rather than rotating subscriptions.")
            self.stdout.write("Existing VAPID keys preserved.")
            return
        contact = options["contact"] or parseaddr(settings.DEFAULT_FROM_EMAIL)[1]
        if "@" not in contact or "\n" in contact:
            raise CommandError("Provide --contact with a valid administrator email.")
        key = ec.generate_private_key(ec.SECP256R1())
        encode = lambda value: base64.urlsafe_b64encode(value).decode().rstrip("=")
        private = encode(key.private_bytes(serialization.Encoding.DER, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
        public = encode(key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint))
        set_key(str(path), "WEB_PUSH_PRIVATE_KEY", private)
        set_key(str(path), "WEB_PUSH_PUBLIC_KEY", public)
        set_key(str(path), "WEB_PUSH_SUBJECT", f"mailto:{contact}")
        self.stdout.write("VAPID keys configured in .env. Restart the API and push worker to load them.")
