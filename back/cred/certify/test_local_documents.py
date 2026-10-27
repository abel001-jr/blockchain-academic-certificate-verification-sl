from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import Mock
from django.test import SimpleTestCase, override_settings
from django.core.files.base import ContentFile
from .encrypted_documents import document_sha256, DocumentEncryptionError, encrypt_document
from .local_documents import owner_document

@override_settings(CREDENTIAL_DOCUMENT_ENCRYPTION_KEY="11" * 32)
class LocalDocumentTests(SimpleTestCase):
    def setUp(self):
        self.directory = TemporaryDirectory(dir=Path(__file__).resolve().parent.parent)
        self.addCleanup(self.directory.cleanup)
        config = override_settings(CREDENTIAL_LOCAL_DOCUMENT_ROOT=self.directory.name)
        config.enable()
        self.addCleanup(config.disable)
        self.cert = SimpleNamespace(pk="credential-1", certificate_id="CR-1", document_file=None, transcript_file=None)
        self.data = b"final issued PDF"
        self.digest = document_sha256(self.data)

    def test_first_fetch_persists_encrypted_copy_and_second_is_offline(self):
        fetch = Mock(return_value=self.data)
        self.assertEqual(owner_document(self.cert, "certificate", "cid", self.digest, fetch), self.data)
        fetch.assert_called_once()
        stored = list(Path(self.directory.name).rglob("*.enc"))
        self.assertEqual(len(stored), 1)
        self.assertNotIn(self.data, stored[0].read_bytes())
        fetch.reset_mock()
        self.assertEqual(owner_document(self.cert, "certificate", "", self.digest, fetch), self.data)
        fetch.assert_not_called()

    def test_matching_original_upload_avoids_ipfs(self):
        self.cert.document_file = ContentFile(self.data, name="issued.pdf")
        fetch = Mock()
        self.assertEqual(owner_document(self.cert, "certificate", "", self.digest, fetch), self.data)
        fetch.assert_not_called()

    def test_presealed_original_is_not_served_for_final_hash(self):
        self.cert.document_file = ContentFile(b"unsealed original", name="original.pdf")
        fetch = Mock(return_value=self.data)
        self.assertEqual(owner_document(self.cert, "certificate", "sealed-cid", self.digest, fetch), self.data)
        fetch.assert_called_once()

    def test_corrupt_cache_recovers_and_invalid_fallback_is_rejected(self):
        fetch = Mock(return_value=self.data)
        owner_document(self.cert, "certificate", "cid", self.digest, fetch)
        path = next(Path(self.directory.name).rglob("*.enc"))
        path.write_bytes(b"corrupted")
        fetch.return_value = b"wrong document"
        with self.assertRaises(DocumentEncryptionError):
            owner_document(self.cert, "certificate", "cid", self.digest, fetch)

    def test_new_final_hash_cannot_reuse_old_cached_document(self):
        fetch = Mock(return_value=self.data)
        owner_document(self.cert, "certificate", "cid", self.digest, fetch)
        updated = b"new final PDF"
        fetch.reset_mock()
        fetch.return_value = updated
        self.assertEqual(owner_document(self.cert, "certificate", "new-cid", document_sha256(updated), fetch), updated)
        fetch.assert_called_once()

    def test_encrypted_db_transcript_is_decrypted_before_hash_check(self):
        encrypted = encrypt_document(self.data, self.cert.certificate_id, "transcript")
        self.cert.transcript_file = ContentFile(encrypted, name="transcript.pdf.enc")
        fetch = Mock(side_effect=RuntimeError("Pinata unavailable"))
        self.assertEqual(owner_document(self.cert, "transcript", "cid", self.digest, fetch), self.data)
        fetch.assert_not_called()
