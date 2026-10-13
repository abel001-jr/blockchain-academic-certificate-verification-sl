import base64
from unittest.mock import Mock, patch
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from pywebpush import WebPushException
from accounts.models import User, Role
from institutions.models import Institution
from certify.models import Certificate
from audit.utils import log_action
from audit.models import AuditLog
from .models import Notification, PushSubscription, NotificationPreference, PushDelivery
from .services import notify, notify_audit_event, dispatch_delivery


@override_settings(WEB_PUSH_PUBLIC_KEY="public", WEB_PUSH_PRIVATE_KEY="private", WEB_PUSH_SUBJECT="mailto:admin@example.edu")
class NotificationTests(TestCase):
    def setUp(self):
        self.institution = Institution.objects.create(institution_id="NOTIFY", name="University")
        self.registrar = User.objects.create_user(email="registrar@example.edu", role=Role.REGISTRAR, institution=self.institution)
        self.vc = User.objects.create_user(email="vc@example.edu", role=Role.VC, institution=self.institution)
        self.chancellor = User.objects.create_user(email="chancellor@example.edu", role=Role.CHANCELLOR, institution=self.institution)
        self.student = User.objects.create_user(email="student@example.edu", role=Role.STUDENT, institution=self.institution)
        self.other = User.objects.create_user(email="other@example.edu", role=Role.VC)
        self.cert = Certificate.objects.create(certificate_id="NOTIFY-1", institution=self.institution, issued_by=self.registrar, student_name="Test Student", student_email=self.student.email, degree_title="Science", graduation_year=2026)
        self.client = APIClient()
        self.client.force_authenticate(self.vc)

    def notification(self, user=None, key="event"):
        return notify(user or self.vc, event_key=key, title="Awaiting approval", body="Private student details")

    def subscribe(self, suffix="one"):
        return PushSubscription.objects.create(user=self.vc, endpoint=f"https://fcm.googleapis.com/fcm/send/{suffix}", p256dh="key", auth="auth")

    def test_inbox_and_mark_read_are_recipient_scoped(self):
        mine = self.notification()
        theirs = self.notification(self.other)
        data = self.client.get("/api/notifications/").data
        self.assertEqual(data["unread_count"], 1)
        self.assertEqual(str(data["results"][0]["id"]), str(mine.pk))
        self.client.patch("/api/notifications/", {"id": str(theirs.pk)}, format="json")
        theirs.refresh_from_db()
        self.assertIsNone(theirs.read_at)
        self.client.patch("/api/notifications/", {"all": True}, format="json")
        self.assertEqual(self.client.get("/api/notifications/").data["unread_count"], 0)

    def test_authentication_and_setup_token_are_required(self):
        from rest_framework_simplejwt.tokens import AccessToken
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.get("/api/notifications/").status_code, 401)
        token = AccessToken.for_user(self.vc)
        token["token_use"] = "officer_setup"
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        self.assertEqual(self.client.get("/api/notifications/").status_code, 403)

    def test_event_is_idempotent_and_targets_next_officer(self):
        log = AuditLog.objects.create(actor=self.registrar, action="certificate.submitted_on_chain", target_type="Certificate", target_id=str(self.cert.pk))
        notify_audit_event(log)
        notify_audit_event(log)
        self.assertEqual(set(Notification.objects.values_list("recipient_id", flat=True)), {self.registrar.pk, self.vc.pk})
        self.assertEqual(PushDelivery.objects.count(), 2)

    def test_chancellor_handoff_and_student_issuance(self):
        log = AuditLog.objects.create(actor=self.vc, action="certificate.vc_approved", target_type="Certificate", target_id=str(self.cert.pk))
        notify_audit_event(log)
        self.assertTrue(Notification.objects.filter(recipient=self.chancellor).exists())
        log.action = "certificate.issued"
        log.pk = None
        log.save()
        notify_audit_event(log)
        self.assertEqual(Notification.objects.get(recipient=self.student).url, "/dashboard/my-certificates")
        self.assertFalse(Notification.objects.filter(recipient=self.other).exists())

    def test_audit_hook_publishes_after_commit(self):
        with self.captureOnCommitCallbacks(execute=True):
            log_action(self.registrar, "certificate.submitted_on_chain", "Certificate", str(self.cert.pk))
            self.assertEqual(Notification.objects.count(), 0)
        self.assertTrue(Notification.objects.filter(recipient=self.vc).exists())

    def test_subscription_rejects_private_or_unapproved_endpoints(self):
        keys = {"p256dh": base64.urlsafe_b64encode(b"\x04" + b"x" * 64).decode(), "auth": base64.urlsafe_b64encode(b"x" * 16).decode()}
        for endpoint in ("http://127.0.0.1/private", "https://localhost/private", "https://fcm.googleapis.com.attacker.test/send"):
            self.assertEqual(self.client.post("/api/notifications/push/", {"endpoint": endpoint, "keys": keys}, format="json").status_code, 400)
        endpoint = "https://fcm.googleapis.com/fcm/send/test"
        self.assertEqual(self.client.post("/api/notifications/push/", {"endpoint": endpoint, "keys": keys}, format="json").status_code, 200)
        self.client.force_authenticate(self.other)
        self.client.delete("/api/notifications/push/", {"endpoint": endpoint}, format="json")
        self.assertTrue(PushSubscription.objects.filter(user=self.vc).exists())

    @patch("pywebpush.webpush")
    def test_push_payload_is_private_and_disabled_preferences_are_respected(self, send):
        notice = self.notification()
        self.subscribe()
        dispatch_delivery(notice.pushdelivery)
        send.assert_not_called()
        notice = self.notification(key="enabled")
        NotificationPreference.objects.create(user=self.vc, push_enabled=True)
        dispatch_delivery(notice.pushdelivery)
        payload = send.call_args.kwargs["data"]
        self.assertNotIn("Private student details", payload)
        self.assertIn("/dashboard?notifications=1", payload)

    @patch("pywebpush.webpush")
    def test_expired_subscription_is_removed(self, send):
        send.side_effect = WebPushException("gone", response=Mock(status_code=410))
        NotificationPreference.objects.create(user=self.vc, push_enabled=True)
        notice = self.notification()
        self.subscribe()
        dispatch_delivery(notice.pushdelivery)
        self.assertEqual(PushSubscription.objects.count(), 0)
        self.assertIsNotNone(notice.pushdelivery.completed_at)

    @patch("pywebpush.webpush")
    def test_retry_does_not_repeat_successful_devices(self, send):
        NotificationPreference.objects.create(user=self.vc, push_enabled=True)
        notice = self.notification()
        self.subscribe("success")
        self.subscribe("retry")
        send.side_effect = [None, WebPushException("rate limit", response=Mock(status_code=429))]
        delivery = notice.pushdelivery
        dispatch_delivery(delivery)
        self.assertIsNone(delivery.completed_at)
        self.assertGreater(delivery.next_attempt_at, timezone.now())
        send.reset_mock()
        send.side_effect = None
        dispatch_delivery(delivery)
        send.assert_called_once()
        self.assertTrue(send.call_args.kwargs["subscription_info"]["endpoint"].endswith("retry"))

    def test_test_notification_deduplicates_same_minute(self):
        self.client.post("/api/notifications/test/")
        self.client.post("/api/notifications/test/")
        self.assertEqual(Notification.objects.count(), 1)
