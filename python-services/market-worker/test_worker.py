import http.client
import importlib.util
import json
import os
import pathlib
import sys
import tempfile
import unittest
from datetime import date


from unittest.mock import MagicMock

class DummySmartWebSocketV2:
    ROOT_URI = "wss://mock"
    HEART_BEAT_INTERVAL = 30
    def on_open(self, *a, **k): pass
    def on_error(self, *a, **k): pass
    def on_close(self, *a, **k): pass
    def _on_data(self, *a, **k): pass
    def _on_ping(self, *a, **k): pass
    def _on_pong(self, *a, **k): pass

for mod in ["psycopg", "pyotp", "redis", "websocket", "SmartApi"]:
    if mod not in sys.modules:
        try:
            __import__(mod)
        except ImportError:
            sys.modules[mod] = MagicMock()

if "SmartApi.smartWebSocketV2" not in sys.modules:
    mock_sw = MagicMock()
    mock_sw.SmartWebSocketV2 = DummySmartWebSocketV2
    sys.modules["SmartApi.smartWebSocketV2"] = mock_sw

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

    def hdel(self, key, *fields):
        self.commands.append(("hdel", key, fields))

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
        writer = worker.QuoteWriter(mock_redis, 300, 86400, 500, feed_mode="synthetic")
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

        # Verify fake quote was NOT injected into Redis quotes
        quote_key = "market:quote:INFY"
        self.assertNotIn(quote_key, mock_redis.store)


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

    def test_redacts_standalone_jwt_and_secrets(self):
        jwt_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
        msg = f"User session: {jwt_token}, password='SuperSecretPassword123!', api_key='angel_live_secret', totp_secret: JBSWY3DPEHPK3PXP"
        redacted = self.sanitizer.redact_text(msg)
        self.assertNotIn(jwt_token, redacted)
        self.assertNotIn("SuperSecretPassword123!", redacted)
        self.assertNotIn("angel_live_secret", redacted)
        self.assertNotIn("JBSWY3DPEHPK3PXP", redacted)
        self.assertIn("[REDACTED_JWT]", redacted)
        self.assertIn("password='[REDACTED]'", redacted)
        self.assertIn("api_key='[REDACTED]'", redacted)
        self.assertIn("totp_secret: [REDACTED]", redacted)

    def test_quote_writer_attaches_market_event_id(self):
        mock_redis = MagicMock()
        mock_pipe = MagicMock()
        mock_redis.pipeline.return_value.__enter__.return_value = mock_pipe
        mock_redis.lindex.return_value = None

        writer = worker.QuoteWriter(mock_redis, quote_ttl=60, history_ttl=300, history_max_items=50, feed_mode="synthetic")
        sub = worker.Subscription(symbol="RELIANCE", token="2885", exchange_segment="NSE", exchange_type=1)
        writer.write(sub, price_paise=250000, volume=1000, source="synthetic")

        # Verify pipe.publish was called with JSON containing market_event_id
        publish_calls = mock_pipe.publish.call_args_list
        self.assertTrue(len(publish_calls) > 0)
        channel, payload_str = publish_calls[0][0]
        self.assertEqual(channel, "market:updates")
        payload = json.loads(payload_str)
        self.assertIn("market_event_id", payload)
        self.assertTrue(payload["market_event_id"].startswith("mkt_tick_"))
        self.assertEqual(payload["symbol"], "RELIANCE")
        self.assertEqual(payload["price_paise"], 250000)

    def test_publish_feed_state_observability(self):
        mock_redis = MagicMock()
        state = worker.publish_feed_state(
            mock_redis,
            feed_provider="angel_one",
            feed_state="CONNECTED",
            is_synthetic=False,
            last_tick="2026-09-25T10:00:00Z",
            subscribed_tokens_count=1420
        )
        self.assertIn("market_event_id", state)
        self.assertTrue(state["market_event_id"].startswith("mkt_feed_"))
        self.assertEqual(state["feed_state"], "CONNECTED")
        self.assertEqual(state["last_tick"], "2026-09-25T10:00:00Z")
        self.assertEqual(state["subscribed_tokens_count"], 1420)
        self.assertFalse(state["is_synthetic"])

        # Check Redis publish was called
        mock_redis.publish.assert_called_once()
        args = mock_redis.publish.call_args[0]
        self.assertEqual(args[0], "market:updates")
        published = json.loads(args[1])
        self.assertEqual(published["feed_state"], "CONNECTED")
        self.assertEqual(published["last_tick"], "2026-09-25T10:00:00Z")
        self.assertEqual(published["subscribed_tokens_count"], 1420)


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

    def test_three_consecutive_failures_publishes_unavailable_and_retries_live(self):
        run_fn = MagicMock(return_value=False)
        self.assertTrue(self.supervisor.handle_feed_cycle(run_fn))
        self.assertEqual(self.supervisor.fail_count, 1)

        self.assertTrue(self.supervisor.handle_feed_cycle(run_fn))
        self.assertEqual(self.supervisor.fail_count, 2)

        # 3rd failure publishes UNAVAILABLE but continues retrying live (no synthetic fallback)
        res = self.supervisor.handle_feed_cycle(run_fn)
        self.assertTrue(res)  # returns True to keep retrying Angel One
        self.assertEqual(self.supervisor.fail_count, 3)
        self.assertFalse(self.supervisor.fallback_active)

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

    def test_explicit_live_mode_never_falls_back_to_synthetic(self):
        live_supervisor = worker.FeedSupervisor(self.store, self.writer, self.control, mode="live", max_failures=3)
        run_fail = MagicMock(return_value=False)

        # 5 consecutive failures in explicit live mode must NEVER trigger synthetic fallback
        for i in range(1, 6):
            res = live_supervisor.handle_feed_cycle(run_fail)
            self.assertTrue(res, f"handle_feed_cycle should return True to keep retrying in live mode on cycle {i}")
            self.assertEqual(live_supervisor.fail_count, i)
            self.assertFalse(live_supervisor.fallback_active)


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

    def test_load_aliases_from_json_file(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump({"CUSTOM_MERGER": "MERGED_TARGET", "SUB_CO": "PARENT_CO"}, f)
            temp_path = f.name
        try:
            aliases = worker.load_canonical_aliases(config_path=temp_path)
            self.assertEqual(worker.resolve_canonical_symbol("CUSTOM_MERGER"), "MERGED_TARGET")
            self.assertEqual(worker.resolve_canonical_symbol("SUB_CO-EQ"), "PARENT_CO")
            self.assertIn("CUSTOM_MERGER", worker.get_symbol_aliases("MERGED_TARGET"))
        finally:
            os.remove(temp_path)
            worker.load_canonical_aliases()

    def test_load_aliases_from_env_json(self):
        old_env = os.environ.get("SYMBOL_ALIASES")
        try:
            os.environ["SYMBOL_ALIASES"] = json.dumps({"ENV_ALIAS": "ENV_TARGET"})
            worker.load_canonical_aliases()
            self.assertEqual(worker.resolve_canonical_symbol("ENV_ALIAS"), "ENV_TARGET")
        finally:
            if old_env is not None:
                os.environ["SYMBOL_ALIASES"] = old_env
            else:
                os.environ.pop("SYMBOL_ALIASES", None)
            worker.load_canonical_aliases()

    def test_load_aliases_from_env_csv(self):
        old_env = os.environ.get("SYMBOL_ALIASES")
        try:
            os.environ["SYMBOL_ALIASES"] = "CSV_OLD1:CSV_NEW1,CSV_OLD2:CSV_NEW2"
            worker.load_canonical_aliases()
            self.assertEqual(worker.resolve_canonical_symbol("CSV_OLD1"), "CSV_NEW1")
            self.assertEqual(worker.resolve_canonical_symbol("CSV_OLD2-EQ"), "CSV_NEW2")
        finally:
            if old_env is not None:
                os.environ["SYMBOL_ALIASES"] = old_env
            else:
                os.environ.pop("SYMBOL_ALIASES", None)
            worker.load_canonical_aliases()

    def test_load_aliases_from_redis(self):
        mock_redis = MagicMock()
        mock_redis.hgetall.return_value = {"REDIS_RENAMED": "REDIS_CANONICAL"}
        worker.load_canonical_aliases(client=mock_redis)
        self.assertEqual(worker.resolve_canonical_symbol("REDIS_RENAMED"), "REDIS_CANONICAL")
        self.assertIn("REDIS_RENAMED", worker.get_symbol_aliases("REDIS_CANONICAL"))
        worker.load_canonical_aliases()


class BenchmarkFallbackSourceTest(unittest.TestCase):
    def setUp(self):
        self.orig_smart_api = worker.GLOBAL_SMART_API
        self.orig_writer = worker.GLOBAL_WRITER
        self.orig_feed_mode = os.environ.get("MARKET_FEED_MODE")
        worker.init_global_token_map()
        worker.GLOBAL_TOKEN_MAP["RELIANCE"] = {"token": "2885", "exch_seg": "NSE", "symbol": "RELIANCE-EQ"}

    def tearDown(self):
        worker.GLOBAL_SMART_API = self.orig_smart_api
        worker.GLOBAL_WRITER = self.orig_writer
        if self.orig_feed_mode is not None:
            os.environ["MARKET_FEED_MODE"] = self.orig_feed_mode
        elif "MARKET_FEED_MODE" in os.environ:
            del os.environ["MARKET_FEED_MODE"]

    def test_a_live_mode_rejects_fallback_and_makes_no_fake_redis_write(self):
        """Test A: In LIVE mode when Angel One is unavailable, return None and make zero Redis writes."""
        os.environ["MARKET_FEED_MODE"] = "live"
        worker.GLOBAL_SMART_API = None
        mock_writer = MagicMock()
        worker.GLOBAL_WRITER = mock_writer

        quote = worker.fetch_quote_for_symbol("RELIANCE")
        self.assertIsNone(quote, "LIVE mode must return None when Angel One quote is missing")
        self.assertEqual(mock_writer.write.call_count, 0, "LIVE mode must never write benchmark fallback to Redis")

    def test_b_live_mode_rejects_simulated_derivative_and_makes_no_fake_redis_write(self):
        """Test B: In LIVE mode, missing underlying or Angel One must not generate simulated derivatives or write to Redis."""
        os.environ["MARKET_FEED_MODE"] = "live"
        worker.GLOBAL_SMART_API = None
        mock_writer = MagicMock()
        worker.GLOBAL_WRITER = mock_writer

        quote_fut = worker.fetch_quote_for_symbol("NIFTY24SEPFUT")
        quote_opt = worker.fetch_quote_for_symbol("NIFTY24SEP25000CE")
        self.assertIsNone(quote_fut, "LIVE mode must not generate simulated futures")
        self.assertIsNone(quote_opt, "LIVE mode must not generate simulated options")
        self.assertEqual(mock_writer.write.call_count, 0, "LIVE mode must never write simulated derivatives to Redis")

    def test_c_synthetic_mode_preserves_benchmark_fallback(self):
        """Test C: In explicit SYNTHETIC mode, benchmark fallback is preserved and labeled benchmark_fallback."""
        os.environ["MARKET_FEED_MODE"] = "synthetic"
        worker.GLOBAL_SMART_API = None
        mock_writer = MagicMock()
        worker.GLOBAL_WRITER = mock_writer

        quote = worker.fetch_quote_for_symbol("RELIANCE")
        self.assertIsNotNone(quote)
        self.assertNotEqual(quote.get("source"), "angelone_live")
        self.assertEqual(quote.get("source"), "benchmark_fallback")
        self.assertEqual(quote.get("price_paise"), worker.DEFAULT_BENCHMARK_PRICES_PAISE["RELIANCE"])
        self.assertGreaterEqual(mock_writer.write.call_count, 1)

    def test_d_synthetic_mode_preserves_simulated_derivative(self):
        """Test D: In explicit SYNTHETIC mode, derivative contracts calculate simulated values labeled simulated_deriv."""
        os.environ["MARKET_FEED_MODE"] = "synthetic"
        worker.GLOBAL_SMART_API = None
        mock_writer = MagicMock()
        worker.GLOBAL_WRITER = mock_writer

        quote_fut = worker.fetch_quote_for_symbol("NIFTY24SEPFUT")
        self.assertIsNotNone(quote_fut)
        self.assertEqual(quote_fut.get("source"), "simulated_deriv")
        self.assertGreater(quote_fut.get("price_paise", 0), 0)

        quote_opt = worker.fetch_quote_for_symbol("NIFTY24SEP25000CE")
        self.assertIsNotNone(quote_opt)
        self.assertEqual(quote_opt.get("source"), "simulated_deriv")
        self.assertGreater(quote_opt.get("price_paise", 0), 0)

    def test_e_live_mode_accepts_valid_angel_one_quote(self):
        """Test E: In LIVE mode, valid quote from Angel One returns angelone_live and allows Redis write."""
        os.environ["MARKET_FEED_MODE"] = "live"
        mock_smart_api = MagicMock()
        mock_smart_api.getMarketData.return_value = {
            "status": True,
            "data": {"fetched": [{"symbolToken": "2885", "exchange": "NSE", "ltp": 2550.50, "close": 2500.00, "exchFeedTime": "30-Sep-2026 15:30:00"}]}
        }
        worker.GLOBAL_SMART_API = mock_smart_api
        mock_writer = MagicMock()
        worker.GLOBAL_WRITER = mock_writer

        with unittest.mock.patch.object(worker, "has_angel_credentials", return_value=True):
            quote = worker.fetch_quote_for_symbol("RELIANCE")
            self.assertIsNotNone(quote)
            self.assertEqual(quote.get("source"), "angelone_live")
            self.assertEqual(quote.get("price_paise"), 255050)
            self.assertEqual(mock_writer.write.call_count, 1)
            call_source = mock_writer.write.call_args[1].get("source")
            self.assertEqual(call_source, "angelone_live")

    def test_writer_rejects_non_live_source_in_live_mode(self):
        """QuoteWriter in LIVE mode must drop any non-live quote (synthetic, fallback, etc.) with zero Redis writes."""
        mock_redis = MagicMock()
        writer = worker.QuoteWriter(mock_redis, 300, 86400, 500, feed_mode="live")
        sub = worker.Subscription("RELIANCE", "2885", "NSE", 1)

        writer.write(sub, 250000, 100, source="synthetic")
        writer.write(sub, 250000, 100, source="benchmark_fallback")
        writer.write(sub, 250000, 100, source="simulated_deriv")
        writer.write(sub, 250000, 100, source="synthetic_gbm")

        self.assertEqual(mock_redis.pipeline.call_count, 0, "No Redis pipeline must execute for non-live quotes in LIVE mode")

    def test_writer_default_source_is_not_angelone_live(self):
        """In synthetic mode, QuoteWriter writes synthetic source and never mutates into angelone_live."""
        mock_redis = MagicMock()
        writer = worker.QuoteWriter(mock_redis, 300, 86400, 500, feed_mode="synthetic")
        sub = worker.Subscription("RELIANCE", "2885", "NSE", 1)
        writer.write(sub, 250000, 100)
        mock_pipe = mock_redis.pipeline.return_value.__enter__.return_value
        hset_calls = [c for c in mock_pipe.method_calls if c[0] == "hset"]
        self.assertTrue(len(hset_calls) > 0)
        quote_calls = [c for c in hset_calls if "market:quote:" in c[1][0]]
        self.assertTrue(len(quote_calls) > 0)
        mapping = quote_calls[0][2]["mapping"]
        self.assertNotEqual(mapping.get("source"), "angelone_live")
        self.assertEqual(mapping.get("source"), "synthetic")
        # Also verify last_tick was written to market:feed_state
        feed_state_calls = [c for c in hset_calls if c[1][0] == "market:feed_state"]
        self.assertTrue(len(feed_state_calls) > 0)
        self.assertIn("last_tick", feed_state_calls[0][2]["mapping"])

    def test_quote_writer_writes_authentic_source_without_mutation(self):
        """In LIVE mode, QuoteWriter writes angelone_live without mutation."""
        mock_redis = MagicMock()
        writer = worker.QuoteWriter(mock_redis, 300, 86400, 500, feed_mode="live")
        sub = worker.Subscription("RELIANCE", "2885", "NSE", 1)

        writer.write(sub, 250000, 100, source="angelone_live")
        mock_pipe = mock_redis.pipeline.return_value.__enter__.return_value
        hset_calls = [c for c in mock_pipe.method_calls if c[0] == "hset"]
        quote_calls = [c for c in hset_calls if "market:quote:" in c[1][0]]
        mapping = quote_calls[0][2]["mapping"]
        self.assertEqual(mapping.get("source"), "angelone_live")


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
        old_mode = os.environ.get("MARKET_FEED_MODE")
        os.environ["QUOTE_SERVER_HOST"] = "127.0.0.1"
        os.environ["QUOTE_SERVER_PORT"] = "0"
        try:
            # 1. In SYNTHETIC mode: /quote?symbol=RELIANCE returns 200 with benchmark quote
            os.environ["MARKET_FEED_MODE"] = "synthetic"
            server = worker.start_quote_server()
            self.assertIsNotNone(server)
            _, port = server.server_address

            conn = http.client.HTTPConnection("127.0.0.1", port, timeout=2)
            conn.request("GET", "/quote?symbol=RELIANCE")
            resp = conn.getresponse()
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode())
            self.assertEqual(data.get("symbol"), "RELIANCE")
            self.assertEqual(data.get("source"), "benchmark_fallback")
            self.assertGreater(data.get("price_paise", 0), 0)
            conn.close()

            # 2. In LIVE mode when Angel One is unavailable: /quote?symbol=RELIANCE returns 404 (Fail closed)
            os.environ["MARKET_FEED_MODE"] = "live"
            conn = http.client.HTTPConnection("127.0.0.1", port, timeout=2)
            conn.request("GET", "/quote?symbol=RELIANCE")
            resp = conn.getresponse()
            self.assertEqual(resp.status, 404)
            conn.close()

            # 3. Missing symbol parameter returns 400
            conn = http.client.HTTPConnection("127.0.0.1", port, timeout=2)
            conn.request("GET", "/quote")
            resp = conn.getresponse()
            self.assertEqual(resp.status, 400)
            conn.close()

            # 4. Unknown path returns 404
            conn = http.client.HTTPConnection("127.0.0.1", port, timeout=2)
            conn.request("GET", "/unknown")
            resp = conn.getresponse()
            self.assertEqual(resp.status, 404)
            conn.close()

            # 5. Health endpoint returns 200
            conn = http.client.HTTPConnection("127.0.0.1", port, timeout=2)
            conn.request("GET", "/health")
            resp = conn.getresponse()
            self.assertEqual(resp.status, 200)
            health_data = json.loads(resp.read().decode())
            self.assertEqual(health_data.get("status"), "ok")
            conn.close()

            server.shutdown()
            server.server_close()
        finally:
            if old_mode is not None:
                os.environ["MARKET_FEED_MODE"] = old_mode
            elif "MARKET_FEED_MODE" in os.environ:
                del os.environ["MARKET_FEED_MODE"]
            os.environ.pop("QUOTE_SERVER_HOST", None)
            os.environ.pop("QUOTE_SERVER_PORT", None)


