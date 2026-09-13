import importlib.util
import pathlib
import sys
import unittest
from datetime import date


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
        second = worker.make_candle(__import__("json").dumps(first), 10, 10100, 40)
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


if __name__ == "__main__":
    unittest.main()
