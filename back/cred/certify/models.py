"""
certificates/models.py

The Django database is the application data layer.
The blockchain is the source of truth.
PostgreSQL stores metadata; the blockchain stores hashes + CIDs.
"""

import hashlib
import secrets
import uuid
from django.db import models
from django.conf import settings
from django.utils import timezone


class FlowType(models.TextChoices):
    SYSTEM_DESIGNED      = "system_designed",      "System Designed"       # full VC+Chancellor approval flow
    EXTERNAL_UPLOAD      = "external_upload",      "External Upload"       # registrar uploads pre-signed PDF
    TRANSCRIPT_THEN_CERT = "transcript_then_cert", "Transcript Then Cert"  # upload transcript, then design cert
    FULL_UPLOAD          = "full_upload",          "Full Upload"           # upload both transcript + cert together


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
    Represents one academic certificate in INTELLIGENT ACADEMIC CREDENTIALING.

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

    # ── Flow type ─────────────────────────────────────────────
    # system_designed : full VC + Chancellor on-chain approval + system PDF generation
    # external_upload : registrar uploads a pre-signed PDF; shorter on-chain path
    flow_type = models.CharField(
        max_length=20,
        choices=FlowType.choices,
        default=FlowType.SYSTEM_DESIGNED,
        db_index=True,
        help_text="Determines which issuance lifecycle this certificate follows.",
    )

    # ── Status ────────────────────────────────────────────────
    status             = models.CharField(
        max_length=32,
        choices=CertificateStatus.choices,
        default=CertificateStatus.DRAFT,
        db_index=True,
    )

    # Snapshot of branding preset at submit-for-approval time
    branding_preset    = models.CharField(max_length=40, blank=True, default="classic_navy")
    template_revision = models.ForeignKey(
        "institutions.CertificateTemplateRevision", on_delete=models.PROTECT,
        null=True, blank=True, related_name="credentials",
    )

    # Registrar appears as a signer (submits for approval on-chain)
    registrar_signer_name  = models.CharField(max_length=200, blank=True)
    registrar_signed_at    = models.DateTimeField(null=True, blank=True)
    registrar_signature_image = models.ImageField(
        upload_to="certificates/signatures/", blank=True, null=True,
    )

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
    # The paired transcript, held locally for the same reason as `document_file`.
    # Pinata is a metered, rate-limited service, so a draft must not consume
    # pinning quota every time the Registrar picks a file; both documents are
    # written here while the draft is being filled in and are moved to IPFS in
    # one step when the credential is anchored. `transcript_hash` and
    # `ipfs_cid_transcript` stay blank until that happens, so "has an anchored
    # transcript" is never true for a draft nobody submitted.
    transcript_file    = models.FileField(upload_to="certificates/transcripts/", blank=True)

    # ── Cryptographic hashes (computed by Django before chain tx) ─
    cert_hash          = models.CharField(max_length=66, blank=True)  # 0x + 64 hex = SHA-256 of JSON
    # For the system-designed flow this is the review document: the rendering
    # officers approve. It is fixed before either officer signs and is never
    # rewritten, so an approval always refers to the same bytes.
    doc_hash           = models.CharField(max_length=66, blank=True)  # SHA-256 of PDF
    # The document actually issued. It additionally carries the signature
    # block, so it can only be rendered after officer approval. Committed to
    # the chain as sealedDocHash at finalization; blank for upload-based flows,
    # where the uploaded document is both the reviewed and the issued copy.
    sealed_doc_hash    = models.CharField(max_length=66, blank=True)

    # ── IPFS ──────────────────────────────────────────────────
    ipfs_cid_json      = models.CharField(max_length=100, blank=True)
    ipfs_cid_pdf       = models.CharField(max_length=100, blank=True)
    ipfs_url_json      = models.URLField(blank=True)
    ipfs_url_pdf       = models.URLField(blank=True)
    # System-designed flow only: the issued rendering, pinned alongside the
    # review copy under a separate reference.
    ipfs_cid_sealed_pdf = models.CharField(max_length=100, blank=True)
    ipfs_url_sealed_pdf = models.URLField(blank=True)
    # Full-upload workflow: transcript is retained with the certificate so it
    # can be reviewed alongside the certificate before approval.
    transcript_hash     = models.CharField(max_length=66, blank=True)
    ipfs_cid_transcript = models.CharField(max_length=100, blank=True)
    ipfs_url_transcript = models.URLField(blank=True)

    # ── Blockchain ────────────────────────────────────────────
    tx_hash            = models.CharField(max_length=66, blank=True)  # Ethereum tx hash
    chain_config_snapshot = models.JSONField(default=dict, blank=True, editable=False)
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
    def requires_sealed_document(self):
        """
        True when the issued document is produced after officer approval.

        Only the system-designed flow does this: its document is generated, so
        it can be rendered for review before approval but cannot include the
        signature block until after. The upload-based flows accept a document
        that is already final, so their reviewed document is also the issued
        one and no sealing step applies.
        """
        return self.flow_type == FlowType.SYSTEM_DESIGNED

    @property
    def authoritative_doc_hash(self):
        """
        The hash a holder of the issued PDF must be able to match.

        For a sealed credential this is the sealed hash, because the sealed
        document is the one that was issued. For everything else the document
        fixed at submit is also the issued document, so doc_hash is correct.
        """
        return self.sealed_doc_hash or self.doc_hash

    @property
    def issued_pdf_cid(self):
        """Private location of the issued document, preferring the sealed copy."""
        return self.ipfs_cid_sealed_pdf or self.ipfs_cid_pdf

    @property
    def verification_url(self):
        """Public URL for QR code / share link."""
        return f"/verify/{self.certificate_id}"


