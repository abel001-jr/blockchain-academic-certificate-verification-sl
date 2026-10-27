from io import BytesIO
from unittest.mock import Mock, patch
import requests
from django.test import SimpleTestCase, override_settings
from .ipfs import PinningError, pin_file_to_ipfs, pinning_failure


@override_settings(PINATA_JWT="test-token", PINATA_GATEWAY="https://example.test")
class PinningErrorTests(SimpleTestCase):
    @patch("certify.ipfs.requests.post", side_effect=requests.ReadTimeout("internal host and credentials"))
    def test_timeout_is_safe_and_does_not_blindly_retry(self, post):
        with self.assertRaises(PinningError) as caught:
            pin_file_to_ipfs(BytesIO(b"payload"), "test.enc", "CR-1")
        payload = pinning_failure(caught.exception)
        self.assertEqual(payload["code"], "storage_timeout")
        self.assertTrue(payload["retryable"])
        self.assertNotIn("credentials", payload["detail"])
        post.assert_called_once()

    @patch("certify.ipfs.requests.post")
    def test_authorization_requires_configuration_fix(self, post):
        response = Mock(status_code=401)
        post.side_effect = requests.HTTPError(response=response)
        with self.assertRaises(PinningError) as caught:
            pin_file_to_ipfs(BytesIO(b"payload"), "test.enc", "CR-1")
        self.assertFalse(caught.exception.retryable)
        self.assertEqual(caught.exception.code, "storage_authorization")

    @patch("certify.ipfs.requests.post")
    def test_malformed_confirmation_is_handled(self, post):
        post.return_value = Mock(json=lambda: {})
        with self.assertRaises(PinningError) as caught:
            pin_file_to_ipfs(BytesIO(b"payload"), "test.enc", "CR-1")
        self.assertEqual(caught.exception.code, "storage_invalid_response")

    @override_settings(PINATA_JWT="")
    def test_missing_configuration_is_not_a_server_error(self):
        with self.assertRaises(PinningError) as caught:
            pin_file_to_ipfs(BytesIO(b"payload"), "test.enc", "CR-1")
        self.assertFalse(caught.exception.retryable)
