import http.client
import importlib.util
import json
import os
import pathlib
import sys
import unittest
from datetime import date


from unittest.mock import MagicMock

for mod in ["psycopg", "pyotp", "redis", "SmartApi", "SmartApi.smartWebSocketV2"]:
    if mod not in sys.modules:
        try:
            __import__(mod)
        except ImportError:
            sys.modules[mod] = MagicMock()

SPEC = importlib.util.spec_from_file_location("market_worker", pathlib.Path(__file__).with_name("worker.py"))
worker = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = worker
SPEC.loader.exec_module(worker)


class VolumeDeltaTest(unittest.TestCase):
    def test_cumulative_daily_volume_becomes_non_negative_deltas(self):
        writer = worker.QuoteWriter(None, 300, 86400, 500)
        trading_day = date(2026, 9, 14)
        self.assertEqual(writer.volume_delta("RELIANCE", trading_day, 1000), 1000)
        self.assertEqual(writer.volume_delta("RELIANCE", trading_day, 1500), 500)
        self.assertEqual(writer.volume_delta("RELIANCE", trading_day, 1800), 300)
        self.assertEqual(writer.volume_delta("RELIANCE", trading_day, 1700), 0)
        self.assertEqual(writer.volume_delta("RELIANCE", date(2026, 9, 15), 200), 200)

    def test_minute_candle_accumulates_tick_volume(self):
        first = worker.make_candle(None, 10, 10000, 100)
        second = worker.make_candle(json.dumps(first), 10, 10100, 40)
        self.assertEqual(second["open_paise"], 10000)
        self.assertEqual(second["high_paise"], 10100)
        self.assertEqual(second["close_paise"], 10100)
        self.assertEqual(second["volume"], 140)


class FeedControlTest(unittest.TestCase):
    def test_reconnect_is_requested_only_once_per_connection(self):
        class WebSocket:
            def __init__(self):
                self.close_calls = 0

            def close_connection(self):
                self.close_calls += 1

        control = worker.FeedControl()
        websocket = WebSocket()
        control.attach(websocket)
        control.reconnect("test")
        control.reconnect("test again")
        self.assertEqual(websocket.close_calls, 1)

        control.detach(websocket)
        next_websocket = WebSocket()
        control.attach(next_websocket)
        control.reconnect("new connection")
        self.assertEqual(next_websocket.close_calls, 1)


class MockRedisPipeline:
    def __init__(self, store):
        self.store = store
        self.commands = []

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        pass

    def hset(self, key, mapping):
        self.commands.append(("hset", key, mapping))

    def expire(self, key, ttl):
        self.commands.append(("expire", key, ttl))

    def lset(self, key, index, value):
        self.commands.append(("lset", key, index, value))

    def lpush(self, key, value):
        self.commands.append(("lpush", key, value))

    def rpush(self, key, value):
        self.commands.append(("rpush", key, value))

    def ltrim(self, key, start, end):
        self.commands.append(("ltrim", key, start, end))

    def publish(self, channel, message):
        self.commands.append(("publish", channel, message))

    def delete(self, key):
        self.commands.append(("delete", key))

    def execute(self):
        for cmd in self.commands:
            action = cmd[0]
            if action == "rpush":
                _, key, val = cmd
                self.store.setdefault(key, []).append(val)
            elif action == "hset":
                _, key, mapping = cmd
                self.store[key] = mapping


class MockRedis:
    def __init__(self):
        self.store = {}

    def pipeline(self):
        return MockRedisPipeline(self.store)

    def lindex(self, key, index):
        lst = self.store.get(key, [])
        if 0 <= index < len(lst):
            return lst[index]
        return None

    def llen(self, key):
        return len(self.store.get(key, []))

    def hgetall(self, key):
        val = self.store.get(key)
        if isinstance(val, dict):
            return val
        return {}

    def hset(self, key, mapping=None, **kwargs):
        if key not in self.store or not isinstance(self.store[key], dict):
            self.store[key] = {}
        if mapping:
            self.store[key].update(mapping)
        if kwargs:
            self.store[key].update(kwargs)

    def expire(self, key, ttl):
        pass


