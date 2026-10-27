from io import BytesIO
from unittest import TestCase
from PIL import Image, ImageDraw
from .institution_identity import compare_reference

class IdentityComparisonTests(TestCase):
    def test_local_artwork_comparison_never_calls_external_ai(self):
        import pymupdf as fitz
        from types import SimpleNamespace
        from unittest.mock import Mock, MagicMock, patch
        from .institution_identity import institutional_identity
        artwork = self.data(self.image())
        asset = Mock(url="/media/logo.png")
        asset.open.side_effect = lambda mode: BytesIO(artwork)
        institution = SimpleNamespace(reference_logo=asset, reference_seal=None, users=MagicMock())
        cert = SimpleNamespace(institution=institution, template_revision=None,
                               registrar_signature_image=None, vc_signature_image=None,
                               chancellor_signature_image=None)
        with fitz.open() as document:
            document.new_page().insert_image(fitz.Rect(40, 40, 140, 140), stream=artwork)
            pdf = document.tobytes()
        with patch("certify.institution_identity.compare_images") as external:
            result = institutional_identity(pdf, cert)
            external.assert_not_called()
            logo = result["items"][0]
            self.assertGreaterEqual(logo["similarity_score"], 90)
            self.assertEqual(logo["status"], "likely_visual_match")
        with patch("certify.institution_identity.compare_images", return_value={"status": "used"}) as external:
            result = institutional_identity(pdf, cert, use_external_ai=True)
            external.assert_called_once()
            self.assertEqual(result["items"][0]["vision"]["status"], "used")

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
        import pymupdf as fitz
        from .institution_identity import document_regions
        document = fitz.open()
        page = document.new_page()
        page.draw_circle((60, 60), 25, color=(1, 0, 0))
        page.insert_text((60, 700), "Registrar")
        regions = document_regions(document)
        self.assertNotIn("logo", regions)
        self.assertNotIn("seal", regions)
        self.assertIn("Registrar signature", regions)
        document.close()

    def test_identity_artwork_found_at_center_and_bottom_across_pages(self):
        import pymupdf as fitz
        from .institution_identity import locate_identity_image
        document = fitz.open()
        page = document.new_page()
        page.draw_rect(fitz.Rect(15, 15, 580, 820), color=(1, 0, 0))
        logo = self.data(self.image("navy"))
        seal_image = Image.new("RGB", (100, 100), "white")
        ImageDraw.Draw(seal_image).ellipse((10, 10, 90, 90), outline="black", width=6)
        seal = self.data(seal_image)
        page.insert_image(fitz.Rect(260, 30, 330, 100), stream=logo)
        page = document.new_page()
        page.insert_image(fitz.Rect(470, 680, 550, 760), stream=seal)
        self.assertEqual(locate_identity_image(document, logo)["document_page"], 1)
        self.assertEqual(locate_identity_image(document, seal)["document_page"], 2)
        document.close()

    def test_page_border_is_not_scored_as_logo_or_seal(self):
        import pymupdf as fitz
        from .institution_identity import locate_identity_image
        document = fitz.open()
        page = document.new_page()
        page.draw_rect(fitz.Rect(15, 15, 580, 820), color=(1, 0, 0))
        self.assertEqual(locate_identity_image(document, self.data(self.image())), {})
        document.close()

    def test_all_officer_signatures_found_on_second_page(self):
        import pymupdf as fitz
        from .institution_identity import document_regions, compare_crop
        import base64
        document = fitz.open()
        document.new_page().insert_text((40, 40), "Transcript page one")
        page = document.new_page()
        signature = Image.new("RGB", (180, 40), "white")
        ImageDraw.Draw(signature).line([(5, 30), (40, 5), (80, 30), (130, 7), (170, 25)], fill="navy", width=4)
        for x, title in [(35, "Registrar"), (220, "Vice-Chancellor"), (405, "Chancellor")]:
            page.insert_image(fitz.Rect(x, 700, x + 150, 734), stream=self.data(signature))
            page.draw_line((x, 740), (x + 150, 740))
            page.insert_text((x, 753), "Printed Officer Name", fontsize=8)
            page.insert_text((x, 765), title, fontsize=8)
        regions = document_regions(document)
        for title in ["Registrar", "Vice-Chancellor", "Chancellor"]:
            region = regions[title + " signature"]
            self.assertEqual(region["document_page"], 2)
            crop = Image.open(BytesIO(base64.b64decode(region["comparison_image"].split(",", 1)[1])))
            self.assertGreaterEqual(compare_crop(self.data(signature), crop), 90)
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

    def test_shape_comparison_tolerates_blur_and_resize(self):
        from PIL import ImageFilter
        from .institution_identity import compare_crop
        reference = Image.new("RGB", (200, 200), "white")
        draw = ImageDraw.Draw(reference)
        draw.ellipse((20, 20, 180, 180), outline="navy", width=8)
        draw.polygon([(60, 130), (100, 45), (140, 130)], fill="navy")
        scan = reference.resize((120, 120)).filter(ImageFilter.GaussianBlur(1))
        self.assertGreaterEqual(compare_crop(self.data(reference), scan), 90)
        self.assertLess(compare_crop(self.data(reference), self.image("red")), 65)

    def test_shape_comparison_preserves_aspect_ratio_and_rotation(self):
        from .institution_identity import compare_crop
        reference = Image.new("RGB", (200, 200), "white")
        draw = ImageDraw.Draw(reference)
        draw.ellipse((20, 20, 180, 180), outline="navy", width=8)
        draw.line((55, 130, 100, 50, 145, 130), fill="navy", width=10)
        rotated = reference.rotate(5, fillcolor="white")
        self.assertGreaterEqual(compare_crop(self.data(reference), rotated), 90)

    def test_signature_comparison_ignores_nearby_text_and_line(self):
        import base64
        import pymupdf as fitz
        from .institution_identity import document_regions, compare_crop
        signature = Image.new("RGB", (220, 60), "white")
        draw = ImageDraw.Draw(signature)
        draw.line([(10, 40), (40, 10), (65, 45), (90, 18), (125, 35), (180, 10), (210, 30)], fill="navy", width=5)
        document = fitz.open()
        page = document.new_page()
        page.insert_text((50, 630), "GPA and unrelated text")
        page.insert_image(fitz.Rect(70, 650, 220, 691), stream=self.data(signature))
        page.draw_line((60, 699), (230, 699))
        page.insert_text((110, 715), "Registrar")
        regions = document_regions(document)
        region = regions["Registrar signature"]
        self.assertIn("comparison_image", region)
        crop = Image.open(BytesIO(base64.b64decode(region["comparison_image"].split(",", 1)[1])))
        self.assertGreaterEqual(compare_crop(self.data(signature), crop), 90)
        self.assertLess(compare_crop(self.data(self.image()), crop), 65)
        self.assertNotEqual(region["document_image"], region["comparison_image"])
        document.close()

    def test_vector_signature_is_compared_without_caption_or_rule(self):
        import base64
        import pymupdf as fitz
        from .institution_identity import document_regions, compare_crop
        document = fitz.open()
        page = document.new_page()
        page.insert_text((75, 660), "GPA: unrelated text")
        points = [(75, 688), (95, 673), (112, 695), (135, 678), (155, 689), (180, 672), (200, 685)]
        shape = page.new_shape()
        shape.draw_polyline(points)
        shape.finish(color=(0, .1, .3), width=2)
        shape.commit()
        reference = page.get_pixmap(matrix=fitz.Matrix(3, 3), clip=fitz.Rect(70, 669, 205, 698), alpha=False)
        page.draw_line((65, 702), (220, 702))
        page.insert_text((105, 718), "Registrar")
        region = document_regions(document)["Registrar signature"]
        self.assertIn("comparison_image", region)
        self.assertIn("Rendered stroke", region["signature_extraction"])
        crop = Image.open(BytesIO(base64.b64decode(region["comparison_image"].split(",", 1)[1])))
        self.assertGreaterEqual(compare_crop(reference.tobytes("png"), crop), 90)
        document.close()

    def test_officer_transcript_preview_verifies_hash(self):
        from types import SimpleNamespace
        from unittest.mock import patch
        from .document_review_views import OfficerCredentialDocumentView
        cert = SimpleNamespace(ipfs_cid_transcript="transcript-cid", transcript_hash="expected-hash", certificate_id="CR-TEST")
        request = SimpleNamespace(user=SimpleNamespace(role="super_admin"), query_params={})
        with patch("certify.document_review_views.get_object_or_404", return_value=cert), patch("certify.encrypted_documents.fetch_verified_document", return_value=b"pdf") as fetch:
            response = OfficerCredentialDocumentView().get(request, "id", "transcript")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Cache-Control"], "private, no-store")
        fetch.assert_called_once_with("transcript-cid", "CR-TEST", "transcript", "expected-hash")

    def test_officer_transcript_renders_inline_page(self):
        import pymupdf
        from types import SimpleNamespace
        from unittest.mock import patch
        from .document_review_views import OfficerCredentialDocumentView
        pdf = pymupdf.open()
        pdf.new_page().insert_text((40, 40), "Academic transcript")
        document = pdf.tobytes()
        pdf.close()
        cert = SimpleNamespace(ipfs_cid_transcript="cid", transcript_hash="hash", certificate_id="CR-TEST")
        request = SimpleNamespace(user=SimpleNamespace(role="super_admin"), query_params={"page": "1"})
        with patch("certify.document_review_views.get_object_or_404", return_value=cert), patch("certify.encrypted_documents.fetch_verified_document", return_value=document):
            response = OfficerCredentialDocumentView().get(request, "id", "transcript")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["page_count"], 1)
        self.assertTrue(response.data["image"].startswith("data:image/png;base64,"))
