from django.test import SimpleTestCase
from .template_suggestions import suggest_fields
from .template_rendering import validate_layout


class TemplateSuggestionTests(SimpleTestCase):
    def analysis(self, text="[GRADUATE FULL NAME]", method="text_layer", **extras):
        return {"pages": [{"page": 1, "width": 600, "height": 400, "method": method,
            "lines": [{"text": text, "bbox": [100, 100, 400, 130], "font": "DejaVuSerif-Bold", "font_size": 24, "color": "#7D3C3C", **extras}]}]}

    def test_name_coordinates_formatting_and_supported_fallback(self):
        analysis = self.analysis()
        item = suggest_fields(analysis)["items"][0]
        field = item["field"]
        self.assertEqual(field["key"], "student_name")
        self.assertEqual(field["font"], "Times-Bold")
        self.assertEqual(field["color"], "#7D3C3C")
        self.assertTrue(field["clear"])
        self.assertLess(field["x"], 100/600)
        validate_layout([field], analysis)

    def test_full_date_never_becomes_graduation_year(self):
        result = suggest_fields(self.analysis("on [DAY] [MONTH] [YEAR]."))
        self.assertEqual(result["items"], [])
        self.assertTrue(result["warnings"])

    def test_embedded_placeholder_does_not_erase_fixed_sentence(self):
        result = suggest_fields(self.analysis("Given under the authority of [INSTITUTION NAME]"))
        self.assertEqual(result["items"], [])
        self.assertIn("fixed wording", result["warnings"][0])

    def test_low_confidence_ocr_is_not_applied(self):
        self.assertEqual(suggest_fields(self.analysis(method="ocr", confidence=40))["items"], [])
        self.assertEqual(len(suggest_fields(self.analysis(method="ocr", confidence=95))["items"]), 1)

    def test_programme_not_silently_mapped_to_department(self):
        self.assertEqual(suggest_fields(self.analysis("[PROGRAMME / FIELD OF STUDY]"))["items"], [])

    def test_blank_master_has_actionable_message(self):
        result = suggest_fields(self.analysis("Fixed institutional wording"))
        self.assertEqual(result["items"], [])
        self.assertIn("manual placement", result["warnings"][0])
