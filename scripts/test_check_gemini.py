import json
import subprocess
import unittest
from unittest.mock import patch
from io import BytesIO
from urllib.error import HTTPError

from check_gemini import check


class GeminiProbeTests(unittest.TestCase):
    def backend(self, key="secret-test-key", model="gemini-3.7-flash"):
        return subprocess.CompletedProcess([], 0, json.dumps([{"Config": {"Env": ["GEMINI_API_KEY=" + key, "GEMINI_MODEL=" + model]}}]), "")

    def test_missing_key_does_not_make_a_network_request(self):
        with patch("check_gemini.subprocess.run", return_value=self.backend(key="")), patch("check_gemini.urlopen") as request:
            result = check("backend", True)
        self.assertEqual(result["reason"], "not_configured")
        request.assert_not_called()

    def test_probe_uses_header_authentication_and_no_account_context(self):
        def respond(request, timeout):
            self.assertEqual(request.get_header("X-goog-api-key"), "secret-test-key")
            self.assertNotIn("secret-test-key", request.full_url)
            data = json.loads(request.data)
            self.assertEqual(data["contents"][0]["parts"][0]["text"], "Reply with the single word OK.")
            return BytesIO(b'{"candidates":[{"finishReason":"STOP","content":{"parts":[{"text":"OK"}]}}]}')
        with patch("check_gemini.subprocess.run", return_value=self.backend()), patch("check_gemini.urlopen", side_effect=respond):
            result = check("backend")
        self.assertTrue(result["working"])
        self.assertNotIn("secret-test-key", json.dumps(result))

    def test_provider_errors_do_not_leak_headers_or_raw_response(self):
        for status, reason in [(400, "request_rejected"), (403, "authentication_failed"), (404, "model_unavailable"), (429, "rate_limited")]:
            with patch("check_gemini.subprocess.run", return_value=self.backend()), patch("check_gemini.urlopen", side_effect=HTTPError("https://secret.invalid", status, "secret provider message", {}, None)):
                result = check("backend")
            self.assertEqual(result["reason"], reason)
            self.assertNotIn("secret", json.dumps(result))


if __name__ == "__main__":
    unittest.main()
