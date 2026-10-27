from unittest.mock import patch
from django.test import TestCase, override_settings
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from accounts.models import User, Role
from institutions.models import Institution
from .models import Certificate
from .ipfs import PinningError


@override_settings(STORAGES={"default": {"BACKEND": "django.core.files.storage.InMemoryStorage"}})
class UploadRetryTests(TestCase):
    def setUp(self):
        institution = Institution.objects.create(institution_id="RETRY", name="Retry Institute")
        user = User.objects.create_user(email="retry@test.example", role=Role.REGISTRAR, institution=institution)
        self.cert = Certificate.objects.create(certificate_id="RETRY-1", institution=institution, issued_by=user,
            student_name="Tobio Kageyama", degree_title="BSc", graduation_year=2026, flow_type="full_upload")
        self.client = APIClient()
        self.client.force_authenticate(user)

    def upload(self):
        return self.client.post(f"/api/certificates/{self.cert.pk}/upload-and-anchor/", {
            "document_file": SimpleUploadedFile("certificate.pdf", b"%PDF certificate", content_type="application/pdf"),
            "transcript_file": SimpleUploadedFile("transcript.pdf", b"%PDF transcript", content_type="application/pdf"),
        }, format="multipart")

    @patch("certify.views.log_action")
    @patch("certify.views.build_certificate_json", return_value={"test": "record"})
    @patch("certify.views._seal", side_effect=lambda data, *args: b"encrypted-" + data)
    @patch("certify.views.document_review_gate", return_value=None)
    @patch("certify.views.require_signatures")
    @patch("certify.views.pin_json_to_ipfs")
    @patch("certify.views.pin_file_to_ipfs")
    def test_metadata_failure_preserves_both_pins_and_retry_reuses_them(self, pin, metadata, *unused):
        pin.side_effect = [{"cid": "transcript-cid", "ipfs_url": "transcript-url"},
                           {"cid": "certificate-cid", "ipfs_url": "certificate-url"}]
        metadata.side_effect = PinningError("Storage timed out", "storage_timeout")
        failed = self.upload()
        self.assertEqual(failed.status_code, 502)
        self.cert.refresh_from_db()
        self.assertEqual(self.cert.status, "draft")
        self.assertEqual(self.cert.ipfs_cid_transcript, "transcript-cid")
        self.assertEqual(self.cert.ipfs_cid_pdf, "certificate-cid")
        self.assertTrue(self.cert.document_file.storage.exists(self.cert.document_file.name))
        metadata.side_effect = None
        metadata.return_value = {"cid": "metadata-cid", "ipfs_url": "metadata-url"}
        retried = self.upload()
        self.assertEqual(retried.status_code, 200, retried.data)
        self.assertEqual(pin.call_count, 2)
        self.cert.refresh_from_db()
        self.assertEqual(self.cert.status, "pending_vc")
