"""audit/utils.py — helper to record audit entries from anywhere."""

from .models import AuditLog


def log_action(
    actor,
    action: str,
    target_type: str = "",
    target_id: str = "",
    detail: str = "",
    ip_address: str = None,
):
    """
    Create an AuditLog entry.

    :param actor:       User instance or None (anonymous)
    :param action:      Dot-namespaced action string e.g. "certificate.issued"
    :param target_type: Model name string e.g. "Certificate"
    :param target_id:   String PK of the target object
    :param detail:      Human-readable description
    :param ip_address:  Requester IP
    """
    AuditLog.objects.create(
        actor=actor,
        actor_email=actor.email if actor else "",
        action=action,
        target_type=target_type,
        target_id=target_id,
        detail=detail,
        ip_address=ip_address or None,
    )
