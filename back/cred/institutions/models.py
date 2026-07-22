"""institutions/models.py"""

import uuid
from django.db import models


class ApplicationStatus(models.TextChoices):
    PENDING  = "pending",  "Pending Review"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"
    ACTIVE   = "active",   "Active (On-Chain)"


class Institution(models.Model):
    """Active institution — anchored on-chain (or pending anchor)."""

    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institution_id  = models.CharField(max_length=20, unique=True)   # e.g. "CUSL-001"
    name            = models.CharField(max_length=255)
    short_name      = models.CharField(max_length=20, blank=True)
    country         = models.CharField(max_length=100, default="Sierra Leone")
    address         = models.TextField(blank=True)
    website         = models.URLField(blank=True)
    email           = models.EmailField(blank=True)
    phone           = models.CharField(max_length=30, blank=True)
    logo_url        = models.URLField(blank=True)

    # Blockchain — the Institutional Admin's wallet that was anchored on-chain
    wallet_address  = models.CharField(max_length=42, blank=True)
    is_chain_active = models.BooleanField(default=False)
    anchor_tx_hash  = models.CharField(max_length=66, blank=True)   # on-chain registration tx

    is_active       = models.BooleanField(default=True)
    created_at      = models.DateTimeField(auto_now_add=True)
    updated_at      = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "credence_institutions"
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.institution_id})"


class CertificateTemplate(models.Model):
    """
    Institution-wide certificate branding (Settings → Certificate Branding).
    One template per institution; applies to every new certificate.
    """

    class Preset(models.TextChoices):
        CLASSIC_NAVY   = "classic_navy",   "Classic Navy"
        FOREST_GREEN   = "forest_green",   "Forest Green"
        DEEP_BURGUNDY  = "deep_burgundy",  "Deep Burgundy"
        SLATE_BLUE     = "slate_blue",     "Slate Blue"
        WARM_CHARCOAL  = "warm_charcoal",  "Warm Charcoal"

    institution = models.OneToOneField(
        Institution,
        on_delete=models.CASCADE,
        related_name="certificate_template",
        primary_key=True,
    )
    preset = models.CharField(
        max_length=40,
        choices=Preset.choices,
        default=Preset.CLASSIC_NAVY,
    )
    logo = models.ImageField(
        upload_to="institutions/logos/",
        blank=True,
        null=True,
        help_text="Optional crest/logo for the certificate header.",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "credence_certificate_templates"

    def __str__(self):
        return f"{self.institution.name} — {self.preset}"


class InstitutionApplication(models.Model):
    """
    Off-chain application workflow before an institution is anchored on-chain.
    Spec §4 Phase 1–3.
    """

    id                   = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institution_name     = models.CharField(max_length=255)
    accreditation_body   = models.CharField(max_length=255, blank=True)
    registration_number  = models.CharField(max_length=100, blank=True)
    country              = models.CharField(max_length=100, default="Sierra Leone")
    contact_email        = models.EmailField()
    contact_phone        = models.CharField(max_length=30, blank=True)
    supporting_document  = models.FileField(upload_to="applications/", blank=True)

    # Admin user created as part of this application (role: institutional_admin, status: pending)
    admin_first_name     = models.CharField(max_length=100)
    admin_last_name      = models.CharField(max_length=100)
    admin_email          = models.EmailField(unique=True)

    # Wallet proven at apply time (Step 2 Connect Wallet + signed nonce)
    wallet_address       = models.CharField(max_length=42, blank=True, default="")
    wallet_verified      = models.BooleanField(default=False)

    status               = models.CharField(
        max_length=20,
        choices=ApplicationStatus.choices,
        default=ApplicationStatus.PENDING,
        db_index=True,
    )
    rejection_reason     = models.TextField(blank=True)

    # Once approved and wallet bound, this points to the created Institution
    institution          = models.OneToOneField(
        Institution,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="application",
    )

    reviewed_by          = models.ForeignKey(
        "accounts.User",
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="reviewed_applications",
    )
    reviewed_at          = models.DateTimeField(null=True, blank=True)
    submitted_at         = models.DateTimeField(auto_now_add=True)
    updated_at           = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "credence_institution_applications"
        ordering = ["-submitted_at"]

    def __str__(self):
        return f"{self.institution_name} — {self.status}"


class WalletNonce(models.Model):
    """
    Single-use challenge nonce for wallet auth / apply-time ownership proofs.
    purpose:
      - "login" — SIWE sign-in
      - "apply" — prove control of wallet during institution application
      - "setup" — officer wallet bind during limited setup session
    """

    PURPOSE_LOGIN = "login"
    PURPOSE_APPLY = "apply"
    PURPOSE_SETUP = "setup"
    PURPOSE_CHOICES = [
        (PURPOSE_LOGIN, "Login"),
        (PURPOSE_APPLY, "Apply"),
        (PURPOSE_SETUP, "Officer setup"),
    ]

    address     = models.CharField(max_length=42, db_index=True)
    nonce       = models.CharField(max_length=64, unique=True)
    message     = models.TextField()
    purpose     = models.CharField(max_length=16, choices=PURPOSE_CHOICES, default=PURPOSE_LOGIN, db_index=True)
    # For apply: signature verified, waiting to be consumed by application submit
    verified    = models.BooleanField(default=False)
    institution_hint = models.CharField(max_length=255, blank=True, default="")
    used        = models.BooleanField(default=False)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "credence_wallet_nonces"

    def __str__(self):
        return f"{self.address} [{self.purpose}] — {'used' if self.used else 'pending'}"


class Department(models.Model):
    """Institution academic department — soft-delete via active=False only."""

    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institution = models.ForeignKey(
        Institution, on_delete=models.CASCADE, related_name="departments",
    )
    name        = models.CharField(max_length=200)
    active      = models.BooleanField(default=True)
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "credence_departments"
        ordering = ["name"]
        unique_together = [("institution", "name")]

    def __str__(self):
        return self.name


class Program(models.Model):
    """Degree program under a department — soft-delete via active=False only."""

    class QualificationType(models.TextChoices):
        BACHELORS = "bachelors", "Bachelor's Degree"
        MASTERS = "masters", "Master's Degree"
        POSTGRAD_DIPLOMA = "postgrad_diploma", "Postgraduate Diploma"
        DIPLOMA = "diploma", "Diploma"
        CERTIFICATE = "certificate", "Certificate"
        ASSOCIATE = "associate", "Associate Degree"

    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    department  = models.ForeignKey(
        Department, on_delete=models.CASCADE, related_name="programs",
    )
    title       = models.CharField(
        max_length=250,
        help_text="Full formal qualification name, e.g. Bachelor of Science in Nursing",
    )
    qualification_type = models.CharField(
        max_length=30,
        choices=QualificationType.choices,
        default=QualificationType.BACHELORS,
    )
    active      = models.BooleanField(default=True)
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "credence_programs"
        ordering = ["title"]
        unique_together = [("department", "title")]

    def __str__(self):
        return self.title

    @property
    def institution_id(self):
        return self.department.institution_id


class GradeClassification(models.Model):
    """Grade / classification labels — soft-delete via active=False only."""

    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institution = models.ForeignKey(
        Institution, on_delete=models.CASCADE, related_name="grade_classifications",
    )
    label       = models.CharField(max_length=100)
    sort_order  = models.PositiveIntegerField(default=0)
    active      = models.BooleanField(default=True)
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "credence_grade_classifications"
        ordering = ["sort_order", "label"]
        unique_together = [("institution", "label")]

    def __str__(self):
        return self.label
