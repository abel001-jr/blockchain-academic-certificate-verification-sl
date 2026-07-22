"""
certificates/models.py

The Django database is the application data layer.
The blockchain is the source of truth.
PostgreSQL stores metadata; the blockchain stores hashes + CIDs.
"""

import uuid
from django.db import models
from django.conf import settings


class CertificateStatus(models.TextChoices):
    DRAFT                 = "draft",                 "Draft"
    PENDING_VC            = "pending_vc",            "Pending VC Approval"
    PENDING_CHANCELLOR    = "pending_chancellor",    "Pending Chancellor Approval"
    PENDING_FINALIZE      = "pending_finalize",      "Pending Final PDF / On-Chain Finalize"
    PENDING               = "pending",               "Pending (legacy)"
    ISSUED                = "issued",                "Issued"
    REVOKED               = "revoked",               "Revoked"



class Certificate(models.Model):
    """
    Represents one academic certificate in CREDENCE.

    Lifecycle (spec §8):
      Draft → Pending → Issued (on-chain) → [Revoked]

    Blockchain fields are populated after the MetaMask transaction
    is confirmed and the smart contract emits CertificateRegistered.
    """

    # ── Identity ──────────────────────────────────────────────
    id             = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    certificate_id = models.CharField(max_length=50, unique=True)  # e.g. CR-2026-CUSL-0042

    # ── Parties ───────────────────────────────────────────────
    institution    = models.ForeignKey(
        "institutions.Institution",
        on_delete=models.PROTECT,
        related_name="certificates",
    )
    issued_by      = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, related_name="issued_certificates",
        limit_choices_to={"role": "registrar"},
    )
    student        = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, related_name="received_certificates",
        limit_choices_to={"role": "student"},
    )

    # ── Certificate details ───────────────────────────────────
    student_name       = models.CharField(max_length=200)   # snapshot at issuance
    student_email      = models.EmailField()
    degree_title       = models.CharField(max_length=255)   # snapshot: full formal program title
    qualification_type = models.CharField(
        max_length=30,
        blank=True,
        default="bachelors",
        help_text="Snapshot of Program.qualification_type at issuance",
    )
    department         = models.CharField(max_length=255, blank=True)
    graduation_year    = models.PositiveSmallIntegerField()
    grade              = models.CharField(max_length=50, blank=True)  # e.g. "First Class"

    # ── Status ────────────────────────────────────────────────
    status             = models.CharField(
        max_length=32,
        choices=CertificateStatus.choices,
        default=CertificateStatus.DRAFT,
        db_index=True,
    )

    # Snapshot of branding preset at submit-for-approval time
    branding_preset    = models.CharField(max_length=40, blank=True, default="classic_navy")

    # Registrar appears as a signer (submits for approval on-chain)
    registrar_signer_name  = models.CharField(max_length=200, blank=True)
    registrar_signed_at    = models.DateTimeField(null=True, blank=True)

    # Dual institutional approvals (on-chain + mirrored in Django)
    vc_approved_at         = models.DateTimeField(null=True, blank=True)
    vc_approval_tx_hash    = models.CharField(max_length=66, blank=True)
    vc_approver_name       = models.CharField(max_length=200, blank=True)
    # Snapshot of VC cosmetic signature at approve time (audit trail)
    vc_signature_image     = models.ImageField(
        upload_to="certificates/signatures/", blank=True, null=True,
    )
    chancellor_approved_at = models.DateTimeField(null=True, blank=True)
    chancellor_approval_tx_hash = models.CharField(max_length=66, blank=True)
    chancellor_approver_name = models.CharField(max_length=200, blank=True)
    chancellor_signature_image = models.ImageField(
        upload_to="certificates/signatures/", blank=True, null=True,
    )

    # Finalize on-chain (after dual approval + final PDF)
    finalize_tx_hash       = models.CharField(max_length=66, blank=True)

    # ── Document storage ──────────────────────────────────────
    # Local file temporarily stored before IPFS pinning
    document_file      = models.FileField(upload_to="certificates/pdfs/", blank=True)

    # ── Cryptographic hashes (computed by Django before chain tx) ─
    cert_hash          = models.CharField(max_length=66, blank=True)  # 0x + 64 hex = SHA-256 of JSON
    doc_hash           = models.CharField(max_length=66, blank=True)  # SHA-256 of PDF

    # ── IPFS ──────────────────────────────────────────────────
    ipfs_cid_json      = models.CharField(max_length=100, blank=True)
    ipfs_cid_pdf       = models.CharField(max_length=100, blank=True)
    ipfs_url_json      = models.URLField(blank=True)
    ipfs_url_pdf       = models.URLField(blank=True)

    # ── Blockchain ────────────────────────────────────────────
    tx_hash            = models.CharField(max_length=66, blank=True)  # Ethereum tx hash
    block_number       = models.PositiveBigIntegerField(null=True, blank=True)
    chain_issued_at    = models.DateTimeField(null=True, blank=True)   # from block timestamp

    # ── Revocation ────────────────────────────────────────────
    revoked_by         = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="revoked_certificates",
    )
    revocation_reason  = models.TextField(blank=True)
    revoked_at         = models.DateTimeField(null=True, blank=True)
    revocation_tx_hash = models.CharField(max_length=66, blank=True)

    # ── Timestamps ────────────────────────────────────────────
    created_at         = models.DateTimeField(auto_now_add=True)
    updated_at         = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "credence_certificates"
        ordering = ["-created_at"]
        verbose_name        = "Certificate"
        verbose_name_plural = "Certificates"

    def __str__(self):
        return f"{self.certificate_id} — {self.student_name} ({self.degree_title})"

    @property
    def is_on_chain(self):
        return bool(self.tx_hash)

    @property
    def verification_url(self):
        """Public URL for QR code / share link."""
        return f"/verify/{self.certificate_id}"
