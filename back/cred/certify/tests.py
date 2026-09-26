"""Tests for the guards that keep officer approval attached to real documents.

The issuance lifecycle commits every document hash on-chain before either
officer signs, so an approval always refers to a specific set of bytes. The
chain enforces the immutability of those hashes, but only for what it can see.
Two things it cannot see are enforced here, because getting them wrong produces
a credential that looks correctly approved and is not:

  - a transcript attached after the on-chain submission was never reviewed by
    the officers and its hash was never anchored;
  - a registrar cannot attach a transcript to a credential that already has
    one, which would silently orphan the hash that was approved.
"""

from unittest import mock

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import Role, User
from certify.models import Certificate, CertificateStatus, FlowType
from institutions.models import Institution

# A throwaway AES-256 key. The happy path encrypts before pinning, so it needs
# one; the guard tests must never reach that code.
TEST_ENCRYPTION_KEY = "11" * 32


def _pdf(name="transcript.pdf"):
    """A file with PDF magic bytes; the view only checks the extension."""
    return SimpleUploadedFile(
        name, b"%PDF-1.4\n% transcript bytes\n", content_type="application/pdf"
    )


class TranscriptAttachmentTests(TestCase):
    """POST /api/certificates/<id>/upload-transcript/ must not run after submit."""

    def setUp(self):
        self.client = APIClient()
        self.institution = Institution.objects.create(
            institution_id="CUSL-001", name="Central University SL"
        )
        self.registrar = User.objects.create_user(
            email="registrar@cusl.edu.sl",
            password="pw-for-tests-only-123",
            first_name="Reg",
            last_name="Istrar",
            role=Role.REGISTRAR,
            institution=self.institution,
        )
        self.client.force_authenticate(self.registrar)

    def _certificate(self, **overrides):
        fields = {
            "certificate_id": "CR-2026-CUSL-0001",
            "institution": self.institution,
            "student_name": "Ada Lovelace",
            "student_email": "ada@example.edu",
            "degree_title": "BSc Computer Science",
            "graduation_year": 2026,
            "flow_type": FlowType.TRANSCRIPT_THEN_CERT,
            "status": CertificateStatus.DRAFT,
        }
        fields.update(overrides)
        return Certificate.objects.create(**fields)

    @override_settings(CREDENTIAL_DOCUMENT_ENCRYPTION_KEY=TEST_ENCRYPTION_KEY)
    @mock.patch("certify.views.pin_file_to_ipfs")
    def test_transcript_can_be_attached_before_the_chain_submission(self, pin):
        pin.return_value = {"cid": "bafyTranscript", "ipfs_url": "https://ipfs/transcript"}
        cert = self._certificate()

        response = self.client.post(
            f"/api/certificates/{cert.id}/upload-transcript/",
            {"transcript_file": _pdf()},
            format="multipart",
        )

        self.assertEqual(response.status_code, 200, response.data)
        cert.refresh_from_db()
        self.assertTrue(cert.transcript_hash, "the transcript hash must be stored")
        self.assertEqual(cert.ipfs_cid_transcript, "bafyTranscript")

    @mock.patch("certify.views.pin_file_to_ipfs")
    def test_transcript_is_refused_once_the_certificate_is_submitted_on_chain(self, pin):
        """The document set is frozen at submit, so this must not go through.

        The officers approved a credential that did not include a transcript. If
        one is attached afterwards it is issued on a credential nobody reviewed
        and whose hash is not on the chain, which is exactly the gap the paired
        hash commitment exists to close.
        """
        cert = self._certificate(
            status=CertificateStatus.PENDING_VC,
            tx_hash="0x" + "a" * 64,
        )

        response = self.client.post(
            f"/api/certificates/{cert.id}/upload-transcript/",
            {"transcript_file": _pdf()},
            format="multipart",
        )

        self.assertEqual(response.status_code, 400, response.data)
        cert.refresh_from_db()
        self.assertFalse(cert.transcript_hash, "no transcript may be recorded")
        pin.assert_not_called()

    @mock.patch("certify.views.pin_file_to_ipfs")
    def test_refusal_applies_to_every_status_after_submit(self, pin):
        """Being mid-approval is not a reason to allow it."""
        for status in (
            CertificateStatus.PENDING_VC,
            CertificateStatus.PENDING_CHANCELLOR,
            CertificateStatus.PENDING_FINALIZE,
        ):
            with self.subTest(status=status):
                cert = self._certificate(
                    certificate_id=f"CR-2026-CUSL-{status}",
                    status=status,
                    tx_hash="0x" + "b" * 64,
                )
                response = self.client.post(
                    f"/api/certificates/{cert.id}/upload-transcript/",
                    {"transcript_file": _pdf()},
                    format="multipart",
                )
                self.assertEqual(response.status_code, 400, response.data)
                cert.refresh_from_db()
                self.assertFalse(cert.transcript_hash)

        pin.assert_not_called()

    @override_settings(CREDENTIAL_DOCUMENT_ENCRYPTION_KEY=TEST_ENCRYPTION_KEY)
    @mock.patch("certify.views.pin_file_to_ipfs")
    def test_a_second_transcript_is_refused_before_submit_too(self, pin):
        pin.return_value = {"cid": "bafyTranscript", "ipfs_url": "https://ipfs/transcript"}
        cert = self._certificate(transcript_hash="deadbeef")

        response = self.client.post(
            f"/api/certificates/{cert.id}/upload-transcript/",
            {"transcript_file": _pdf()},
            format="multipart",
        )

        self.assertEqual(response.status_code, 400, response.data)
        cert.refresh_from_db()
        # The approved hash must survive, or the on-chain pair would no longer
        # describe what is stored.
        self.assertEqual(cert.transcript_hash, "deadbeef")
        pin.assert_not_called()
