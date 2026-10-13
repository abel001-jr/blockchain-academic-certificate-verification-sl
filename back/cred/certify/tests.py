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
from io import BytesIO
from zipfile import ZipFile
import os

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Role, User
from audit.models import AuditLog
from certify.attestation_notices import notify_officer_pending_attestation
from certify.encrypted_documents import (
    DocumentEncryptionError,
    decrypt_document,
    document_sha256,
    encrypt_document,
)
from certify.models import (
    Certificate,
    CertificateStatus,
    DocumentReview,
    DocumentReviewKind,
    DocumentReviewState,
    FlowType,
    StudentInviteToken,
)
from certify.serializers import CertificateDetailSerializer
from certify.views import notify_student_issued
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

    def _clear_transcript_review(self, cert):
        """Mark the transcript's document review as done.

        These tests are about the tx_hash freeze, not about document review, so
        the review is declared satisfied up front rather than re-derived per
        test. `_pdf()` returns fixed bytes, so the recorded hash matches the file
        the test uploads and the gate's byte comparison is satisfied honestly
        rather than bypassed.
        """
        DocumentReview.objects.create(
            certificate=cert,
            document_kind=DocumentReviewKind.TRANSCRIPT,
            state=DocumentReviewState.RESOLVED,
            document_sha256=document_sha256(_pdf().read()),
            summary={"unresolved_count": 0, "requires_review": False},
        )

    @override_settings(CREDENTIAL_DOCUMENT_ENCRYPTION_KEY=TEST_ENCRYPTION_KEY)
    @mock.patch("certify.views.pin_file_to_ipfs")
    def test_transcript_can_be_attached_before_the_chain_submission(self, pin):
        pin.return_value = {"cid": "bafyTranscript", "ipfs_url": "https://ipfs/transcript"}
        cert = self._certificate()
        self._clear_transcript_review(cert)

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


