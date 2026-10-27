import json
from unittest.mock import patch, Mock
from django.test import SimpleTestCase, override_settings
from .layered_extraction import api_fields, extract_with_layers
from .document_analysis import DocumentAnalysisError


PAGES = [{"page": 1, "text": "Eren Yeagar Graduated in 2025", "lines": [{"text": "Eren Yeagar"}, {"text": "Graduated in 2025"}]}]


@override_settings(GROQ_API_KEY="test-key", GROQ_MODEL="test-model")
class LayeredExtractionTests(SimpleTestCase):
    @patch("certify.layered_extraction.requests.post")
    @patch("certify.layered_extraction.extract_fields", return_value={})
    @patch("certify.layered_extraction.analyze_pdf")
    def test_second_ocr_evidence_reaches_comparison_without_duplicate_pages(self, analyze, extract, post):
        from .field_extraction import compare_fields
        analyze.side_effect = [
            {"pages": [{"page": 1, "text": "University", "lines": [], "items": []}], "page_count": 1, "ocr_used": False},
            {"pages": [{"page": 1, "method": "ocr", "text": "Eren Yeagar", "lines": [], "items": []}], "page_count": 1, "ocr_used": True},
        ]
        analysis, fields, _ = extract_with_layers(b"pdf")
        self.assertEqual(len(analysis["pages"]), 1)
        self.assertIn("University", analysis["pages"][0]["text"])
        result = compare_fields({"student_name": "Eren Yeagar"}, fields, fields=("student_name",), pages=analysis["pages"])
        self.assertEqual(result[0]["status"], "verbatim_match")
        post.assert_not_called()

    def test_name_value_uses_position_instead_of_next_label(self):
        from .field_extraction import extract_fields
        page = {"lines": [
            {"text": "STUDENT FULL NAME", "bbox": [36, 80, 110, 89]},
            {"text": "STUDENT IDENTIFICATION", "bbox": [36, 98, 125, 108]},
            {"text": "Tobio Kageyama", "bbox": [172, 77, 245, 90]},
            {"text": "SAMPLE-TE-001", "bbox": [172, 96, 245, 109]},
        ]}
        self.assertEqual(extract_fields([page])["student_name"], "Tobio Kageyama")

    @patch("certify.layered_extraction.api_fields", return_value={"student_name": "STUDENT IDENTIFICATION"})
    @patch("certify.layered_extraction.extract_fields", return_value={"student_name": "Tobio Kageyama", "degree_title": "BSc", "institution": "Central University", "graduation_year": "2026"})
    @patch("certify.layered_extraction.analyze_pdf")
    def test_local_reading_preserves_labelled_name_without_api(self, analyze, extract, interpret):
        analyze.return_value = {"pages": PAGES, "page_count": 1, "ocr_used": False}
        _, fields, _ = extract_with_layers(b"pdf")
        self.assertEqual(fields["student_name"], "Tobio Kageyama")
        interpret.assert_not_called()

    @patch("certify.layered_extraction.requests.post")
    def test_api_accepts_only_values_grounded_in_document_lines(self, post):
        post.return_value = Mock(content=b"small", json=lambda: {"choices": [{"message": {"content": json.dumps({"fields": [
            {"key": "student_name", "line_id": 0, "value": "Eren Yeagar"},
            {"key": "graduation_year", "line_id": 1, "value": "2025"},
            {"key": "institution", "line_id": 0, "value": "Invented University"},
        ]})}}]})
        result = api_fields(PAGES)
        self.assertEqual(result, {"student_name": "Eren Yeagar", "graduation_year": "2025"})
        payload = post.call_args.kwargs["json"]
        self.assertEqual(json.loads(payload["messages"][1]["content"])[0]["text"], "Eren Yeagar")

    @patch("certify.layered_extraction.api_fields", return_value={"student_name": "Eren Yeagar", "graduation_year": "2025"})
    @patch("certify.layered_extraction.extract_fields", return_value={})
    @patch("certify.layered_extraction.analyze_pdf")
    def test_local_missing_fields_trigger_ocr_without_api(self, analyze, extract, interpret):
        analyze.return_value = {"pages": PAGES, "page_count": 1, "ocr_used": False}
        analysis, fields, layers = extract_with_layers(b"pdf")
        self.assertTrue(analyze.call_args_list[1].kwargs["force_ocr"])
        self.assertTrue(analysis["ocr_used"])
        self.assertEqual(fields, {})
        interpret.assert_not_called()
        self.assertEqual([layer["status"] for layer in layers], ["used", "used"])

    @override_settings(GROQ_API_KEY="")
    @patch("certify.layered_extraction.extract_fields", return_value={})
    @patch("certify.layered_extraction.analyze_pdf")
    def test_unavailable_layers_are_reported_without_losing_local_reading(self, analyze, extract):
        analyze.side_effect = [{"pages": PAGES, "page_count": 1, "ocr_used": False}, DocumentAnalysisError("Tesseract unavailable")]
        analysis, fields, layers = extract_with_layers(b"pdf")
        self.assertEqual(analysis["page_count"], 1)
        self.assertEqual([layer["status"] for layer in layers], ["used", "unavailable"])

    @patch("certify.layered_extraction.api_fields", return_value={"student_name": "Eren Yeagar"})
    @patch("certify.layered_extraction.extract_fields")
    @patch("certify.layered_extraction.analyze_pdf")
    def test_deep_uses_groq_without_local_heuristics_or_second_ocr(self, analyze, extract, interpret):
        analyze.return_value = {"pages": PAGES, "page_count": 1, "ocr_used": False}
        _, fields, layers = extract_with_layers(b"pdf", reading_mode="deep")
        analyze.assert_called_once_with(b"pdf")
        extract.assert_not_called()
        interpret.assert_called_once_with(PAGES)
        self.assertEqual(fields, {"student_name": "Eren Yeagar"})
        self.assertEqual(layers[-1]["name"], "Groq API")

    @override_settings(GROQ_API_KEY="")
    @patch("certify.layered_extraction.analyze_pdf")
    def test_deep_requires_key_before_processing(self, analyze):
        with self.assertRaisesMessage(DocumentAnalysisError, "GROQ_API_KEY"):
            extract_with_layers(b"pdf", reading_mode="deep")
        analyze.assert_not_called()

    @patch("certify.layered_extraction.api_fields", side_effect=ValueError("bad response"))
    @patch("certify.layered_extraction.analyze_pdf")
    def test_deep_failure_is_explicit(self, analyze, interpret):
        analyze.return_value = {"pages": PAGES, "page_count": 1, "ocr_used": False}
        with self.assertRaisesMessage(DocumentAnalysisError, "Groq Deep reading is unavailable"):
            extract_with_layers(b"pdf", reading_mode="deep")

    def test_reading_mode_validation(self):
        from .document_review_views import DocumentAnalyzeSerializer
        from django.core.files.uploadedfile import SimpleUploadedFile
        for mode, valid in (("local", True), ("deep", True), ("ollama", False)):
            serializer = DocumentAnalyzeSerializer(data={"document_file": SimpleUploadedFile("doc.pdf", b"pdf"), "reading_mode": mode})
            self.assertEqual(serializer.is_valid(), valid)

    def test_endpoint_passes_mode_and_records_provenance(self):
        from contextlib import ExitStack
        from types import SimpleNamespace
        from django.core.files.uploadedfile import SimpleUploadedFile
        from .document_review_views import DocumentAnalyzeView
        cert = SimpleNamespace(status="draft", certificate_id="CR-TEST", id="id")
        analysis = {"pages": PAGES, "page_count": 1, "ocr_used": False}
        for mode in ("local", "deep"):
            with self.subTest(mode=mode), ExitStack() as stack:
                def mock(name, **kwargs):
                    return stack.enter_context(patch(f"certify.document_review_views.{name}", **kwargs))
                mock("get_object_or_404", return_value=cert)
                mock("require_signatures")
                extract = mock("extract_with_layers", return_value=(analysis, {}, []))
                mock("_expected_from_upload", return_value={})
                identity = mock("institutional_identity", return_value={})
                save = mock("DocumentReview.objects.update_or_create", return_value=(Mock(), True))
                mock("log_action")
                mock("_serialize_review", return_value={})
                request = SimpleNamespace(user=SimpleNamespace(institution="institution"), data={
                    "document_file": SimpleUploadedFile("doc.pdf", b"pdf"), "reading_mode": mode,
                })
                response = DocumentAnalyzeView().post(request, "id")
                self.assertEqual(response.status_code, 201)
                extract.assert_called_once_with(b"pdf", reading_mode=mode)
                self.assertEqual(identity.call_args.kwargs["use_external_ai"], mode == "deep")
                self.assertEqual(save.call_args.kwargs["defaults"]["summary"]["reading_mode"], mode)
