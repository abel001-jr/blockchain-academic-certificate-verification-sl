from unittest.mock import Mock, patch

from django.core.cache import cache
from django.test import SimpleTestCase, override_settings

from .encrypted_documents import DocumentEncryptionError, document_sha256, encrypt_document, fetch_verified_document
from .ipfs import fetch_file_from_ipfs


@override_settings(IPFS_TRUST_ENV=True, CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}})
class EncryptedIPFSCacheTests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    def tearDown(self):
        cache.clear()

    @patch("certify.ipfs.requests.get")
    def test_repeated_preview_uses_encrypted_cache_and_still_checks_hash(self, get):
        document = b"%PDF-1.4 test review"
        get.return_value = Mock(content=encrypt_document(document, "credential", "certificate-review"))
        expected = document_sha256(document)
        self.assertEqual(fetch_verified_document("cid", "credential", "certificate-review", expected), document)
        self.assertEqual(fetch_verified_document("cid", "credential", "certificate-review", expected[2:].upper()), document)
        self.assertEqual(fetch_verified_document("cid", "credential", "certificate-review", expected), document)
        get.assert_called_once()
        with self.assertRaises(DocumentEncryptionError):
            fetch_verified_document("cid", "credential", "certificate-review", "0xwrong")
        with self.assertRaises(DocumentEncryptionError):
            fetch_verified_document("cid", "another-credential", "certificate-review", expected)

    @patch("certify.ipfs.requests.get")
    def test_plaintext_is_not_cached(self, get):
        get.return_value = Mock(content=b"%PDF legacy plaintext")
        fetch_file_from_ipfs("legacy")
        fetch_file_from_ipfs("legacy")
        self.assertEqual(get.call_count, 2)

    @override_settings(IPFS_TRUST_ENV=True, PINATA_GATEWAY="https://primary.test", IPFS_FALLBACK_GATEWAYS=["https://fallback.test"])
    @patch("certify.ipfs.requests.get")
    def test_rate_limit_uses_fallback(self, get):
        import requests
        limited = Mock(status_code=429)
        error = requests.HTTPError(response=limited)
        limited.raise_for_status.side_effect = error
        success = Mock(content=encrypt_document(b"pdf", "credential", "transcript"))
        get.side_effect = [limited, success]
        self.assertEqual(fetch_file_from_ipfs("cid"), success.content)
        self.assertEqual(get.call_count, 2)
        self.assertEqual(get.call_args.args[0], "https://fallback.test/ipfs/cid")

    @override_settings(PINATA_GATEWAY="https://primary.test", IPFS_FALLBACK_GATEWAYS=["https://fallback.test"])
    @patch("certify.ipfs.requests.get")
    def test_rate_limited_gateway_is_skipped_for_other_cids(self, get):
        import requests
        from .ipfs import _gateway_key
        limited = Mock(status_code=429, headers={"Retry-After": "90"})
        limited.raise_for_status.side_effect = requests.HTTPError(response=limited)
        success = Mock(content=encrypt_document(b"pdf", "credential", "transcript"))
        get.side_effect = [limited, success, success]
        fetch_file_from_ipfs("first")
        fetch_file_from_ipfs("second")
        self.assertEqual(get.call_count, 3)
        self.assertEqual(get.call_args.args[0], "https://fallback.test/ipfs/second")
        self.assertTrue(cache.get(_gateway_key("https://primary.test")))
        cache.delete(_gateway_key("https://primary.test"))
        get.side_effect = None
        get.return_value = success
        fetch_file_from_ipfs("third")
        self.assertEqual(get.call_args.args[0], "https://primary.test/ipfs/third")

    @override_settings(PINATA_GATEWAY="https://primary.test", IPFS_FALLBACK_GATEWAYS=[])
    @patch("certify.ipfs.requests.get")
    def test_all_gateways_cooling_down_do_not_send_more_requests(self, get):
        from .ipfs import _gateway_key
        cache.set(_gateway_key("https://primary.test"), True, 60)
        with self.assertRaisesMessage(RuntimeError, "rate limited"):
            fetch_file_from_ipfs("another-cid")
        get.assert_not_called()

    @patch("certify.ipfs.requests.get")
    def test_metadata_is_cached_but_plaintext_pdfs_are_not(self, get):
        get.return_value = Mock(content=b'{"certificateId":"CR-1"}')
        self.assertEqual(fetch_file_from_ipfs("metadata"), fetch_file_from_ipfs("metadata"))
        get.assert_called_once()

    def test_retry_after_seconds_and_http_dates(self):
        from datetime import datetime, timezone, timedelta
        from email.utils import format_datetime
        from .ipfs import _cooldown_seconds
        self.assertEqual(_cooldown_seconds(Mock(headers={"Retry-After": "120"})), 120)
        seconds = _cooldown_seconds(Mock(headers={"Retry-After": format_datetime(datetime.now(timezone.utc) + timedelta(seconds=90))}))
        self.assertTrue(87 <= seconds <= 90)
        self.assertEqual(_cooldown_seconds(Mock(headers={})), 60)

    @patch("certify.ipfs.requests.get")
    def test_concurrent_cid_reads_share_one_upstream_fetch(self, get):
        from concurrent.futures import ThreadPoolExecutor
        import time
        payload = encrypt_document(b"pdf", "credential", "transcript")
        def respond(*args, **kwargs):
            time.sleep(0.03)
            return Mock(content=payload)
        get.side_effect = respond
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(fetch_file_from_ipfs, ["concurrent"] * 4))
        self.assertEqual(results, [payload] * 4)
        get.assert_called_once()

    @override_settings(PINATA_GATEWAY="https://primary.test", IPFS_FALLBACK_GATEWAYS=["https://fallback.test"])
    @patch("certify.ipfs.requests.get")
    def test_fast_preview_does_not_wait_for_all_gateways(self, get):
        import requests
        get.side_effect = requests.Timeout("slow gateway")
        with self.assertRaises(RuntimeError):
            fetch_file_from_ipfs("fast-preview", fast=True)
        get.assert_called_once_with("https://primary.test/ipfs/fast-preview", timeout=(1, 2))
