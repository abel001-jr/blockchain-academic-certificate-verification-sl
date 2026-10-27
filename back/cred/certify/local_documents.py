"""Private encrypted persistent copies for owner document access."""
import logging
import os
import re
import tempfile
from pathlib import Path
from django.conf import settings
from .encrypted_documents import (DocumentEncryptionError, decrypt_document,
    document_sha256, encrypt_document, is_encrypted_document)

logger = logging.getLogger(__name__)


def owner_document(certificate, kind, cid, expected_hash, fetch, *, return_source=False):
    if kind not in {"certificate", "transcript"}:
        raise DocumentEncryptionError("Unsupported document kind.")
    digest = str(expected_hash or "").lower().removeprefix("0x")
    if not re.fullmatch(r"[0-9a-f]{64}", digest):
        raise DocumentEncryptionError("A valid final document hash is required.")
    # Outside MEDIA_ROOT: never expose encrypted credential cache through media URLs.
    root = Path(getattr(settings, "CREDENTIAL_LOCAL_DOCUMENT_ROOT", settings.BASE_DIR / "private_document_cache"))
    identity = str(certificate.pk)
    if not re.fullmatch(r"[A-Za-z0-9_-]+", identity):
        raise DocumentEncryptionError("Invalid credential identity.")
    target = root / identity / f"{kind}-{digest}.enc"

    def matches(data):
        return document_sha256(data).lower().removeprefix("0x") == digest

    try:
        data = decrypt_document(target.read_bytes(), certificate.certificate_id, kind)
        if matches(data):
            return (data, "local_cache") if return_source else data
    except (OSError, DocumentEncryptionError):
        pass
    # Original upload files may predate signing/sealing. Reuse only exact matches.
    source = certificate.document_file if kind == "certificate" else certificate.transcript_file
    data = None
    origin = "local_file"
    if source:
        try:
            with source.open("rb") as file:
                candidate = file.read()
            if is_encrypted_document(candidate):
                candidate = decrypt_document(candidate, certificate.certificate_id, kind)
            if matches(candidate):
                data = candidate
        except (OSError, DocumentEncryptionError):
            pass
    if data is None:
        if not cid:
            raise DocumentEncryptionError("No matching final issued file is available in local storage, and its IPFS location is missing. Contact the registrar to restore the issued document.")
        data = fetch(cid, certificate.certificate_id, kind, expected_hash)
        origin = "cloud"
    if not matches(data):
        raise DocumentEncryptionError("Document does not match its final issued hash.")
    temporary = None
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        encrypted = encrypt_document(data, certificate.certificate_id, kind)
        with tempfile.NamedTemporaryFile(dir=target.parent, delete=False) as file:
            temporary = file.name
            file.write(encrypted)
        os.replace(temporary, target)
        temporary = None
    except OSError:
        logger.warning("Could not persist private credential document cache.")
    finally:
        if temporary:
            try:
                os.unlink(temporary)
            except OSError:
                pass
    return (data, origin) if return_source else data