class SyntheticFeedTest(unittest.TestCase):
    def test_synthetic_feed_generates_bounded_ticks(self):
        mock_redis = MockRedis()
        writer = worker.QuoteWriter(mock_redis, 300, 86400, 500)
        subscriptions = [
            worker.Subscription("RELIANCE", "2885", "NSE", 1),
            worker.Subscription("TCS", "11536", "NSE", 1),
        ]
        feed = worker.SyntheticFeed(subscriptions, writer, tick_interval_seconds=0.1)

        # Run 20 steps
        for _ in range(20):
            ticks = feed.step()
            self.assertEqual(len(ticks), 2)
            for sub, price_paise, volume in ticks:
                self.assertGreater(price_paise, 0)
                self.assertGreater(volume, 0)
                # Price should stay within ±15% of benchmark
                benchmark = worker.DEFAULT_BENCHMARK_PRICES_PAISE[sub.symbol]
                self.assertLess(abs(price_paise - benchmark) / benchmark, 0.15)


class HistoricalCandleSeedTest(unittest.TestCase):
    def test_seed_historical_candles_populates_empty_history(self):
        mock_redis = MockRedis()
        subscriptions = [
            worker.Subscription("INFY", "1594", "NSE", 1),
        ]

        worker.seed_historical_candles(mock_redis, subscriptions, 86400, 500, count=50)

        history_key = "market:history:INFY"
        self.assertIn(history_key, mock_redis.store)
        self.assertEqual(len(mock_redis.store[history_key]), 50)

        # Verify quote was also set
        quote_key = "market:quote:INFY"
        self.assertIn(quote_key, mock_redis.store)
        self.assertEqual(mock_redis.store[quote_key]["symbol"], "INFY")
        self.assertEqual(mock_redis.store[quote_key]["source"], "initial_seed")


class FallbackMasterTest(unittest.TestCase):
    def test_fallback_master_contains_standard_symbols(self):
        symbols = [item["name"] for item in worker.FALLBACK_INSTRUMENT_MASTER]
        for expected in ["RELIANCE", "TCS", "INFY", "HDFCBANK", "NIFTY", "BANKNIFTY"]:
            self.assertIn(expected, symbols)


class SensitiveDataFilterTest(unittest.TestCase):
    def setUp(self):
        self.sanitizer = worker.SensitiveDataFilter()

    def test_redacts_bearer_jwt_and_private_key(self):
        raw_msg = (
            "Error occurred while making POST request. Headers: {"
            "'Content-type': 'application/json', 'X-PrivateKey': 'SECRET_KEY_123', "
            "'Authorization': 'Bearer eyJhbGciOiJIUzUxMiJ9.my_super_secret_jwt.signature'}"
        )
        redacted = self.sanitizer.redact_text(raw_msg)
        self.assertNotIn("SECRET_KEY_123", redacted)
        self.assertNotIn("my_super_secret_jwt", redacted)
        self.assertIn("'X-PrivateKey': '[REDACTED]'", redacted)
        self.assertIn("'Authorization': 'Bearer [REDACTED]'", redacted)

    def test_filter_method_on_log_record(self):
        import logging
        record = logging.LogRecord(
            name="smartConnect",
            level=logging.ERROR,
            pathname=__file__,
            lineno=42,
            msg="Request failed with Authorization: Bearer abc123def and X-PrivateKey: 'KEY999'",
            args=(),
            exc_info=None,
        )
        self.sanitizer.filter(record)
        self.assertNotIn("abc123def", record.msg)
        self.assertNotIn("KEY999", record.msg)
        self.assertIn("Authorization: Bearer [REDACTED]", record.msg)
        self.assertIn("X-PrivateKey: '[REDACTED]'", record.msg)