class FeedStateTest(unittest.TestCase):
    def test_publish_feed_state_writes_to_redis_and_pubsub(self):
        mock_redis = MagicMock()
        state = worker.publish_feed_state(mock_redis, "angel_one", "LIVE", is_synthetic=False, last_tick="2026-09-23T12:00:00Z")
        self.assertEqual(state["feed_provider"], "angel_one")
        self.assertEqual(state["feed_state"], "LIVE")
        self.assertFalse(state["is_synthetic"])
        self.assertEqual(state["last_tick"], "2026-09-23T12:00:00Z")

        mock_redis.hset.assert_called_once()
        call_args = mock_redis.hset.call_args
        self.assertEqual(call_args[0][0], "market:feed_state")
        self.assertEqual(call_args[1]["mapping"]["feed_provider"], "angel_one")
        self.assertEqual(call_args[1]["mapping"]["feed_state"], "LIVE")
        self.assertEqual(call_args[1]["mapping"]["is_synthetic"], "false")

        mock_redis.publish.assert_called_once()
        pub_channel, pub_payload = mock_redis.publish.call_args[0]
        self.assertEqual(pub_channel, "market:updates")
        parsed_pub = json.loads(pub_payload)
        self.assertEqual(parsed_pub["type"], "feed_status")
        self.assertEqual(parsed_pub["feed_provider"], "angel_one")

    def test_feed_supervisor_publishes_unavailable_state_on_threshold(self):
        mock_redis = MagicMock()
        mock_writer = MagicMock()
        mock_writer.client = mock_redis
        control = worker.FeedControl()
        supervisor = worker.FeedSupervisor(None, mock_writer, control, mode="live", max_failures=2)

        def failing_feed(store, writer, control):
            return False

        # First failure -> RETRYING
        supervisor.handle_feed_cycle(failing_feed)
        self.assertEqual(supervisor.fail_count, 1)
        retrying_calls = [c for c in mock_redis.hset.call_args_list if c[1]["mapping"].get("feed_state") == "RETRYING"]
        self.assertTrue(len(retrying_calls) > 0)
        self.assertEqual(retrying_calls[0][1]["mapping"]["feed_provider"], "angel_one")
        self.assertEqual(retrying_calls[0][1]["mapping"]["is_synthetic"], "false")

        # Second failure -> triggers UNAVAILABLE state (never synthetic fallback!)
        res = supervisor.handle_feed_cycle(failing_feed)
        self.assertTrue(res)  # continues live retry loop
        unavailable_calls = [c for c in mock_redis.hset.call_args_list if c[1]["mapping"].get("feed_state") == "UNAVAILABLE"]
        self.assertTrue(len(unavailable_calls) > 0)
        self.assertEqual(unavailable_calls[0][1]["mapping"]["feed_provider"], "angel_one")
        self.assertEqual(unavailable_calls[0][1]["mapping"]["is_synthetic"], "false")

    def test_live_mode_without_credentials_publishes_unavailable(self):
        mock_redis = MagicMock()
        state = worker.publish_feed_state(mock_redis, "angel_one", "UNAVAILABLE", is_synthetic=False)
        self.assertEqual(state["feed_provider"], "angel_one")
        self.assertEqual(state["feed_state"], "UNAVAILABLE")
        self.assertEqual(state["is_synthetic"], False)

    def test_synthetic_mode_publishes_synthetic_live_state(self):
        mock_redis = MagicMock()
        state = worker.publish_feed_state(mock_redis, "synthetic", "LIVE", is_synthetic=True)
        self.assertEqual(state["feed_provider"], "synthetic")
        self.assertEqual(state["feed_state"], "LIVE")
        self.assertEqual(state["is_synthetic"], True)