# ── Student invite / onboarding token ────────────────────────────────────────

class StudentInviteToken(models.Model):
    """
    One-time token sent to a student via WhatsApp when their certificate
    is issued.  The student claims it to get a JWT and link their account.

    Lifecycle:
        created (on cert issued / resend)
        → claimed via POST /api/auth/student-invite/claim/
        → used = True, claimed_at = now()

    A new token invalidates all previous unused tokens for the same cert.
    Issuance reuses an unexpired token rather than rotating it, so a claim
    link the student already holds stays valid until its window closes.
    TTL defaults to STUDENT_INVITE_TTL_HOURS (settings, default 24 h).
    """

    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    certificate = models.ForeignKey(
        Certificate,
        on_delete=models.CASCADE,
        related_name="invite_tokens",
    )
    student     = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="invite_tokens",
    )

    # raw token stored hashed; raw value returned once on creation
    token_hash  = models.CharField(max_length=64, unique=True)  # SHA-256 hex of raw token

    expires_at  = models.DateTimeField()
    used        = models.BooleanField(default=False)
    claimed_at  = models.DateTimeField(null=True, blank=True)

    # Delivery tracking
    whatsapp_sent = models.BooleanField(default=False)

    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "credence_student_invite_tokens"
        ordering = ["-created_at"]

    def __str__(self):
        return f"InviteToken({self.certificate.certificate_id} → {self.student.email})"

    @property
    def is_expired(self):
        return timezone.now() >= self.expires_at

    @property
    def is_valid(self):
        return not self.used and not self.is_expired

    @classmethod
    def _hash(cls, raw: str) -> str:
        return hashlib.sha256(raw.encode()).hexdigest()

    @classmethod
    def create_for_certificate(cls, certificate) -> tuple["StudentInviteToken", str]:
        """
        Invalidate any existing unused tokens for this cert, then create
        a fresh token.  Returns (instance, raw_token).  The raw token is
        never stored — only its SHA-256 hash is persisted.
        """
        from django.conf import settings as _s
        ttl_hours = getattr(_s, "STUDENT_INVITE_TTL_HOURS", 24)

        # Invalidate old unused tokens for this cert
        cls.objects.filter(certificate=certificate, used=False).update(
            used=True, claimed_at=timezone.now()
        )

        raw = secrets.token_urlsafe(24)   # 192 bits — unguessable
        token_hash = cls._hash(raw)
        instance = cls.objects.create(
            certificate=certificate,
            student=certificate.student,
            token_hash=token_hash,
            expires_at=timezone.now() + timezone.timedelta(hours=ttl_hours),
        )
        return instance, raw

    @classmethod
    def claim(cls, raw: str) -> tuple["StudentInviteToken | None", str]:
        """
        Validate and mark a token as used.
        Returns (token_instance, error_message).
        On success: error_message is "".
        """
        token_hash = cls._hash(raw)
        try:
            token = cls.objects.select_related("student", "certificate").get(
                token_hash=token_hash
            )
        except cls.DoesNotExist:
            return None, "Invalid invite token."
        if token.used:
            return None, "This invite link has already been used."
        if token.is_expired:
            return None, "This invite link has expired. Ask your institution to resend it."
        claimed_at = timezone.now()
        # A conditional write allows only one request to consume an invitation.
        claimed = cls.objects.filter(pk=token.pk, used=False, expires_at__gt=claimed_at).update(
            used=True, claimed_at=claimed_at
        )
        if not claimed:
            return None, "This invite link has already been used or has expired."
        token.used = True
        token.claimed_at = claimed_at
        return token, ""


