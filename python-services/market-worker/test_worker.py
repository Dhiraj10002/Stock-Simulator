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

        writer = worker.QuoteWriter(mock_redis, quote_ttl=60, history_ttl=300, history_max_items=50)
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
            last_tick="2026-09-25T10:00:00Z"
        )
        self.assertIn("market_event_id", state)
        self.assertTrue(state["market_event_id"].startswith("mkt_feed_"))
        self.assertEqual(state["feed_state"], "CONNECTED")
        self.assertEqual(state["last_tick"], "2026-09-25T10:00:00Z")
        self.assertFalse(state["is_synthetic"])

        # Check Redis publish was called
        mock_redis.publish.assert_called_once()
        args = mock_redis.publish.call_args[0]
        self.assertEqual(args[0], "market:updates")
        published = json.loads(args[1])
        self.assertEqual(published["feed_state"], "CONNECTED")
        self.assertEqual(published["last_tick"], "2026-09-25T10:00:00Z")


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
        mock_redis = MagicMock()
        writer = worker.QuoteWriter(mock_redis, 300, 86400, 500)
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



