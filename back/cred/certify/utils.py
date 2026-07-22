"""
certificates/utils.py

Utilities for certificate ID generation and SHA-256 hashing.
"""

import hashlib
import json
from datetime import datetime


def generate_certificate_id(institution_short: str, year: int, sequence: int) -> str:
    """
    Generates a human-readable certificate ID.
    e.g.  CR-2026-CUSL-0042
    """
    return f"CR-{year}-{institution_short.upper()}-{sequence:04d}"


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
