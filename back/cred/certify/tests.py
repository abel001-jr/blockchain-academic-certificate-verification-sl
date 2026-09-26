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
from certify.serializers import CertificateDetailSerializer
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


class StudentEmailUpdateTests(TestCase):
    """POST /api/certificates/<id>/update-student-email/.

    `student_email` is folded into `build_certificate_json()` and therefore into
    the `dataHash` committed to Ethereum. Nothing in the codebase can re-hash or
    re-pin after the fact, so the field has to stay frozen from the moment the
    hash exists — otherwise the stored certificate stops reproducing its own
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