if __name__ == "__main__":
    unittest.main()





class DemandSubscriptionRegressionTest(unittest.TestCase):
    def setUp(self):
        self.store = worker.InstrumentStore("", ["TCS"])
        self.rows = [
            {"symbol": "TCS-EQ", "name": "TCS", "exch_seg": "NSE", "token": "11536"},
            {"symbol": "TCS29SEP991940CE", "name": "TCS", "exch_seg": "NFO", "token": "50001", "expiry": "29SEP2099"},
            {"symbol": "TCS24SEP001940CE", "name": "TCS", "exch_seg": "NFO", "token": "50002", "expiry": "24SEP2000"},
            {"symbol": "835TCSL27-N0", "name": "TCS", "exch_seg": "NSE", "token": "999"},
        ]
        self.store._rows = self.rows
        self.store._subscriptions = {(s.token, s.exchange_type): s for s in self.store._build_subscriptions(self.rows)}

    def test_exact_nfo_token_is_subscribed_without_expired_contracts_or_bonds(self):
        subs = self.store._build_subscriptions(self.rows, [r["symbol"] for r in self.rows])
        self.assertEqual({s.symbol for s in subs}, {"TCS", "TCS29SEP991940CE"})
        option = next(s for s in subs if s.exchange_segment == "NFO")
        self.assertEqual((option.token, option.exchange_type), ("50001", 2))

    def test_demand_adds_and_removes_broker_subscription(self):
        client = MagicMock()
        socket = MagicMock()
        client.zrevrangebyscore.return_value = ["TCS29SEP991940CE"]
        added = worker.sync_demand_subscriptions(self.store, client, socket)
        self.assertEqual([s.symbol for s in added], ["TCS29SEP991940CE"])
        socket.subscribe.assert_called_once_with("demand", 3, [{"exchangeType": 2, "tokens": ["50001"]}])
        self.assertIsNotNone(self.store.lookup("50001", 2))
        # Repeated polling must not re-subscribe or duplicate SDK reconnect tokens.
        worker.sync_demand_subscriptions(self.store, client, socket)
        self.assertEqual(socket.subscribe.call_count, 1)
        self.assertEqual(socket.input_request_dict[3][2], ["50001"])
        client.zrevrangebyscore.return_value = []
        worker.sync_demand_subscriptions(self.store, client, socket)
        socket.unsubscribe.assert_called_once_with("demand", 3, [{"exchangeType": 2, "tokens": ["50001"]}])
        self.assertIsNone(self.store.lookup("50001", 2))
        self.assertIsNotNone(self.store.lookup("11536", 1))

    def test_failed_subscribe_can_retry(self):
        client, socket = MagicMock(), MagicMock()
        client.zrevrangebyscore.return_value = ["TCS29SEP991940CE"]
        socket.subscribe.side_effect = RuntimeError("disconnected")
        with self.assertRaises(RuntimeError):
            worker.sync_demand_subscriptions(self.store, client, socket)
        self.assertIsNone(self.store.lookup("50001", 2))
        socket.subscribe.side_effect = None
        worker.sync_demand_subscriptions(self.store, client, socket)
        self.assertIsNotNone(self.store.lookup("50001", 2))

