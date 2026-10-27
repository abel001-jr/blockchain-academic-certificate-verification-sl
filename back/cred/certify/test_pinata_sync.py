from datetime import timedelta
from unittest.mock import Mock, patch
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate
from accounts.models import Role, User
from .models import PinataStorageSnapshot
from .pinata_usage import get_pinata_storage_usage, sync_pinata_storage_usage
from .platform_views import PlatformStatsView


@override_settings(PINATA_JWT="test", PINATA_STORAGE_QUOTA_BYTES=1000)
class PinataSyncTests(TestCase):
    @patch("requests.sessions.Session.request", side_effect=AssertionError("Dashboard attempted an HTTP request"))
    @patch("certify.pinata_usage.sync_pinata_storage_usage", side_effect=AssertionError("Dashboard attempted a sync"))
    def test_dashboard_endpoint_uses_snapshot_even_when_missing_or_stale(self, sync, http):
        user = User.objects.create_user(email="snapshot-admin@example.com", role=Role.SUPER_ADMIN)
        factory = APIRequestFactory()
        for state in ("missing", "fresh", "stale", "failed"):
            with self.subTest(state=state):
                PinataStorageSnapshot.objects.all().delete()
                if state != "missing":
                    PinataStorageSnapshot.objects.create(
                        size_bytes=123,
                        synced_at=timezone.now() - timedelta(minutes=10 if state == "stale" else 0),
                        unavailable=state == "failed",
                    )
                for _ in range(2):
                    request = factory.get("/api/admin/platform-stats/")
                    force_authenticate(request, user=user)
                    response = PlatformStatsView.as_view()(request)
                    self.assertEqual(response.status_code, 200)
                    usage = response.data["completion"]["pinata"]
                    self.assertEqual(usage["count"], None if state == "missing" else 123)
                    self.assertEqual(usage["unavailable"], state != "fresh")
        sync.assert_not_called()
        http.assert_not_called()

    @patch("certify.pinata_usage.requests.get")
    def test_dashboard_reads_never_call_pinata(self, get):
        PinataStorageSnapshot.objects.create(size_bytes=123, synced_at=timezone.now(), unavailable=False)
        for _ in range(5):
            self.assertEqual(get_pinata_storage_usage()["count"], 123)
        get.assert_not_called()

    @patch("certify.pinata_usage.requests.get")
    def test_shared_lease_and_schedule(self, get):
        response = Mock(status_code=200)
        response.json.return_value = {"pin_size_total": 123}
        get.return_value = response
        self.assertTrue(sync_pinata_storage_usage())
        self.assertFalse(sync_pinata_storage_usage())
        self.assertEqual(get.call_count, 1)
        self.assertEqual(get_pinata_storage_usage()["count"], 123)

    @patch("certify.pinata_usage.requests.get")
    def test_rate_limit_preserves_value_and_increases_backoff(self, get):
        import requests
        response = Mock(status_code=429, headers={"Retry-After": "300"})
        response.raise_for_status.side_effect = requests.HTTPError(response=response)
        get.return_value = response
        PinataStorageSnapshot.objects.create(size_bytes=123, synced_at=timezone.now(), unavailable=False)
        sync_pinata_storage_usage()
        row = PinataStorageSnapshot.objects.get(pk=1)
        self.assertEqual(row.size_bytes, 123)
        self.assertGreater(row.next_attempt_at, timezone.now() + timedelta(seconds=295))
        self.assertTrue(get_pinata_storage_usage()["unavailable"])
        self.assertFalse(sync_pinata_storage_usage())
        response.headers = {}
        row.next_attempt_at = timezone.now() - timedelta(seconds=1)
        row.save()
        sync_pinata_storage_usage()
        row.refresh_from_db()
        self.assertEqual(row.failures, 2)
        self.assertGreater(row.next_attempt_at, timezone.now() + timedelta(seconds=115))
