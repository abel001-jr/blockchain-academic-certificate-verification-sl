from unittest.mock import patch

import pymupdf
from django.core.files.base import ContentFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import Role, User
from institutions.models import Institution
from .encrypted_documents import document_sha256, encrypt_document
from .models import Certificate


@override_settings(CREDENTIAL_DOCUMENT_ENCRYPTION_KEY="ab" * 32,
                   STORAGES={"default": {"BACKEND": "django.core.files.storage.InMemoryStorage"}})
class SignerDocumentFallbackTests(TestCase):
    def setUp(self):
        self.institution = Institution.objects.create(institution_id="FALLBACK", name="Fallback University")
        self.signer = User.objects.create_user(email="vc@fallback.example", role=Role.VC, institution=self.institution)
        self.client = APIClient()
        self.client.force_authenticate(self.signer)
        with pymupdf.open() as pdf:
            for text in ("Transcript page one", "Transcript page two"):
                pdf.new_page().insert_text((50, 50), text)
            self.pdf = pdf.tobytes()
        self.cert = Certificate.objects.create(institution=self.institution, certificate_id="FALLBACK-1",
            student_name="Ada Lovelace", degree_title="Computing", graduation_year=2026,
            flow_type="full_upload", status="pending_vc", ipfs_cid_transcript="transcript-cid",
            transcript_hash=document_sha256(self.pdf))
        self.cert.transcript_file.save("transcript.enc", ContentFile(encrypt_document(self.pdf, self.cert.certificate_id, "transcript")))
        self.url = f"/api/certificates/{self.cert.pk}/review-document/transcript/"

    @patch("certify.encrypted_documents.fetch_verified_document", side_effect=RuntimeError("IPFS retrieval failed: rate limited"))
    def test_rate_limit_offers_secondary_view(self, fetch):
        response = self.client.get(self.url + "?page=1")
        self.assertEqual(response.status_code, 502, response.data)
        self.assertEqual(response.data["code"], "document_rate_limited")
        self.assertTrue(response.data["fallback_available"])

    @patch("certify.encrypted_documents.fetch_verified_document", side_effect=AssertionError("Secondary view must not use gateways"))
    def test_secondary_view_renders_all_pages_without_gateway_requests(self, fetch):
        for page in (1, 2):
            response = self.client.get(self.url + f"?page={page}&source=stored")
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response.data["source"], "stored")
            self.assertEqual(response.data["page_count"], 2)
            self.assertTrue(response.data["image"].startswith("data:image/png;base64,"))
            self.assertEqual(response["Cache-Control"], "private, no-store")
        fetch.assert_not_called()

    @patch("certify.encrypted_documents.fetch_verified_document", side_effect=RuntimeError("IPFS retrieval failed: HTTP 401, HTTP 403"))
    def test_gateway_authorization_failure_does_not_request_user_password(self, fetch):
        response = self.client.get(self.url + "?page=1")
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.data["code"], "document_gateway_authorization")
        self.assertTrue(response.data["fallback_available"])
        self.assertIn("system administrator", response.data["detail"])

    def test_saved_copy_with_wrong_hash_is_rejected(self):
        self.cert.transcript_hash = "0x" + "0" * 64
        self.cert.save(update_fields=["transcript_hash"])
        response = self.client.get(self.url + "?page=1&source=stored")
        self.assertEqual(response.status_code, 409)
        self.assertNotIn("image", response.data)

    def test_saved_copy_from_another_credential_is_rejected(self):
        self.cert.transcript_file.save("wrong.enc", ContentFile(encrypt_document(self.pdf, "OTHER-ID", "transcript")))
        response = self.client.get(self.url + "?page=1&source=stored")
        self.assertEqual(response.status_code, 409)

    def test_missing_saved_copy_does_not_substitute_metadata(self):
        self.cert.transcript_file.delete()
        response = self.client.get(self.url + "?page=1&source=stored")
        self.assertEqual(response.status_code, 404)
        self.assertNotIn("image", response.data)

    def test_other_institution_cannot_read_saved_document(self):
        other = Institution.objects.create(institution_id="OTHER-FB", name="Other University")
        self.signer.institution = other
        self.signer.save(update_fields=["institution"])
        response = self.client.get(self.url + "?page=1&source=stored")
        self.assertEqual(response.status_code, 404)

    def test_generated_review_copy_uses_its_own_encryption_domain(self):
        self.cert.flow_type = "system_designed"
        self.cert.ipfs_cid_pdf = "certificate-cid"
        self.cert.doc_hash = document_sha256(self.pdf)
        self.cert.document_file.save("review.enc", ContentFile(encrypt_document(self.pdf, self.cert.certificate_id, "certificate-review")), save=False)
        self.cert.save()
        response = self.client.get(f"/api/certificates/{self.cert.pk}/review-document/certificate/?page=1&source=stored&progress=true")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["source"], "stored")

    def test_secondary_page_outside_document_is_rejected(self):
        response = self.client.get(self.url + "?page=3&source=stored")
        self.assertEqual(response.status_code, 400)

    @patch("certify.encrypted_documents.fetch_verified_document")
    def test_preview_requests_short_gateway_attempt_when_saved_copy_exists(self, fetch):
        fetch.return_value = self.pdf
        response = self.client.get(self.url + "?page=1")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(fetch.call_args.kwargs, {"fast": True})

    def test_preview_budget_is_separate_from_general_dashboard_budget(self):
        from types import SimpleNamespace
        from django.core.cache import cache
        from rest_framework.throttling import UserRateThrottle
        from .throttles import OfficerDocumentPreviewThrottle
        request = SimpleNamespace(user=self.signer, META={"REMOTE_ADDR": "127.0.0.1"})
        preview = OfficerDocumentPreviewThrottle()
        general = UserRateThrottle()
        preview_key = preview.get_cache_key(request, None)
        general_key = general.get_cache_key(request, None)
        cache.delete_many([preview_key, general_key])
        try:
            self.assertNotEqual(preview_key, general_key)
            for _ in range(200):
                self.assertTrue(general.allow_request(request, None))
            self.assertFalse(general.allow_request(request, None))
            for _ in range(300):
                self.assertTrue(preview.allow_request(request, None))
            self.assertFalse(preview.allow_request(request, None))
        finally:
            cache.delete_many([preview_key, general_key])

    @patch("certify.encrypted_documents.fetch_verified_document", side_effect=AssertionError("Saved review must not require IPFS"))
    def test_both_saved_documents_remain_reviewable_during_ipfs_outage(self, fetch):
        self.cert.ipfs_cid_pdf = "certificate-cid"
        self.cert.doc_hash = document_sha256(self.pdf)
        self.cert.document_file.save("certificate.enc", ContentFile(encrypt_document(self.pdf, self.cert.certificate_id, "certificate")), save=False)
        self.cert.save()
        for kind in ("certificate", "transcript"):
            for page in (1, 2):
                response = self.client.get(f"/api/certificates/{self.cert.pk}/review-document/{kind}/?source=stored&page={page}")
                self.assertEqual(response.status_code, 200, response.data)
                self.assertEqual(response.data["display_source"], "stored")
                self.assertEqual(response.data["page_count"], 2)
        fetch.assert_not_called()