class FeedSupervisorTest(unittest.TestCase):
    def setUp(self):
        self.store = MagicMock()
        self.writer = MagicMock()
        self.control = worker.FeedControl()
        self.supervisor = worker.FeedSupervisor(self.store, self.writer, self.control, mode="auto", max_failures=3)

    def test_opened_true_resets_fail_count(self):
        self.supervisor.fail_count = 2
        run_fn = MagicMock(return_value=True)
        res = self.supervisor.handle_feed_cycle(run_fn)
        self.assertTrue(res)
        self.assertEqual(self.supervisor.fail_count, 0)
        self.assertFalse(self.supervisor.fallback_active)

    def test_opened_false_increments_fail_count(self):
        run_fn = MagicMock(return_value=False)
        res = self.supervisor.handle_feed_cycle(run_fn)
        self.assertTrue(res)
        self.assertEqual(self.supervisor.fail_count, 1)

    def test_exception_increments_fail_count(self):
        run_fn = MagicMock(side_effect=RuntimeError("connection dropped"))
        res = self.supervisor.handle_feed_cycle(run_fn)
        self.assertTrue(res)
        self.assertEqual(self.supervisor.fail_count, 1)

    def test_three_consecutive_failures_triggers_fallback(self):
        run_fn = MagicMock(return_value=False)
        self.assertTrue(self.supervisor.handle_feed_cycle(run_fn))
        self.assertEqual(self.supervisor.fail_count, 1)

        self.assertTrue(self.supervisor.handle_feed_cycle(run_fn))
        self.assertEqual(self.supervisor.fail_count, 2)

        # 3rd failure activates synthetic fallback
        res = self.supervisor.handle_feed_cycle(run_fn)
        self.assertFalse(res)  # returns False to break out of live loop
        self.assertEqual(self.supervisor.fail_count, 3)
        self.assertTrue(self.supervisor.fallback_active)

    def test_recovery_resets_counter_before_fallback_threshold(self):
        run_fail = MagicMock(return_value=False)
        run_success = MagicMock(return_value=True)

        self.supervisor.handle_feed_cycle(run_fail)
        self.supervisor.handle_feed_cycle(run_fail)
        self.assertEqual(self.supervisor.fail_count, 2)

        # Successful connection resets
        self.supervisor.handle_feed_cycle(run_success)
        self.assertEqual(self.supervisor.fail_count, 0)

        # One more failure starts from 1 again, not triggering fallback
        res = self.supervisor.handle_feed_cycle(run_fail)
        self.assertTrue(res)
        self.assertEqual(self.supervisor.fail_count, 1)
        self.assertFalse(self.supervisor.fallback_active)


class SymbolAliasTest(unittest.TestCase):
    def test_zomato_resolves_to_eternal(self):
        self.assertEqual(worker.resolve_canonical_symbol("ZOMATO"), "ETERNAL")
        self.assertEqual(worker.resolve_canonical_symbol("ZOMATO-EQ"), "ETERNAL")

    def test_eternal_resolves_to_eternal(self):
        self.assertEqual(worker.resolve_canonical_symbol("ETERNAL"), "ETERNAL")
        self.assertEqual(worker.resolve_canonical_symbol("ETERNAL-EQ"), "ETERNAL")

    def test_tatamotors_resolves_to_tmpv(self):
        self.assertEqual(worker.resolve_canonical_symbol("TATAMOTORS"), "TMPV")
        self.assertEqual(worker.resolve_canonical_symbol("TATAMOTORS-EQ"), "TMPV")

    def test_tmpv_resolves_to_tmpv(self):
        self.assertEqual(worker.resolve_canonical_symbol("TMPV"), "TMPV")
        self.assertEqual(worker.resolve_canonical_symbol("TMPV-EQ"), "TMPV")

    def test_prajind_resolves_to_prajind(self):
        self.assertEqual(worker.resolve_canonical_symbol("PRAJIND"), "PRAJIND")
        self.assertEqual(worker.resolve_canonical_symbol("PRAJIND-EQ"), "PRAJIND")

    def test_unknown_symbol_resolves_cleanly(self):
        self.assertEqual(worker.resolve_canonical_symbol("NONEXISTENT"), "NONEXISTENT")
        self.assertEqual(worker.resolve_canonical_symbol("UNKNOWN-EQ"), "UNKNOWN")

    def test_get_symbol_aliases_returns_mirrored_symbols(self):
        aliases = worker.get_symbol_aliases("ETERNAL")
        self.assertIn("ZOMATO", aliases)

        tmpv_aliases = worker.get_symbol_aliases("TMPV")
        self.assertIn("TATAMOTORS", tmpv_aliases)


