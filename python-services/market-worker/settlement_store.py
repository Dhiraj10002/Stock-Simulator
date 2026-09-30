"""Archive sourced closing-window ticks outside Redis and the quote hot path."""
import logging
import threading
from datetime import datetime
from zoneinfo import ZoneInfo


class SettlementRecorder:
    def __init__(self, database_url: str):
        self.database_url = database_url
        self.pending = {}
        self.lock = threading.Lock()
        if database_url:
            threading.Thread(target=self._run, daemon=True, name="settlement-archive").start()

    def record(self, symbol: str, price: int, source: str, mode: str, observed: datetime):
        local = observed.astimezone(ZoneInfo("Asia/Kolkata"))
        allowed = (mode == "live" and source == "angelone_live") or (mode == "synthetic" and source in ("synthetic_gbm", "synthetic", "fno_engine", "simulated_deriv"))
        if not self.database_url or not allowed or price <= 0 or local.weekday() >= 5 or (local.hour, local.minute) != (15, 29):
            return
        key = (symbol, local.date().isoformat(), mode.upper())
        with self.lock:
            previous = self.pending.get(key)
            if previous is None or observed > previous[-1]:
                self.pending[key] = (*key, source, price, observed)

    def flush(self):
        with self.lock:
            rows = list(self.pending.values())
        if not rows:
            return
        import psycopg
        with psycopg.connect(self.database_url, connect_timeout=3) as conn:
            with conn.cursor() as cur:
                cur.execute("SET LOCAL statement_timeout = '5s'")
                cur.executemany("""
                    INSERT INTO settlement_references (symbol, session_date, feed_mode, source, price_paise, observed_at)
                    VALUES (%s,%s,%s,%s,%s,%s)
                    ON CONFLICT (symbol,session_date,feed_mode) DO UPDATE SET
                        source=EXCLUDED.source, price_paise=EXCLUDED.price_paise, observed_at=EXCLUDED.observed_at
                    WHERE settlement_references.observed_at < EXCLUDED.observed_at
                """, rows)
        with self.lock:
            for row in rows:
                key = row[:3]
                if self.pending.get(key) == row:
                    del self.pending[key]

    def _run(self):
        while True:
            threading.Event().wait(1)
            try:
                self.flush()
            except Exception:
                # Keep pending rows for retry; never print connection credentials.
                logging.warning("settlement archive unavailable; pending references retained for retry")
