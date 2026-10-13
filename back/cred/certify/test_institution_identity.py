from io import BytesIO
from unittest import TestCase
from PIL import Image, ImageDraw
from .institution_identity import compare_reference

class IdentityComparisonTests(TestCase):
    def image(self, colour="navy"):
        image = Image.new("RGB", (100, 100), "white")
        ImageDraw.Draw(image).rectangle((20, 20, 80, 80), fill=colour)
        return image

    def data(self, image):
        stream = BytesIO()
        image.save(stream, format="PNG")
        return stream.getvalue()

    def test_matching_reference_reports_page(self):
        image = self.image()
        self.assertEqual(compare_reference(self.data(image), [(3, image)])[1], 3)

    def test_different_colour_does_not_match(self):
        self.assertIsNone(compare_reference(self.data(self.image()), [(1, self.image("red"))]))

    def test_no_candidate_requires_manual_review(self):
        self.assertIsNone(compare_reference(self.data(self.image()), []))

    def test_document_regions_include_actual_page_pixels(self):
        import fitz
        from .institution_identity import document_regions
        document = fitz.open()
        page = document.new_page()
        page.draw_circle((60, 60), 25, color=(1, 0, 0))
        page.insert_text((60, 700), "Registrar")
        regions = document_regions(document)
        self.assertTrue(regions["logo"]["document_image"].startswith("data:image/png;base64,"))
        self.assertEqual(regions["seal"]["document_page"], 1)
        self.assertIn("Registrar signature", regions)
        document.close()

    def test_image_refresh_preserves_inspection_decision(self):
        from types import SimpleNamespace
        from unittest.mock import Mock, patch
        from django.core.files.uploadedfile import SimpleUploadedFile
        from .document_review_views import DocumentReviewImagesView
        from .encrypted_documents import document_sha256
        review = SimpleNamespace(summary={}, document_sha256=document_sha256(b"pdf"), state="resolved", resolution_note="Confirmed", save=Mock())
        request = SimpleNamespace(user=SimpleNamespace(institution="institution"), FILES={"document_file": SimpleUploadedFile("test.pdf", b"pdf")})
        with patch("certify.document_review_views.get_object_or_404", side_effect=[SimpleNamespace(), review]), patch("certify.document_review_views.institutional_identity", return_value={"items": []}), patch("certify.document_review_views._serialize_review", return_value={}):
            response = DocumentReviewImagesView().post(request, "id", "transcript")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(review.state, "resolved")
        self.assertEqual(review.resolution_note, "Confirmed")
        review.save.assert_called_once_with(update_fields=["summary"])

    def test_image_refresh_rejects_different_file(self):
        from types import SimpleNamespace
        from unittest.mock import Mock, patch
        from django.core.files.uploadedfile import SimpleUploadedFile
        from .document_review_views import DocumentReviewImagesView
        review = SimpleNamespace(summary={}, document_sha256="wrong", save=Mock())
        request = SimpleNamespace(user=SimpleNamespace(institution="institution"), FILES={"document_file": SimpleUploadedFile("test.pdf", b"pdf")})
        with patch("certify.document_review_views.get_object_or_404", side_effect=[SimpleNamespace(), review]):
            response = DocumentReviewImagesView().post(request, "id", "transcript")
        self.assertEqual(response.status_code, 409)
        review.save.assert_not_called()
