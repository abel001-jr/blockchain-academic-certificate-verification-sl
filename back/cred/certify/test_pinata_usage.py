from unittest.mock import Mock, patch

import requests
from django.core.cache import cache
from django.test import TestCase, override_settings

from .pinata_usage import get_pinata_storage_usage, sync_pinata_storage_usage
from .models import PinataStorageSnapshot


@override_settings(
    PINATA_JWT="test-token", PINATA_API_KEY="", PINATA_SECRET_API_KEY="",
    PINATA_STORAGE_QUOTA_BYTES=1000000000,
    CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}},
)
class PinataUsageTests(TestCase):
    def setUp(self):
        cache.clear()

    @patch("certify.pinata_usage.requests.get")
    def test_actual_usage_is_cached(self, get):
        get.return_value = Mock(json=Mock(return_value={"pin_size_total": 12345}))
        sync_pinata_storage_usage()
        self.assertEqual(get_pinata_storage_usage()["count"], 12345)
        self.assertEqual(get_pinata_storage_usage()["total"], 1000000000)
        get.assert_called_once_with(
            "https://api.pinata.cloud/data/userPinnedDataTotal",
            headers={"Authorization": "Bearer test-token"}, timeout=5,
        )

    @patch("certify.pinata_usage.requests.get")
    def test_failure_is_not_reported_as_zero(self, get):
        get.side_effect = requests.Timeout()
        sync_pinata_storage_usage()
        self.assertIsNone(get_pinata_storage_usage()["count"])

    @patch("certify.pinata_usage.requests.get")
    def test_invalid_totals_are_unavailable(self, get):
        for size in [None, -1, True, "123", 1.5]:
            PinataStorageSnapshot.objects.all().delete()
            get.return_value = Mock(json=Mock(return_value={"pin_size_total": size}))
            sync_pinata_storage_usage()
            self.assertIsNone(get_pinata_storage_usage()["count"])

    @override_settings(PINATA_JWT="")
    @patch("certify.pinata_usage.requests.get")
    def test_missing_credentials_do_not_call_pinata(self, get):
        self.assertIsNone(get_pinata_storage_usage()["count"])
        get.assert_not_called()

    @override_settings(PINATA_JWT="", PINATA_API_KEY="key", PINATA_SECRET_API_KEY="secret")
    @patch("certify.pinata_usage.requests.get")
    def test_api_key_auth_and_zero_usage(self, get):
        get.return_value = Mock(json=Mock(return_value={"pin_size_total": 0}))
        sync_pinata_storage_usage()
        self.assertEqual(get_pinata_storage_usage()["count"], 0)
        self.assertEqual(get.call_args.kwargs["headers"], {
            "pinata_api_key": "key", "pinata_secret_api_key": "secret",
        })