# ── Employer verification share codes ─────────────────────────────────────────

class VerificationShareCode(models.Model):
    """
    Student-generated share code that allows an employer (or any third party)
    to verify a specific certificate without hitting the CAPTCHA / rate-limit
    wall and without requiring live student consent.

    Lifecycle:
        student generates code  (POST /api/my-certificates/<cert_id>/share-codes/)
        → share URL sent to employer out-of-band (WhatsApp, email, etc.)
        → employer visits  GET /api/verify/<cert_id>/?code=<raw_code>
        → if single_use=True: code marked used after first successful verify
        → student can revoke at any time

    The raw code is never stored — only its SHA-256 hash.  The raw value is
    returned once in the creation response.
    """

    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    certificate = models.ForeignKey(
        Certificate,
        on_delete=models.CASCADE,
        related_name="share_codes",
    )
    created_by  = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="share_codes",
    )

    code_hash   = models.CharField(max_length=64, unique=True)  # SHA-256 of raw code
    label       = models.CharField(
        max_length=100, blank=True,
        help_text="Optional human-readable label e.g. 'Acme Corp interview'",
    )
    single_use  = models.BooleanField(
        default=False,
        help_text="If True the code is invalidated after the first successful verify.",
    )
    expires_at  = models.DateTimeField(
        null=True, blank=True,
        help_text="Closing time for full-document access. Required by create().",
    )
    revoked     = models.BooleanField(default=False)
    used        = models.BooleanField(default=False)
    used_at     = models.DateTimeField(null=True, blank=True)
    used_by_ip  = models.GenericIPAddressField(null=True, blank=True)

    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "credence_verification_share_codes"
        ordering = ["-created_at"]

    def __str__(self):
        return f"ShareCode({self.certificate.certificate_id} by {self.created_by.email})"

    @property
    def is_valid(self):
        if self.revoked or self.used:
            return False
        if self.expires_at and timezone.now() >= self.expires_at:
            return False
        return True

    @staticmethod
    def _hash(raw: str) -> str:
        return hashlib.sha256(raw.encode()).hexdigest()

    @classmethod
    def create(cls, *, certificate, created_by, label="", single_use=False, expires_at=None):
        """
        Generate a new share code.  Returns (instance, raw_code).
        The raw code is a URL-safe 18-char string (108 bits of entropy).

        expires_at is mandatory: a share code unlocks the decrypted document
        pair, so it must always carry a closing time.
        """
        if expires_at is None:
            raise ValueError(
                "VerificationShareCode requires an expiry; full-document access "
                "must have a closing time."
            )
        raw = secrets.token_urlsafe(18)
        instance = cls.objects.create(
            certificate=certificate,
            created_by=created_by,
            code_hash=cls._hash(raw),
            label=label,
            single_use=single_use,
            expires_at=expires_at,
        )
        return instance, raw

    @classmethod
    def validate(
        cls, raw: str, ip: str = "", *, consume: bool = True
    ) -> tuple["VerificationShareCode | None", str]:
        """
        Look up and validate a raw share code.
        Returns (instance, error_string).  On success error_string is "".
        If single_use and consume=True, marks the code as used.
        """
        code_hash = cls._hash(raw)
        try:
            sc = cls.objects.select_related("certificate").get(code_hash=code_hash)
        except cls.DoesNotExist:
            return None, "Invalid share code."
        if sc.revoked:
            return None, "This share code has been revoked."
        if sc.used:
            return None, "This share code has already been used."
        if sc.expires_at and timezone.now() >= sc.expires_at:
            return None, "This share code has expired."
        if sc.single_use and consume:
            sc.used    = True
            sc.used_at = timezone.now()
            sc.used_by_ip = ip or None
            claimed = cls.objects.filter(pk=sc.pk, used=False, revoked=False, expires_at__gt=sc.used_at).update(
                used=True, used_at=sc.used_at, used_by_ip=sc.used_by_ip)
            if not claimed:
                return None, "This share code has already been used or is no longer active."
        return sc, ""


