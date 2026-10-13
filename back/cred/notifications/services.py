"""Durable inbox and push outbox. Push failures never block credential actions."""
import json
import hashlib
import logging
from datetime import timedelta
from urllib.parse import urlparse

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .models import Notification, NotificationPreference, PushSubscription, PushDelivery

logger = logging.getLogger(__name__)


def push_configured():
    return bool(settings.WEB_PUSH_PUBLIC_KEY and settings.WEB_PUSH_PRIVATE_KEY and settings.WEB_PUSH_SUBJECT)


def allowed_push_endpoint(endpoint):
    parsed = urlparse(endpoint)
    return parsed.scheme == "https" and not parsed.username and not parsed.password and parsed.port in (None, 443) and parsed.hostname in settings.WEB_PUSH_ALLOWED_HOSTS


def notify(user, *, event_key, title, body="", url="/dashboard"):
    if not user or not user.is_active:
        return None
    with transaction.atomic():
        notice, created = Notification.objects.get_or_create(
            recipient=user, event_key=event_key,
            defaults={"title": title, "body": body, "url": url},
        )
        if created:
            PushDelivery.objects.create(notification=notice, next_attempt_at=timezone.now())
    return notice


def notify_audit_event(log):
    """Route committed credential events to the people who need them."""
    from accounts.models import User, Role
    from certify.models import Certificate
    account_titles = {
        "officer.authorized_on_chain": "Your officer wallet is authorized",
        "officer.revoked_on_chain": "Your officer wallet authorization was revoked",
        "registrar.authorized_on_chain": "Your Registrar wallet is authorized",
        "registrar.revoked_on_chain": "Your Registrar wallet authorization was revoked",
        "user.activated": "Your account was activated",
    }
    if log.action in account_titles and log.target_type == "User":
        recipient = User.objects.filter(pk=log.target_id, is_active=True).first()
        notify(recipient, event_key=f"audit:{log.pk}", title=account_titles[log.action], body="Your account access has been updated. Review your profile for details.", url="/dashboard/settings")
        return
    titles = {
        "certificate.submitted_on_chain": "Credential awaiting Vice Chancellor approval",
        "certificate.vc_approved": "Credential awaiting Chancellor approval",
        "certificate.dean_approved": "Credential ready to finalize",
        "certificate.issued": "Credential issued",
        "certificate.revoked": "Credential revoked",
    }
    if log.action not in titles or log.target_type != "Certificate":
        return
    cert = Certificate.objects.filter(pk=log.target_id).first()
    if not cert:
        return
    next_role = {
        "certificate.submitted_on_chain": Role.VC,
        "certificate.vc_approved": Role.CHANCELLOR,
        "certificate.dean_approved": Role.REGISTRAR,
    }.get(log.action)
    roles = {Role.REGISTRAR}
    if next_role:
        roles.add(next_role)
    if log.action in ("certificate.issued", "certificate.revoked"):
        roles.add(Role.INSTITUTIONAL_ADMIN)
    recipients = list(User.objects.filter(institution=cert.institution, role__in=roles, is_active=True))
    if log.actor_id and log.actor not in recipients:
        recipients.append(log.actor)
    if log.action in ("certificate.issued", "certificate.revoked"):
        student = User.objects.filter(email__iexact=cert.student_email, role=Role.STUDENT, institution=cert.institution, is_active=True).first()
        if student:
            recipients.append(student)
    for user in recipients:
        url = "/dashboard/my-certificates" if user.role == Role.STUDENT else f"/dashboard/certificates/{cert.pk}"
        notify(user, event_key=f"audit:{log.pk}", title=titles[log.action], body=f"{cert.certificate_id} · {cert.student_name}", url=url)


def dispatch_delivery(delivery):
    from pywebpush import webpush, WebPushException
    notice = delivery.notification
    pref = NotificationPreference.objects.filter(user=notice.recipient, push_enabled=True).exists()
    if not pref or not notice.recipient.is_active or notice.read_at:
        delivery.completed_at = timezone.now()
        delivery.save(update_fields=["completed_at"])
        return
    subscriptions = list(PushSubscription.objects.filter(user=notice.recipient))
    failed = False
    # Lock-screen payload stays generic; private details remain in the authenticated inbox.
    payload = json.dumps({"title": "Academic credential update", "body": "You have a new system notification.", "url": "/dashboard?notifications=1", "tag": str(notice.pk)})
    for subscription in subscriptions:
        endpoint_key = hashlib.sha256(subscription.endpoint.encode()).hexdigest()
        if endpoint_key in delivery.delivered_endpoints:
            continue
        if not allowed_push_endpoint(subscription.endpoint):
            subscription.delete()
            continue
        try:
            webpush(subscription_info={"endpoint": subscription.endpoint, "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth}}, data=payload, vapid_private_key=settings.WEB_PUSH_PRIVATE_KEY, vapid_claims={"sub": settings.WEB_PUSH_SUBJECT}, ttl=3600, timeout=10)
            delivery.delivered_endpoints.append(endpoint_key)
        except WebPushException as exc:
            status = getattr(getattr(exc, "response", None), "status_code", None)
            if status in (404, 410):
                subscription.delete()
            else:
                failed = True
        except Exception:
            failed = True
            logger.warning("Push transport failed for notification %s", notice.pk)
    delivery.attempts += 1
    delivery.last_error = "Push delivery failed; retry scheduled." if failed else ""
    if not failed or delivery.attempts >= 5:
        delivery.completed_at = timezone.now()
    else:
        delivery.next_attempt_at = timezone.now() + timedelta(minutes=2 ** delivery.attempts)
    delivery.save()