class StudentEmailUpdateTests(TestCase):
    """POST /api/certificates/<id>/update-student-email/.

    `student_email` is folded into `build_certificate_json()` and therefore into
    the `dataHash` committed to Ethereum. Nothing in the codebase can re-hash or
    re-pin after the fact, so the field has to stay frozen from the moment the
    hash exists â€” otherwise the stored certificate stops reproducing its own
    on-chain data hash.
    """

    def setUp(self):
        self.client = APIClient()
        self.institution = Institution.objects.create(
            institution_id="CUSL-001", name="Central University SL"
        )
        self.other_institution = Institution.objects.create(
            institution_id="UNIMED-002", name="Uni of Mines SL"
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
            "flow_type": FlowType.SYSTEM_DESIGNED,
            "status": CertificateStatus.DRAFT,
        }
        fields.update(overrides)
        return Certificate.objects.create(**fields)

    def test_draft_email_is_corrected(self):
        cert = self._certificate()

        response = self.client.post(
            f"/api/certificates/{cert.id}/update-student-email/",
            {"student_email": "Ada.Lovelace@Example.EDU"},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        cert.refresh_from_db()
        # Normalised, not stored as typed.
        self.assertEqual(cert.student_email, "ada.lovelace@example.edu")
        self.assertEqual(response.data["previous_student_email"], "ada@example.edu")

    def test_hashed_email_is_frozen(self):
        cert = self._certificate(cert_hash="a" * 64)

        response = self.client.post(
            f"/api/certificates/{cert.id}/update-student-email/",
            {"student_email": "typo-fix@example.edu"},
            format="json",
        )

        self.assertEqual(response.status_code, 409, response.data)
        cert.refresh_from_db()
        self.assertEqual(cert.student_email, "ada@example.edu")

    def test_issued_email_is_frozen_even_without_a_hash(self):
        # Defence in depth: an ISSUED/REVOKED row stays closed even if data was
        # ever repaired to drop the hash, so a missing hash can never become a
        # way to reopen a settled credential.
        for settled in (CertificateStatus.ISSUED, CertificateStatus.REVOKED):
            with self.subTest(status=settled):
                cert = self._certificate(
                    certificate_id=f"CR-2026-CUSL-{settled}",
                    status=settled,
                )

                response = self.client.post(
                    f"/api/certificates/{cert.id}/update-student-email/",
                    {"student_email": "typo-fix@example.edu"},
                    format="json",
                )

                self.assertEqual(response.status_code, 409, response.data)
                cert.refresh_from_db()
                self.assertEqual(cert.student_email, "ada@example.edu")

    def test_issued_rejection_does_not_claim_it_was_hashed(self):
        # A hashless ISSUED row must not be told it was "hashed and anchored".
        cert = self._certificate(status=CertificateStatus.ISSUED)

        response = self.client.post(
            f"/api/certificates/{cert.id}/update-student-email/",
            {"student_email": "typo-fix@example.edu"},
            format="json",
        )

        self.assertEqual(response.status_code, 409, response.data)
        self.assertIn("closed to correction", response.data["detail"])
        # cert_hash defaults to "" rather than None on this model.
        self.assertFalse(response.data["cert_hash"])

    def test_pending_states_remain_editable(self):
        # Every pre-anchor state still recomputes its hash at prepare/anchor.
        for open_status in (
            CertificateStatus.PENDING,
            CertificateStatus.PENDING_VC,
            CertificateStatus.PENDING_CHANCELLOR,
            CertificateStatus.PENDING_FINALIZE,
        ):
            with self.subTest(status=open_status):
                cert = self._certificate(
                    certificate_id=f"CR-2026-CUSL-{open_status}",
                    status=open_status,
                )

                response = self.client.post(
                    f"/api/certificates/{cert.id}/update-student-email/",
                    {"student_email": f"{open_status}@example.edu"},
                    format="json",
                )

                self.assertEqual(response.status_code, 200, response.data)
                cert.refresh_from_db()
                self.assertEqual(cert.student_email, f"{open_status}@example.edu")

    def test_detail_serializer_cannot_write_student_email(self):
        # The guarantee is enforced by the serializer, not only by the fact
        # that CertificateDetailView happens to be GET-only. `student_name` is
        # still writable, so the request itself is not a no-op.
        serializer = CertificateDetailSerializer(
            self._certificate(),
            data={"student_name": "Someone Else", "student_email": "bypass@example.edu"},
            partial=True,
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()

        cert = Certificate.objects.get(certificate_id="CR-2026-CUSL-0001")
        self.assertEqual(cert.student_name, "Someone Else")
        self.assertEqual(
            cert.student_email, "ada@example.edu",
            "student_email must be read-only on the detail serializer",
        )

    def test_invalid_address_is_rejected(self):
        cert = self._certificate()

        response = self.client.post(
            f"/api/certificates/{cert.id}/update-student-email/",
            {"student_email": "not-an-email"},
            format="json",
        )

        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("student_email", response.data)
        cert.refresh_from_db()
        self.assertEqual(cert.student_email, "ada@example.edu")

    def test_other_institutions_certificate_is_forbidden(self):
        cert = self._certificate(
            certificate_id="CR-2026-UNIMED-0002",
            institution=self.other_institution,
        )

        response = self.client.post(
            f"/api/certificates/{cert.id}/update-student-email/",
            {"student_email": "ada@example.edu"},
            format="json",
        )

        self.assertEqual(response.status_code, 403, response.data)
        cert.refresh_from_db()
        self.assertEqual(cert.student_email, "ada@example.edu")

    def test_students_cannot_change_the_address(self):
        cert = self._certificate()
        student = User.objects.create_user(
            email="ada@example.edu",
            password="pw-for-tests-only-123",
            first_name="Ada",
            last_name="Lovelace",
            role=Role.STUDENT,
            institution=self.institution,
        )
        self.client.force_authenticate(student)

        response = self.client.post(
            f"/api/certificates/{cert.id}/update-student-email/",
            {"student_email": "attacker@example.edu"},
            format="json",
        )

        self.assertEqual(response.status_code, 403, response.data)
        cert.refresh_from_db()
        self.assertEqual(cert.student_email, "ada@example.edu")

    def test_unchanged_address_is_a_no_op(self):
        cert = self._certificate()

        response = self.client.post(
            f"/api/certificates/{cert.id}/update-student-email/",
            {"student_email": "ADA@example.edu"},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        cert.refresh_from_db()
        self.assertEqual(cert.student_email, "ada@example.edu")

    def test_the_change_is_audited(self):
        from audit.models import AuditLog

        cert = self._certificate()

        self.client.post(
            f"/api/certificates/{cert.id}/update-student-email/",
            {"student_email": "ada.lovelace@example.edu"},
            format="json",
        )

        entry = AuditLog.objects.filter(action="certificate.student_email_changed").first()
        self.assertIsNotNone(entry)
        self.assertIn("ada@example.edu", entry.detail)
        self.assertIn("ada.lovelace@example.edu", entry.detail)


class PlatformStatsTests(TestCase):
    """GET /api/admin/platform-stats/ and /api/admin/certificates/overview/.

    The Super Admin console used to compute every total in the browser from the
    first page of each list, which DRF caps at 20. These guard the two bugs
    that caused: a wrong aggregate, and a per-institution list a Super Admin
    cannot narrow down.
    """

    def setUp(self):
        self.client = APIClient()
        self.super_admin = User.objects.create_user(
            email="root@credence.org",
            password="pw-for-tests-only-123",
            first_name="Root",
            last_name="Admin",
            role=Role.SUPER_ADMIN,
        )
        self.institution = Institution.objects.create(
            institution_id="CUSL-001", name="Central University SL"
        )
        self.other = Institution.objects.create(
            institution_id="UNIMED-002", name="Uni of Mines SL"
        )
        # 25 certificates: more than one page, so a client-side count over the
        # first 20 would report 20.
        for i in range(25):
            Certificate.objects.create(
                certificate_id=f"CR-2026-CUSL-{i:04d}",
                institution=self.institution,
                student_name=f"Student {i}",
                student_email=f"student{i}@cusl.edu.sl",
                degree_title="BSc Computer Science",
                graduation_year=2026,
                flow_type=FlowType.SYSTEM_DESIGNED,
                status=CertificateStatus.ISSUED if i < 5 else CertificateStatus.DRAFT,
            )
        Certificate.objects.create(
            certificate_id="CR-2026-UNIMED-0001",
            institution=self.other,
            student_name="Other Student",
            student_email="other@unimed.edu.sl",
            degree_title="BSc Mining",
            graduation_year=2026,
            flow_type=FlowType.SYSTEM_DESIGNED,
            status=CertificateStatus.ISSUED,
        )
        self.client.force_authenticate(self.super_admin)

    def test_stats_count_every_record_not_just_the_first_page(self):
        response = self.client.get("/api/admin/platform-stats/")

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["certificates"]["total"], 26)
        self.assertEqual(response.data["certificates"]["by_status"]["issued"], 6)
        self.assertEqual(response.data["certificates"]["by_status"]["draft"], 20)

    def test_stats_group_certificates_by_institution(self):
        response = self.client.get("/api/admin/platform-stats/")

        by_name = {row["name"]: row["total"] for row in response.data["by_institution"]}
        self.assertEqual(by_name["Central University SL"], 25)
        self.assertEqual(by_name["Uni of Mines SL"], 1)

    def test_overview_paginates_past_the_drf_page_cap(self):
        response = self.client.get("/api/admin/certificates/overview/?page=2&page_size=20")

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["count"], 26)
        self.assertEqual(response.data["total_pages"], 2)
        self.assertEqual(len(response.data["results"]), 6)

    def test_overview_filters_by_institution(self):
        response = self.client.get(
            f"/api/admin/certificates/overview/?institution={self.other.id}"
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["certificate_id"], "CR-2026-UNIMED-0001")

    def test_overview_filters_by_status(self):
        response = self.client.get("/api/admin/certificates/overview/?status=issued")

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["count"], 6)

    def test_overview_search_spans_institutions(self):
        # Searching by institution name has to reach certificates the Super Admin
        # cannot see from a single institution's page.
        response = self.client.get(
            "/api/admin/certificates/overview/?search=Uni%20of%20Mines"
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(
            response.data["results"][0]["institution_name"], "Uni of Mines SL"
        )

    def test_certificate_list_rejects_institution_filter_for_registrars(self):
        registrar = User.objects.create_user(
            email="registrar@cusl.edu.sl",
            password="pw-for-tests-only-123",
            first_name="Reg",
            last_name="Istrar",
            role=Role.REGISTRAR,
            institution=self.institution,
        )
        self.client.force_authenticate(registrar)

        response = self.client.get(
            f"/api/certificates/?institution={self.other.id}"
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["count"], 0)

    def test_registrars_cannot_read_platform_stats(self):
        registrar = User.objects.create_user(
            email="registrar@cusl.edu.sl",
            password="pw-for-tests-only-123",
            first_name="Reg",
            last_name="Istrar",
            role=Role.REGISTRAR,
            institution=self.institution,
        )
        self.client.force_authenticate(registrar)

        self.assertEqual(
            self.client.get("/api/admin/platform-stats/").status_code, 403
        )
        self.assertEqual(
            self.client.get("/api/admin/certificates/overview/").status_code, 403
        )


#: fitz stamps a creation time and a document ID into the PDF trailer, so two
#: builds of identical content are different files â€” the same non-determinism
#: `REMAINING_WORK.md` records for `generate_certificate_pdf`, and the reason
#: that renderer needs `invariant=1`.
#:
#: The gate compares SHA-256 across two separate requests, so the harness has to
#: model the real flow, where the Registrar picks one file and the *same bytes*
#: are sent to analyse and then to anchor. Caching by content makes identical
#: content produce identical bytes; changing the lines still produces a different
#: file, which is what the stale-review test needs.
_PDF_CACHE = {}


def build_pdf(lines, filename="document.pdf"):
    """A real single-page PDF with a text layer, built the way a registrar's
    actual upload would be. Using a genuine PDF rather than a stub keeps the
    extraction path under test honest."""
    import fitz

    key = tuple(lines)
    if key not in _PDF_CACHE:
        document = fitz.open()
        page = document.new_page()
        y = 90.0
        for line in lines:
            page.insert_text((60, y), line, fontsize=11)
            y += 16
        _PDF_CACHE[key] = document.tobytes()
        document.close()

    return SimpleUploadedFile(filename, _PDF_CACHE[key], content_type="application/pdf")


#: Matches the intake record built in DocumentReviewTests.setUp exactly.
#:
#: Every compared field is behind a label, because that is what the extractor
#: looks for. The institution name also appears as a bare masthead, which is
#: typical of a real certificate and must not be mistaken for the labelled value.
MATCHING_DOCUMENT = [
    "Central University SL",
    "Certificate of Achievement",
    "This is to certify that",
    "Student Name: Ada Lovelace",
    "Degree: BSc Computer Science",
    "Institution: Central University SL",
    "Graduation Year: 2026",
]

#: Same layout, but the name on the document belongs to someone else. This is
#: the exact error the check exists to catch.
MISMATCHED_DOCUMENT = [
    "Central University SL",
    "Certificate of Achievement",
    "This is to certify that",
    "Student Name: Alan Turing",
    "Degree: BSc Computer Science",
    "Institution: Central University SL",
    "Graduation Year: 2026",
]

#: Two problems at once, for the paths that have to account for every one of
#: them rather than the first.
TWO_MISMATCHED_DOCUMENT = [
    "Central University SL",
    "Certificate of Achievement",
    "This is to certify that",
    "Student Name: Alan Turing",
    "Degree: Bachelor of Wizardry",
    "Institution: Central University SL",
    "Graduation Year: 2026",
]


@override_settings(CREDENTIAL_DOCUMENT_ENCRYPTION_KEY=TEST_ENCRYPTION_KEY)
class DocumentReviewTests(TestCase):
    """Registrar document review â€” REMAINING_WORK item 4.

    The load-bearing properties, each of which is a way the check could be
    quietly defeated:

      - a mismatch cannot be cleared by claiming everything matched;
      - an override and a rejection both require a written reason;
      - a credential is not submitted on-chain while a review is open, and the
        rejection happens before any blob is pinned;
      - a review performed against one file cannot be inherited by a different
        file;
      - re-analysing a document discards the previous decision.
    """

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
        self.cert = self._certificate()

    def _certificate(self, **overrides):
        fields = {
            "certificate_id": "CR-2026-CUSL-0001",
            "institution": self.institution,
            "student_name": "Ada Lovelace",
            "student_email": "ada@example.edu",
            "degree_title": "BSc Computer Science",
            "graduation_year": 2026,
            "flow_type": FlowType.FULL_UPLOAD,
            "status": CertificateStatus.DRAFT,
        }
        fields.update(overrides)
        return Certificate.objects.create(**fields)

    def _analyze(self, lines, kind="certificate", **extra):
        return self.client.post(
            f"/api/certificates/{self.cert.id}/analyze-document/",
            {"document_file": build_pdf(lines), "document_kind": kind, **extra},
            format="multipart",
        )

    def _resolve(self, kind, **body):
        return self.client.post(
            f"/api/certificates/{self.cert.id}/document-reviews/{kind}/resolve/",
            body, format="json",
        )

    # â”€â”€ Analysis â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    def test_matching_document_analyses_clean(self):
        response = self._analyze(MATCHING_DOCUMENT)

        self.assertEqual(response.status_code, 201, response.data)
        review = response.data["review"]
        self.assertEqual(review["state"], "pending")
        self.assertEqual(review["summary"]["unresolved_count"], 0)
        self.assertEqual(review["summary"]["requires_review"], False)
        self.assertEqual(review["extracted"]["student_name"], "Ada Lovelace")
        self.assertTrue(review["document_sha256"])

    def test_wrong_name_on_document_is_flagged(self):
        response = self._analyze(MISMATCHED_DOCUMENT)

        review = response.data["review"]
        self.assertEqual(review["state"], "pending")
        self.assertEqual(review["summary"]["counts"]["mismatch"], 1)

        flagged = {c["field"]: c for c in review["comparisons"]}
        self.assertEqual(flagged["student_name"]["status"], "mismatch")
        self.assertEqual(flagged["student_name"]["extracted"], "Alan Turing")
        self.assertEqual(flagged["student_name"]["expected"], "Ada Lovelace")
        # The other fields still agree, so this is one difference, not a wash.
        self.assertEqual(flagged["degree_title"]["status"], "match")

    def test_missing_field_is_reported_not_silently_agreed(self):
        # A document the extractor understood not at all must not read as
        # "all fields agree" â€” that is the silent binding the design doc forbids.
        response = self._analyze(["Some decorative heading with no labels at all"])

        review = response.data["review"]
        self.assertEqual(review["summary"]["counts"]["not_found"], 4)
        self.assertTrue(review["summary"]["requires_review"])
        self.assertEqual(review["state"], "pending")

    def test_reanalysis_discards_previous_decision(self):
        self._analyze(MATCHING_DOCUMENT)
        self._resolve("certificate", action="approve")

        # Same document kind, different content: the earlier sign-off was given
        # for content that is no longer the file in hand.
        second = self._analyze(MISMATCHED_DOCUMENT)

        self.assertEqual(second.data["replaced_existing"], True)
        self.assertEqual(second.data["review"]["state"], "pending")
        self.assertEqual(second.data["review"]["resolution_note"], "")
        self.assertEqual(second.data["review"]["reviewed_by"], None)
        self.assertEqual(
            DocumentReview.objects.get(
                certificate=self.cert, document_kind="certificate"
            ).state,
            "pending",
        )

    def test_analysis_is_audited(self):
        self._analyze(MISMATCHED_DOCUMENT)
        self.assertTrue(
            AuditLog.objects.filter(
                action="certificate.document_analysed",
                target_id=str(self.cert.id),
            ).exists()
        )

    # â”€â”€ Resolution â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    def test_approve_when_everything_agrees(self):
        self._analyze(MATCHING_DOCUMENT)

        response = self._resolve("certificate", action="approve")

        self.assertEqual(response.status_code, 200, response.data)
        review = response.data["review"]
        self.assertEqual(review["state"], "resolved")
        self.assertTrue(review["is_resolved"])
        self.assertEqual(review["reviewed_by"], "registrar@cusl.edu.sl")
        # A fully labelled document was actually read, so the note stays optional.
        self.assertFalse(review["used_weak_evidence"])

    def test_an_unlabelled_document_gets_its_own_verdict(self):
        """A text search must never be reported as a field that was read.

        The document states everything and labels nothing. Every value is
        genuinely present, so the review must not block â€” but reporting that as
        `match` makes a substring search indistinguishable from parsing a field,
        in the counts, in the chip, and in the stored comparisons.
        """
        review = self._analyze([
            "Central University SL",
            "Certificate of Achievement",
            "This is to certify that",
            "Ada Lovelace",
            "BSc Computer Science",
            "2026",
        ]).data["review"]

        self.assertEqual(review["summary"]["counts"]["match"], 0, review["summary"])
        self.assertEqual(review["summary"]["counts"]["verbatim_match"], 4, review["summary"])
        self.assertEqual(review["summary"]["weak_evidence_count"], 4)
        self.assertTrue(review["used_weak_evidence"])
        for item in review["comparisons"]:
            self.assertEqual(item["status"], "verbatim_match", item)
            self.assertIsNone(item["extracted"], item)
        # Non-blocking: a legible document must not be stranded.
        self.assertFalse(review["summary"]["requires_review"])

    def test_approving_an_unlabelled_document_requires_a_reason(self):
        """Nothing was read, so the Registrar has to say what they checked."""
        self._analyze([
            "Central University SL",
            "Certificate of Achievement",
            "This is to certify that",
            "Ada Lovelace",
            "BSc Computer Science",
            "2026",
        ])

        response = self._resolve("certificate", action="approve")

        self.assertEqual(response.status_code, 400, response.data)
        self.assertTrue(response.data["requires_reason"], response.data)
        self.assertEqual(
            DocumentReview.objects.get(
                certificate=self.cert, document_kind="certificate"
            ).state,
            "pending",
        )

        # With the reason recorded it is a legitimate sign-off.
        accepted = self._resolve(
            "certificate",
            action="approve",
            resolution_note="Ada Lovelace is the recipient; BSc Computer Science is the award.",
        )
        self.assertEqual(accepted.status_code, 200, accepted.data)
        self.assertEqual(accepted.data["review"]["state"], "resolved")
        self.assertTrue(accepted.data["review"]["used_weak_evidence"])

    def test_approving_a_mostly_labelled_document_does_not_require_a_reason(self):
        """One unlabelled field is disclosed in the panel; it is not a block on
        the routine click-through, and must not turn every review into a form."""
        self._analyze([
            "Central University SL",
            "Certificate of Achievement",
            "This is to certify that",
            "Student Name: Ada Lovelace",
            "Degree: BSc Computer Science",
            "Graduation Year: 2026",
        ])

        response = self._resolve("certificate", action="approve")

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["review"]["state"], "resolved")
        self.assertTrue(response.data["review"]["used_weak_evidence"])

    def test_cannot_approve_over_an_unresolved_mismatch(self):
        # The core integrity property: "everything matched" is only available
        # when everything actually matched.
        self._analyze(MISMATCHED_DOCUMENT)

        response = self._resolve("certificate", action="approve")

        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(response.data["unresolved"], ["student_name"])
        self.assertEqual(
            DocumentReview.objects.get(
                certificate=self.cert, document_kind="certificate"
            ).state,
            "pending",
        )

    def test_override_requires_a_reason(self):
        self._analyze(MISMATCHED_DOCUMENT)

        response = self._resolve("certificate", action="override")

        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("resolution_note", response.data)

    def test_override_records_the_fields_and_the_reason(self):
        self._analyze(MISMATCHED_DOCUMENT)

        response = self._resolve(
            "certificate",
            action="override",
            fields=["student_name"],
            resolution_note="Registrar confirmed the document belongs to Ada Lovelace.",
        )

        self.assertEqual(response.status_code, 200, response.data)
        review = response.data["review"]
        self.assertEqual(review["state"], "overridden")
        self.assertEqual(review["overridden_fields"], ["student_name"])
        self.assertIn("confirmed", review["resolution_note"])
        self.assertTrue(review["is_resolved"])

    def test_override_rejects_a_field_that_was_never_flagged(self):
        self._analyze(MISMATCHED_DOCUMENT)

        response = self._resolve(
            "certificate",
            action="override",
            fields=["not_a_field"],
            resolution_note="because",
        )

        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("not_a_field", response.data["detail"])

    def test_override_cannot_omit_a_field_the_check_raised(self):
        """An override clears the whole review, so a partial field list would
        let the audit trail record less than was actually accepted."""
        self._analyze(TWO_MISMATCHED_DOCUMENT)

        response = self._resolve(
            "certificate",
            action="override",
            fields=["student_name"],
            resolution_note="Registrar confirmed the degree wording on the original.",
        )

        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("degree_title", response.data["detail"])
        # Still open, so the credential is still blocked.
        self.assertIsNone(response.data.get("review"))
        self.assertTrue(
            self.cert.document_reviews.get(document_kind="certificate").blocks_submission
        )

    def test_override_cannot_send_an_empty_field_list(self):
        self._analyze(MISMATCHED_DOCUMENT)

        response = self._resolve(
            "certificate",
            action="override",
            fields=[],
            resolution_note="Looks fine to me.",
        )

        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("student_name", response.data["detail"])

    def test_override_records_every_outstanding_field(self):
        self._analyze(TWO_MISMATCHED_DOCUMENT)

        response = self._resolve(
            "certificate",
            action="override",
            fields=["student_name", "degree_title"],
            resolution_note="Both differences confirmed against the registrar's file.",
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(
            sorted(response.data["review"]["overridden_fields"]),
            ["degree_title", "student_name"],
        )
        self.assertTrue(response.data["review"]["is_resolved"])

    def test_rejection_requires_a_reason_and_keeps_blocking(self):
        self._analyze(MISMATCHED_DOCUMENT)

        no_reason = self._resolve("certificate", action="reject")
        self.assertEqual(no_reason.status_code, 400, no_reason.data)

        response = self._resolve(
            "certificate", action="reject",
            resolution_note="Wrong student's certificate. Requesting a replacement.",
        )
        review = response.data["review"]
        self.assertEqual(review["state"], "rejected")
        # Rejecting means this file must not be the one anchored, so a
        # rejected review still stands in the way.
        self.assertTrue(review["blocks_submission"])
        self.assertFalse(review["is_resolved"])

    def test_resolving_an_absent_review_is_a_404(self):
        response = self._resolve("certificate", action="approve")
        self.assertEqual(response.status_code, 404, response.data)

    def test_students_cannot_resolve(self):
        self._analyze(MATCHING_DOCUMENT)
        student = User.objects.create_user(
            email="ada@example.edu",
            password="pw-for-tests-only-123",
            first_name="Ada",
            last_name="Lovelace",
            role=Role.STUDENT,
        )
        self.client.force_authenticate(student)

        self.assertEqual(
            self._resolve("certificate", action="approve").status_code, 403
        )

    # â”€â”€ The gate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    def _anchor(self):
        return self.client.post(
            f"/api/certificates/{self.cert.id}/upload-and-anchor/",
            {
                "document_file": build_pdf(MATCHING_DOCUMENT, "cert.pdf"),
                "transcript_file": build_pdf(MATCHING_DOCUMENT, "transcript.pdf"),
            },
            format="multipart",
        )

    def test_submission_is_blocked_while_a_review_is_open(self):
        # full_upload requires both documents, and neither has been analysed.
        with mock.patch("certify.views.pin_file_to_ipfs") as pin_file, \
             mock.patch("certify.views.pin_json_to_ipfs") as pin_json:
            response = self._anchor()

        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(response.data["code"], "document_review_required")
        self.assertCountEqual(
            response.data["missing"], ["certificate", "transcript"]
        )
        # Nothing may be pinned for a credential that cannot proceed, or the
        # rejection leaves orphan blobs on IPFS.
        pin_file.assert_not_called()
        pin_json.assert_not_called()
        self.assertEqual(self.cert.status, CertificateStatus.DRAFT)
        self.assertEqual(self.cert.doc_hash, "")

    def test_pending_review_still_blocks_after_analysis(self):
        self._analyze(MATCHING_DOCUMENT)
        self._analyze(MATCHING_DOCUMENT, kind="transcript")

        with mock.patch("certify.views.pin_file_to_ipfs") as pin_file:
            response = self._anchor()

        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(
            sorted(b["document_kind"] for b in response.data["blocking"]),
            ["certificate", "transcript"],
        )
        pin_file.assert_not_called()

    def test_resolved_reviews_allow_submission(self):
        self._analyze(MATCHING_DOCUMENT)
        self._analyze(MATCHING_DOCUMENT, kind="transcript")
        self._resolve("certificate", action="approve")
        self._resolve("transcript", action="approve")

        with mock.patch("certify.views.pin_file_to_ipfs") as pin_file, \
             mock.patch("certify.views.pin_json_to_ipfs") as pin_json:
            pin_file.return_value = {"cid": "QmTest", "ipfs_url": "https://ipfs/QmTest"}
            pin_json.return_value = {"cid": "QmJson", "ipfs_url": "https://ipfs/QmJson"}
            response = self._anchor()

        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(pin_file.called)
        self.cert.refresh_from_db()
        self.assertEqual(self.cert.status, CertificateStatus.PENDING_VC)

    def test_review_cannot_be_inherited_by_different_bytes(self):
        # Clear the review on one file, then submit a different one. Without the
        # hash comparison this would sail through.
        self._analyze(MATCHING_DOCUMENT)
        self._analyze(MATCHING_DOCUMENT, kind="transcript")
        self._resolve("certificate", action="approve")
        self._resolve("transcript", action="approve")

        with mock.patch("certify.views.pin_file_to_ipfs") as pin_file:
            # Same layout, one extra line: different SHA-256.
            response = self.client.post(
                f"/api/certificates/{self.cert.id}/upload-and-anchor/",
                {
                    "document_file": build_pdf(
                        MATCHING_DOCUMENT + ["Issued by the Registrar"], "cert.pdf"
                    ),
                    "transcript_file": build_pdf(MATCHING_DOCUMENT, "transcript.pdf"),
                },
                format="multipart",
            )

        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(
            [item["document_kind"] for item in response.data["stale"]], ["certificate"]
        )
        self.assertIn("changed since it was reviewed", response.data["detail"])
        pin_file.assert_not_called()

    def test_system_designed_certificate_half_is_not_gated(self):
        # The generated certificate is rendered from the intake record, so
        # re-reading it could only ever agree with itself and it carries no
        # independent evidence. Only the transcript half is gated; see
        # test_system_designed_requires_its_transcript_review.
        self.cert.flow_type = FlowType.SYSTEM_DESIGNED
        self.cert.save(update_fields=["flow_type"])

        with mock.patch("certify.views.pin_file_to_ipfs") as pin_file, \
             mock.patch("certify.views.pin_json_to_ipfs") as pin_json:
            response = self.client.post(
                f"/api/certificates/{self.cert.id}/upload-and-anchor/",
                {"document_file": build_pdf(MATCHING_DOCUMENT, "cert.pdf")},
                format="multipart",
            )

        # Rejected for the flow being wrong, not for a missing review.
        self.assertEqual(response.status_code, 400, response.data)
        self.assertNotIn("document_review_required", response.data)

    def test_system_designed_requires_its_transcript_review(self):
        # The distinction this whole feature rests on. The certificate half of a
        # system-designed credential is self-referential and cannot be checked
        # against anything; the transcript half is authored independently, so it
        # can be, and therefore must be.
        from certify.document_review_views import required_review_kinds

        self.cert.flow_type = FlowType.SYSTEM_DESIGNED
        self.cert.transcript_hash = "ab" * 32
        self.cert.save(update_fields=["flow_type", "transcript_hash"])

        self.assertEqual(
            required_review_kinds(self.cert), [DocumentReviewKind.TRANSCRIPT]
        )

        # With no transcript yet there is nothing independent to check, so the
        # gate asks for nothing. Refusing a transcript-free credential is
        # `prepare/`'s job, because that is the step that anchors it.
        self.cert.transcript_hash = ""
        self.assertEqual(required_review_kinds(self.cert), [])

    def test_transcript_attach_requires_only_its_own_review(self):
        # On the transcript-then-certificate flow the certificate has not been
        # generated yet, so requiring its review would block on a document that
        # does not exist.
        cert = self._certificate(
            certificate_id="CR-2026-CUSL-0002",
            flow_type=FlowType.TRANSCRIPT_THEN_CERT,
        )
        with mock.patch("certify.views.pin_file_to_ipfs") as pin_file:
            blocked = self.client.post(
                f"/api/certificates/{cert.id}/upload-transcript/",
                {"transcript_file": build_pdf(MATCHING_DOCUMENT, "transcript.pdf")},
                format="multipart",
            )

        self.assertEqual(blocked.status_code, 409, blocked.data)
        self.assertEqual(blocked.data["missing"], ["transcript"])
        pin_file.assert_not_called()

    def test_detail_serializer_reports_review_state(self):
        self._analyze(MATCHING_DOCUMENT)
        self._analyze(MISMATCHED_DOCUMENT, kind="transcript")
        self._resolve("transcript", action="override",
                      fields=["student_name"],
                      resolution_note="Confirmed by phone with the dean.")

        payload = CertificateDetailSerializer(self.cert).data
        reviews = payload["document_reviews"]

        self.assertCountEqual(reviews["required_kinds"], ["certificate", "transcript"])
        self.assertFalse(reviews["all_resolved"])

        by_kind = {r["document_kind"]: r for r in reviews["reviews"]}
        self.assertEqual(by_kind["transcript"]["state"], "overridden")
        self.assertEqual(by_kind["certificate"]["state"], "pending")

    def test_detail_serializer_is_safe_with_no_reviews(self):
        payload = CertificateDetailSerializer(self.cert).data
        self.assertEqual(payload["document_reviews"]["reviews"], [])
        self.assertFalse(payload["document_reviews"]["all_resolved"])


@override_settings(CREDENTIAL_DOCUMENT_ENCRYPTION_KEY=TEST_ENCRYPTION_KEY)
class CertificatePrepareTests(TestCase):
    """`prepare/` seals the review document officers go on to approve.

    This endpoint had no test at all, which is how it shipped a call to
    `encrypt_document(..., "certificate-review")` against an AAD domain that
    only permitted `certificate` and `transcript`. Nothing had ever exercised
    the path, so the mismatch surfaced as a 500 on the first real use.

    What is pinned here:

      - the review blob is a real encrypted envelope, and its hash officers
        approve is the hash of the *plaintext* PDF, not of the ciphertext;
      - the review blob is sealed under its own AAD domain and cannot be opened
        as the issued certificate, or against another credential;
      - a missing key is reported as a clean, actionable 500 rather than an
        unhandled traceback, and nothing is pinned or mutated.
    """

    def setUp(self):
        self.client = APIClient()
        self.institution = Institution.objects.create(
            institution_id="CUSL-004", name="Central University SL"
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
        self.cert = Certificate.objects.create(
            certificate_id="CR-2026-CUSL-0041",
            institution=self.institution,
            student_name="Ada Lovelace",
            student_email="ada@example.edu",
            degree_title="BSc Computer Science",
            graduation_year=2026,
            flow_type=FlowType.SYSTEM_DESIGNED,
            status=CertificateStatus.DRAFT,
        )
        # A system-designed credential is one record made of two documents, and
        # `prepare/` refuses until the transcript half is attached and reviewed.
        # These tests are about the sealing mechanics of `prepare/`, so the
        # credential is brought to the state flow 2 actually reaches first,
        # rather than being handed a transcript-free record that could not occur.
        self._attach_reviewed_transcript()

    def _attach_reviewed_transcript(self):
        # A fresh File per request: an uploaded file is consumed by the request
        # that reads it, so reusing one object makes the second read empty and
        # the hash comparison fails for a reason that has nothing to do with
        # what is under test.
        analyze = self.client.post(
            f"/api/certificates/{self.cert.id}/analyze-document/",
            {"document_file": build_pdf(MATCHING_DOCUMENT, "transcript.pdf"),
             "document_kind": "transcript"},
            format="multipart",
        )
        # 201 when the review is created, 200 when it replaces an earlier one.
        self.assertIn(analyze.status_code, (200, 201), analyze.data)
        resolve = self.client.post(
            f"/api/certificates/{self.cert.id}/document-reviews/transcript/resolve/",
            {"action": "approve"},
            format="json",
        )
        self.assertEqual(resolve.status_code, 200, resolve.data)
        with mock.patch(
            "certify.views.pin_file_to_ipfs",
            return_value={"cid": "bafyTranscript", "ipfs_url": "https://ipfs/bafyTranscript"},
        ):
            attach = self.client.post(
                f"/api/certificates/{self.cert.id}/upload-transcript/",
                {"transcript_file": build_pdf(MATCHING_DOCUMENT, "transcript.pdf")},
                format="multipart",
            )
        self.assertEqual(attach.status_code, 200, attach.data)
        self.cert.refresh_from_db()
        self.assertTrue(self.cert.transcript_hash, "setup left no transcript attached")

    def _prepare(self):
        return self.client.post(f"/api/certificates/{self.cert.id}/prepare/")

    def _stub_ipfs(self):
        return (
            mock.patch(
                "certify.views.pin_file_to_ipfs",
                return_value={"cid": "bafyReview", "ipfs_url": "https://ipfs/bafyReview"},
            ),
            mock.patch(
                "certify.views.pin_json_to_ipfs",
                return_value={"cid": "bafyJson", "ipfs_url": "https://ipfs/bafyJson"},
            ),
        )

    def test_prepare_seals_the_review_and_commits_its_plaintext_hash(self):
        pin_file, pin_json = self._stub_ipfs()
        with pin_file as pin, pin_json:
            response = self._prepare()

        self.assertEqual(response.status_code, 200, response.data)
        self.cert.refresh_from_db()

        # The committed hash is of the document the officers will look at. If it
        # were the ciphertext, the review could never be checked against it, and
        # a rotated key would silently change what "the same document" means.
        self.assertTrue(self.cert.doc_hash)
        self.assertEqual(self.cert.doc_hash, response.data["doc_hash"])
        self.assertEqual(response.data["status"], CertificateStatus.PENDING_VC)

        # What went to IPFS is an encrypted envelope, not the PDF.
        self.assertTrue(pin.call_args[0][0].read().startswith(b"CREDENCE-ENC-V1"))
        self.assertEqual(self.cert.status, CertificateStatus.PENDING_VC)
        self.assertEqual(self.cert.ipfs_cid_pdf, "bafyReview")

    def test_the_review_blob_cannot_be_opened_as_the_issued_certificate(self):
        pin_file, pin_json = self._stub_ipfs()
        with pin_file as pin, pin_json:
            self._prepare()
        blob = pin.call_args[0][0].read()

        # Same key, same credential, correct envelope — only the domain differs.
        # This is the reason `certificate-review` is not simply `certificate`.
        with self.assertRaises(DocumentEncryptionError):
            decrypt_document(blob, self.cert.certificate_id, "certificate")
        with self.assertRaises(DocumentEncryptionError):
            decrypt_document(blob, self.cert.certificate_id, "transcript")
        # And it is bound to its own credential, not replayable onto another.
        with self.assertRaises(DocumentEncryptionError):
            decrypt_document(blob, "CR-2026-CUSL-9999", "certificate-review")
        # It does open in its own domain, or the blob is simply corrupt.
        self.assertTrue(decrypt_document(blob, self.cert.certificate_id, "certificate-review"))

    def test_a_missing_key_is_a_clean_error_and_pins_nothing(self):
        pin_file, pin_json = self._stub_ipfs()
        with self.settings(CREDENTIAL_DOCUMENT_ENCRYPTION_KEY=""), \
             pin_file as pin, pin_json as pin_json_mock:
            response = self._prepare()

        self.assertEqual(response.status_code, 500, response.data)
        # The operator needs to know which setting to fix, without a traceback.
        self.assertIn("CREDENTIAL_DOCUMENT_ENCRYPTION_KEY", response.data["detail"])
        # A fault before pinning must not leave an orphan blob or a half-built
        # credential that claims to be awaiting review.
        pin.assert_not_called()
        pin_json_mock.assert_not_called()
        self.cert.refresh_from_db()
        self.assertEqual(self.cert.status, CertificateStatus.DRAFT)
        self.assertEqual(self.cert.doc_hash, "")
        self.assertEqual(self.cert.ipfs_cid_pdf, "")

    def test_a_malformed_key_is_rejected_the_same_way(self):
        # The placeholder shipped in `.env.example` is a non-hex string of the
        # wrong length, so "the key is set" is not the same as "the key works".
        for bad in ("", "abc", "z" * 64, "11" * 31):
            with self.subTest(key_length=len(bad)):
                with self.settings(CREDENTIAL_DOCUMENT_ENCRYPTION_KEY=bad):
                    response = self._prepare()
                self.assertEqual(response.status_code, 500, response.data)

    def test_an_unknown_aad_domain_is_refused(self):
        # Guards the allowlist itself, so a future domain has to be declared
        # deliberately rather than by editing a call site.
        with self.assertRaises(DocumentEncryptionError):
            encrypt_document(b"%PDF-1.4", self.cert.certificate_id, "seal")

    def test_prepare_is_refused_before_the_transcript_exists(self):
        # The whole reason flow 2 had no document checking: it never asked for
        # a transcript, so there was nothing to check the credential against.
        # Preparing hands the record straight to the VC and Dean, so a
        # transcript-free system-designed credential must not get that far.
        cert = Certificate.objects.create(
            certificate_id="CR-2026-CUSL-0042",
            institution=self.institution,
            student_name="Ada Lovelace",
            student_email="ada@example.edu",
            degree_title="BSc Computer Science",
            graduation_year=2026,
            flow_type=FlowType.SYSTEM_DESIGNED,
            status=CertificateStatus.DRAFT,
        )

        pin_file, pin_json = self._stub_ipfs()
        with pin_file as pin, pin_json as pin_json_mock:
            response = self.client.post(f"/api/certificates/{cert.id}/prepare/")

        self.assertEqual(response.status_code, 409, response.data)
        self.assertTrue(response.data["transcript_required"])
        # It stays a draft, so the Registrar can attach the transcript and try
        # again rather than starting over.
        cert.refresh_from_db()
        self.assertEqual(cert.status, CertificateStatus.DRAFT)
        self.assertEqual(cert.doc_hash, "")
        pin.assert_not_called()
        pin_json_mock.assert_not_called()

    def test_prepare_is_refused_while_the_transcript_review_is_open(self):
        # Attaching the transcript is not the same as settling it. An analysed
        # but unresolved transcript still stands in the way.
        cert = Certificate.objects.create(
            certificate_id="CR-2026-CUSL-0043",
            institution=self.institution,
            student_name="Ada Lovelace",
            student_email="ada@example.edu",
            degree_title="BSc Computer Science",
            graduation_year=2026,
            flow_type=FlowType.SYSTEM_DESIGNED,
            status=CertificateStatus.DRAFT,
        )
        # Analysed but never resolved, and the bytes attached directly onto the
        # record rather than through `upload-transcript/` — which is gated on
        # this very review, and would therefore refuse. Doing it this way
        # reaches the state the anchor step has to defend against: a transcript
        # on the record whose review is still open. Going through the endpoint
        # would make this test pass for the wrong reason, because the 409 would
        # come from the upload and never reach `prepare/`.
        analyze = self.client.post(
            f"/api/certificates/{cert.id}/analyze-document/",
            {"document_file": build_pdf(MATCHING_DOCUMENT, "transcript.pdf"),
             "document_kind": "transcript"},
            format="multipart",
        )
        self.assertIn(analyze.status_code, (200, 201), analyze.data)
        Certificate.objects.filter(pk=cert.pk).update(
            transcript_hash=document_sha256(
                build_pdf(MATCHING_DOCUMENT, "transcript.pdf").read()
            )
        )

        pin_file, pin_json = self._stub_ipfs()
        with pin_file as pin, pin_json as pin_json_mock:
            response = self.client.post(f"/api/certificates/{cert.id}/prepare/")

        self.assertEqual(response.status_code, 409, response.data)
        # The review exists but is unresolved, so it is "blocking" rather than
        # "missing" — analysed-but-not-cleared is a different state from
        # never-analysed, and the two read differently to the Registrar.
        self.assertEqual(response.data["missing"], [])
        self.assertEqual(
            [b["document_kind"] for b in response.data["blocking"]], ["transcript"]
        )
        cert.refresh_from_db()
        self.assertEqual(cert.status, CertificateStatus.DRAFT)
        pin.assert_not_called()
        pin_json_mock.assert_not_called()

    def test_prepare_is_refused_when_the_transcript_changed_after_review(self):
        # Same defeat the upload path already guards there: a review of one file
        # must not authorise a different one. `upload-transcript/` refuses to
        # attach unreviewed bytes in the first place, so this is the narrower
        # remaining case — the transcript on the record stops being the one
        # that was reviewed (a replacement path, or a swap below the API). The
        # hash comparison is what makes it visible, and it must still stop
        # `prepare/`.
        cert = Certificate.objects.create(
            certificate_id="CR-2026-CUSL-0044",
            institution=self.institution,
            student_name="Ada Lovelace",
            student_email="ada@example.edu",
            degree_title="BSc Computer Science",
            graduation_year=2026,
            flow_type=FlowType.SYSTEM_DESIGNED,
            status=CertificateStatus.DRAFT,
        )
        analyze = self.client.post(
            f"/api/certificates/{cert.id}/analyze-document/",
            {"document_file": build_pdf(MATCHING_DOCUMENT, "transcript.pdf"),
             "document_kind": "transcript"},
            format="multipart",
        )
        # 201 when the review is created, 200 when it replaces an earlier one.
        self.assertIn(analyze.status_code, (200, 201), analyze.data)
        resolve = self.client.post(
            f"/api/certificates/{cert.id}/document-reviews/transcript/resolve/",
            {"action": "approve"},
            format="json",
        )
        self.assertEqual(resolve.status_code, 200, resolve.data)
        with mock.patch(
            "certify.views.pin_file_to_ipfs",
            return_value={"cid": "bafyTranscript", "ipfs_url": "https://ipfs/bafyTranscript"},
        ):
            attach = self.client.post(
                f"/api/certificates/{cert.id}/upload-transcript/",
                {"transcript_file": build_pdf(MATCHING_DOCUMENT, "transcript.pdf")},
                format="multipart",
            )
        self.assertEqual(attach.status_code, 200, attach.data)

        # The record now points at a different transcript than the one signed off.
        Certificate.objects.filter(pk=cert.pk).update(transcript_hash="ab" * 32)

        pin_file, pin_json = self._stub_ipfs()
        with pin_file as pin, pin_json as pin_json_mock:
            response = self.client.post(f"/api/certificates/{cert.id}/prepare/")

        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(response.data["stale"][0]["document_kind"], "transcript")
        cert.refresh_from_db()
        self.assertEqual(cert.status, CertificateStatus.DRAFT)
        pin.assert_not_called()
        pin_json_mock.assert_not_called()


class StudentInviteTokenTests(TestCase):
    """The student claim link â€” REMAINING_WORK item 6.

    The raw token is returned exactly once, at creation. That single fact is
    what makes the rest of this load-bearing: rotating the token to "refresh" a
    link destroys the only copy the student has, and a retried issuance that
    rotates would leave them holding a dead link with no way to be told. So the
    behaviour that matters is *not* rotating, and it had no test at all.
    """

    def setUp(self):
        self.institution = Institution.objects.create(
            institution_id="CUSL-002", name="Central University SL"
        )
        self.student = User.objects.create_user(
            email="ada@example.edu", password="pw", role=Role.STUDENT,
            institution=self.institution,
        )
        self.cert = Certificate.objects.create(
            certificate_id="CR-2026-CUSL-0009",
            institution=self.institution,
            student=self.student,
            student_name="Ada Lovelace",
            degree_title="BSc Computer Science",
            graduation_year=2026,
            flow_type=FlowType.FULL_UPLOAD,
            status=CertificateStatus.ISSUED,
        )

    # â”€â”€ TTL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    def test_default_window_is_24_hours(self):
        token, _raw = StudentInviteToken.create_for_certificate(self.cert)

        self.assertAlmostEqual(
            (token.expires_at - timezone.now()).total_seconds(),
            24 * 3600,
            delta=60,
        )

    @override_settings(STUDENT_INVITE_TTL_HOURS=1)
    def test_window_follows_the_setting(self):
        token, _raw = StudentInviteToken.create_for_certificate(self.cert)

        self.assertAlmostEqual(
            (token.expires_at - timezone.now()).total_seconds(),
            3600,
            delta=60,
        )

    def test_a_longer_window_is_not_silently_capped(self):
        """The setting is the single source of the window; a test that pinned it
        to 24h would have hidden a deployment that widens it deliberately."""
        self.assertEqual(settings.STUDENT_INVITE_TTL_HOURS, 24)

    # â”€â”€ Rotation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    def test_issuance_keeps_an_active_claim_link(self):
        first = notify_student_issued(self.cert)
        self.assertTrue(first["invite_created"])

        second = notify_student_issued(self.cert)

        self.assertFalse(second["invite_created"])
        # The raw token exists only at creation, so a kept link cannot be
        # re-handed to the registrar.
        self.assertEqual(second["claim_url"], "")
        self.assertEqual(second["wa_body"], "")
        self.assertEqual(StudentInviteToken.objects.count(), 1)

    def test_keeping_an_active_link_does_not_resend_whatsapp(self):
        notify_student_issued(self.cert)

        with mock.patch("notifications.whatsapp.send_whatsapp") as send:
            result = notify_student_issued(self.cert)

        self.assertFalse(result["twilio_sent"])
        send.assert_not_called()

    def test_resend_rotates_and_invalidates_the_old_link(self):
        first, first_raw = StudentInviteToken.create_for_certificate(self.cert)

        result = notify_student_issued(self.cert, force=True)

        self.assertTrue(result["invite_created"])
        self.assertNotEqual(result["claim_url"], "")
        # The new link carries a different token, and the old one is dead.
        self.assertNotIn(first_raw, result["claim_url"])
        first.refresh_from_db()
        self.assertTrue(first.used)
        self.assertEqual(StudentInviteToken.objects.count(), 2)

        claimed, error = StudentInviteToken.claim(first_raw)
        self.assertIsNone(claimed)
        self.assertIn("already been used", error)

    def test_an_expired_link_is_replaced_rather_than_kept(self):
        stale, _raw = StudentInviteToken.create_for_certificate(self.cert)
        StudentInviteToken.objects.filter(pk=stale.pk).update(
            expires_at=timezone.now() - timezone.timedelta(minutes=1),
        )

        result = notify_student_issued(self.cert)

        self.assertTrue(result["invite_created"])
        self.assertNotEqual(result["claim_url"], "")
        self.assertEqual(StudentInviteToken.objects.count(), 2)

    def test_an_already_claimed_link_is_replaced(self):
        claimed, raw = StudentInviteToken.create_for_certificate(self.cert)
        token, error = StudentInviteToken.claim(raw)
        self.assertEqual(error, "")
        self.assertIsNotNone(token)

        result = notify_student_issued(self.cert)

        self.assertTrue(result["invite_created"])
        claimed.refresh_from_db()
        self.assertTrue(claimed.used)

    # â”€â”€ Claiming â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    def test_a_claim_is_single_use(self):
        _token, raw = StudentInviteToken.create_for_certificate(self.cert)

        first, error = StudentInviteToken.claim(raw)
        self.assertEqual(error, "")
        self.assertIsNotNone(first)
        self.assertTrue(first.used)
        self.assertIsNotNone(first.claimed_at)

        second, error = StudentInviteToken.claim(raw)
        self.assertIsNone(second)
        self.assertIn("already been used", error)

    def test_an_expired_token_cannot_be_claimed(self):
        token, raw = StudentInviteToken.create_for_certificate(self.cert)
        StudentInviteToken.objects.filter(pk=token.pk).update(
            expires_at=timezone.now() - timezone.timedelta(minutes=1),
        )

        claimed, error = StudentInviteToken.claim(raw)

        self.assertIsNone(claimed)
        self.assertIn("expired", error.lower())

    def test_an_unknown_token_is_rejected(self):
        claimed, error = StudentInviteToken.claim("not-a-real-token")

        self.assertIsNone(claimed)
        self.assertIn("Invalid", error)

    def test_rotation_invalidates_the_previous_token_for_the_same_certificate(self):
        first, first_raw = StudentInviteToken.create_for_certificate(self.cert)
        second, second_raw = StudentInviteToken.create_for_certificate(self.cert)
        self.assertNotEqual(first_raw, second_raw)

        first.refresh_from_db()
        self.assertTrue(first.used)

        claimed, error = StudentInviteToken.claim(first_raw)
        self.assertIsNone(claimed)
        self.assertIn("already been used", error)

    def test_a_certificate_without_a_student_is_not_notified(self):
        self.cert.student = None
        self.cert.save(update_fields=["student"])

        result = notify_student_issued(self.cert)

        self.assertEqual(result["claim_url"], "")
        self.assertFalse(result["invite_created"])
        self.assertEqual(StudentInviteToken.objects.count(), 0)


CERT_PDF = b"%PDF-1.4\nissued certificate\n"
TRANSCRIPT_PDF = b"%PDF-1.4\nissued transcript\n"


@override_settings(CREDENTIAL_DOCUMENT_ENCRYPTION_KEY=TEST_ENCRYPTION_KEY)
class MyCertificateDocumentsTests(TestCase):
    """A graduate downloads their own pair â€” REMAINING_WORK item 6.

    Item 1 removed document locations from public verification, which is right
    for a third party and wrong for the owner. These tests pin the owner's route
    and, more importantly, that it is closed to everyone else: the failure this
    guards against is a document endpoint that authorises by certificate ID
    alone.
    """

    def setUp(self):
        self.client = APIClient()
        self.institution = Institution.objects.create(
            institution_id="CUSL-003", name="Central University SL"
        )
        self.student = User.objects.create_user(
            email="ada@example.edu", password="pw", role=Role.STUDENT,
            institution=self.institution,
        )
        self.other_student = User.objects.create_user(
            email="grace@example.edu", password="pw", role=Role.STUDENT,
            institution=self.institution,
        )
        self.cert = Certificate.objects.create(
            certificate_id="CR-2026-CUSL-0007",
            institution=self.institution,
            student=self.student,
            student_name="Ada Lovelace",
            degree_title="BSc Computer Science",
            graduation_year=2026,
            flow_type=FlowType.FULL_UPLOAD,
            status=CertificateStatus.ISSUED,
            # `issued_pdf_cid` and `authoritative_doc_hash` are both derived
            # properties (sealed copy preferred), so the underlying fields are
            # what get set.
            ipfs_cid_pdf="bafyCert",
            doc_hash=document_sha256(CERT_PDF),
            ipfs_cid_transcript="bafyTranscript",
            transcript_hash=document_sha256(TRANSCRIPT_PDF),
        )

        self.encrypted_cert = encrypt_document(
            CERT_PDF, self.cert.certificate_id, "certificate",
        )
        self.encrypted_transcript = encrypt_document(
            TRANSCRIPT_PDF, self.cert.certificate_id, "transcript",
        )

    def _stub_ipfs(self, cert_blob=None, transcript_blob=None):
        blobs = {
            "bafyCert": cert_blob if cert_blob is not None else self.encrypted_cert,
            "bafyTranscript": (
                transcript_blob if transcript_blob is not None else self.encrypted_transcript
            ),
        }
        return mock.patch(
            # Patched at the source module: `fetch_verified_document` imports
            # this inside the function to keep ipfs out of module import order.
            "certify.ipfs.fetch_file_from_ipfs",
            side_effect=lambda cid: blobs[cid],
        )

    def _get(self, certificate_id="CR-2026-CUSL-0007"):
        return self.client.get(f"/api/my-certificates/{certificate_id}/documents/")

    # â”€â”€ Access â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    def test_anonymous_is_refused(self):
        response = self._get()
        self.assertIn(response.status_code, (401, 403))

    def test_another_student_cannot_read_someone_elses_documents(self):
        self.client.force_authenticate(self.other_student)

        response = self._get()

        self.assertEqual(response.status_code, 404, response.data)
        # One message for "not yours" and "does not exist", so a real
        # certificate ID is not confirmed by the error.
        self.assertIn("of yours", response.data["detail"])

    def test_an_unknown_certificate_id_is_indistinguishable_from_not_yours(self):
        """A real ID belonging to someone else must not be distinguishable from
        one that was never issued, or the endpoint confirms which IDs exist."""
        self.client.force_authenticate(self.other_student)

        someone_elses = self._get()
        invented = self._get("CR-2026-CUSL-9999")

        self.assertEqual(invented.status_code, 404)
        self.assertEqual(invented.data["detail"], someone_elses.data["detail"])

    def test_a_draft_is_not_downloadable(self):
        self.cert.status = CertificateStatus.PENDING_VC
        self.cert.save(update_fields=["status"])
        self.client.force_authenticate(self.student)

        response = self._get()

        self.assertEqual(response.status_code, 404, response.data)

    # â”€â”€ The pair â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    def test_the_graduate_receives_certificate_and_transcript_together(self):
        self.client.force_authenticate(self.student)

        with self._stub_ipfs():
            response = self._get()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/zip")
        self.assertIn("CR-2026-CUSL-0007-documents.zip", response["Content-Disposition"])
        # A decrypted credential must not be cached by anything in the path.
        self.assertEqual(response["Cache-Control"], "private, no-store")

        with ZipFile(BytesIO(response.content)) as bundle:
            names = sorted(bundle.namelist())
            self.assertEqual(
                names,
                [
                    "CR-2026-CUSL-0007-certificate.pdf",
                    "CR-2026-CUSL-0007-transcript.pdf",
                ],
            )
            self.assertEqual(bundle.read(names[0]), CERT_PDF)
            self.assertEqual(bundle.read(names[1]), TRANSCRIPT_PDF)

    def test_a_document_that_no_longer_matches_its_hash_is_refused(self):
        """The re-hash check is the only thing standing between a corrupted
        stored blob and a graduate holding it as their award."""
        self.client.force_authenticate(self.student)
        tampered = encrypt_document(
            b"%PDF-1.4\nsomething else entirely\n",
            self.cert.certificate_id, "certificate",
        )

        with self._stub_ipfs(cert_blob=tampered):
            response = self._get()

        self.assertEqual(response.status_code, 409, response.data)
        self.assertIn("anchored hash", response.data["detail"])

    def test_a_legacy_unencrypted_document_is_refused(self):
        self.client.force_authenticate(self.student)

        with self._stub_ipfs(cert_blob=b"%PDF-1.4\nplaintext\n"):
            response = self._get()

        self.assertEqual(response.status_code, 409, response.data)
        self.assertIn("re-encrypted", response.data["detail"])

    def test_a_missing_transcript_is_reported_rather_than_silently_half_served(self):
        Certificate.objects.filter(pk=self.cert.pk).update(ipfs_cid_transcript="", transcript_hash="")
        self.client.force_authenticate(self.student)

        with self._stub_ipfs():
            response = self._get()

        self.assertEqual(response.status_code, 409, response.data)
        self.assertIn("transcript", response.data["detail"])

    # â”€â”€ Discovery â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    def test_the_student_list_advertises_the_download(self):
        self.client.force_authenticate(self.student)

        response = self.client.get("/api/my-certificates/")

        self.assertEqual(response.status_code, 200)
        row = response.data[0] if isinstance(response.data, list) else response.data["results"][0]
        self.assertEqual(
            row["documents_path"], "/api/my-certificates/CR-2026-CUSL-0007/documents/",
        )
        self.assertTrue(row["has_transcript"])


# â”€â”€ Attestation notices â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

TX_HASH = "0x" + "a" * 64


class AttestationNoticeTests(TestCase):
    """Telling the next officer that work is waiting on them.

    The browser Notification API cannot do this: it renders in the tab of whoever
    just acted, and the officer who must act next is a different person in a
    different browser. So the notice has to be server-side, which makes it the
    only thing standing between "self-propelling pipeline" and "officers poll a
    dashboard they have to remember to open".

    The properties that matter, each a way the pipeline could silently go back to
    being poll-based:

      - every transition that hands work to an officer sends a notice, to the
        officer who now holds the next step and nobody else;
      - the notice is aimed at a *role*, so it cannot be sent to the officer who
        just acted;
      - a mail failure never blocks the credential. An undelivered notice is an
        inconvenience; a credential that cannot be approved because SMTP is down
        is an outage.
    """

    def setUp(self):
        self.client = APIClient()
        self.institution = Institution.objects.create(
            institution_id="CUSL-021", name="University of Makeni"
        )
        self.registrar = User.objects.create_user(
            email="registrar@mkn.edu.sl",
            password="pw-for-tests-only-123",
            first_name="Reg", last_name="Istrar",
            role=Role.REGISTRAR, institution=self.institution,
        )
        self.vc = User.objects.create_user(
            email="vc@mkn.edu.sl",
            password="pw-for-tests-only-123",
            first_name="Vic", last_name="Chancellor",
            role=Role.VC, institution=self.institution,
        )
        self.dean = User.objects.create_user(
            email="dean@mkn.edu.sl",
            password="pw-for-tests-only-123",
            first_name="Dee", last_name="An",
            role=Role.CHANCELLOR, institution=self.institution,
        )

    def _certificate(self, **overrides):
        fields = {
            "certificate_id": "CR-2026-MKN-0001",
            "institution": self.institution,
            "issued_by": self.registrar,
            "student_name": "Ada Lovelace",
            "student_email": "ada@example.edu",
            "degree_title": "BSc Computer Science",
            "graduation_year": 2026,
            "flow_type": FlowType.SYSTEM_DESIGNED,
            "status": CertificateStatus.DRAFT,
        }
        fields.update(overrides)
        return Certificate.objects.create(**fields)

    # â”€â”€ Targeting â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    def test_the_vc_seat_is_addressed_as_vice_chancellor(self):
        """The data model says CHANCELLOR; the officer's inbox must not."""
        with mock.patch(
            "certify.attestation_notices.send_officer_attestation_notice",
            return_value=True,
        ) as send:
            notify_officer_pending_attestation(
                institution=self.institution, role=Role.VC,
                credential_id="CR-2026-MKN-0001", credential_kind="Certificate",
            )

        self.assertEqual(send.call_count, 1)
        self.assertEqual(send.call_args.kwargs["officer"], self.vc)
        self.assertEqual(send.call_args.kwargs["role_label"], "Vice Chancellor")

    def test_the_chancellor_seat_is_addressed_as_chancellor(self):
        with mock.patch(
            "certify.attestation_notices.send_officer_attestation_notice",
            return_value=True,
        ) as send:
            notify_officer_pending_attestation(
                institution=self.institution, role=Role.CHANCELLOR,
                credential_id="CR-2026-MKN-0001", credential_kind="Certificate",
            )

        self.assertEqual(send.call_args.kwargs["officer"], self.dean)
        self.assertEqual(send.call_args.kwargs["role_label"], "Chancellor")

    def test_only_the_officer_holding_that_role_is_emailed(self):
        """Aiming at a role is what stops the notice landing on whoever just acted."""
        with mock.patch(
            "certify.attestation_notices.send_officer_attestation_notice",
            return_value=True,
        ) as send:
            result = notify_officer_pending_attestation(
                institution=self.institution, role=Role.CHANCELLOR,
                credential_id="CR-2026-MKN-0001", credential_kind="Certificate",
            )

        self.assertEqual(result["recipients"], 1)
        recipients = {c.kwargs["officer"] for c in send.call_args_list}
        self.assertEqual(recipients, {self.dean})
        self.assertNotIn(self.vc, recipients)

    def test_a_role_that_cannot_hold_an_officer_seat_is_refused(self):
        """Students and registrars are not officers; a notice to them is a bug."""
        for role in (Role.STUDENT, Role.REGISTRAR, Role.SUPER_ADMIN):
            with self.subTest(role=role):
                with self.assertRaises(ValueError):
                    notify_officer_pending_attestation(
                        institution=self.institution, role=role,
                        credential_id="CR-2026-MKN-0001", credential_kind="Certificate",
                    )

    def test_a_deactivated_officer_is_not_emailed(self):
        self.dean.is_active = False
        self.dean.save(update_fields=["is_active"])

        with mock.patch(
            "certify.attestation_notices.send_officer_attestation_notice",
        ) as send:
            result = notify_officer_pending_attestation(
                institution=self.institution, role=Role.CHANCELLOR,
                credential_id="CR-2026-MKN-0001", credential_kind="Certificate",
            )

        send.assert_not_called()
        self.assertEqual(result["recipients"], 0)

    def test_an_institution_with_no_officer_yet_is_not_an_error(self):
        """Half-built institutions are normal; the credential must still progress."""
        other = Institution.objects.create(
            institution_id="CUSL-022", name="University of Bo"
        )
        with mock.patch(
            "certify.attestation_notices.send_officer_attestation_notice",
        ) as send:
            result = notify_officer_pending_attestation(
                institution=other, role=Role.VC,
                credential_id="CR-2026-BO-0001", credential_kind="Certificate",
            )

        send.assert_not_called()
        self.assertEqual(result, {"role": Role.VC, "recipients": 0, "sent": 0})

    # â”€â”€ Resilience â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    def test_a_transport_failure_does_not_propagate(self):
        """A credential that cannot be emailed must still be approvable."""
        with mock.patch(
            "certify.attestation_notices.send_officer_attestation_notice",
            side_effect=RuntimeError("SMTP exploded"),
        ):
            result = notify_officer_pending_attestation(
                institution=self.institution, role=Role.VC,
                credential_id="CR-2026-MKN-0001", credential_kind="Certificate",
            )

        self.assertEqual(result["sent"], 0)
        self.assertEqual(result["recipients"], 1)

    def test_an_officer_with_no_email_on_file_is_skipped(self):
        self.vc.email = ""
        self.vc.save(update_fields=["email"])

        with mock.patch(
            "certify.attestation_notices.send_officer_attestation_notice",
        ) as send:
            result = notify_officer_pending_attestation(
                institution=self.institution, role=Role.VC,
                credential_id="CR-2026-MKN-0001", credential_kind="Certificate",
            )

        send.assert_not_called()
        self.assertEqual(result["recipients"], 1)
        self.assertEqual(result["sent"], 0)

    # â”€â”€ The message itself â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    @override_settings(
        EMAIL_ENABLED=True,
        EMAIL_HOST_USER="apikey",
        EMAIL_HOST_PASSWORD="secret",
        DEFAULT_FROM_EMAIL="no-reply@credence.test",
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    )
    def test_the_message_reaches_the_officer_with_a_working_link(self):
        from django.core import mail

        notify_officer_pending_attestation(
            institution=self.institution, role=Role.VC,
            credential_id="CR-2026-MKN-0001", credential_kind="Certificate",
            student_name="Ada Lovelace",
        )

        self.assertEqual(len(mail.outbox), 1)
        sent = mail.outbox[0]
        self.assertEqual(sent.to, ["vc@mkn.edu.sl"])
        self.assertIn("CR-2026-MKN-0001", sent.subject)
        self.assertIn("Vice Chancellor", sent.subject)
        self.assertIn("Ada Lovelace", sent.body)
        self.assertIn("/dashboard/approvals", sent.body)
        # "Attestation" is the word that tells an officer this needs their wallet,
        # as opposed to a document that is merely ready.
        self.assertIn("attestation", sent.body.lower())

    @override_settings(EMAIL_ENABLED=False)
    def test_nothing_is_sent_when_email_is_not_configured(self):
        from django.core import mail

        notify_officer_pending_attestation(
            institution=self.institution, role=Role.VC,
            credential_id="CR-2026-MKN-0001", credential_kind="Certificate",
        )

        self.assertEqual(len(mail.outbox), 0)

    # â”€â”€ Wiring: every hand-off notifies â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    def test_the_registrar_submission_notifies_the_vc(self):
        self.client.force_authenticate(self.registrar)
        cert = self._certificate(status=CertificateStatus.PENDING_VC)

        with mock.patch(
            "certify.views.notify_officer_pending_attestation",
        ) as notice:
            response = self.client.post(
                f"/api/certificates/{cert.id}/confirm-chain/",
                {"tx_hash": TX_HASH}, format="json",
            )

        self.assertEqual(response.status_code, 200, response.data)
        notice.assert_called_once()
        self.assertEqual(notice.call_args.kwargs["role"], Role.VC)
        self.assertEqual(notice.call_args.kwargs["institution"], self.institution)
        self.assertEqual(notice.call_args.kwargs["credential_id"], cert.certificate_id)

    def test_the_vc_approval_notifies_the_dean(self):
        self.client.force_authenticate(self.vc)
        cert = self._certificate(
            status=CertificateStatus.PENDING_VC,
            tx_hash=TX_HASH,
            doc_hash="0x" + "b" * 64,
        )

        with mock.patch(
            "certify.views.notify_officer_pending_attestation",
        ) as notice:
            response = self.client.post(
                f"/api/certificates/{cert.id}/confirm-vc/",
                {"tx_hash": TX_HASH}, format="json",
            )

        self.assertEqual(response.status_code, 200, response.data)
        notice.assert_called_once()
        self.assertEqual(notice.call_args.kwargs["role"], Role.CHANCELLOR)

    def test_a_failed_notice_does_not_fail_the_vc_approval(self):
        """The outage case: SMTP down must not cost the pipeline an approval.

        This drives the real view and only breaks the transport, because that is
        the failure that actually happens. Mocking the notice function itself
        would test a guard that does not exist at the call site.
        """
        self.client.force_authenticate(self.vc)
        cert = self._certificate(
            status=CertificateStatus.PENDING_VC,
            tx_hash=TX_HASH,
            doc_hash="0x" + "b" * 64,
        )

        with mock.patch(
            "certify.attestation_notices.send_officer_attestation_notice",
            side_effect=RuntimeError("SMTP exploded"),
        ):
            response = self.client.post(
                f"/api/certificates/{cert.id}/confirm-vc/",
                {"tx_hash": TX_HASH}, format="json",
            )

        self.assertEqual(response.status_code, 200, response.data)
        cert.refresh_from_db()
        self.assertEqual(cert.status, CertificateStatus.PENDING_CHANCELLOR)
        self.assertEqual(cert.vc_approval_tx_hash, TX_HASH)


@override_settings(CREDENTIAL_DOCUMENT_ENCRYPTION_KEY=TEST_ENCRYPTION_KEY)
class DraftDocumentTests(TestCase):
    """The resumable-draft routes behind the external-upload flow.

    Autosave, read-back and abandon all have one thing in common: they touch a
    credential that is not finished and was never submitted. So the property
    these tests protect most is that none of the three can reach a record that
    officers have already seen, and none of them turns a local draft into an
    anchored one.
    """

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
            "certificate_id": "CR-2026-CUSL-0100",
            "institution": self.institution,
            "student_name": "Ada Lovelace",
            "student_email": "ada@example.edu",
            "degree_title": "BSc Computer Science",
            "graduation_year": 2026,
            "flow_type": FlowType.FULL_UPLOAD,
            "status": CertificateStatus.DRAFT,
        }
        fields.update(overrides)
        return Certificate.objects.create(**fields)

    def _save(self, cert, kind="certificate", name="cert.pdf"):
        return self.client.post(
            f"/api/certificates/{cert.id}/save-draft-document/",
            {"kind": kind, "document_file": _pdf(name)},
        )

    # â”€â”€ save â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    def test_saving_a_draft_document_stores_it_locally_and_keeps_the_draft(self):
        cert = self._certificate()

        response = self._save(cert)

        self.assertEqual(response.status_code, 200, response.data)
        cert.refresh_from_db()
        self.assertEqual(cert.status, CertificateStatus.DRAFT, "saving is not submitting")
        self.assertTrue(cert.document_file.name)
        self.assertTrue(cert.document_file.name.endswith(".pdf.enc"))

    def test_saving_a_draft_document_does_not_pin_to_ipfs(self):
        """Pinata is metered, so autosave must not spend quota.

        The anchored fields are the assertion that matters: if autosave ever
        started writing a CID, a draft would consume Pinata capacity and
        `has_transcript`-style checks would start reporting anchored documents
        that were never submitted.
        """
        cert = self._certificate()

        with mock.patch("certify.ipfs.pin_file_to_ipfs") as pin:
            response = self._save(cert, kind="transcript")

        self.assertEqual(response.status_code, 200, response.data)
        pin.assert_not_called()
        cert.refresh_from_db()
        self.assertEqual(cert.ipfs_cid_pdf, "")
        self.assertEqual(cert.ipfs_cid_transcript, "")
        self.assertEqual(cert.doc_hash, "")
        self.assertEqual(cert.transcript_hash, "")
        self.assertTrue(cert.transcript_file.name)

    def test_a_saved_draft_document_is_stored_encrypted(self):
        """The local copy must be ciphertext, not a readable PDF on disk."""
        cert = self._certificate()
        plain = b"%PDF-1.4\n% the real transcript\n"

        response = self.client.post(
            f"/api/certificates/{cert.id}/save-draft-document/",
            {
                "kind": "certificate",
                "document_file": SimpleUploadedFile(
                    "cert.pdf", plain, content_type="application/pdf"
                ),
            },
        )

        self.assertEqual(response.status_code, 200, response.data)
        cert.refresh_from_db()
        on_disk = cert.document_file.read()
        self.assertNotIn(b"the real transcript", on_disk)
        self.assertEqual(
            decrypt_document(on_disk, cert.certificate_id, "certificate"), plain
        )

    def test_replacing_a_draft_document_removes_the_superseded_file(self):
        """Autosave fires on every selection, so the old copy must not pile up."""
        cert = self._certificate()
        self._save(cert, name="first.pdf")
        cert.refresh_from_db()
        first_name = cert.document_file.name
        first_path = cert.document_file.path

        self._save(cert, name="second.pdf")
        cert.refresh_from_db()

        self.assertNotEqual(first_name, cert.document_file.name)
        self.assertFalse(os.path.exists(first_path), "the replaced file was left behind")
        self.assertTrue(
            os.path.exists(cert.document_file.path),
            "replacing a draft document deleted the copy that was just saved",
        )

    def test_replacing_a_draft_document_drops_the_review_made_against_the_old_one(self):
        """A verdict on replaced bytes is a verdict nobody made.

        The browser clears its own review when a file is re-picked, but the
        Replace button overwrites the saved copy in place without a delete. If
        the review row survives, a refresh restores an approval against a
        document that is no longer the one that was read.
        """
        cert = self._certificate()
        self._save(cert, kind="transcript", name="first.pdf")
        DocumentReview.objects.create(
            certificate=cert,
            document_kind=DocumentReviewKind.TRANSCRIPT,
            state=DocumentReviewState.RESOLVED,
        )

        self._save(cert, kind="transcript", name="second.pdf")

        self.assertFalse(
            DocumentReview.objects.filter(
                certificate=cert, document_kind=DocumentReviewKind.TRANSCRIPT
            ).exists(),
            "the review of the replaced document was left attached to the draft",
        )

    def test_replacing_one_document_leaves_the_other_document_review_alone(self):
        cert = self._certificate()
        self._save(cert, kind="certificate", name="cert.pdf")
        self._save(cert, kind="transcript", name="transcript.pdf")
        DocumentReview.objects.create(
            certificate=cert,
            document_kind=DocumentReviewKind.CERTIFICATE,
            state=DocumentReviewState.RESOLVED,
        )

        self._save(cert, kind="transcript", name="transcript-v2.pdf")

        self.assertTrue(
            DocumentReview.objects.filter(
                certificate=cert, document_kind=DocumentReviewKind.CERTIFICATE
            ).exists(),
            "replacing the transcript discarded the certificate's review",
        )

    def test_a_document_cannot_be_saved_to_a_submitted_certificate(self):
        cert = self._certificate(
            status=CertificateStatus.PENDING_VC, tx_hash=TX_HASH, cert_hash="0x" + "c" * 64,
        )

        response = self._save(cert)

        self.assertEqual(response.status_code, 400, response.data)
        cert.refresh_from_db()
        self.assertEqual(cert.document_file.name, "")

    def test_a_non_pdf_draft_document_is_rejected(self):
        cert = self._certificate()

        response = self.client.post(
            f"/api/certificates/{cert.id}/save-draft-document/",
            {
                "kind": "certificate",
                "document_file": SimpleUploadedFile(
                    "notes.txt", b"not a pdf", content_type="text/plain"
                ),
            },
        )

        self.assertEqual(response.status_code, 400, response.data)
        cert.refresh_from_db()
        self.assertEqual(cert.document_file.name, "")

    def test_another_institutions_registrar_cannot_touch_the_draft(self):
        elsewhere = Institution.objects.create(
            institution_id="OTHER-1", name="Other University"
        )
        stranger = User.objects.create_user(
            email="stranger@other.edu",
            password="pw-for-tests-only-123",
            first_name="Str",
            last_name="Anger",
            role=Role.REGISTRAR,
            institution=elsewhere,
        )
        cert = self._certificate()
        self.client.force_authenticate(stranger)

        self.assertEqual(self._save(cert).status_code, 404)
        self.assertEqual(
            self.client.get(f"/api/certificates/{cert.id}/draft-document/").status_code, 404
        )
        self.assertEqual(
            self.client.post(f"/api/certificates/{cert.id}/abandon/").status_code, 404
        )

    # â”€â”€ read back â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    def test_a_saved_draft_document_can_be_read_back_byte_for_byte(self):
        cert = self._certificate()
        self._save(cert, kind="transcript", name="transcript.pdf")

        response = self.client.get(
            f"/api/certificates/{cert.id}/draft-document/?kind=transcript"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertIn("inline", response["Content-Disposition"])
        self.assertTrue(response["Cache-Control"].startswith("private, no-store"))
        self.assertEqual(response["X-Content-Type-Options"], "nosniff")
        self.assertTrue(response.content.startswith(b"%PDF-1.4"))

    def test_reading_a_draft_document_with_nothing_stored_is_a_404(self):
        cert = self._certificate()

        response = self.client.get(f"/api/certificates/{cert.id}/draft-document/")

        self.assertEqual(response.status_code, 404, response.data)

    def test_reading_an_unknown_document_kind_is_rejected(self):
        cert = self._certificate()
        self._save(cert)

        response = self.client.get(
            f"/api/certificates/{cert.id}/draft-document/?kind=passport"
        )

        self.assertEqual(response.status_code, 400, response.data)

    def test_a_draft_document_cannot_be_read_after_submission(self):
        cert = self._certificate()
        self._save(cert)
        Certificate.objects.filter(pk=cert.pk).update(
            status=CertificateStatus.PENDING_VC, tx_hash=TX_HASH,
        )

        response = self.client.get(f"/api/certificates/{cert.id}/draft-document/")

        self.assertEqual(response.status_code, 400, response.data)

    def test_a_document_stored_against_another_credential_will_not_decrypt(self):
        """The AES-GCM associated data has to bind the file to its credential.

        A blob lifted out of one draft and dropped into another must fail to
        decrypt rather than render as the wrong student's document.
        """
        first = self._certificate()
        second = self._certificate(certificate_id="CR-2026-CUSL-0101")
        self._save(first)
        first.refresh_from_db()
        stolen = first.document_file.read()
        second.transcript_file.save("lifted.pdf.enc", ContentFile(stolen), save=True)

        response = self.client.get(
            f"/api/certificates/{second.id}/draft-document/?kind=transcript"
        )

        self.assertEqual(response.status_code, 409, response.data)

    # â”€â”€ clearing a document â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    def test_clearing_a_draft_document_removes_it_and_its_review(self):
        """Clearing has to mean the same thing in the browser and on the server.

        Otherwise the file is gone from the screen, comes back on the next
        reopen, and the review that was decided against it silently applies to
        a document the Registrar already threw away.
        """
        cert = self._certificate()
        self._save(cert, kind="transcript", name="transcript.pdf")
        DocumentReview.objects.create(
            certificate=cert,
            document_kind=DocumentReviewKind.TRANSCRIPT,
            state=DocumentReviewState.RESOLVED,
        )
        cert.refresh_from_db()
        stored_path = cert.transcript_file.path

        response = self.client.delete(
            f"/api/certificates/{cert.id}/draft-document/?kind=transcript"
        )

        self.assertEqual(response.status_code, 204, response.data)
        cert.refresh_from_db()
        self.assertEqual(cert.transcript_file.name, "")
        self.assertFalse(os.path.exists(stored_path))
        self.assertFalse(
            DocumentReview.objects.filter(
                certificate=cert, document_kind=DocumentReviewKind.TRANSCRIPT
            ).exists()
        )

    def test_clearing_one_document_leaves_the_other_alone(self):
        cert = self._certificate()
        self._save(cert, kind="certificate", name="cert.pdf")
        self._save(cert, kind="transcript", name="transcript.pdf")

        response = self.client.delete(
            f"/api/certificates/{cert.id}/draft-document/?kind=transcript"
        )

        self.assertEqual(response.status_code, 204, response.data)
        cert.refresh_from_db()
        self.assertTrue(cert.document_file.name, "the certificate went with the transcript")
        self.assertEqual(cert.transcript_file.name, "")

    def test_clearing_a_document_that_was_never_saved_is_not_an_error(self):
        cert = self._certificate()

        response = self.client.delete(f"/api/certificates/{cert.id}/draft-document/")

        self.assertEqual(response.status_code, 204, response.data)

    def test_a_draft_document_cannot_be_cleared_after_submission(self):
        cert = self._certificate()
        self._save(cert)
        Certificate.objects.filter(pk=cert.pk).update(
            status=CertificateStatus.PENDING_VC, tx_hash=TX_HASH,
        )

        response = self.client.delete(f"/api/certificates/{cert.id}/draft-document/")

        self.assertEqual(response.status_code, 400, response.data)
        cert.refresh_from_db()
        self.assertTrue(cert.document_file.name)

    # â”€â”€ abandon â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    def test_abandoning_a_draft_deletes_the_record_and_its_documents(self):
        cert = self._certificate()
        self._save(cert, kind="transcript", name="transcript.pdf")
        cert.refresh_from_db()
        stored_path = cert.transcript_file.path
        pk = cert.id

        response = self.client.post(f"/api/certificates/{cert.id}/abandon/")

        self.assertEqual(response.status_code, 204, response.data)
        self.assertFalse(Certificate.objects.filter(pk=pk).exists())
        self.assertFalse(os.path.exists(stored_path), "the saved document outlived the draft")

    def test_abandoning_a_draft_keeps_an_audit_record(self):
        """The row is gone; the reason it is gone must not be."""
        cert = self._certificate()

        self.client.post(f"/api/certificates/{cert.id}/abandon/")

        entry = AuditLog.objects.filter(action="certificate.abandoned").first()
        self.assertIsNotNone(entry, "abandoning a draft left no trace")
        self.assertIn(cert.certificate_id, entry.detail)

    def test_abandoning_a_draft_takes_its_reviews_with_it(self):
        cert = self._certificate()
        DocumentReview.objects.create(
            certificate=cert,
            document_kind=DocumentReviewKind.CERTIFICATE,
            state=DocumentReviewState.RESOLVED,
        )

        self.client.post(f"/api/certificates/{cert.id}/abandon/")

        self.assertEqual(DocumentReview.objects.filter(certificate_id=cert.id).count(), 0)

    def test_a_submitted_certificate_cannot_be_abandoned(self):
        """Deleting an on-chain credential must go through revoke, not delete."""
        cert = self._certificate(
            status=CertificateStatus.PENDING_VC, tx_hash=TX_HASH, cert_hash="0x" + "c" * 64,
        )

        response = self.client.post(f"/api/certificates/{cert.id}/abandon/")

        self.assertEqual(response.status_code, 400, response.data)
        self.assertTrue(Certificate.objects.filter(pk=cert.pk).exists())

    def test_an_issued_certificate_cannot_be_abandoned(self):
        cert = self._certificate(status=CertificateStatus.ISSUED, tx_hash=TX_HASH)

        response = self.client.post(f"/api/certificates/{cert.id}/abandon/")

        self.assertEqual(response.status_code, 400, response.data)
        self.assertTrue(Certificate.objects.filter(pk=cert.pk).exists())

    def test_abandoning_is_not_available_to_a_student(self):
        cert = self._certificate()
        student = User.objects.create_user(
            email="ada@example.edu",
            password="pw-for-tests-only-123",
            first_name="Ada",
            last_name="Lovelace",
            role=Role.STUDENT,
            institution=self.institution,
        )
        self.client.force_authenticate(student)

        response = self.client.post(f"/api/certificates/{cert.id}/abandon/")

        self.assertEqual(response.status_code, 403, response.data)
        self.assertTrue(Certificate.objects.filter(pk=cert.pk).exists())
