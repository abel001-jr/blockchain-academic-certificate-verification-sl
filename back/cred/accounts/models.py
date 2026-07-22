"""
accounts/models.py

Custom User model for CREDENCE.
Roles: Super Admin, Registrar (institution head / anchored issuer),
       VC, Chancellor, Student.
"""

import uuid
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models


class Role(models.TextChoices):
    SUPER_ADMIN          = "super_admin",         "Super Admin"
    # Kept for legacy rows; treated as Registrar (institution head)
    INSTITUTIONAL_ADMIN  = "institutional_admin",  "Institutional Admin (legacy)"
    REGISTRAR            = "registrar",            "Registrar"
    VC                   = "vc",                   "Vice Chancellor"
    CHANCELLOR           = "chancellor",           "Chancellor"
    STUDENT              = "student",              "Student"


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("Email is required")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("role", Role.SUPER_ADMIN)
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    id            = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email         = models.EmailField(unique=True)
    first_name    = models.CharField(max_length=100)
    last_name     = models.CharField(max_length=100)
    role          = models.CharField(max_length=30, choices=Role.choices, default=Role.STUDENT)

    institution   = models.ForeignKey(
        "institutions.Institution",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="users",
    )

    student_id    = models.CharField(max_length=50, blank=True, default="")
    wallet_address = models.CharField(max_length=42, blank=True, default="")

    # Officer onboarding (VC / Chancellor)
    must_change_password = models.BooleanField(
        default=False,
        help_text="True while the officer still uses the emailed temporary password.",
    )
    wallet_verified = models.BooleanField(
        default=False,
        help_text="True after the officer proves wallet ownership via signed nonce.",
    )
    on_chain_authorized = models.BooleanField(
        default=False,
        help_text="True after Registrar authorizes the officer wallet on-chain.",
    )

    # Cosmetic digital signature (VC / Chancellor) — NOT cryptographic proof
    signature_image = models.ImageField(
        upload_to="officers/signatures/",
        blank=True,
        null=True,
        help_text="Scanned or typed signature image for certificate display only.",
    )
    signature_set_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the officer last set/updated their signature image.",
    )

    is_active     = models.BooleanField(default=True)
    is_staff      = models.BooleanField(default=False)
    date_joined   = models.DateTimeField(auto_now_add=True)
    updated_at    = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD  = "email"
    REQUIRED_FIELDS = ["first_name", "last_name"]

    class Meta:
        db_table = "credence_users"
        ordering = ["-date_joined"]

    def __str__(self):
        return f"{self.full_name} <{self.email}> [{self.role}]"

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip()

    @property
    def is_super_admin(self):
        return self.role == Role.SUPER_ADMIN

    @property
    def is_institutional_admin(self):
        return self.role == Role.INSTITUTIONAL_ADMIN

    @property
    def is_registrar(self):
        return self.role in (Role.REGISTRAR, Role.INSTITUTIONAL_ADMIN)

    @property
    def is_vc(self):
        return self.role == Role.VC

    @property
    def is_chancellor(self):
        return self.role == Role.CHANCELLOR

    @property
    def is_student(self):
        return self.role == Role.STUDENT

    @property
    def can_issue_certificates(self):
        """Registrar (institution head) prepares / submits certificates."""
        return self.role in (Role.REGISTRAR, Role.INSTITUTIONAL_ADMIN)

    @property
    def can_manage_officers(self):
        """Registrar may add VC and Chancellor accounts."""
        return self.role in (Role.REGISTRAR, Role.INSTITUTIONAL_ADMIN, Role.SUPER_ADMIN)

    @property
    def requires_wallet(self):
        return self.role in (
            Role.SUPER_ADMIN,
            Role.INSTITUTIONAL_ADMIN,
            Role.REGISTRAR,
            Role.VC,
            Role.CHANCELLOR,
        )

    @property
    def has_signature(self):
        return bool(self.signature_image)

    @property
    def is_officer(self):
        return self.role in (Role.VC, Role.CHANCELLOR)

    @property
    def needs_officer_setup(self):
        """Limited session: wallet bind + permanent password not finished."""
        return self.is_officer and (
            self.must_change_password or not self.wallet_verified
        )

    @property
    def officer_status(self):
        """Human-readable onboarding status for registrar UI."""
        if not self.is_officer:
            return None
        if self.on_chain_authorized and self.wallet_verified:
            return "authorized"
        if self.wallet_verified and not self.on_chain_authorized:
            return "pending_authorization"
        if self.must_change_password or not self.wallet_verified:
            return "awaiting_setup"
        return "pending_authorization"
