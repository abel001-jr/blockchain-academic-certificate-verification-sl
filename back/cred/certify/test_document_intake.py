from io import BytesIO

import fitz
from PIL import Image
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from accounts.models import Role, User
from institutions.models import Institution
from .document_intake import prepare_document
from .encrypted_documents import document_sha256
from .models import Certificate, CertificateStatus, FlowType


def image_file(name="scan.jpeg", color="white"):
    buffer = BytesIO()
    Image.new("RGB", (600, 900), color).save(buffer, "JPEG")
    return SimpleUploadedFile(name, buffer.getvalue(), content_type="image/jpeg")


def pdf_file(text="Student Name: Ada Lovelace"):
    with fitz.open() as doc:
        page = doc.new_page()
        page.insert_text((72, 72), text)
        return SimpleUploadedFile("credential.pdf", doc.tobytes(), content_type="application/pdf")


class DocumentIntakeTests(SimpleTestCase):
    def test_single_pdf_preserves_reviewed_bytes(self):
        source = pdf_file()
        original = source.read()
        source.seek(0)
        self.assertEqual(prepare_document([source]), original)

    def test_images_merge_in_selected_order(self):
        output = prepare_document([image_file(color="red"), image_file(color="blue")])
        with fitz.open(stream=output, filetype="pdf") as doc:
            self.assertEqual(doc.page_count, 2)
            first = doc[0].get_pixmap().pixel(20, 20)
            second = doc[1].get_pixmap().pixel(20, 20)
            self.assertGreater(first[0], first[2])
            self.assertGreater(second[2], second[0])

    def test_rotation_changes_hash_and_only_selected_page(self):
        output = prepare_document([image_file(), image_file()])
        rotated = prepare_document([SimpleUploadedFile("pages.pdf", output)], 90, 2)
        self.assertNotEqual(document_sha256(output), document_sha256(rotated))
        with fitz.open(stream=rotated, filetype="pdf") as doc:
            self.assertEqual(doc[0].rotation, 0)
            self.assertEqual(doc[1].rotation, 90)

    def test_missing_rotation_page_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "page to rotate"):
            prepare_document([image_file()], 90, 2)

    def test_corrupt_or_unsupported_file_is_rejected(self):
        for name in ("bad.jpeg", "bad.pdf", "bad.txt"):
            with self.subTest(name=name), self.assertRaises(ValueError):
                prepare_document([SimpleUploadedFile(name, b"invalid")])

    def test_page_and_size_limits(self):
        with self.assertRaises(ValueError):
            prepare_document([])
        with self.assertRaises(ValueError):
            prepare_document([image_file()] * 51)
        source = pdf_file()
        source.size = 21 * 1024 * 1024
        with self.assertRaisesRegex(ValueError, "20 MB"):
            prepare_document([source])

    def test_mixed_pdf_and_scan_retains_pdf_text(self):
        output = prepare_document([pdf_file(), image_file()])
        with fitz.open(stream=output, filetype="pdf") as doc:
            self.assertEqual(doc.page_count, 2)
            self.assertIn("Ada Lovelace", doc[0].get_text())


class DocumentIntakeEndpointTests(TestCase):
    def setUp(self):
        self.institution = Institution.objects.create(institution_id="INTAKE", name="University")
        self.user = User.objects.create_user(email="intake@example.edu", password="test-password", role=Role.REGISTRAR, institution=self.institution)
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.cert = Certificate.objects.create(certificate_id="INTAKE-001", institution=self.institution, student_name="Ada", student_email="ada@example.edu", degree_title="BSc", graduation_year=2026, flow_type=FlowType.FULL_UPLOAD)
        self.url = f"/api/certificates/{self.cert.id}/prepare-document/"

    def test_preparation_does_not_store_or_anchor(self):
        response = self.client.post(self.url, {"pages": [image_file(), image_file()]}, format="multipart")
        self.assertEqual(response.status_code, 200)
        with fitz.open(stream=response.content, filetype="pdf") as doc:
            self.assertEqual(doc.page_count, 2)
        self.cert.refresh_from_db()
        self.assertFalse(self.cert.document_file)
        self.assertFalse(self.cert.doc_hash)
        self.assertFalse(self.cert.ipfs_cid_pdf)

    def test_submitted_credentials_cannot_be_changed(self):
        self.cert.status = CertificateStatus.PENDING_VC
        self.cert.save()
        self.assertEqual(self.client.post(self.url, {"pages": image_file()}).status_code, 400)

    def test_other_institution_cannot_prepare(self):
        self.cert.institution = Institution.objects.create(institution_id="OTHER", name="Other")
        self.cert.save()
        self.assertEqual(self.client.post(self.url, {"pages": image_file()}).status_code, 404)

    def test_invalid_rotation_returns_actionable_error(self):
        response = self.client.post(self.url, {"pages": image_file(), "rotation": "45"})
        self.assertEqual(response.status_code, 400)
        self.assertIn("Rotation", response.data["detail"])
