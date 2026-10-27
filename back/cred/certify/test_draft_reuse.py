from django.core.files.base import ContentFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import Role, User
from institutions.models import Department, Institution, Program
from .models import Certificate, DocumentReview


@override_settings(STORAGES={"default": {"BACKEND": "django.core.files.storage.InMemoryStorage"}})
class IssuanceDraftReuseTests(TestCase):
    def setUp(self):
        self.institution = Institution.objects.create(institution_id="DRAFT", name="Draft University")
        self.user = User.objects.create_user(email="registrar@draft.example", role=Role.REGISTRAR, institution=self.institution)
        self.department = Department.objects.create(institution=self.institution, name="Computing")
        self.program = Program.objects.create(department=self.department, title="Bachelor of Science in Computing")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.payload = dict(student_name="Ada Lovelace", student_email="ada@draft.example",
                            department_id=str(self.department.pk), program_id=str(self.program.pk),
                            graduation_year=2026, flow_type="full_upload")

    def create(self, **changes):
        return self.client.post("/api/certificates/", {**self.payload, **changes}, format="json")

    def draft(self):
        response = self.create()
        self.assertEqual(response.status_code, 201, response.data)
        return Certificate.objects.get(pk=response.data["id"])

    def test_repeated_start_and_lost_response_retry_reuse_one_draft(self):
        first = self.draft()
        for _ in range(3):
            response = self.create(student_email="ADA@draft.example")
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response.data["id"], str(first.pk))
            self.assertTrue(response.data["draft_reused"])
        self.assertEqual(Certificate.objects.count(), 1)

    def test_reuse_preserves_documents_and_review_decisions(self):
        draft = self.draft()
        draft.transcript_file.save("saved.pdf.enc", ContentFile(b"saved encrypted bytes"))
        review = DocumentReview.objects.create(certificate=draft, document_kind="transcript", document_sha256="a" * 64)
        response = self.create()
        self.assertEqual(response.status_code, 200, response.data)
        draft.refresh_from_db()
        self.assertEqual(draft.transcript_file.read(), b"saved encrypted bytes")
        self.assertTrue(DocumentReview.objects.filter(pk=review.pk).exists())
        self.assertTrue(response.data["has_draft_transcript"])

    def test_back_to_details_updates_same_draft_and_invalidates_reviews(self):
        draft = self.draft()
        draft.transcript_file.save("saved.pdf.enc", ContentFile(b"saved encrypted bytes"))
        DocumentReview.objects.create(certificate=draft, document_kind="transcript", document_sha256="a" * 64)
        response = self.create(draft_id=str(draft.pk), student_name="Ada Byron Lovelace")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data["draft_details_changed"])
        draft.refresh_from_db()
        self.assertEqual(draft.student_name, "Ada Byron Lovelace")
        self.assertEqual(Certificate.objects.count(), 1)
        self.assertTrue(draft.transcript_file.name)
        self.assertFalse(draft.document_reviews.exists())

    def test_unchanged_details_keep_review(self):
        draft = self.draft()
        review = DocumentReview.objects.create(certificate=draft, document_kind="transcript", document_sha256="a" * 64)
        response = self.create(draft_id=str(draft.pk))
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(response.data["draft_details_changed"])
        self.assertTrue(DocumentReview.objects.filter(pk=review.pk).exists())

    def test_switching_workflow_resumes_original_instead_of_copying(self):
        draft = self.draft()
        response = self.create(flow_type="system_designed")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["id"], str(draft.pk))
        self.assertEqual(response.data["flow_type"], "full_upload")
        self.assertEqual(Certificate.objects.count(), 1)

    def test_other_students_awards_and_years_get_separate_drafts(self):
        self.draft()
        self.assertEqual(self.create(student_email="other@draft.example").status_code, 201)
        self.assertEqual(self.create(graduation_year=2025).status_code, 201)
        other = Program.objects.create(department=self.department, title="Bachelor of Science in Mathematics")
        self.assertEqual(self.create(program_id=str(other.pk)).status_code, 201)

    def test_draft_from_other_institution_cannot_be_updated(self):
        draft = self.draft()
        other = Institution.objects.create(institution_id="OTHER", name="Other University")
        outsider = User.objects.create_user(email="other@other.example", role=Role.REGISTRAR, institution=other)
        department = Department.objects.create(institution=other, name="Computing")
        program = Program.objects.create(department=department, title=self.program.title)
        self.client.force_authenticate(outsider)
        response = self.create(draft_id=str(draft.pk), department_id=str(department.pk), program_id=str(program.pk))
        self.assertEqual(response.status_code, 404, response.data)
        response = self.create(department_id=str(department.pk), program_id=str(program.pk))
        self.assertEqual(response.status_code, 201, response.data)
        self.assertNotEqual(response.data["id"], str(draft.pk))

    def test_prepared_documents_cannot_be_edited_through_draft_save(self):
        draft = self.draft()
        draft.doc_hash = "0x" + "a" * 64
        draft.save(update_fields=["doc_hash"])
        response = self.create(draft_id=str(draft.pk), student_name="Ada Byron Lovelace")
        self.assertEqual(response.status_code, 409, response.data)
        draft.refresh_from_db()
        self.assertEqual(draft.student_name, "Ada Lovelace")

    def test_submitted_record_is_reused_without_resetting_approval_progress(self):
        draft = self.draft()
        draft.status = "pending_vc"
        draft.tx_hash = "0x" + "b" * 64
        draft.save(update_fields=["status", "tx_hash"])
        response = self.create(draft_id=str(draft.pk))
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["status"], "pending_vc")
        self.assertEqual(response.data["tx_hash"], draft.tx_hash)
        self.assertEqual(self.create().data["id"], str(draft.pk))
        self.assertEqual(self.create(draft_id=str(draft.pk), student_name="Ada Byron Lovelace").status_code, 409)
        self.assertEqual(Certificate.objects.count(), 1)

    def test_prepared_but_unsigned_record_is_resumed_instead_of_copied(self):
        draft = self.draft()
        draft.status = "pending_vc"
        draft.cert_hash = "0x" + "a" * 64
        draft.doc_hash = "0x" + "b" * 64
        draft.save(update_fields=["status", "cert_hash", "doc_hash"])
        response = self.create()
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["id"], str(draft.pk))
        self.assertEqual(response.data["doc_hash"], draft.doc_hash)
        self.assertEqual(Certificate.objects.count(), 1)

    def test_legacy_duplicates_are_preserved_and_reuse_is_deterministic(self):
        original = self.draft()
        Certificate.objects.create(certificate_id="OLD-DUPLICATE", institution=self.institution,
            student_name=original.student_name, student_email=original.student_email,
            department=original.department, degree_title=original.degree_title,
            graduation_year=original.graduation_year, flow_type="full_upload")
        response = self.create()
        self.assertEqual(response.data["id"], str(original.pk))
        self.assertEqual(Certificate.objects.count(), 2)
