import json
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import Mock, patch
import pymupdf as fitz
from django.core.files.base import ContentFile
from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework.test import APIClient
from accounts.models import User, Role
from .models import Institution, CertificateTemplateRevision
from .ai_suggestions import suggest_with_groq, AssistanceError
from certify.document_analysis import DocumentAnalysisError
from .template_views import extract_template_analysis


class FreshTemplateAnalysisTests(SimpleTestCase):
    def test_current_master_is_read_and_rotated_coordinates_match_page(self):
        with fitz.open() as doc:
            page = doc.new_page(width=600, height=400)
            page.insert_text((100, 100), "[STUDENT NAME]", fontsize=18)
            page.set_rotation(90)
            master = doc.tobytes()
        revision = SimpleNamespace(master=ContentFile(master, name="master.pdf"), analysis={"pages": []})
        analysis = extract_template_analysis(revision)
        page = analysis["pages"][0]
        self.assertEqual((page["width"], page["height"]), (400, 600))
        line = page["lines"][0]
        self.assertEqual(line["text"], "[STUDENT NAME]")
        x0, y0, x1, y1 = line["bbox"]
        self.assertTrue(0 <= x0 < x1 <= 400)
        self.assertTrue(0 <= y0 < y1 <= 600)
        self.assertEqual(revision.analysis, {"pages": []})


