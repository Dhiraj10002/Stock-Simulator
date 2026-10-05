import unittest
from datetime import datetime
from zoneinfo import ZoneInfo
from unittest.mock import patch
from settlement_store import SettlementRecorder


class SettlementRecorderTest(unittest.TestCase):
    def test_nfo_archive_uses_new_close_and_retains_historical_schedule(self):
        with patch("settlement_store.threading.Thread"):
            recorder = SettlementRecorder("unused-test-url")
        for day, minute, valid in [("2026-09-29", 29, False), ("2026-09-29", 35, False), ("2026-09-29", 39, True), ("2026-09-29", 41, False), ("2026-07-30", 29, True), ("2026-07-30", 39, False)]:
            with self.subTest(day=day, minute=minute):
                recorder.pending.clear()
                observed = datetime.fromisoformat(day).replace(hour=15, minute=minute, second=55, tzinfo=ZoneInfo("Asia/Kolkata"))
                recorder.record("NIFTYFUT", 100, "angelone_live", "live", observed, "NFO")
                self.assertEqual(bool(recorder.pending), valid)

    def test_only_sourced_closing_window_is_recorded_and_latest_wins(self):
        with patch("settlement_store.threading.Thread"):
            recorder = SettlementRecorder("unused-test-url")
        close = datetime(2026, 9, 24, 15, 29, 55, tzinfo=ZoneInfo("Asia/Kolkata"))
        recorder.record("TCS", 100, "synthetic_gbm", "live", close)
        recorder.record("TCS", 100, "angelone_live", "live", close.replace(hour=11))
        self.assertEqual(recorder.pending, {})
        recorder.record("TCS", 105, "angelone_live", "live", close)
        recorder.record("TCS", 99, "angelone_live", "live", close.replace(second=50))
        self.assertEqual(list(recorder.pending.values())[0][-2], 105)
        recorder.record("TCS", 106, "angelone_live", "live", close.replace(second=59))
        self.assertEqual(list(recorder.pending.values())[0][-2], 106)

    def test_failed_archive_retains_pending_reference(self):
        with patch("settlement_store.threading.Thread"):
            recorder = SettlementRecorder("unused-test-url")
        close = datetime(2026, 9, 24, 15, 29, 55, tzinfo=ZoneInfo("Asia/Kolkata"))
        recorder.record("TCS", 105, "angelone_live", "live", close)
        import sys
        from unittest.mock import MagicMock
        driver = MagicMock()
        driver.connect.side_effect = RuntimeError("database unavailable")
        with patch.dict(sys.modules, {"psycopg": driver}):
            with self.assertRaises(RuntimeError):
                recorder.flush()
        self.assertEqual(len(recorder.pending), 1)