class ProvenanceCandleTest(unittest.TestCase):
    def test_mode_switch_does_not_mix_same_minute_ohlc(self):
        old = worker.make_candle(None, 10, 99999, 100, "synthetic_gbm", "SYNTHETIC")
        live = worker.make_candle(json.dumps(old), 10, 10000, 3, "angelone_live", "LIVE")
        self.assertEqual(live["open_paise"], 10000)
        self.assertEqual(live["high_paise"], 10000)
        self.assertEqual(live["volume"], 3)
        self.assertEqual(live["source"], "angelone_live")


class RealBrokerDataRegressionTest(unittest.TestCase):
    def test_zero_change_is_available_and_no_fake_volume_is_written(self):
        from unittest.mock import patch
        api = MagicMock()
        api.getMarketData.return_value = {"status": True, "data": {"fetched": [
            {"exchange": "NFO", "symbolToken": "12345", "ltp": 4.6, "close": 4.6,
             "tradeVolume": 22, "exchFeedTime": "30-Sep-2026 15:30:00"}]}}
        info = {"token": "12345", "exch_seg": "NFO", "symbol": "TCS23NOV262640CE"}
        with patch.dict(os.environ, MARKET_FEED_MODE="live"), patch.object(worker, "GLOBAL_SMART_API", api), patch.object(worker, "GLOBAL_TOKEN_MAP", {info["symbol"]: info}), patch.object(worker, "GLOBAL_WRITER", None), patch.object(worker, "broker_call", side_effect=lambda call: call()):
            q = worker.fetch_quote_for_symbol(info["symbol"])
        self.assertEqual(q["change_paise"], 0)
        self.assertTrue(q["day_change_available"])
        self.assertEqual(q["previous_close_paise"], 460)
        self.assertEqual(q["volume"], 22)
        self.assertEqual(q["updated_at"], "2026-09-30T10:00:00+00:00")
        api.getMarketData.assert_called_once_with("FULL", {"NFO": ["12345"]})

    def test_snapshot_wrong_identity_rejected(self):
        from unittest.mock import patch
        api = MagicMock()
        api.getMarketData.return_value = {"status": True, "data": {"fetched": [{"exchange": "NSE", "symbolToken": "12345", "ltp": 900}]}}
        with patch.object(worker, "broker_call", side_effect=lambda call: call()):
            self.assertIsNone(worker.fetch_full_snapshot(api, "NFO", "12345"))

    def test_missing_close_does_not_use_hardcoded_live_benchmark(self):
        redis = MockRedis()
        writer = worker.QuoteWriter(redis, 300, 86400, 500, feed_mode="live")
        writer.write(worker.Subscription("RELIANCE", "2885", "NSE", 1), 10000, 0, source="angelone_live", build_history=False)
        q = redis.store["market:quote:RELIANCE"]
        self.assertEqual(q["previous_close_paise"], 0)
        self.assertEqual(q["day_change_available"], "false")
        self.assertNotIn("change_paise", q)
        self.assertNotIn("market:history:RELIANCE", redis.store)

    def test_historical_rows_use_rupees_to_paise_sort_and_filter_invalid_data(self):
        now = worker.datetime(2026, 9, 30, 11, tzinfo=worker.timezone.utc)
        rows = [["2026-09-30T15:29:00+05:30", 100, 102, 99, 101, 0],
                ["2026-09-30T15:28:00+05:30", 100, 102, 99, 100, 100],
                ["2026-09-30T15:29:00+05:30", 100, 102, 99, 101, 0],
                ["2026-09-30T15:30:00+05:30", 100, 90, 110, 101, 1],
                ["2026-10-01T15:30:00+05:30", 100, 102, 99, 101, 1]]
        candles = worker.normalize_broker_candles(rows, now)
        self.assertEqual(len(candles), 2)
        self.assertGreater(candles[0]["timestamp"], candles[1]["timestamp"])
        self.assertEqual(candles[0]["close_paise"], 10100)
        self.assertEqual(candles[0]["volume"], 0)
        self.assertEqual(candles[0]["feed_mode"], "LIVE")

    def test_backfill_is_disabled_outside_live_mode(self):
        writer = worker.QuoteWriter(None, 300, 86400, 500, feed_mode="synthetic")
        api = MagicMock()
        self.assertFalse(worker.backfill_history(writer, api, worker.Subscription("NIFTY", "99926000", "NSE", 1), "ONE_MINUTE"))
        api.getCandleData.assert_not_called()

    def test_verified_websocket_requires_tls_validation(self):
        from unittest.mock import patch
        socket = object.__new__(worker.VerifiedSmartWebSocket)
        socket.auth_token, socket.api_key, socket.client_code, socket.feed_token = "test", "test", "test", "test"
        with patch.object(worker, "WebSocketApp") as app:
            socket.connect()
        self.assertEqual(app.return_value.run_forever.call_args.kwargs["sslopt"]["cert_reqs"], worker.ssl.CERT_REQUIRED)
        self.assertTrue(app.return_value.run_forever.call_args.kwargs["sslopt"]["check_hostname"])


