from django.test import SimpleTestCase
from .degree_awards import formal_program_title
from .models import Program
from .catalog_serializers import ProgramSerializer
from certify.field_extraction import compare_fields


class DegreeAwardTests(SimpleTestCase):
    def test_each_program_builds_its_selected_award(self):
        for key, title in [("bsc", "Bachelor of Science"), ("bsc_eng", "Bachelor of Science in Engineering"), ("ba", "Bachelor of Arts")]:
            self.assertEqual(formal_program_title("Computer Science", key), f"{title} in Computer Science")
        self.assertEqual(formal_program_title("Bachelor of Science in Nursing", "bsc"), "Bachelor of Science in Nursing")

    def test_document_abbreviations_match_full_awards(self):
        for alias, title in [("BSc", "Bachelor of Science"), ("B.Sc.", "Bachelor of Science"), ("BSc Eng", "Bachelor of Science in Engineering"), ("BSE", "Bachelor of Science in Engineering"), ("BA", "Bachelor of Arts")]:
            result = compare_fields({"degree_title": f"{title} in Computer Science"}, {"degree_title": f"{alias} in Computer Science"}, fields=("degree_title",))
            self.assertEqual(result[0]["status"], "match", result)

    def test_different_awards_do_not_match_on_the_same_subject(self):
        for other in ["BA", "BSE"]:
            result = compare_fields({"degree_title": "BSc in Computer Science"}, {"degree_title": f"{other} in Computer Science"}, fields=("degree_title",))
            self.assertEqual(result[0]["status"], "mismatch")

    def test_conflicting_award_is_rejected(self):
        serializer = ProgramSerializer()
        from rest_framework.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            serializer.validate({"title": "BA in History", "degree_award": "bsc", "qualification_type": "bachelors"})
        with self.assertRaises(ValidationError):
            serializer.validate({"title": "Computer Science", "degree_award": "bsc", "qualification_type": "certificate"})
