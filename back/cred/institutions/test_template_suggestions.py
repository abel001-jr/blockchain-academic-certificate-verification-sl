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

    def test_unlabelled_certificate_gaps_and_signature_captions(self):
        analysis = {"pages": [{"page": 1, "width": 1000, "height": 800, "method": "text_layer", "lines": [
            {"text": text, "bbox": box} for text, box in [
                ("Upon the recommendation of the Senate", [300, 150, 700, 175]),
                ("having successfully completed the prescribed course of study", [220, 280, 780, 300]),
                ("and passed the examinations, is hereby awarded the degree of", [200, 310, 800, 330]),
                ("with all the rights, privileges and honours", [250, 500, 750, 520]),
                ("Registrar", [120, 730, 220, 750]),
                ("Vice-Chancellor", [430, 730, 570, 750]),
                ("Chancellor", [780, 730, 880, 750]),
            ]]}]}
        result = suggest_fields(analysis)
        fields = {item["field"]["key"]: item["field"] for item in result["items"]}
        self.assertEqual(set(fields), {"student_name", "degree_title", "registrar_signature", "vc_signature", "chancellor_signature"})
        self.assertTrue(all(item["method"] == "layout" for item in result["items"]))
        self.assertTrue(all(not field["clear"] for field in fields.values()))
        self.assertGreater(fields["student_name"]["y"] * 800, 175)
        self.assertLess((fields["student_name"]["y"] + fields["student_name"]["height"]) * 800, 280)
        validate_layout(list(fields.values()), analysis)

    def test_occupied_or_low_confidence_gap_is_not_suggested(self):
        analysis = self.analysis("Upon the recommendation of the Senate")
        analysis["pages"][0]["lines"].append({"text": "Actual student name", "bbox": [100, 135, 400, 150]})
        self.assertEqual(suggest_fields(analysis)["items"], [])
        analysis = self.analysis("Registrar", method="ocr", confidence=20)
        self.assertEqual(suggest_fields(analysis)["items"], [])

    def test_signature_uses_signing_rule_width_and_stays_above_it(self):
        analysis = self.analysis("Vice-Chancellor")
        analysis["pages"][0]["horizontal_rules"] = [[80, 90, 420, 90], [0, 80, 600, 80]]
        field = suggest_fields(analysis)["items"][0]["field"]
        self.assertEqual(field["key"], "vc_signature")
        # Ignore the page-wide decorative rule; the signing rule is narrower.
        # Use a typical signing rule under 45% of page width.
        analysis["pages"][0]["horizontal_rules"] = [[150, 90, 350, 90]]
        field = suggest_fields(analysis)["items"][0]["field"]
        self.assertAlmostEqual(field["x"], 150/600)
        self.assertAlmostEqual(field["width"], 200/600)
        self.assertLess((field["y"]+field["height"])*400, 90)

    def test_all_checked_fields_are_reported_and_matching_values_are_located(self):
        analysis = self.analysis("Actual University")
        result = suggest_fields(analysis, expected_values={"institution_name": ["Actual University"]})
        self.assertEqual(result["items"][0]["field"]["key"], "institution_name")
        self.assertEqual(result["items"][0]["method"], "matched_value")
        self.assertNotIn("institution_name", result["missing_fields"])
        self.assertIn("graduation_year", result["missing_fields"])
        self.assertTrue({"student_name", "degree_title", "institution_name", "graduation_year"}.issubset(result["checked_fields"]))

    def test_explicit_year_label_places_value_beside_label(self):
        analysis = self.analysis("Graduation year")
        field = suggest_fields(analysis)["items"][0]["field"]
        self.assertEqual(field["key"], "graduation_year")
        self.assertGreater(field["x"] * 600, 400)
        self.assertFalse(field["clear"])

    def test_merged_ocr_officer_line_recovers_three_signature_positions(self):
        analysis = {"pages": [{"page": 1, "width": 842, "height": 595, "method": "ocr",
            "lines": [{"text": "Registrar Vice-Chancellor Chancellor", "bbox": [151, 526, 696, 540], "confidence": 96}],
            "items": [
                {"text": "Registrar", "bbox": [151, 526, 203, 540], "confidence": 96},
                {"text": "Vice-Chancellor", "bbox": [377, 526, 466, 540], "confidence": 96},
                {"text": "Chancellor", "bbox": [635, 528, 696, 537], "confidence": 96},
            ]}]}
        result = suggest_fields(analysis)
        fields = {item["field"]["key"]: item["field"] for item in result["items"]}
        self.assertEqual(set(fields), {"registrar_signature", "vc_signature", "chancellor_signature"})
        self.assertLess(fields["registrar_signature"]["x"], fields["vc_signature"]["x"])
        self.assertLess(fields["vc_signature"]["x"], fields["chancellor_signature"]["x"])
        validate_layout(list(fields.values()), analysis)

    def test_narrow_institution_gap_has_readability_warning(self):
        analysis = {"pages": [{"page": 1, "width": 842, "height": 595, "method": "ocr", "lines": [
            {"text": "Given under the authority of", "bbox": [335, 416, 509, 428], "confidence": 96},
            {"text": "on", "bbox": [414, 439, 429, 446], "confidence": 96},
        ]}]}
        result = suggest_fields(analysis)
        item = result["items"][0]
        self.assertEqual(item["field"]["key"], "institution_name")
        self.assertIn("readability", item["note"])
        self.assertNotIn("graduation_year", {entry["field"]["key"] for entry in result["items"]})
        validate_layout([item["field"]], analysis)