class BrokerHistoryIntegrationBoundaryTest(unittest.TestCase):
    def test_backfill_merges_newer_stream_bucket_and_never_fabricates_quotes(self):
        from unittest.mock import patch
        now = worker.datetime.now(worker.timezone.utc)
        old = now - worker.timedelta(minutes=5)
        stream = dict(timestamp=int(now.timestamp()) // 60 * 60, open_paise=10100, high_paise=10200,
                      low_paise=10000, close_paise=10150, volume=5, source="angelone_live", feed_mode="LIVE")
        client = MagicMock()
        client.lrange.return_value = [json.dumps(stream)]
        writer = worker.QuoteWriter(client, 300, 86400, 500, feed_mode="live")
        api = MagicMock()
        api.getCandleData.return_value = {"status": True, "data": [[old.isoformat(), 100, 102, 99, 101, 0]]}
        sub = worker.Subscription("NIFTY", "99926000", "NSE", 1)
        with patch.object(worker, "broker_call", side_effect=lambda call: call()):
            self.assertTrue(worker.backfill_history(writer, api, sub, "ONE_MINUTE"))
        pipe = client.pipeline.return_value.__enter__.return_value
        args = pipe.rpush.call_args.args
        self.assertEqual(args[0], "market:history:NIFTY")
        self.assertEqual(json.loads(args[1])["close_paise"], 10150)
        self.assertEqual(json.loads(args[2])["volume"], 0)
        pipe.hset.assert_not_called()
        params = api.getCandleData.call_args.args[0]
        self.assertEqual(params["symboltoken"], "99926000")
        self.assertEqual(params["interval"], "ONE_MINUTE")

    def test_empty_broker_history_does_not_delete_cached_candles(self):
        from unittest.mock import patch
        client, api = MagicMock(), MagicMock()
        api.getCandleData.return_value = {"status": True, "data": []}
        writer = worker.QuoteWriter(client, 300, 86400, 500, feed_mode="live")
        with patch.object(worker, "broker_call", side_effect=lambda call: call()):
            self.assertFalse(worker.backfill_history(writer, api, worker.Subscription("NIFTY", "99926000", "NSE", 1), "ONE_MINUTE"))
        client.pipeline.assert_not_called()
