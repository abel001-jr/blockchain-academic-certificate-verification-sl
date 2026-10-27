from django.test import SimpleTestCase
from .template_mode import detect_design_mode

class TemplateModeTests(SimpleTestCase):
    def test_existing_text_detected_from_live_text_or_ocr(self):
        for method in ("text_layer", "ocr"):
            result = detect_design_mode({"pages": [{"method": method, "lines": [{"text": "This certifies that the graduate has completed the prescribed course of study"}]}]})
            self.assertEqual(result["recommended"], "existing")

    def test_empty_text_is_advisory_not_proof_of_blank_design(self):
        result = detect_design_mode({"pages": [{"text": ""}]})
        self.assertEqual(result["recommended"], "blank")
        self.assertIn("unreadable", result["detail"])

    def test_short_signature_captions_identify_existing_certificate(self):
        result = detect_design_mode({"pages": [{"method": "text_layer", "text": "Registrar Chancellor"}]})
        self.assertEqual(result["recommended"], "existing")
        self.assertEqual(result["form"], "prewritten_certificate")

    def test_placeholders_identify_template(self):
        result = detect_design_mode({"pages": [{"method": "text_layer", "text": "[STUDENT NAME]"}]})
        self.assertEqual(result["form"], "placeholder_template")

    def test_low_confidence_ocr_is_not_assumed_blank(self):
        result = detect_design_mode({"pages": [{"method": "ocr", "lines": [{"text": "unreadable", "confidence": 20}]}]})
        self.assertEqual(result["recommended"], "existing")
        self.assertEqual(result["form"], "uncertain")
