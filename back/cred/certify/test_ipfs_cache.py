from unittest.mock import Mock, patch

from django.core.cache import cache
from django.test import SimpleTestCase, override_settings

from .encrypted_documents import DocumentEncryptionError, document_sha256, encrypt_document, fetch_verified_document
from .ipfs import fetch_file_from_ipfs


@override_settings(CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}})
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
