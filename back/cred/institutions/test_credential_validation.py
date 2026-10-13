from types import SimpleNamespace
from unittest.mock import patch
from django.test import SimpleTestCase
from django.utils import timezone

from .credential_validation import validate_name, validate_year, template_preflight
from .template_rendering import validate_layout
from .pdf_certificate import generate_certificate_pdf
from .catalog_serializers import ProgramSerializer, GradeClassificationSerializer


class CredentialValidationTests(SimpleTestCase):
    def certificate(self, **changes):
        data = dict(student_name="Ada Lovelace", graduation_year=2026, degree_title="Bachelor of Science", department="Computing", grade="First Class", certificate_id="CRED-001", institution=SimpleNamespace(name="University"))
        data.update(changes)
        return SimpleNamespace(**data)

    def revision(self, **changes):
        field = dict(key="student_name", page=1, x=.2, y=.3, width=.6, height=.1, font_size=18)
        field.update(changes)
        return SimpleNamespace(fields=[field], analysis={"pages": [{"width": 600, "height": 400}]})

    def test_names_preserve_accents_initials_and_punctuation(self):
        self.assertEqual(validate_name("  José   O’Neill-Sam A. "), "José O’Neill-Sam A.")

    def test_bad_names_are_rejected(self):
        for value in ("", "A", "123", "Ada123", "Ada\nLovelace", "Ada\u200bLovelace", "A" * 201, 123):
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate_name(value)

    def test_year_bounds_and_integer_type(self):
        self.assertEqual(validate_year(1900), 1900)
        self.assertEqual(validate_year(timezone.now().year), timezone.now().year)
        for value in (1899, timezone.now().year + 1, timezone.now().year + 2, 2026.5, "2026", True):
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate_year(value)

    def test_configured_name_length_blocks_input(self):
        with self.assertRaisesRegex(ValueError, "at most 5"):
            template_preflight(self.certificate(), self.revision(max_length=5))

    def test_configured_year_range_blocks_input(self):
        revision = self.revision(key="graduation_year", min_value=2020, max_value=2025)
        with self.assertRaisesRegex(ValueError, "configured range"):
            template_preflight(self.certificate(), revision)

    def test_type_length_and_readability_configuration(self):
        for changes in ({"input_type": "number"}, {"max_length": 201}, {"min_length": 20, "max_length": 10}, {"min_font_size": 20}, {"required": "yes"}):
            revision = self.revision(**changes)
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                validate_layout(revision.fields, revision.analysis)

    def test_shrink_warning_gives_adjustment_guidance(self):
        warnings = template_preflight(self.certificate(student_name="Alexandria Catherine Longsurname"), self.revision(width=.3))
        self.assertTrue(warnings)
        self.assertIn("Widen", warnings[0])

    def test_overflow_rejected_before_rendering(self):
        with self.assertRaisesRegex(ValueError, "Widen"):
            template_preflight(self.certificate(), self.revision(width=.01, min_font_size=12))

    def test_invalid_data_never_reaches_uploaded_renderer(self):
        cert = self.certificate(student_name="123", template_revision_id="revision")
        with patch("institutions.template_rendering.render_uploaded_template") as render:
            with self.assertRaises(ValueError):
                generate_certificate_pdf(cert)
            render.assert_not_called()

    def test_font_character_support_checked_before_render(self):
        with self.assertRaisesRegex(ValueError, "unsupported"):
            template_preflight(self.certificate(student_name="王小明"), self.revision())

    def test_catalog_titles_reject_hidden_characters(self):
        serializer = ProgramSerializer(data={"title": "Degree\u200btitle", "department": "00000000-0000-0000-0000-000000000000"})
        # Test scalar validation without querying a department.
        from rest_framework.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            serializer.validate_title("Degree\u200btitle")
        with self.assertRaises(ValidationError):
            GradeClassificationSerializer().validate_label("A" * 51)
