import unittest

from production_addresses import primary_api_hostname


class ProductionAddressTests(unittest.TestCase):
    def test_existing_two_domain_setting_selects_primary_without_changing_input(self):
        value = "api.stock-simulator.in, stocksim-api.duckdns.org"
        self.assertEqual(primary_api_hostname(value), "api.stock-simulator.in")
        self.assertEqual(value, "api.stock-simulator.in, stocksim-api.duckdns.org")

    def test_single_host_and_whitespace(self):
        self.assertEqual(primary_api_hostname("  stocksim-api.duckdns.org  "), "stocksim-api.duckdns.org")

    def test_all_addresses_are_validated(self):
        for value in ("api.valid.test,https://invalid.test", "api.valid.test,", "api.valid.test/path",
                      "api.valid.test:443", "api.valid.test?secret=value", "api.valid.test\nother.test",
                      "api.valid.test,.invalid.test", "api.valid.test,-invalid.test", "example.com",
                      "api.valid.test,api.example.com", "", None):
            with self.subTest(value=value), self.assertRaises(ValueError):
                primary_api_hostname(value)
