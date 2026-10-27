import json
from types import SimpleNamespace
from unittest.mock import Mock, patch
from django.test import SimpleTestCase, TestCase, override_settings
from eth_abi import encode
from rest_framework.test import APIClient
from accounts.models import Role, User
from institutions.models import Institution
from certify.models import Certificate, CertificateStatus
from certify.encrypted_documents import DocumentEncryptionError, document_sha256
from certify.utils import build_certificate_json, compute_sha256_json
from .integrity import CERTIFICATE_TUPLE, VerificationUnavailable, read_chain_record, verify_record

class ChainReaderTests(SimpleTestCase):
    @patch("verification.integrity.ChainConfig.load")
    @patch("verification.integrity.requests.Session")
    def test_contract_reads_use_one_block_and_final_sealed_hash(self, session, config):
        config.return_value = SimpleNamespace(rpc_url="http://rpc.test", chain_id=31337, certificate_registry_address="0x" + "1" * 40)
        row = ("CR-1", bytes.fromhex("11" * 32), bytes.fromhex("22" * 32), bytes.fromhex("33" * 32), bytes.fromhex("44" * 32), "0x" + "2" * 40, "INST", 2, True, False, "0x" + "3" * 40, 10, "0x" + "4" * 40, 11, 12, 9, 0, "")
        values = ["0x7a69", "0x20", "0x1234", "0x" + encode(["bool"] * 4, [True, False, False, True]).hex(), "0x" + encode([CERTIFICATE_TUPLE], [row]).hex()]
        post = session.return_value.__enter__.return_value.post
        post.side_effect = [Mock(json=Mock(return_value={"result": value})) for value in values]
        result = read_chain_record("CR-1")
        self.assertEqual(result["certificate_hash"], "0x" + "44" * 32)
        self.assertEqual(result["status"], "issued")
        self.assertEqual(result["block_number"], 32)
        for call in post.call_args_list[2:]:
            self.assertEqual(call.kwargs["json"]["params"][-1], "0x20")

    @patch("verification.integrity.ChainConfig.load")
    @patch("verification.integrity.requests.Session")
    def test_wrong_network_fails_before_reading_contract(self, session, config):
        config.return_value = SimpleNamespace(rpc_url="http://rpc.test", chain_id=31337, certificate_registry_address="0x" + "1" * 40)
        session.return_value.__enter__.return_value.post.return_value.json.return_value = {"result": "0x1"}
        with self.assertRaisesMessage(VerificationUnavailable, "wrong network"):
            read_chain_record("CR-1")

    @patch("verification.integrity.ChainConfig.load")
    @patch("verification.integrity.requests.Session")
    def test_missing_contract_is_unavailable(self, session, config):
        config.return_value = SimpleNamespace(rpc_url="http://rpc.test", chain_id=31337, certificate_registry_address="0x" + "1" * 40)
        session.return_value.__enter__.return_value.post.side_effect = [Mock(json=Mock(return_value={"result": value})) for value in ["0x7a69", "0x20", "0x"]]
        with self.assertRaisesMessage(VerificationUnavailable, "contract is unavailable"):
            read_chain_record("CR-1")