# ── Employer live consent requests ────────────────────────────────────────────

class ConsentRequestStatus(models.TextChoices):
    PENDING  = "pending",  "Pending"
    APPROVED = "approved", "Approved"
    DENIED   = "denied",   "Denied"
    EXPIRED  = "expired",  "Expired"


class ConsentRequest(models.Model):
    """
    Employer requests live consent from the student to verify a certificate.
    Used when the employer doesn't have a pre-shared code.

    Lifecycle:
        employer submits  POST /api/verify/<cert_id>/request-consent/
            → status = pending
            → WhatsApp push sent to student
        student approves  POST /api/verify/consent/<id>/respond/  { action: "approve" }
            → status = approved
            → employer polls GET /api/verify/consent/<id>/  → sees approved + full cert data
        student denies    POST /api/verify/consent/<id>/respond/  { action: "deny" }
            → status = denied
        auto-expire       background or on-poll: if expires_at < now → status = expired
    """

    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    certificate = models.ForeignKey(
        Certificate,
        on_delete=models.CASCADE,
        related_name="consent_requests",
    )
    student     = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="incoming_consent_requests",
    )

    # Employer / verifier identity (self-reported — not authenticated)
    verifier_name  = models.CharField(max_length=200)
    verifier_email = models.EmailField(blank=True)
    verifier_org   = models.CharField(max_length=200, blank=True)
    verifier_ip    = models.GenericIPAddressField(null=True, blank=True)

    status     = models.CharField(
        max_length=16,
        choices=ConsentRequestStatus.choices,
        default=ConsentRequestStatus.PENDING,
        db_index=True,
    )
    expires_at = models.DateTimeField()   # default: now + CONSENT_REQUEST_TTL_MINUTES

    # Populated when student responds
    responded_at = models.DateTimeField(null=True, blank=True)

    # Notification tracking
    whatsapp_sent = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "credence_consent_requests"
        ordering = ["-created_at"]

    def __str__(self):
        return (
            f"ConsentRequest({self.certificate.certificate_id} "
            f"← {self.verifier_name} [{self.status}])"
        )

    @property
    def is_expired(self):
        return timezone.now() >= self.expires_at

    def resolve_expired(self):
        """If still pending and past expiry, flip status to expired. Returns bool changed."""
        if self.status == ConsentRequestStatus.PENDING and self.is_expired:
            self.status = ConsentRequestStatus.EXPIRED
            self.save(update_fields=["status", "updated_at"])
            return True
        return False


class DocumentReviewKind(models.TextChoices):
    CERTIFICATE = "certificate", "Certificate"
    TRANSCRIPT  = "transcript",  "Transcript"


class DocumentReviewState(models.TextChoices):
    PENDING    = "pending",    "Awaiting Registrar review"
    RESOLVED   = "resolved",   "Reviewed, all fields agree"
    OVERRIDDEN = "overridden", "Reviewed, mismatches overridden"
    REJECTED   = "rejected",   "Document rejected"


