"""
certificates/utils.py

Utilities for certificate ID generation and SHA-256 hashing.
"""

import hashlib
import json
import secrets
from datetime import datetime


def generate_certificate_id(institution_short: str, year: int) -> str:
    """
    Generate a high-entropy, non-guessable certificate ID.

    Format:  CR-{year}-{INSTITUTION}-{8-hex-chars}
    Example: CR-2026-CUSL-A3F92C01

    The 8-hex suffix is drawn from os.urandom via secrets.token_hex(4),
    giving 2^32 (~4.3 billion) values per institution per year.  With a
    typical cohort of a few hundred graduates the probability of a random
    guess being a valid ID is < 0.00001 %, making enumeration attacks
    impractical even without rate limiting.

    A sequential ``sequence`` parameter is no longer accepted — callers
    that passed one should be updated (the perform_create view is the only
    caller and is updated alongside this change).
    """
    suffix = secrets.token_hex(4).upper()   # 8 uppercase hex chars
    return f"CR-{year}-{institution_short.upper()}-{suffix}"


def compute_sha256_bytes(data: bytes) -> str:
    """Return 0x-prefixed hex SHA-256 of raw bytes."""
    digest = hashlib.sha256(data).hexdigest()
    return f"0x{digest}"


def compute_sha256_json(data: dict) -> str:
    """Return 0x-prefixed hex SHA-256 of a JSON-serialised dict (sorted keys)."""
    raw = json.dumps(data, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return compute_sha256_bytes(raw)


def build_certificate_json(certificate) -> dict:
    """
    Build the canonical JSON representation of a certificate.
    This is what gets hashed (dataHash) and later pinned to IPFS.

    issuedAt must be stable across prepare / re-hash — use created_at, not now().
    """
    issued_at = certificate.created_at
    if issued_at is not None:
        issued_at_str = issued_at.strftime("%Y-%m-%dT%H:%M:%S.%fZ")
    else:
        issued_at_str = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%fZ")

    return {
        "certificateId":   certificate.certificate_id,
        "institutionId":   certificate.institution.institution_id,
        "institutionName": certificate.institution.name,
        "studentName":     certificate.student_name,
        "studentEmail":    certificate.student_email,
        "degreeTitle":     certificate.degree_title,
        "qualificationType": getattr(certificate, "qualification_type", "") or "bachelors",
        "department":      certificate.department,
        "graduationYear":  certificate.graduation_year,
        "grade":           certificate.grade,
        "issuedBy":        certificate.issued_by.full_name if certificate.issued_by else "",
        "issuedAt":        issued_at_str,
    }
