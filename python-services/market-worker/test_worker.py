import importlib.util
import json
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
        self.assertEqual(mock_redis.store[quote_key]["source"], "synthetic_seed")


class FallbackMasterTest(unittest.TestCase):
    def test_fallback_master_contains_standard_symbols(self):
        symbols = [item["name"] for item in worker.FALLBACK_INSTRUMENT_MASTER]
        for expected in ["RELIANCE", "TCS", "INFY", "HDFCBANK", "NIFTY", "BANKNIFTY"]:
            self.assertIn(expected, symbols)


if __name__ == "__main__":
    unittest.main()
