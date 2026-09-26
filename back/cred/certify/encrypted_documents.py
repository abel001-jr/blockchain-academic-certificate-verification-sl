"""Encryption helpers for credential PDFs stored on public IPFS."""

import hashlib
import re
import secrets

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.conf import settings


_MAGIC = b"CREDENCE-ENC-V1\x00"
_NONCE_BYTES = 12


class DocumentEncryptionError(ValueError):
    """Raised when key configuration or encrypted content is invalid."""


def _cipher() -> AESGCM:
    key_hex = getattr(settings, "CREDENTIAL_DOCUMENT_ENCRYPTION_KEY", "")
    if not re.fullmatch(r"[0-9a-fA-F]{64}", key_hex or ""):
        raise DocumentEncryptionError(
            "CREDENTIAL_DOCUMENT_ENCRYPTION_KEY must be configured as 64 hex characters."
        )
    return AESGCM(bytes.fromhex(key_hex))


def _aad(certificate_id: str, document_kind: str) -> bytes:
    if document_kind not in {"certificate", "transcript"}:
        raise DocumentEncryptionError("Unsupported credential document type.")
    return f"credence:v1:{certificate_id}:{document_kind}".encode("utf-8")


def encrypt_document(pdf_bytes: bytes, certificate_id: str, document_kind: str) -> bytes:
    """Return a versioned AES-256-GCM envelope for a final PDF."""
    nonce = secrets.token_bytes(_NONCE_BYTES)
    ciphertext = _cipher().encrypt(nonce, pdf_bytes, _aad(certificate_id, document_kind))
    return _MAGIC + nonce + ciphertext


def decrypt_document(encrypted_bytes: bytes, certificate_id: str, document_kind: str) -> bytes:
    """Decrypt a stored document and reject wrong keys, IDs, or tampering."""
    if not encrypted_bytes.startswith(_MAGIC) or len(encrypted_bytes) <= len(_MAGIC) + _NONCE_BYTES:
        raise DocumentEncryptionError("Encrypted document envelope is invalid.")
    nonce_start = len(_MAGIC)
    nonce = encrypted_bytes[nonce_start:nonce_start + _NONCE_BYTES]
    ciphertext = encrypted_bytes[nonce_start + _NONCE_BYTES:]
    try:
        return _cipher().decrypt(nonce, ciphertext, _aad(certificate_id, document_kind))
    except InvalidTag as exc:
        raise DocumentEncryptionError(
            "Document could not be authenticated. Check its key and credential association."
        ) from exc


def is_encrypted_document(payload: bytes) -> bool:
    return payload.startswith(_MAGIC)


def document_sha256(pdf_bytes: bytes) -> str:
    """SHA-256 of the original PDF bytes (before encryption)."""
    return "0x" + hashlib.sha256(pdf_bytes).hexdigest()
