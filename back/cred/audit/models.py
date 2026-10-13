"""
audit/models.py

Immutable audit log — every significant action in INTELLIGENT ACADEMIC CREDENTIALING is recorded here.
Covers spec §3 (certificate revocation history) and §12 (Audit Logs page).
"""

import uuid
from django.db import models
from django.conf import settings


class AuditLog(models.Model):
    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Who performed the action (null = anonymous/public)
    actor       = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="audit_logs",
    )
    actor_email = models.EmailField(blank=True)   # snapshot in case user is deleted

    # What happened
    action      = models.CharField(max_length=100, db_index=True)
    # e.g. "certificate.created", "certificate.issued", "certificate.revoked",
    #       "certificate.verified", "user.login", "user.created"

    # What it was done to
    target_type = models.CharField(max_length=50, blank=True)   # "Certificate", "User", etc.
    target_id   = models.CharField(max_length=100, blank=True)

    # Human-readable description
    detail      = models.TextField(blank=True)

    # Network
    ip_address  = models.GenericIPAddressField(null=True, blank=True)

    timestamp   = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "credence_audit_logs"
        ordering = ["-timestamp"]
        verbose_name        = "Audit Log"
        verbose_name_plural = "Audit Logs"

    def __str__(self):
        actor = self.actor_email or "anonymous"
        return f"[{self.timestamp:%Y-%m-%d %H:%M}] {actor} → {self.action}"