class DocumentReview(models.Model):
    """The result of comparing an uploaded document against the intake record.

    Item 4 of `REMAINING_WORK.md`. The design doc is explicit that a document
    must not be silently bound to the entered student:

        "Compare extracted student name, award, institution, and other
         configured fields with the intake data. Flag mismatches for Registrar
         review; do not silently bind a document to the entered student."

    One row per (certificate, document_kind), replaced when the document is
    re-analysed. The extracted values and the per-field verdicts are both kept,
    because "the extractor said X and the record said Y, and the Registrar
    accepted that" is the audit trail this feature exists to produce — storing
    only a final boolean would make an override indistinguishable from a match.

    The comparison itself is advisory: OCR on a scanned transcript is
    fallible, so a Registrar may override a mismatch with a stated reason. What
    is *not* advisory is that a decision has to exist. A credential is not
    submitted on-chain while its review is still `pending`, which is what stops
    the document from being bound to the student without anyone deciding.
    """

    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    certificate = models.ForeignKey(
        Certificate, on_delete=models.CASCADE, related_name="document_reviews",
    )
    document_kind = models.CharField(
        max_length=16, choices=DocumentReviewKind.choices,
    )

    state = models.CharField(
        max_length=16, choices=DocumentReviewState.choices,
        default=DocumentReviewState.PENDING, db_index=True,
    )

    #: field name -> the string the extractor read off the document
    extracted = models.JSONField(default=dict, blank=True)
    #: per-field verdicts from `field_extraction.compare_fields`
    comparisons = models.JSONField(default=list, blank=True)
    #: counts + requires_review, cached so list views do not re-derive it
    summary = models.JSONField(default=dict, blank=True)

    ocr_used   = models.BooleanField(default=False)
    page_count = models.PositiveIntegerField(default=0)
    #: SHA-256 of the exact bytes analysed, so a later re-upload cannot quietly
    #: inherit a review that was performed against different content.
    document_sha256 = models.CharField(max_length=64, blank=True)

    #: Registrar's justification. Required for an override or a rejection,
    #: since both are a human accepting responsibility for a known difference.
    resolution_note = models.TextField(blank=True)
    #: field names the Registrar explicitly cleared, kept alongside the note so
    #: a later review can show *which* differences were waved through.
    overridden_fields = models.JSONField(default=list, blank=True)

    reviewed_by = models.ForeignKey(
        "accounts.User", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="document_reviews",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "credence_document_reviews"
        ordering = ["document_kind"]
        constraints = [
            models.UniqueConstraint(
                fields=["certificate", "document_kind"],
                name="uniq_document_review_per_kind",
            ),
        ]
        verbose_name = "Document review"
        verbose_name_plural = "Document reviews"

    def __str__(self):
        return f"{self.certificate.certificate_id} — {self.get_document_kind_display()} ({self.state})"

    @property
    def is_resolved(self):
        """True once a Registrar has made a decision that permits submission."""
        return self.state in (
            DocumentReviewState.RESOLVED,
            DocumentReviewState.OVERRIDDEN,
        )

    @property
    def is_rejected(self):
        return self.state == DocumentReviewState.REJECTED

    @property
    def used_weak_evidence(self):
        """Whether any field was confirmed by text search rather than by reading.

        A resolved review of a label-less certificate has not had a single value
        read from a labelled field, so a state label claiming "all fields agree"
        would be true of the values and false of the method. The panel uses this
        to say which it was.
        """
        from .field_extraction import weak_evidence

        return bool(weak_evidence(self.comparisons or []))

    @property
    def blocks_submission(self):
        """Whether this review stands between the credential and the chain.

        A rejected document also blocks: the point of rejecting is that this
        file must not be the one that gets hashed and anchored, so the
        Registrar has to upload a replacement, which produces a new analysis.
        """
        return not self.is_resolved


class PinataStorageSnapshot(models.Model):
    """Shared storage statistics and synchronization lease; never credential status."""
    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    size_bytes = models.BigIntegerField(null=True)
    synced_at = models.DateTimeField(null=True)
    next_attempt_at = models.DateTimeField(null=True)
    lease_until = models.DateTimeField(null=True)
    failures = models.PositiveIntegerField(default=0)
    unavailable = models.BooleanField(default=True)
