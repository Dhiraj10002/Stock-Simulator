import os
import unittest
from unittest.mock import patch
from broker_proxy import configured_proxy, check_proxy

class BrokerProxyTests(unittest.TestCase):
    def test_direct_mode_has_no_hidden_host_dependency(self):
        with patch.dict(os.environ, {}, clear=True), patch("socket.create_connection") as connect:
            self.assertIsNone(configured_proxy())
            check_proxy("broker.example")
            connect.assert_not_called()

    def test_invalid_proxy_fails_without_echoing_credentials(self):
        with patch.dict(os.environ, {"HTTPS_PROXY": "ftp://secret:password@proxy:8118"}, clear=True):
            with self.assertRaisesRegex(ValueError, "supported http/socks") as caught:
                configured_proxy()
            self.assertNotIn("password", str(caught.exception))

    def test_proxy_connect_failure_is_visible(self):
        with patch.dict(os.environ, {"HTTPS_PROXY": "http://proxy:8118"}, clear=True), patch("socket.create_connection", side_effect=OSError("offline")):
            with self.assertRaises(OSError):
                check_proxy("broker.example")
