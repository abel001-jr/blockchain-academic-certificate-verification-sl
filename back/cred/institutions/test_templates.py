from io import BytesIO
from tempfile import TemporaryDirectory
from unittest.mock import patch

import fitz
from PIL import Image
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import User, Role
from certify.models import Certificate, FlowType
from certify.encrypted_documents import document_sha256, encrypt_document
from .models import Institution, CertificateTemplate, CertificateTemplateRevision, Department, Program
from .pdf_certificate import generate_certificate_pdf
from .template_rendering import validate_layout
from certify.document_intake import prepare_document


def master():
    with fitz.open() as doc:
        page = doc.new_page(width=600, height=400)
        page.insert_text((30, 50), "INSTITUTIONAL ARTWORK AND WORDING", fontsize=14)
        page.insert_text((120, 170), "OLD STUDENT", fontsize=18)
        return doc.tobytes()


def layout():
    return [
        {"key": "student_name", "page": 1, "x": .2, "y": .35, "width": .6, "height": .1, "clear": True},
        {"key": "degree_title", "page": 1, "x": .2, "y": .5, "width": .6, "height": .08},
        {"key": "graduation_year", "page": 1, "x": .4, "y": .6, "width": .2, "height": .08},
        *[{"key": key, "page": 1, "x": x, "y": .8, "width": .2, "height": .1} for key, x in [("registrar_signature", .1), ("vc_signature", .4), ("chancellor_signature", .7)]],
    ]


class UploadedTemplateTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.institution = Institution.objects.create(institution_id="TEMPLATE", name="Actual University")
        cls.registrar = User.objects.create_user(email="template@example.edu", role=Role.REGISTRAR, institution=cls.institution)
        cls.other = Institution.objects.create(institution_id="OTHER-T", name="Other University")

    def setUp(self):
        self.directory = TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        setting = override_settings(MEDIA_ROOT=self.directory.name)
        setting.enable()
        self.addCleanup(setting.disable)
        self.client = APIClient()
        self.client.force_authenticate(self.registrar)
        self.revision = CertificateTemplateRevision.objects.create(
            institution=self.institution, master=ContentFile(master(), name="master.pdf"),
            fields=layout(), analysis={"pages": [{"page": 1, "width": 600, "height": 400}]})
        self.cert = Certificate.objects.create(institution=self.institution, issued_by=self.registrar,
            certificate_id="TEMPLATE-001", student_name="Ada Lovelace", student_email="ada@example.edu",
            degree_title="Bachelor of Science", graduation_year=2026, template_revision=self.revision,
            flow_type=FlowType.SYSTEM_DESIGNED)
        self.url = f"/api/certificate-templates/{self.revision.id}/"

    def test_branding_can_be_disabled_and_enabled_again(self):
        from django.utils import timezone
        self.revision.approved_at = timezone.now()
        self.revision.save(update_fields=["approved_at"])
        template = CertificateTemplate.objects.create(institution=self.institution, active_revision=self.revision)
        response = self.client.post("/api/certificate-templates/disable/", {"confirm": True}, format="json")
        self.assertEqual(response.status_code, 200)
        template.refresh_from_db()
        self.assertIsNone(template.active_revision_id)
        response = self.client.post("/api/certificate-templates/enable/", {"revision_id": str(self.revision.pk)}, format="json")
        self.assertEqual(response.status_code, 200)
        template.refresh_from_db()
        self.assertEqual(template.active_revision_id, self.revision.pk)
        self.cert.refresh_from_db()
        self.assertEqual(self.cert.template_revision_id, self.revision.pk)

    def test_edit_updates_same_version_and_keeps_two_version_limit(self):
        from django.utils import timezone
        self.revision.approved_at = timezone.now()
        self.revision.save(update_fields=["approved_at"])
        template = CertificateTemplate.objects.create(institution=self.institution, active_revision=self.revision)
        CertificateTemplateRevision.objects.create(institution=self.institution, master=self.revision.master.name)
        response = self.client.post(f"{self.url}edit/", {}, format="json")
        self.assertEqual(response.status_code, 200)
        draft = CertificateTemplateRevision.objects.get(pk=response.data["id"])
        self.assertEqual(draft.pk, self.revision.pk)
        self.assertEqual(CertificateTemplateRevision.objects.filter(institution=self.institution).count(), 2)
        self.assertIsNone(draft.approved_at)
        self.assertEqual(draft.fields, self.revision.fields)
        template.refresh_from_db()
        self.assertIsNone(template.active_revision_id)
        updated_fields = layout()
        updated_fields[0]["font_size"] = 16
        response = self.client.patch(f"/api/certificate-templates/{draft.pk}/", {"fields": updated_fields, "approve": True}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        template.refresh_from_db()
        self.assertEqual(template.active_revision_id, draft.pk)
        self.cert.refresh_from_db()
        self.assertEqual(self.cert.template_revision_id, self.revision.pk)
        draft.refresh_from_db()
        self.assertEqual(draft.fields[0]["font_size"], 16)
        self.assertIsNotNone(draft.approved_at)
        response = self.client.post(f"{self.url}edit/", {}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(str(response.data["id"]), str(self.revision.pk))
        self.assertEqual(CertificateTemplateRevision.objects.filter(institution=self.institution).count(), 2)

    def test_enable_rejects_unapproved_or_other_institution_template(self):
        CertificateTemplate.objects.create(institution=self.institution)
        response = self.client.post("/api/certificate-templates/enable/", {"revision_id": str(self.revision.pk)}, format="json")
        self.assertEqual(response.status_code, 404)
        from django.utils import timezone
        self.revision.institution = self.other
        self.revision.approved_at = timezone.now()
        self.revision.save(update_fields=["institution", "approved_at"])
        response = self.client.post("/api/certificate-templates/enable/", {"revision_id": str(self.revision.pk)}, format="json")
        self.assertEqual(response.status_code, 404)

    def test_rendering_preserves_master_and_replaces_labelled_content(self):
        output = generate_certificate_pdf(self.cert, include_attestations=False)
        with fitz.open(stream=output, filetype="pdf") as doc:
            text = doc[0].get_text()
        self.assertIn("INSTITUTIONAL ARTWORK AND WORDING", text)
        self.assertIn("Ada Lovelace", text)
        self.assertIn("2026", text)
        self.assertNotIn("OLD STUDENT", text)
        self.assertIn("Review copy", text)

    def test_review_render_is_deterministic(self):
        first = generate_certificate_pdf(self.cert, include_attestations=False)
        second = generate_certificate_pdf(self.cert, include_attestations=False)
        self.assertEqual(first, second)
        self.cert.vc_approver_name = "Officer"
        self.assertEqual(first, generate_certificate_pdf(self.cert, include_attestations=False))

    def test_flattened_scan_can_be_populated_without_ocr_dependencies(self):
        with fitz.open(stream=master(), filetype="pdf") as doc:
            image = doc[0].get_pixmap(dpi=150).tobytes("png")
        flattened = prepare_document([SimpleUploadedFile("scan.png", image)])
        self.revision.master.save("flattened.pdf", ContentFile(flattened), save=True)
        output = generate_certificate_pdf(self.cert, include_attestations=False)
        with fitz.open(stream=output, filetype="pdf") as doc:
            self.assertIn("Ada Lovelace", doc[0].get_text())
            self.assertTrue(doc[0].get_images())

    def test_final_differs_and_uses_configured_signature_asset(self):
        image = BytesIO()
        Image.new("RGB", (150, 50), "black").save(image, "PNG")
        for field in ("registrar_signature_image", "vc_signature_image", "chancellor_signature_image"):
            getattr(self.cert, field).save(field + ".png", ContentFile(image.getvalue()), save=False)
        review = generate_certificate_pdf(self.cert, include_attestations=False)
        final = generate_certificate_pdf(self.cert, include_attestations=True)
        self.assertNotEqual(document_sha256(review), document_sha256(final))
        with fitz.open(stream=final, filetype="pdf") as doc:
            self.assertNotIn("Review copy", doc[0].get_text())
            self.assertTrue(doc[0].get_images())

    def test_missing_signature_snapshot_blocks_final_rendering(self):
        with self.assertRaisesRegex(ValueError, "asset was not captured"):
            generate_certificate_pdf(self.cert, include_attestations=True)

    def test_out_of_bounds_and_nonfinite_fields_rejected(self):
        for changes in ({"width": 2}, {"x": float("nan")}, {"page": 2}, {"font_size": -10}, {"clear": "false"}, {"color": "invalid"}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                validate_layout([{**layout()[0], **changes}], self.revision.analysis)

    def test_oversized_text_is_an_actionable_error(self):
        self.cert.student_name = "Name" * 100
        with self.assertRaisesRegex(ValueError, "at most|does not fit"):
            generate_certificate_pdf(self.cert, include_attestations=False)

    def test_upload_reads_live_text_and_keeps_private_master(self):
        response = self.client.post("/api/certificate-templates/", {"master": SimpleUploadedFile("actual.pdf", master()), "name": "Actual style"})
        self.assertEqual(response.status_code, 201, response.data)
        self.assertFalse(response.data["analysis"]["ocr_used"])
        self.assertIn("INSTITUTIONAL", response.data["analysis"]["pages"][0]["text"])
        self.assertNotIn("master", response.data)

    def test_two_template_limit_blocks_third_before_processing(self):
        second = self.client.post("/api/certificate-templates/", {"master": SimpleUploadedFile("second.pdf", master())})
        self.assertEqual(second.status_code, 201)
        with patch("institutions.template_views.prepare_document") as prepare:
            third = self.client.post("/api/certificate-templates/", {"master": SimpleUploadedFile("third.pdf", master())})
        self.assertEqual(third.status_code, 409)
        self.assertIn("maximum of two", third.data["detail"])
        prepare.assert_not_called()
        self.assertEqual(CertificateTemplateRevision.objects.filter(institution=self.institution).count(), 2)

    def test_legacy_edit_duplicates_merge_into_original_with_latest_status(self):
        from importlib import import_module
        from django.apps import apps
        from django.db import connection
        from types import SimpleNamespace
        from django.utils import timezone
        self.revision.approved_at = timezone.now()
        self.revision.save(update_fields=["approved_at"])
        copy = CertificateTemplateRevision.objects.create(
            institution=self.institution, name=self.revision.name,
            master=self.revision.master.name, fields=layout(),
            analysis=self.revision.analysis, approved_at=timezone.now())
        latest_fields = layout()
        latest_fields[0]["font_size"] = 15
        CertificateTemplateRevision.objects.create(
            institution=self.institution, name=self.revision.name,
            master=self.revision.master.name, fields=latest_fields, analysis=self.revision.analysis)
        template = CertificateTemplate.objects.create(institution=self.institution, active_revision=copy)
        self.cert.template_revision = copy
        self.cert.save(update_fields=["template_revision"])
        merge = import_module("institutions.migrations.0006_merge_duplicate_template_edits").merge_duplicate_edits
        merge(apps, SimpleNamespace(connection=connection))
        self.assertEqual(CertificateTemplateRevision.objects.filter(institution=self.institution).count(), 1)
        self.revision.refresh_from_db()
        self.assertIsNone(self.revision.approved_at)
        self.assertEqual(self.revision.fields, latest_fields)
        self.cert.refresh_from_db()
        self.assertEqual(self.cert.template_revision_id, self.revision.pk)
        template.refresh_from_db()
        self.assertIsNone(template.active_revision_id)

    def test_template_limit_is_scoped_to_institution(self):
        for number in range(2):
            CertificateTemplateRevision.objects.create(institution=self.other, name=str(number), master=ContentFile(master(), name=f"other-{number}.pdf"))
        response = self.client.post("/api/certificate-templates/", {"master": SimpleUploadedFile("second.pdf", master())})
        self.assertEqual(response.status_code, 201)

    def test_replacement_at_limit_resets_unused_draft_without_new_version(self):
        draft = CertificateTemplateRevision.objects.create(institution=self.institution, fields=layout(), master=ContentFile(master(), name="replace.pdf"), analysis=self.revision.analysis)
        old_name = draft.master.name
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post("/api/certificate-templates/", {"master": SimpleUploadedFile("new.pdf", master()), "replace_id": str(draft.id)})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["id"], str(draft.id))
        draft.refresh_from_db()
        self.assertEqual(draft.fields, [])
        self.assertNotEqual(draft.master.name, old_name)
        self.assertFalse(draft.master.storage.exists(old_name))
        self.assertEqual(CertificateTemplateRevision.objects.filter(institution=self.institution).count(), 2)

    def test_approved_or_used_template_cannot_be_replaced(self):
        response = self.client.post("/api/certificate-templates/", {"master": SimpleUploadedFile("new.pdf", master()), "replace_id": str(self.revision.id)})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(self.client.patch(self.url, {"fields": layout(), "approve": True}, format="json").status_code, 200)
        response = self.client.post("/api/certificate-templates/", {"master": SimpleUploadedFile("new.pdf", master()), "replace_id": str(self.revision.id)})
        self.assertEqual(response.status_code, 409)

    def test_other_institution_template_cannot_be_replaced(self):
        draft = CertificateTemplateRevision.objects.create(institution=self.other, master=ContentFile(master(), name="other.pdf"))
        response = self.client.post("/api/certificate-templates/", {"master": SimpleUploadedFile("new.pdf", master()), "replace_id": str(draft.id)})
        self.assertEqual(response.status_code, 404)

    def test_full_restart_discards_only_confirmed_unused_drafts(self):
        draft = CertificateTemplateRevision.objects.create(institution=self.institution, master=ContentFile(master(), name="restart.pdf"))
        path, storage = draft.master.name, draft.master.storage
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post("/api/certificate-templates/restart/", {"draft_ids": [str(draft.id)]}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(CertificateTemplateRevision.objects.filter(pk=draft.id).exists())
        self.assertFalse(storage.exists(path))
        self.assertTrue(CertificateTemplateRevision.objects.filter(pk=self.revision.id).exists())

    def test_restart_rejects_protected_or_foreign_drafts_atomically(self):
        other = CertificateTemplateRevision.objects.create(institution=self.other, master=ContentFile(master(), name="foreign.pdf"))
        for target in (self.revision, other):
            response = self.client.post("/api/certificate-templates/restart/", {"draft_ids": [str(target.id)]}, format="json")
            self.assertEqual(response.status_code, 409)
            self.assertTrue(CertificateTemplateRevision.objects.filter(pk=target.id).exists())

    def test_draft_branding_reset_clears_assets_and_fields_keeps_master(self):
        image = BytesIO()
        Image.new("RGB", (50, 50), "white").save(image, "PNG")
        self.revision.logo.save("crest.png", ContentFile(image.getvalue()), save=False)
        self.revision.seal.save("seal.png", ContentFile(image.getvalue()), save=True)
        original = self.revision.master.name
        response = self.client.patch(self.url, {"fields": [], "clear_assets": True}, format="json")
        self.assertEqual(response.status_code, 200)
        self.revision.refresh_from_db()
        self.assertEqual(self.revision.fields, [])
        self.assertFalse(self.revision.logo)
        self.assertFalse(self.revision.seal)
        self.assertEqual(self.revision.master.name, original)

    def test_scan_upload_uses_ocr_service_and_can_be_labelled(self):
        image = BytesIO()
        Image.new("RGB", (600, 400), "white").save(image, "JPEG")
        with patch("institutions.template_views.analyze_pdf", return_value={"ocr_used": True, "pages": [{"page": 1, "text": "scan", "items": []}]}):
            response = self.client.post("/api/certificate-templates/", {"master": SimpleUploadedFile("scan.jpeg", image.getvalue())})
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data["analysis"]["ocr_used"])

    def test_approval_activates_and_freezes_version(self):
        response = self.client.patch(self.url, {"fields": layout(), "approve": True}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(CertificateTemplate.objects.get(institution=self.institution).active_revision_id, self.revision.id)
        self.assertEqual(self.client.patch(self.url, {"fields": []}, format="json").status_code, 409)

    def test_approval_requires_complete_fields_and_assets(self):
        response = self.client.patch(self.url, {"fields": layout()[:1], "approve": True}, format="json")
        self.assertEqual(response.status_code, 400)
        fields = layout() + [{"key": "seal", "page": 1, "x": .4, "y": .7, "width": .1, "height": .1}]
        self.assertEqual(self.client.patch(self.url, {"fields": fields, "approve": True}, format="json").status_code, 400)

    def test_another_institution_cannot_read_or_modify(self):
        self.revision.institution = self.other
        self.revision.save()
        self.assertEqual(self.client.patch(self.url, {"fields": []}, format="json").status_code, 404)
        self.assertEqual(self.client.get(self.url + "page/").status_code, 404)

    def test_sample_and_page_preview(self):
        self.assertEqual(self.client.get(self.url + "sample/").status_code, 200)
        self.assertEqual(self.client.get(self.url + "page/").status_code, 200)
        self.assertEqual(self.client.get(self.url + "page/?page=4").status_code, 400)

    def test_changing_active_template_does_not_change_existing_credential(self):
        first = generate_certificate_pdf(self.cert, include_attestations=False)
        other = CertificateTemplateRevision.objects.create(institution=self.institution, master=ContentFile(master(), name="new.pdf"), fields=[], analysis=self.revision.analysis)
        CertificateTemplate.objects.create(institution=self.institution, active_revision=other)
        self.assertEqual(first, generate_certificate_pdf(self.cert, include_attestations=False))

    def test_extracts_manually_selected_artwork_as_seal(self):
        crop = {"key": "seal", "page": 1, "x": .05, "y": .05, "width": .4, "height": .1}
        response = self.client.patch(self.url, {"fields": layout(), "extract_asset": crop}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.revision.refresh_from_db()
        self.assertTrue(self.revision.seal)
        with self.revision.seal.open("rb") as source, Image.open(source) as image:
            self.assertEqual(image.format, "PNG")

    def test_invalid_sample_prevents_template_activation(self):
        fields = layout()
        fields[0]["width"] = .001
        response = self.client.patch(self.url, {"fields": fields, "approve": True}, format="json")
        self.assertEqual(response.status_code, 400)
        self.revision.refresh_from_db()
        self.assertIsNone(self.revision.approved_at)
        self.assertFalse(CertificateTemplate.objects.filter(active_revision=self.revision).exists())

    def test_new_credential_snapshots_active_version(self):
        self.assertEqual(self.client.patch(self.url, {"fields": layout(), "approve": True}, format="json").status_code, 200)
        department = Department.objects.create(institution=self.institution, name="Computing")
        program = Program.objects.create(department=department, title="Computing certificate", qualification_type="certificate")
        response = self.client.post("/api/certificates/", {"student_name": "New Graduate", "student_email": "new-graduate@example.edu", "graduation_year": 2026, "department_id": str(department.id), "program_id": str(program.id), "flow_type": "system_designed"}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(str(response.data["template_revision"]), str(self.revision.id))

    def test_preflight_rejects_invalid_year_without_generating(self):
        self.cert.graduation_year = 1800
        self.cert.save()
        with patch("institutions.template_views.render_uploaded_template") as render:
            response = self.client.get(f"/api/certificates/{self.cert.id}/preflight/")
        self.assertEqual(response.status_code, 400)
        self.assertIn("Graduation year", response.data["detail"])
        render.assert_not_called()

    def test_catalog_program_cannot_exceed_active_template_limit(self):
        from .catalog_serializers import ProgramSerializer
        from rest_framework.exceptions import ValidationError
        self.revision.fields[1]["max_length"] = 50
        self.revision.save()
        CertificateTemplate.objects.create(institution=self.institution, active_revision=self.revision)
        department = Department.objects.create(institution=self.institution, name="Computing")
        with self.assertRaises(ValidationError):
            ProgramSerializer().validate({"department": department, "title": "Degree " * 12})

    @override_settings(CREDENTIAL_DOCUMENT_ENCRYPTION_KEY="11" * 32)
    def test_submitted_preview_serves_verified_original_review(self):
        output = generate_certificate_pdf(self.cert, include_attestations=False)
        self.cert.doc_hash = document_sha256(output)
        self.cert.ipfs_cid_pdf = "original-review"
        self.cert.save()
        encrypted = encrypt_document(output, self.cert.certificate_id, "certificate-review")
        with patch("certify.ipfs.fetch_file_from_ipfs", return_value=encrypted):
            response = self.client.get(f"/api/certificates/{self.cert.id}/template-preview/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, output)