class BenchmarkFallbackSourceTest(unittest.TestCase):
    def test_benchmark_fallback_is_never_labeled_angelone_live(self):
        old_smart_api = worker.GLOBAL_SMART_API
        worker.GLOBAL_SMART_API = None
        try:
            quote = worker.fetch_quote_for_symbol("RELIANCE")
            self.assertIsNotNone(quote)
            self.assertNotEqual(quote.get("source"), "angelone_live")
            self.assertEqual(quote.get("source"), "benchmark_fallback")
        finally:
            worker.GLOBAL_SMART_API = old_smart_api

    def test_writer_default_source_is_not_angelone_live(self):
        mock_redis = MagicMock()
        writer = worker.QuoteWriter(mock_redis, 300, 86400, 500)
        sub = worker.Subscription("RELIANCE", "2885", "NSE", 1)
        writer.write(sub, 250000, 100)
        mock_pipe = mock_redis.pipeline.return_value.__enter__.return_value
        hset_calls = [c for c in mock_pipe.method_calls if c[0] == "hset"]
        self.assertTrue(len(hset_calls) > 0)
        mapping = hset_calls[0][2]["mapping"]
        self.assertNotEqual(mapping.get("source"), "angelone_live")
        self.assertEqual(mapping.get("source"), "synthetic")


class QuoteServerArchitectureTest(unittest.TestCase):
    def test_start_quote_server_defaults_to_all_interfaces(self):
        old_host = os.environ.get("QUOTE_SERVER_HOST")
        old_port = os.environ.get("QUOTE_SERVER_PORT")
        try:
            if "QUOTE_SERVER_HOST" in os.environ:
                del os.environ["QUOTE_SERVER_HOST"]
            os.environ["QUOTE_SERVER_PORT"] = "0"
            server = worker.start_quote_server()
            self.assertIsNotNone(server)
            host, port = server.server_address
            self.assertEqual(host, "0.0.0.0")
            self.assertGreater(port, 0)
            server.shutdown()
            server.server_close()
        finally:
            if old_host is not None:
                os.environ["QUOTE_SERVER_HOST"] = old_host
            elif "QUOTE_SERVER_HOST" in os.environ:
                del os.environ["QUOTE_SERVER_HOST"]
            if old_port is not None:
                os.environ["QUOTE_SERVER_PORT"] = old_port
            elif "QUOTE_SERVER_PORT" in os.environ:
                del os.environ["QUOTE_SERVER_PORT"]

    def test_quote_server_endpoint_serves_requests(self):
        os.environ["QUOTE_SERVER_HOST"] = "127.0.0.1"
        os.environ["QUOTE_SERVER_PORT"] = "0"
        try:
            server = worker.start_quote_server()
            self.assertIsNotNone(server)
            _, port = server.server_address

            conn = http.client.HTTPConnection("127.0.0.1", port, timeout=2)
            conn.request("GET", "/quote?symbol=RELIANCE")
            resp = conn.getresponse()
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode())
            self.assertEqual(data.get("symbol"), "RELIANCE")
            self.assertGreater(data.get("price_paise", 0), 0)
            conn.close()

            conn = http.client.HTTPConnection("127.0.0.1", port, timeout=2)
            conn.request("GET", "/quote")
            resp = conn.getresponse()
            self.assertEqual(resp.status, 400)
            conn.close()

            conn = http.client.HTTPConnection("127.0.0.1", port, timeout=2)
            conn.request("GET", "/unknown")
            resp = conn.getresponse()
            self.assertEqual(resp.status, 404)
            conn.close()

            server.shutdown()
            server.server_close()
        finally:
            os.environ.pop("QUOTE_SERVER_HOST", None)
            os.environ.pop("QUOTE_SERVER_PORT", None)


if __name__ == "__main__":
    unittest.main()



