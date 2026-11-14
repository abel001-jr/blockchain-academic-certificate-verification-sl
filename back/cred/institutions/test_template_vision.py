import json
from types import SimpleNamespace
from unittest.mock import Mock, patch
import pymupdf as fitz
from django.core.files.base import ContentFile
from django.test import SimpleTestCase, override_settings
from .template_vision import suggest_visual_layout
from .test_template_asset_suggestions import artwork
from .ai_suggestions import AssistanceError


@override_settings(GROQ_API_KEY="test", GROQ_VISION_MODEL="test-vision", GEMINI_API_KEY="")
class VisualLayoutTests(SimpleTestCase):
    def setUp(self):
        with fitz.open() as doc:
            doc.new_page(width=600, height=800)
            self.revision = SimpleNamespace(master=ContentFile(doc.tobytes(), name="master.pdf"), logo=None, seal=None)
        self.analysis = {"pages": [{"page": 1, "width": 600, "height": 800, "lines": []}]}

    def response(self, items):
        return Mock(status_code=200, content=b"{}", json=lambda: {"choices": [{"message": {"content": json.dumps({"items": items})}}]})

    @patch("institutions.template_vision.requests.post")
    def test_uploaded_art_is_sent_and_proportions_preserved_without_saving(self, post):
        post.return_value = self.response([{"key": "logo", "x": .1, "y": .1, "width": .2, "height": .2}])
        result = suggest_visual_layout(self.revision, self.analysis, {"logo": artwork()}, [])
        field = result["items"][0]["field"]
        self.assertAlmostEqual(field["width"]*600/(field["height"]*800), 2)
        self.assertFalse(field["clear"])
        content = post.call_args.kwargs["json"]["messages"][1]["content"]
        self.assertEqual(sum(item["type"] == "image_url" for item in content), 2)
        self.assertIsNone(self.revision.logo)

    @patch("institutions.template_vision.requests.post")
    def test_invalid_overlapping_and_unavailable_asset_proposals_are_skipped(self, post):
        post.return_value = self.response([
            {"key": "student_name", "x": True, "y": .2, "width": .3, "height": .1},
            {"key": "seal", "x": .1, "y": .1, "width": .2, "height": .1},
            {"key": "degree_title", "x": .1, "y": .2, "width": .3, "height": .1}])
        fields = [{"key": "student_name", "page": 1, "x": .1, "y": .2, "width": .3, "height": .1}]
        self.assertEqual(suggest_visual_layout(self.revision, self.analysis, {}, fields)["items"], [])

    @patch("institutions.template_vision.requests.post")
    def test_fixed_text_is_not_covered(self, post):
        self.analysis["pages"][0]["lines"] = [{"text": "Fixed title", "bbox": [60, 80, 240, 160]}]
        post.return_value = self.response([{"key": "student_name", "x": .1, "y": .1, "width": .3, "height": .1}])
        self.assertEqual(suggest_visual_layout(self.revision, self.analysis, {}, [])["items"], [])

    @patch("institutions.template_vision.requests.post")
    def test_provider_failure_has_safe_error(self, post):
        import requests
        post.side_effect = requests.Timeout()
        with self.assertRaises(AssistanceError):
            suggest_visual_layout(self.revision, self.analysis, {}, [])

    @override_settings(GEMINI_API_KEY="test-gemini", GEMINI_MODEL="test-gemini-model")
    @patch("institutions.template_vision.requests.post")
    def test_gemini_fallback_receives_page_and_artwork(self, post):
        items = [{"key": "student_name", "x": .1, "y": .4, "width": .8, "height": .05}]
        post.side_effect = [Mock(status_code=429), Mock(status_code=200, content=b"{}", json=lambda: {
            "candidates": [{"content": {"parts": [{"text": json.dumps({"items": items})}]}}]})]
        result = suggest_visual_layout(self.revision, self.analysis, {"logo": artwork()}, [])
        self.assertEqual(result["items"][0]["field"]["key"], "student_name")
        payload = post.call_args.kwargs["json"]
        self.assertEqual(sum("inlineData" in part for part in payload["contents"][0]["parts"]), 2)
        self.assertIn("test-gemini-model", post.call_args.args[0])

    @patch("institutions.template_vision.requests.post")
    def test_invalid_json_is_reported_as_unavailable(self, post):
        post.return_value = Mock(status_code=200, content=b"{}", json=lambda: {"choices": [{"message": {"content": "{"}}]})
        with self.assertRaises(AssistanceError):
            suggest_visual_layout(self.revision, self.analysis, {}, [])

    @patch("institutions.template_vision.requests.post")
    def test_full_design_keeps_multiple_editable_wording_boxes(self, post):
        post.return_value = self.response([
            {"key": "static_text", "text": "Certificate of Achievement", "font_size": 24, "x": .1, "y": .1, "width": .8, "height": .05},
            {"key": "static_text", "text": "This certifies that", "x": .1, "y": .2, "width": .8, "height": .05},
            {"key": "student_name", "x": .1, "y": .3, "width": .8, "height": .05}])
        result = suggest_visual_layout(self.revision, self.analysis, {}, [], full_design=True)
        self.assertEqual(len(result["items"]), 3)
        self.assertEqual(result["items"][0]["field"]["text"], "Certificate of Achievement")
        self.assertEqual(result["items"][0]["field"]["font_size"], 24)
        self.assertFalse(result["items"][0]["field"]["clear"])

    @patch("institutions.template_vision.requests.post")
    def test_regular_discovery_does_not_generate_wording(self, post):
        post.return_value = self.response([{"key": "static_text", "text": "New wording", "x": .1, "y": .1, "width": .8, "height": .05}])
        self.assertEqual(suggest_visual_layout(self.revision, self.analysis, {}, [])["items"], [])
