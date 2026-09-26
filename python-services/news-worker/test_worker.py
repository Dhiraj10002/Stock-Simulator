import json
import os
import unittest
from unittest.mock import MagicMock

import worker


class NewsWorkerAliasTest(unittest.TestCase):
    def setUp(self):
        worker.CANONICAL_ALIASES = dict(worker.DEFAULT_CANONICAL_ALIASES)
        worker.KEYWORD_ALIASES = {k: list(v) for k, v in worker.DEFAULT_KEYWORD_ALIASES.items()}

    def test_default_aliases_resolve_canonical(self):
        self.assertEqual(worker.resolve_canonical_symbol("ZOMATO"), "ETERNAL")
        self.assertEqual(worker.resolve_canonical_symbol("TATAMOTORS"), "TMPV")
        self.assertEqual(worker.resolve_canonical_symbol("PRAJIND"), "PRAJIND")
        self.assertEqual(worker.resolve_canonical_symbol("TCS"), "TCS")

    def test_matching_symbols_resolves_to_canonical(self):
        # News mentioning ZOMATO should tag ETERNAL
        symbols = worker.matching_symbols("Zomato reports 30% jump in food delivery revenue")
        self.assertIn("ETERNAL", symbols)

        # News mentioning Tata Motors should tag TMPV
        symbols = worker.matching_symbols("Tata Motors plans new EV battery plant")
        self.assertIn("TMPV", symbols)

        # News mentioning Reliance should tag RELIANCE
        symbols = worker.matching_symbols("Reliance Industries expands retail footprint")
        self.assertIn("RELIANCE", symbols)

    def test_load_aliases_from_env_json(self):
        old_env = os.environ.get("SYMBOL_ALIASES")
        try:
            os.environ["SYMBOL_ALIASES"] = json.dumps({"NEWCO": "CANONICAL_NEW"})
            worker.load_symbol_aliases()
            self.assertEqual(worker.resolve_canonical_symbol("NEWCO"), "CANONICAL_NEW")
            symbols = worker.matching_symbols("NewCo announces merger")
            self.assertIn("CANONICAL_NEW", symbols)
        finally:
            if old_env is not None:
                os.environ["SYMBOL_ALIASES"] = old_env
            else:
                os.environ.pop("SYMBOL_ALIASES", None)

    def test_load_aliases_from_env_csv(self):
        old_env = os.environ.get("SYMBOL_ALIASES")
        try:
            os.environ["SYMBOL_ALIASES"] = "CSV_OLD:CSV_CANONICAL"
            worker.load_symbol_aliases()
            self.assertEqual(worker.resolve_canonical_symbol("CSV_OLD"), "CSV_CANONICAL")
        finally:
            if old_env is not None:
                os.environ["SYMBOL_ALIASES"] = old_env
            else:
                os.environ.pop("SYMBOL_ALIASES", None)

    def test_load_aliases_from_redis(self):
        mock_redis = MagicMock()
        mock_redis.hgetall.return_value = {"REDIS_OLD": "REDIS_CANONICAL"}
        worker.load_symbol_aliases(client=mock_redis)
        self.assertEqual(worker.resolve_canonical_symbol("REDIS_OLD"), "REDIS_CANONICAL")

    def test_sentiment_scoring(self):
        label, score = worker.sentiment("Company reports record profit and massive gain in market share")
        self.assertEqual(label, "POSITIVE")
        self.assertGreater(score, 0)

        label, score = worker.sentiment("Company faces fraud investigation and default risk")
        self.assertEqual(label, "NEGATIVE")
        self.assertLess(score, 0)

        label, score = worker.sentiment("Market trade volume remains steady ahead of holidays")
        self.assertEqual(label, "NEUTRAL")
        self.assertEqual(score, 0)

    def test_matching_sectors(self):
        sectors = worker.matching_sectors("RBI repo rate hike affects commercial vehicle lending and tech outsourcing")
        self.assertIn("BANKING", sectors)
        self.assertIn("AUTO", sectors)
        self.assertIn("IT", sectors)

    def test_fetch_all_feeds_deduplication(self):
        worker.fetch_items = MagicMock(side_effect=[
            [
                {"title": "Headline 1", "url": "https://example.com/1", "sentiment": "POSITIVE"},
                {"title": "Duplicate", "url": "https://example.com/common", "sentiment": "NEUTRAL"},
            ],
            [
                {"title": "Headline 2", "url": "https://example.com/2", "sentiment": "NEGATIVE"},
                {"title": "Duplicate Copy", "url": "https://example.com/common", "sentiment": "NEUTRAL"},
            ],
        ])
        results = worker.fetch_all_feeds(["https://feed1.rss", "https://feed2.rss"])
        self.assertEqual(len(results), 3)
        urls = [r["url"] for r in results]
        self.assertEqual(urls, ["https://example.com/1", "https://example.com/common", "https://example.com/2"])


if __name__ == "__main__":
    unittest.main()
