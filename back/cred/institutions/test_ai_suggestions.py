import json
from unittest.mock import Mock, patch
from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework.test import APIClient
from accounts.models import User, Role
from .models import Institution, CertificateTemplateRevision
from .ai_suggestions import suggest_with_groq, AssistanceError


@override_settings(GROQ_API_KEY="test-only", GROQ_MODEL="openai/gpt-oss-20b")
class AISuggestionTests(SimpleTestCase):
    analysis = {"pages": [{"page": 1, "width": 100, "height": 100,
        "method": "text_layer", "lines": [{"text": "[STUDENT NAME]",
        "bbox": [10, 20, 90, 30], "font": "Times-Roman", "font_size": 12}]}]}

    def response(self, items):
        return Mock(status_code=200, content=b"{}", json=lambda: {
            "choices": [{"message": {"content": json.dumps({"items": items})}}]})

    @patch("institutions.ai_suggestions.requests.post")
    def test_coordinates_come_from_local_extraction_and_clearing_stays_off(self, post):
        post.return_value = self.response([{"line_id": 0, "key": "student_name", "x": 999}])
        field = suggest_with_groq(self.analysis)["items"][0]["field"]
        self.assertEqual(field["x"], .1)
        self.assertFalse(field["clear"])
        self.assertEqual(post.call_args.kwargs["timeout"], (5, 35))

    @patch("institutions.ai_suggestions.requests.post")
    def test_unknown_keys_invalid_ids_and_duplicate_lines_are_rejected(self, post):
        post.return_value = self.response([{"line_id": 0, "key": "student_name"},
            {"line_id": 0, "key": "degree_title"}, {"line_id": True, "key": "grade"},
            {"line_id": 99, "key": "grade"}, {"line_id": 0, "key": []}])
        self.assertEqual(len(suggest_with_groq(self.analysis)["items"]), 1)

    @patch("institutions.ai_suggestions.requests.post")
    def test_provider_errors_are_not_exposed(self, post):
        post.return_value = Mock(status_code=401)
        with self.assertRaises(AssistanceError):
            suggest_with_groq(self.analysis)

    @override_settings(GROQ_API_KEY="")
    @patch("institutions.ai_suggestions.requests.post")
    def test_missing_key_fails_without_network_call(self, post):
        with self.assertRaises(AssistanceError):
            suggest_with_groq(self.analysis)
        post.assert_not_called()

    @patch("institutions.ai_suggestions.requests.post")
    def test_invalid_json_is_rejected(self, post):
        post.return_value = Mock(status_code=200, content=b"{}", json=lambda: {})
        with self.assertRaises(AssistanceError):
            suggest_with_groq(self.analysis)


class AISuggestionAccessTests(TestCase):
    def setUp(self):
        self.inst = Institution.objects.create(institution_id="AI-OWN", name="Own")
        self.user = User.objects.create_user(email="ai@example.test", role=Role.REGISTRAR, institution=self.inst)
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    @patch("institutions.template_views.suggest_with_groq")
    def test_other_institution_document_cannot_be_sent(self, assist):
        other = Institution.objects.create(institution_id="AI-OTHER", name="Other")
        revision = CertificateTemplateRevision.objects.create(institution=other, name="Private", analysis={})
        response = self.client.post(f"/api/certificate-templates/{revision.id}/ai-suggestions/")
        self.assertEqual(response.status_code, 404)
        assist.assert_not_called()

    @patch("institutions.template_views.suggest_with_groq")
    def test_suggestions_do_not_change_saved_fields(self, assist):
        revision = CertificateTemplateRevision.objects.create(institution=self.inst, name="Draft", analysis={}, fields=[])
        assist.return_value = {"items": [], "warnings": []}
        response = self.client.post(f"/api/certificate-templates/{revision.id}/ai-suggestions/")
        self.assertEqual(response.status_code, 200)
        revision.refresh_from_db()
        self.assertEqual(revision.fields, [])
