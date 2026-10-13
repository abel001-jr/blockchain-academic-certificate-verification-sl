import json
from unittest.mock import patch, Mock
from django.test import SimpleTestCase, override_settings
from .layered_extraction import api_fields, extract_with_layers
from .document_analysis import DocumentAnalysisError


PAGES = [{"page": 1, "text": "Eren Yeagar Graduated in 2025", "lines": [{"text": "Eren Yeagar"}, {"text": "Graduated in 2025"}]}]


@override_settings(GROQ_API_KEY="test-key", GROQ_MODEL="test-model")
class LayeredExtractionTests(SimpleTestCase):
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
    def test_missing_fields_trigger_ocr_and_api(self, analyze, extract, interpret):
        analyze.return_value = {"pages": PAGES, "page_count": 1, "ocr_used": False}
        analysis, fields, layers = extract_with_layers(b"pdf")
        self.assertTrue(analyze.call_args_list[1].kwargs["force_ocr"])
        self.assertTrue(analysis["ocr_used"])
        self.assertEqual(fields["graduation_year"], "2025")
        self.assertEqual([layer["status"] for layer in layers], ["used", "used", "used"])

    @override_settings(GROQ_API_KEY="")
    @patch("certify.layered_extraction.extract_fields", return_value={})
    @patch("certify.layered_extraction.analyze_pdf")
    def test_unavailable_layers_are_reported_without_losing_local_reading(self, analyze, extract):
        analyze.side_effect = [{"pages": PAGES, "page_count": 1, "ocr_used": False}, DocumentAnalysisError("Tesseract unavailable")]
        analysis, fields, layers = extract_with_layers(b"pdf")
        self.assertEqual(analysis["page_count"], 1)
        self.assertEqual([layer["status"] for layer in layers], ["used", "unavailable", "not_configured"])