@override_settings(HCAPTCHA_ENABLED=False)
class CredentialIntegrityTests(TestCase):
    def setUp(self):
        institution = Institution.objects.create(institution_id="INTEGRITY", name="Integrity University")
        user = User.objects.create_user(email="registrar@integrity.test", role=Role.REGISTRAR, institution=institution)
        self.cert = Certificate.objects.create(certificate_id="CR-INTEGRITY", institution=institution, issued_by=user,
            student_name="Test Student", student_email="student@test.example", degree_title="BSc", graduation_year=2026,
            status=CertificateStatus.ISSUED, ipfs_cid_json="json-cid", ipfs_cid_pdf="pdf-cid", ipfs_cid_transcript="transcript-cid")
        self.metadata = build_certificate_json(self.cert)
        self.chain = {"exists": True, "status": "issued", "data_hash": compute_sha256_json(self.metadata),
            "certificate_hash": document_sha256(b"certificate"), "transcript_hash": document_sha256(b"transcript"),
            "institution_id": institution.institution_id, "chain_id": 31337, "contract_address": "0x" + "1" * 40, "block_number": 3}
        for name, value in (("read_chain_record", self.chain), ("fetch_file_from_ipfs", json.dumps(self.metadata).encode()), ("fetch_verified_document", b"pdf")):
            patcher = patch("verification.integrity." + name, return_value=value)
            setattr(self, name, patcher.start())
            self.addCleanup(patcher.stop)

    def test_public_checks_chain_and_metadata_but_not_private_documents(self):
        report = verify_record(self.cert)
        self.assertEqual(report["verification_outcome"], "valid")
        self.assertEqual(report["checks"]["certificate"]["status"], "not_checked")
        self.fetch_verified_document.assert_not_called()

    def test_full_uses_chain_hashes_even_if_database_hashes_are_changed(self):
        self.cert.doc_hash = "0xwrong"
        self.cert.transcript_hash = "0xwrong"
        report = verify_record(self.cert, include_documents=True)
        self.assertEqual(report["verification_outcome"], "valid")
        self.assertEqual(self.fetch_verified_document.call_args_list[0].args[-1], self.chain["certificate_hash"])
        self.assertEqual(self.fetch_verified_document.call_args_list[1].args[-1], self.chain["transcript_hash"])

    def test_database_metadata_change_is_detected(self):
        self.cert.student_name = "Different Student"
        self.assertEqual(verify_record(self.cert)["verification_outcome"], "tampered")

    def test_replaced_metadata_content_is_detected(self):
        self.fetch_file_from_ipfs.return_value = b'{"studentName":"Different Student"}'
        self.assertEqual(verify_record(self.cert)["verification_outcome"], "tampered")

    def test_missing_metadata_is_unavailable(self):
        self.fetch_file_from_ipfs.side_effect = RuntimeError("storage offline")
        self.assertEqual(verify_record(self.cert)["verification_outcome"], "unavailable")

    def test_rpc_failure_does_not_use_database_issued_status(self):
        self.read_chain_record.side_effect = VerificationUnavailable("RPC unavailable")
        self.assertEqual(verify_record(self.cert)["verification_outcome"], "unavailable")
        self.fetch_file_from_ipfs.assert_not_called()

    def test_chain_revocation_wins_over_database(self):
        self.chain["status"] = "revoked"
        self.assertEqual(verify_record(self.cert)["verification_outcome"], "revoked")
        self.fetch_file_from_ipfs.assert_not_called()

    def test_local_chain_reset_is_not_verified(self):
        self.read_chain_record.return_value = {"exists": False}
        self.assertEqual(verify_record(self.cert)["verification_outcome"], "not_verified")

    def test_document_outage_is_not_tampering(self):
        self.fetch_verified_document.side_effect = RuntimeError("storage offline")
        report = verify_record(self.cert, include_documents=True)
        self.assertEqual(report["verification_outcome"], "unavailable")
        self.assertEqual(report["checks"]["data"]["status"], "matched")

    def test_mismatch_does_not_skip_other_document(self):
        self.fetch_verified_document.side_effect = [DocumentEncryptionError("wrong hash"), b"pdf"]
        report = verify_record(self.cert, include_documents=True)
        self.assertEqual(report["verification_outcome"], "tampered")
        self.assertEqual(report["checks"]["transcript"]["status"], "matched")

    def test_supplied_original_files_are_compared_against_chain(self):
        good = verify_record(self.cert, include_documents=True, supplied_documents={"certificate": b"certificate", "transcript": b"transcript"})
        self.assertEqual(good["verification_outcome"], "valid")
        self.fetch_verified_document.assert_not_called()
        bad = verify_record(self.cert, include_documents=True, supplied_documents={"certificate": b"changed"})
        self.assertEqual(bad["verification_outcome"], "tampered")

    def test_public_api_scope_and_no_private_hashes(self):
        response = APIClient().get(f"/api/verify/{self.cert.certificate_id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["verification_outcome"], "valid")
        self.assertNotIn("data_hash", response.data["blockchain"])
        self.assertEqual(response.data["certificate"]["degree_title"], self.cert.degree_title)
        self.assertEqual(response.data["certificate"]["department"], self.cert.department)
        self.assertEqual(response.data["certificate"]["graduation_year"], self.cert.graduation_year)
        self.assertNotIn("grade", response.data["certificate"])
        self.assertNotIn("documents_path", response.data["certificate"])
        self.assertEqual(response["Cache-Control"], "private, no-store")

    def test_public_upload_compares_only_supplied_file_without_private_details(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        response = APIClient().post(f"/api/verify/{self.cert.certificate_id}/", {"certificate": SimpleUploadedFile("cert.pdf", b"certificate")}, format="multipart")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["verification_outcome"], "valid")
        self.assertEqual(response.data["verification_scope"], "public")
        self.assertEqual(response.data["checks"]["certificate"]["source"], "uploaded_file")
        self.assertEqual(response.data["checks"]["transcript"]["status"], "not_checked")
        self.assertNotIn("grade", response.data["certificate"])
        self.assertNotIn("documents_path", response.data["certificate"])
        self.fetch_verified_document.assert_not_called()

    def test_public_changed_upload_reports_mismatch(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        response = APIClient().post(f"/api/verify/{self.cert.certificate_id}/", {"certificate": SimpleUploadedFile("cert.pdf", b"changed")}, format="multipart")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["verification_outcome"], "tampered")
        self.assertEqual(response.data["checks"]["certificate"]["status"], "mismatch")
        self.fetch_verified_document.assert_not_called()

    def test_stored_files_still_require_share_access(self):
        self.assertEqual(APIClient().get(f"/api/verify/{self.cert.certificate_id}/documents/").status_code, 403)

    def test_single_use_link_allows_only_one_verification(self):
        from certify.models import VerificationShareCode
        raw = self.make_share_code()
        VerificationShareCode.objects.filter(certificate=self.cert).update(single_use=True)
        url = f"/api/verify/{self.cert.certificate_id}/?code={raw}"
        self.assertEqual(APIClient().get(url).status_code, 200)
        self.assertEqual(APIClient().get(url).status_code, 403)

    def single_use_access(self):
        from certify.models import VerificationShareCode
        raw = self.make_share_code()
        VerificationShareCode.objects.filter(certificate=self.cert).update(single_use=True)
        return raw, VerificationShareCode.objects.get(certificate=self.cert)

    def upload_pdf(self):
        import pymupdf as fitz
        from django.core.files.uploadedfile import SimpleUploadedFile
        with fitz.open() as doc:
            doc.new_page()
            data = doc.tobytes()
        self.chain["certificate_hash"] = document_sha256(data)
        return SimpleUploadedFile("certificate.pdf", data, content_type="application/pdf")

    def test_employer_preflight_does_not_consume_or_disclose_records(self):
        raw, share = self.single_use_access()
        response = APIClient().post(f"/api/verify/{self.cert.certificate_id}/access/", {"code": raw}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["access_valid"])
        self.assertNotIn("certificate", response.data)
        share.refresh_from_db()
        self.assertFalse(share.used)

    def test_employer_missing_or_invalid_pdf_does_not_spend_access(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        raw, share = self.single_use_access()
        url = f"/api/verify/{self.cert.certificate_id}/verify-documents/?code={raw}"
        self.assertEqual(APIClient().post(url, {}, format="multipart").status_code, 400)
        self.assertEqual(APIClient().post(url, {"certificate": SimpleUploadedFile("fake.pdf", b"not pdf")}, format="multipart").status_code, 400)
        share.refresh_from_db()
        self.assertFalse(share.used)

    def test_employer_upload_consumes_once_and_skips_missing_transcript(self):
        raw, share = self.single_use_access()
        url = f"/api/verify/{self.cert.certificate_id}/verify-documents/?code={raw}"
        response = APIClient().post(url, {"certificate": self.upload_pdf()}, format="multipart")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["verification_outcome"], "valid")
        self.assertTrue(response.data["access_consumed"])
        self.assertEqual(response.data["checks"]["transcript"]["status"], "not_checked")
        self.fetch_verified_document.assert_not_called()
        self.assertEqual(APIClient().post(url, {"certificate": self.upload_pdf()}, format="multipart").status_code, 403)

    def test_employer_optional_transcript_is_checked_when_supplied(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        raw, share = self.single_use_access()
        certificate = self.upload_pdf()
        transcript = self.upload_pdf()
        self.chain["transcript_hash"] = document_sha256(transcript.read())
        transcript.seek(0)
        response = APIClient().post(f"/api/verify/{self.cert.certificate_id}/verify-documents/?code={raw}", {"certificate": certificate, "transcript": transcript}, format="multipart")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["checks"]["transcript"]["status"], "matched")
        self.assertEqual(response.data["checks"]["transcript"]["source"], "uploaded_file")
        self.fetch_verified_document.assert_not_called()

    def test_employer_upload_requires_student_access(self):
        response = APIClient().post(f"/api/verify/{self.cert.certificate_id}/verify-documents/", {"certificate": self.upload_pdf()}, format="multipart")
        self.assertEqual(response.status_code, 403)

    def test_unavailable_check_keeps_employer_access_for_retry(self):
        raw, share = self.single_use_access()
        with patch("verification.integrity.verify_record", return_value={"verification_outcome": "unavailable", "checks": {}, "blockchain": {}, "message": "Retry"}):
            response = APIClient().post(f"/api/verify/{self.cert.certificate_id}/verify-documents/?code={raw}", {"certificate": self.upload_pdf()}, format="multipart")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["access_consumed"])
        share.refresh_from_db()
        self.assertFalse(share.used)

    def make_share_code(self):
        from certify.models import VerificationShareCode
        from django.utils import timezone
        student = User.objects.create_user(email="student@integrity.test", role=Role.STUDENT)
        _, raw = VerificationShareCode.create(certificate=self.cert, created_by=student, expires_at=timezone.now() + timezone.timedelta(hours=1))
        return raw

    def test_authorized_file_upload_compares_files_without_document_fetch(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        raw = self.make_share_code()
        response = APIClient().post(f"/api/verify/{self.cert.certificate_id}/?code={raw}", {
            "certificate": SimpleUploadedFile("cert.pdf", b"certificate"),
            "transcript": SimpleUploadedFile("transcript.pdf", b"transcript")}, format="multipart")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["verification_outcome"], "valid")
        self.assertEqual(response.data["checks"]["certificate"]["source"], "uploaded_file")
        self.fetch_verified_document.assert_not_called()

    @patch("verification.document_views.fetch_verified_document", return_value=b"pdf")
    def test_shared_download_uses_chain_commitments_and_blocks_chain_revocation(self, fetch):
        raw = self.make_share_code()
        url = f"/api/verify/{self.cert.certificate_id}/documents/?code={raw}"
        response = APIClient().get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(fetch.call_args_list[0].args[-1], self.chain["certificate_hash"])
        self.assertEqual(fetch.call_args_list[1].args[-1], self.chain["transcript_hash"])
        fetch.reset_mock()
        self.chain["status"] = "revoked"
        self.assertEqual(APIClient().get(url).status_code, 409)
        fetch.assert_not_called()

    def test_actual_substituted_encrypted_payload_is_rejected_against_chain(self):
        from certify.encrypted_documents import encrypt_document, fetch_verified_document
        self.fetch_verified_document.side_effect = fetch_verified_document
        with override_settings(CREDENTIAL_DOCUMENT_ENCRYPTION_KEY="ab" * 32):
            payload = encrypt_document(b"substituted file", self.cert.certificate_id, "certificate")
            with patch("certify.ipfs.fetch_file_from_ipfs", return_value=payload):
                report = verify_record(self.cert, include_documents=True)
        self.assertEqual(report["verification_outcome"], "tampered")
        self.assertEqual(report["checks"]["certificate"]["status"], "mismatch")

    def test_absent_metadata_location_is_unavailable(self):
        self.cert.ipfs_cid_json = ""
        self.assertEqual(verify_record(self.cert)["verification_outcome"], "unavailable")

    def test_approved_consent_runs_full_integrity_verification(self):
        from certify.models import ConsentRequest
        from django.utils import timezone
        consent = ConsentRequest.objects.create(certificate=self.cert, verifier_name="Employer", status="approved", expires_at=timezone.now() + timezone.timedelta(hours=1))
        response = APIClient().get(f"/api/verify/consent/{consent.pk}/")
        self.assertEqual(response.status_code, 200)
        report = response.data["certificate"]
        self.assertEqual(report["verification_scope"], "full")
        self.assertEqual(report["verification_outcome"], "valid")
        self.assertEqual(report["certificate"]["certificate_document_hash"], self.chain["certificate_hash"])
        self.assertEqual(response["Cache-Control"], "private, no-store")
        self.assertEqual(self.fetch_verified_document.call_count, 2)

    def test_pending_consent_does_not_fetch_private_documents(self):
        from certify.models import ConsentRequest
        from django.utils import timezone
        consent = ConsentRequest.objects.create(certificate=self.cert, verifier_name="Employer", status="pending", expires_at=timezone.now() + timezone.timedelta(hours=1))
        response = APIClient().get(f"/api/verify/consent/{consent.pk}/")
        self.assertNotIn("certificate", response.data)
        self.fetch_verified_document.assert_not_called()

    def test_missing_decryption_configuration_is_unavailable(self):
        self.fetch_verified_document.side_effect = DocumentEncryptionError("CREDENTIAL_DOCUMENT_ENCRYPTION_KEY must be configured as 64 hex characters.")
        self.assertEqual(verify_record(self.cert, include_documents=True)["verification_outcome"], "unavailable")

    def test_on_chain_record_survives_missing_database_record_as_partial_result(self):
        response = APIClient().get("/api/verify/CR-MISSING-LOCAL/")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["found"])
        self.assertEqual(response.data["verification_outcome"], "unavailable")
        self.assertEqual(response.data["checks"]["blockchain"]["status"], "matched")
        self.assertNotIn("data_hash", response.data["blockchain"])
        self.fetch_file_from_ipfs.assert_not_called()

    def test_missing_record_on_chain_and_database_is_not_found(self):
        self.read_chain_record.return_value = {"exists": False}
        response = APIClient().get("/api/verify/CR-MISSING-LOCAL/")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["verification_outcome"], "not_found")