@override_settings(GROQ_API_KEY="test-only", GEMINI_API_KEY="", GROQ_MODEL="openai/gpt-oss-20b")
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
    def test_unsafe_or_conflicting_classifications_are_rejected(self, post):
        for text, key in [
            ("Ada Lovelace", "student_name"),
            ("[Ada Lovelace]", "student_name"),
            ("This certifies that [STUDENT NAME]", "student_name"),
            ("[STUDENT NAME]", "degree_title"),
            ("[PROGRAMME / FIELD OF STUDY]", "department"),
            ("[DAY MONTH YEAR]", "graduation_year"),
            ("Registrar", "registrar_signature"),
        ]:
            with self.subTest(text=text, key=key):
                analysis = deepcopy(self.analysis)
                analysis["pages"][0]["lines"][0]["text"] = text
                post.return_value = self.response([{"line_id": 0, "key": key}])
                result = suggest_with_groq(analysis)
                self.assertEqual(result["items"], [])
                self.assertTrue(any("skipped" in warning for warning in result["warnings"]))

    @patch("institutions.ai_suggestions.requests.post")
    def test_alternative_explicit_placeholders_are_supported(self, post):
        for text in ["{{RECIPIENT}}", "<AWARDEE NAME>", "[CANDIDATE NAME]"]:
            with self.subTest(text=text):
                analysis = deepcopy(self.analysis)
                analysis["pages"][0]["lines"][0]["text"] = text
                post.return_value = self.response([{"line_id": 0, "key": "student_name"}])
                self.assertEqual(len(suggest_with_groq(analysis)["items"]), 1)

    @override_settings(GEMINI_API_KEY="fallback-test", GEMINI_MODEL="gemini-flash-latest")
    @patch("institutions.ai_suggestions.requests.post")
    def test_groq_rate_limit_uses_gemini_fallback(self, post):
        post.side_effect = [Mock(status_code=429), Mock(status_code=200, content=b"{}", json=lambda: {
            "candidates": [{"content": {"parts": [{"text": json.dumps({"items": [{"line_id": 0, "key": "student_name"}]})}]}}]})]
        result = suggest_with_groq(self.analysis)
        self.assertEqual(len(result["items"]), 1)
        self.assertEqual(post.call_count, 2)
        fallback = post.call_args
        self.assertIn("generativelanguage.googleapis.com", fallback.args[0])
        self.assertEqual(fallback.kwargs["headers"]["x-goog-api-key"], "fallback-test")
        self.assertNotIn("Authorization", fallback.kwargs["headers"])

    @override_settings(GEMINI_API_KEY="fallback-test")
    @patch("institutions.ai_suggestions.requests.post")
    def test_timeout_and_invalid_output_trigger_fallback(self, post):
        import requests
        for failure in [requests.Timeout(), Mock(status_code=200, content=b"{}", json=lambda: {})]:
            with self.subTest(failure=type(failure).__name__):
                post.side_effect = [failure, Mock(status_code=200, content=b"{}", json=lambda: {
                    "candidates": [{"content": {"parts": [{"text": '{"items": []}'}]}}]})]
                self.assertEqual(suggest_with_groq(self.analysis)["items"], [])

    @override_settings(GEMINI_API_KEY="fallback-test")
    @patch("institutions.ai_suggestions.requests.post")
    def test_success_does_not_call_fallback(self, post):
        post.return_value = self.response([])
        suggest_with_groq(self.analysis)
        post.assert_called_once()

    @override_settings(GEMINI_API_KEY="fallback-test")
    @patch("institutions.ai_suggestions.requests.post")
    def test_both_providers_failing_returns_safe_error(self, post):
        post.return_value = Mock(status_code=429)
        with self.assertRaises(AssistanceError) as error:
            suggest_with_groq(self.analysis)
        self.assertEqual(post.call_count, 2)
        self.assertNotIn("fallback-test", str(error.exception))

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

    @patch("institutions.template_views.extract_template_analysis")
    @patch("institutions.template_views.suggest_with_groq")
    def test_empty_ai_preserves_local_suggestions(self, assist, extract):
        revision = CertificateTemplateRevision.objects.create(institution=self.inst, name="Draft", fields=[])
        extract.return_value = deepcopy(AISuggestionTests.analysis)
        assist.return_value = {"items": [], "warnings": []}
        response = self.client.post(f"/api/certificate-templates/{revision.id}/ai-suggestions/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["items"][0]["field"]["key"], "student_name")
        self.assertNotIn("student_name", response.data["missing_fields"])
        revision.refresh_from_db()
        self.assertEqual(revision.fields, [])

    @patch("institutions.template_views.extract_template_analysis")
    @patch("institutions.template_vision.suggest_visual_layout")
    def test_visual_request_uses_uploaded_art_and_current_fields(self, visual, extract):
        from .test_template_asset_suggestions import artwork
        revision = CertificateTemplateRevision.objects.create(institution=self.inst, name="Draft", fields=[])
        extract.return_value = deepcopy(AISuggestionTests.analysis)
        visual.return_value = {"items": [], "warnings": []}
        response = self.client.post(f"/api/certificate-templates/{revision.id}/ai-suggestions/",
            {"visual": "true", "page": "1", "fields": "[]", "logo": artwork()}, format="multipart")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn("logo", visual.call_args.args[2])
        self.assertEqual(visual.call_args.args[3:], ([], 1))
        self.assertEqual(len(response.data["items"]), 1)
        revision.refresh_from_db()
        self.assertFalse(revision.logo)

    @patch("institutions.template_views.extract_template_analysis")
    @patch("institutions.template_views.suggest_with_groq")
    def test_unavailable_ai_returns_local_suggestions_with_warning(self, assist, extract):
        revision = CertificateTemplateRevision.objects.create(institution=self.inst, name="Draft")
        extract.return_value = deepcopy(AISuggestionTests.analysis)
        assist.side_effect = AssistanceError("Unavailable")
        response = self.client.post(f"/api/certificate-templates/{revision.id}/ai-suggestions/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["items"]), 1)
        self.assertTrue(any("unavailable" in warning for warning in response.data["warnings"]))

    @patch("institutions.template_views.suggest_with_groq")
    def test_other_institution_document_cannot_be_sent(self, assist):
        other = Institution.objects.create(institution_id="AI-OTHER", name="Other")
        revision = CertificateTemplateRevision.objects.create(institution=other, name="Private", analysis={})
        response = self.client.post(f"/api/certificate-templates/{revision.id}/ai-suggestions/")
        self.assertEqual(response.status_code, 404)
        assist.assert_not_called()

    @patch("institutions.template_views.extract_template_analysis")
    @patch("institutions.template_views.suggest_with_groq")
    def test_suggestions_do_not_change_saved_fields(self, assist, extract):
        revision = CertificateTemplateRevision.objects.create(institution=self.inst, name="Draft", analysis={}, fields=[])
        assist.return_value = {"items": [], "warnings": []}
        response = self.client.post(f"/api/certificate-templates/{revision.id}/ai-suggestions/")
        self.assertEqual(response.status_code, 200)
        revision.refresh_from_db()
        self.assertEqual(revision.fields, [])
        assist.assert_called_once_with(extract.return_value)

    @patch("institutions.template_views.extract_template_analysis")
    def test_both_methods_use_fresh_analysis_without_saving_fields(self, extract):
        revision = CertificateTemplateRevision.objects.create(institution=self.inst, name="Draft", analysis={"pages": []}, fields=[])
        fresh = deepcopy(AISuggestionTests.analysis)
        extract.return_value = fresh
        response = self.client.post(f"/api/certificate-templates/{revision.id}/suggestions/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual({item["field"]["key"] for item in response.data["items"]}, {"student_name", "institution_name"})
        with patch("institutions.template_views.suggest_with_groq", return_value={"items": [], "warnings": []}) as assist:
            response = self.client.post(f"/api/certificate-templates/{revision.id}/ai-suggestions/")
            self.assertEqual(response.status_code, 200)
            assist.assert_called_once_with(fresh)
        self.assertEqual(extract.call_count, 2)
        revision.refresh_from_db()
        self.assertEqual(revision.fields, [])

    @patch("institutions.template_views.extract_template_analysis")
    def test_extraction_errors_are_returned_by_both_methods(self, extract):
        revision = CertificateTemplateRevision.objects.create(institution=self.inst, name="Draft")
        extract.side_effect = DocumentAnalysisError("Cannot read master.")
        for method in ["suggestions", "ai-suggestions"]:
            response = self.client.post(f"/api/certificate-templates/{revision.id}/{method}/")
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.data["detail"], "Cannot read master.")

    @patch("institutions.template_views.extract_template_analysis")
    def test_approved_templates_reject_both_methods(self, extract):
        from django.utils import timezone
        revision = CertificateTemplateRevision.objects.create(institution=self.inst, approved_at=timezone.now())
        for method in ["suggestions", "ai-suggestions"]:
            response = self.client.post(f"/api/certificate-templates/{revision.id}/{method}/")
            self.assertEqual(response.status_code, 400)
        extract.assert_not_called()

    @override_settings(TEMPLATE_AI_RATE="1/min")
    @patch("institutions.template_views.extract_template_analysis")
    @patch("institutions.template_views.suggest_with_groq")
    def test_application_limit_returns_retry_after_without_provider_call(self, assist, extract):
        from django.core.cache import cache
        cache.clear()
        self.addCleanup(cache.clear)
        revision = CertificateTemplateRevision.objects.create(institution=self.inst, name="Draft")
        assist.return_value = {"items": [], "warnings": []}
        url = f"/api/certificate-templates/{revision.id}/ai-suggestions/"
        self.assertEqual(self.client.post(url).status_code, 200)
        response = self.client.post(url)
        self.assertEqual(response.status_code, 429)
        self.assertGreater(int(response["Retry-After"]), 0)
        assist.assert_called_once()
