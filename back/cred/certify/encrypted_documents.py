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


#: AAD domains. The document kind is part of the associated data, so a blob
#: sealed under one domain can never be opened as another — that is the point of
#: listing them rather than interpolating a free-form string.
#:
#: `certificate-review` is the signature-less document rendered by `prepare/` and
#: committed to officers as `doc_hash`. It is deliberately its own domain: it is
#: a commitment, not a deliverable, and nothing in the product decrypts it. If it
#: shared the `certificate` domain, an unauthenticated party holding the review
#: blob could serve it in place of the issued certificate.
#: `certificate`/`transcript` are the only kinds `fetch_verified_document` opens,
#: and they are what a student is entitled to download.
_AAD_DOMAINS = frozenset({"certificate", "transcript", "certificate-review"})


def _aad(certificate_id: str, document_kind: str) -> bytes:
    if document_kind not in _AAD_DOMAINS:
        raise DocumentEncryptionError(
            f"Unsupported credential document type: {document_kind!r}."
        )
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


def fetch_verified_document(
    cid: str, associated_id: str, document_kind: str, expected_hash: str,
    *, fast=False,
) -> bytes:
    """Fetch, decrypt and re-verify one credential document.

    Lives here rather than in a view because the re-hash check is the whole
    point of the function: any route that hands a decrypted document to somebody
    has to go through it, or a stored blob that no longer matches its anchored
    hash could still be served. Two routes need it — the share-code download and
    the graduate's own copy — and a shared helper is what keeps them from
    drifting apart.

    `expected_hash` is compared case-insensitively because the chain returns
    lowercase hex while some rows were written before the `0x` prefix was
    standardised.
    """
    from .ipfs import fetch_file_from_ipfs

    encrypted = fetch_file_from_ipfs(cid, fast=True) if fast else fetch_file_from_ipfs(cid)
    if not is_encrypted_document(encrypted):
        raise DocumentEncryptionError(
            "This credential contains a legacy document that has not been re-encrypted."
        )
    document = decrypt_document(encrypted, associated_id, document_kind)
    if document_sha256(document).lower().removeprefix("0x") != (expected_hash or "").lower().removeprefix("0x"):
        raise DocumentEncryptionError("Decrypted document does not match its anchored hash.")
    return document
