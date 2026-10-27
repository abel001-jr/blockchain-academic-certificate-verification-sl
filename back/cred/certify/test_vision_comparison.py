from unittest.mock import patch, Mock
from django.test import SimpleTestCase, override_settings
from .vision_comparison import compare_images

@override_settings(GROQ_API_KEY="test-only", GROQ_VISION_MODEL="test-vision")
class VisionComparisonTests(SimpleTestCase):
    def response(self, content):
        response = Mock(content=b"result")
        response.json.return_value = {"choices": [{"message": {"content": content}}]}
        return response

    @patch("certify.vision_comparison.requests.post")
    def test_sends_both_images_and_validates_evidence(self, post):
        post.return_value = self.response('{"assessment":"similar","observations":["Same emblem"],"recommendation":"Confirm manually"}')
        result = compare_images("data:crop", "data:reference", "logo")
        self.assertEqual(result["assessment"], "similar")
        content = post.call_args.kwargs["json"]["messages"][1]["content"]
        self.assertEqual([x["image_url"]["url"] for x in content[1:]], ["data:crop", "data:reference"])

    @patch("certify.vision_comparison.requests.post")
    def test_invalid_evidence_falls_back(self, post):
        post.return_value = self.response('{"assessment":"authentic"}')
        self.assertEqual(compare_images("crop", "reference", "seal")["status"], "unavailable")

    @override_settings(GROQ_API_KEY="")
    @patch("certify.vision_comparison.requests.post")
    def test_no_key_does_not_send_images(self, post):
        self.assertEqual(compare_images("crop", "reference", "logo")["status"], "not_configured")
        post.assert_not_called()
