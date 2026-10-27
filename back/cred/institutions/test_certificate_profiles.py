from django.test import SimpleTestCase
from .certificate_profiles import selected_profile, annotate_profile

class CertificateProfileTests(SimpleTestCase):
    def test_defaults_to_bachelor_of_science(self):
        self.assertEqual(selected_profile()["title"], "Bachelor of Science")

    def test_invalid_type_rejected(self):
        with self.assertRaises(ValueError):
            selected_profile("arbitrary")

    def test_award_conflict_warns_without_rewriting_master(self):
        result = {"items": [{"field": {"key": "degree_title"}, "note": "Review."}], "warnings": []}
        analysis = {"pages": [{"text": "Bachelor of Arts with Honours in Mass Communication"}]}
        annotate_profile(result, selected_profile(), analysis)
        self.assertIn("Bachelor of Arts", result["warnings"][0])
        self.assertIn("student_name", result["missing_required_fields"])
        self.assertTrue(result["items"][0]["field"]["required"])
        self.assertIn("Bachelor of Science", result["items"][0]["note"])
        self.assertEqual(analysis["pages"][0]["text"], "Bachelor of Arts with Honours in Mass Communication")
