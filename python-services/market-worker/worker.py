import json
import math
import os
import random
import threading
import time
import urllib.request
from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any

import psycopg
import pyotp
import redis
from SmartApi import SmartConnect
from SmartApi.smartWebSocketV2 import SmartWebSocketV2

INSTRUMENT_MASTER_URL = "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json"
EXCHANGE_TYPES = {"NSE": 1, "NFO": 2, "BSE": 3, "MCX": 5, "NCDEX": 7}

FALLBACK_INSTRUMENT_MASTER = [
    {"token": "2885", "symbol": "RELIANCE-EQ", "name": "RELIANCE", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "11536", "symbol": "TCS-EQ", "name": "TCS", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "1594", "symbol": "INFY-EQ", "name": "INFY", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "1333", "symbol": "HDFCBANK-EQ", "name": "HDFCBANK", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "26000", "symbol": "NIFTY-INDEX", "name": "NIFTY", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "25", "instrumenttype": "AMXIDX", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "26009", "symbol": "BANKNIFTY-INDEX", "name": "BANKNIFTY", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "15", "instrumenttype": "AMXIDX", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "5097", "symbol": "ETERNAL-EQ", "name": "ETERNAL", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "11491", "symbol": "APARINDS-EQ", "name": "APARINDS", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
]

DEFAULT_BENCHMARK_PRICES_PAISE = {
    "RELIANCE": 124390,  # ₹1,243.90
    "TCS": 219000,       # ₹2,190.00
    "INFY": 105860,      # ₹1,058.60
    "HDFCBANK": 71300,   # ₹713.00
    "NIFTY": 2532000,    # ₹25,320.00
    "BANKNIFTY": 5215000,# ₹52,150.00
    "ETERNAL": 27850,    # ₹278.50 (formerly Zomato)
    "APARINDS": 845000,  # ₹8,450.00
}


@dataclass(frozen=True)
class Subscription:
    symbol: str
    token: str
    exchange_segment: str
    exchange_type: int


class FeedControl:
    """Coordinates refresh/watchdog signals with the active WebSocket."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._websocket: SmartWebSocketV2 | None = None
        self._opened = False
        self._last_tick_at: float | None = None
        self._reconnect_requested = False

    def attach(self, websocket: SmartWebSocketV2) -> None:
        with self._lock:
            self._websocket = websocket
            self._opened = False
            self._last_tick_at = None
            self._reconnect_requested = False

    def opened(self) -> None:
        with self._lock:
            self._opened = True
            self._last_tick_at = time.monotonic()
            self._reconnect_requested = False

    def tick(self) -> None:
        with self._lock:
            self._last_tick_at = time.monotonic()

    def healthy_connection_opened(self) -> bool:
        with self._lock:
            return self._opened

    def stale(self, stale_after_seconds: int) -> bool:
        with self._lock:
            return self._opened and self._last_tick_at is not None and time.monotonic() - self._last_tick_at > stale_after_seconds

    def reconnect(self, reason: str) -> None:
        with self._lock:
            websocket = self._websocket
            if websocket is None or self._reconnect_requested:
                return
            self._reconnect_requested = True
        print(f"market worker: reconnect requested ({reason})", flush=True)
        try:
            websocket.close_connection()
        except Exception as error:
            with self._lock:
                if self._websocket is websocket:
                    self._reconnect_requested = False
            print(f"market worker: failed to close WebSocket: {error}", flush=True)

    def detach(self, websocket: SmartWebSocketV2) -> None:
        with self._lock:
            if self._websocket is websocket:
                self._websocket = None
                self._opened = False
                self._last_tick_at = None
                self._reconnect_requested = False


class InstrumentStore:
    def __init__(self, database_url: str, symbols: list[str]) -> None:
        self.database_url = database_url
        self.symbols = symbols
        self._subscriptions: dict[tuple[str, int], Subscription] = {}
        self._lock = threading.Lock()

    def subscriptions(self) -> list[Subscription]:
        with self._lock:
            return list(self._subscriptions.values())

    def lookup(self, token: str, exchange_type: int) -> Subscription | None:
        with self._lock:
            return self._subscriptions.get((token, exchange_type))

    def refresh(self) -> bool:
        print("market worker: downloading Angel One instrument master", flush=True)
        rows: list[dict[str, Any]] = []
        try:
            request = urllib.request.Request(INSTRUMENT_MASTER_URL, headers={"User-Agent": "stock-simulator-market-worker/1.0"})
            with urllib.request.urlopen(request, timeout=30) as response:
                rows = json.load(response)
        except Exception as error:
            print(f"market worker: instrument master download failed: {error}; using fallback master", flush=True)
            rows = FALLBACK_INSTRUMENT_MASTER

        try:
            self._upsert(rows)
        except Exception as error:
            print(f"market worker: database upsert failed: {error}; proceeding with memory subscriptions", flush=True)

        subscriptions = self._build_subscriptions(rows)
        if not subscriptions:
            # Fall back to built-in subscriptions
            subscriptions = [
                Subscription(s, clean(item["token"]), "NSE", EXCHANGE_TYPES["NSE"])
                for s in self.symbols
                for item in FALLBACK_INSTRUMENT_MASTER
                if item["name"] == s
            ]
            if not subscriptions:
                raise RuntimeError("none of MARKET_SYMBOLS were found as NSE equity instruments")

        with self._lock:
            changed = self._subscriptions != {(item.token, item.exchange_type): item for item in subscriptions}
            self._subscriptions = {(item.token, item.exchange_type): item for item in subscriptions}
        print(f"market worker: configured {len(subscriptions)} instruments; subscribed symbols={','.join(item.symbol for item in subscriptions)}", flush=True)
        return changed

    def _upsert(self, rows: list[dict[str, Any]]) -> None:
        if not self.database_url:
            return
        statement = """
            INSERT INTO instruments (token, symbol, name, underlying_symbol, expiry, strike, option_type, lot_size, instrument_type, exchange_segment, tick_size, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
            ON CONFLICT (token, exchange_segment) DO UPDATE SET
                symbol = EXCLUDED.symbol, name = EXCLUDED.name, expiry = EXCLUDED.expiry,
                underlying_symbol = EXCLUDED.underlying_symbol,
                strike = EXCLUDED.strike, lot_size = EXCLUDED.lot_size,
                option_type = EXCLUDED.option_type,
                instrument_type = EXCLUDED.instrument_type, tick_size = EXCLUDED.tick_size,
                updated_at = NOW()
        """
        values = []
        target_names = set(self.symbols)
        for row in rows:
            token, segment = clean(row.get("token")), clean(row.get("exch_seg"))
            if not token or not segment:
                continue
            name = clean(row.get("name"))
            symbol = clean(row.get("symbol"))
            underlying = clean(row.get("underlying_symbol")) or name
            if name not in target_names and symbol not in target_names and underlying not in target_names:
                continue
            values.append((token, symbol, name, underlying, clean(row.get("expiry")),
                           clean(row.get("strike")), clean(row.get("option_type")), integer(row.get("lotsize")), clean(row.get("instrumenttype")),
                           segment, clean(row.get("tick_size"))))
        if not values:
            return
        with psycopg.connect(self.database_url) as connection:
            with connection.cursor() as cursor:
                for start in range(0, len(values), 1000):
                    cursor.executemany(statement, values[start:start + 1000])
            connection.commit()

    def _build_subscriptions(self, rows: list[dict[str, Any]]) -> list[Subscription]:
        subscriptions = []
        for requested in self.symbols:
            match = next((row for row in rows if clean(row.get("exch_seg")) == "NSE" and clean(row.get("name")).upper() == requested
                          and (clean(row.get("symbol")).upper() == f"{requested}-EQ" or clean(row.get("symbol")).upper() == f"{requested}-INDEX")), None)
            if match is None:
                continue
            subscriptions.append(Subscription(requested, clean(match.get("token")), "NSE", EXCHANGE_TYPES["NSE"]))
        return subscriptions


class QuoteWriter:
    def __init__(self, client: redis.Redis, quote_ttl: int, history_ttl: int, history_max_items: int) -> None:
        self.client = client
        self.quote_ttl = quote_ttl
        self.history_ttl = history_ttl
        self.history_max_items = history_max_items
        self._daily_volume: dict[str, tuple[date, int]] = {}

    def write(self, subscription: Subscription, price_paise: int, volume: int, source: str = "angelone_live") -> None:
        now = datetime.now(timezone.utc)
        quote = {"symbol": subscription.symbol, "price_paise": price_paise, "source": source, "updated_at": now.isoformat()}
        quote_key, history_key = f"market:quote:{subscription.symbol}", f"market:history:{subscription.symbol}"
        bucket = int(now.timestamp()) // 60
        latest = self.client.lindex(history_key, 0)
        candle = make_candle(latest, bucket, price_paise, self.volume_delta(subscription.symbol, now.date(), volume))
        with self.client.pipeline() as pipe:
            pipe.hset(quote_key, mapping=quote)
            pipe.expire(quote_key, self.quote_ttl)
            if latest and candle["timestamp"] == bucket * 60:
                pipe.lset(history_key, 0, json.dumps(candle))
            else:
                pipe.lpush(history_key, json.dumps(candle))
            pipe.ltrim(history_key, 0, self.history_max_items - 1)
            pipe.expire(history_key, self.history_ttl)
            pipe.publish("market:updates", json.dumps(quote))
            pipe.execute()

    def volume_delta(self, symbol: str, trading_day: date, cumulative_volume: int) -> int:
        """Converts Angel One's cumulative day volume to a non-negative delta."""
        cumulative_volume = max(cumulative_volume, 0)
        previous = self._daily_volume.get(symbol)
        self._daily_volume[symbol] = (trading_day, cumulative_volume)
        if previous is None or previous[0] != trading_day:
            return cumulative_volume
        return max(cumulative_volume - previous[1], 0)


def is_indian_market_open() -> bool:
    now_utc = datetime.now(timezone.utc)
    # Indian Standard Time is UTC + 5:30
    now_ist = datetime.fromtimestamp(now_utc.timestamp() + 5 * 3600 + 30 * 60, tz=timezone.utc)
    if now_ist.weekday() > 4:  # Saturday or Sunday
        return False
    # Market trading session: 09:15 to 15:30 IST
    market_open = now_ist.replace(hour=9, minute=15, second=0, microsecond=0)
    market_close = now_ist.replace(hour=15, minute=30, second=0, microsecond=0)
    return market_open <= now_ist <= market_close


class SyntheticFeed:
    """
    Generates realistic market micro-ticks using Geometric Brownian Motion (GBM)
    with mean-reverting drift and volume bursts for offline / 24-7 paper trading.
    """

    def __init__(
        self,
        subscriptions: list[Subscription],
        writer: QuoteWriter,
        tick_interval_seconds: float = 1.0,
        benchmark_prices: dict[str, int] | None = None,
    ) -> None:
        self.subscriptions = subscriptions
        self.writer = writer
        self.tick_interval_seconds = max(0.1, tick_interval_seconds)
        self.benchmark_prices = benchmark_prices or DEFAULT_BENCHMARK_PRICES_PAISE
        self._prices: dict[str, float] = {
            s.symbol: float(self.benchmark_prices.get(s.symbol, 200000))
            for s in subscriptions
        }
        self._cumulative_volume: dict[str, int] = {s.symbol: 100000 for s in subscriptions}
        self._stop_event = threading.Event()

    def stop(self) -> None:
        self._stop_event.set()

    def step(self) -> list[tuple[Subscription, int, int]]:
        results = []
        for sub in self.subscriptions:
            cur_price = self._prices[sub.symbol]
            target_price = float(self.benchmark_prices.get(sub.symbol, cur_price))

            # Mean reversion drift towards benchmark
            drift = (target_price - cur_price) * 0.0008

            # Micro-volatility shock
            volatility_step = 0.0012
            shock = cur_price * random.gauss(0, volatility_step)

            new_price = max(100.0, cur_price + drift + shock)
            self._prices[sub.symbol] = new_price

            vol_delta = int(abs(shock) * 15) + random.randint(10, 150)
            self._cumulative_volume[sub.symbol] += vol_delta

            price_paise = int(round(new_price))
            self.writer.write(sub, price_paise, self._cumulative_volume[sub.symbol], source="synthetic_gbm")
            results.append((sub, price_paise, self._cumulative_volume[sub.symbol]))
        return results

    def run(self) -> None:
        print(f"market worker: synthetic GBM feed started for {len(self.subscriptions)} symbols ({','.join(s.symbol for s in self.subscriptions)})", flush=True)
        while not self._stop_event.is_set():
            if not is_indian_market_open():
                # Market is closed (after 15:30 IST or weekend): hold prices frozen!
                self._stop_event.wait(5.0)
                continue
            try:
                self.step()
            except Exception as error:
                print(f"market worker: synthetic tick generation error: {error}", flush=True)
            self._stop_event.wait(self.tick_interval_seconds)


def seed_historical_candles(client: redis.Redis, subscriptions: list[Subscription], history_ttl: int, max_items: int, count: int = 150) -> None:
    """
    Ensures Redis contains at least `count` 1-minute historical candles for each subscribed symbol.
    """
    now = datetime.now(timezone.utc)
    current_bucket = int(now.timestamp()) // 60

    for sub in subscriptions:
        history_key = f"market:history:{sub.symbol}"
        try:
            existing_count = client.llen(history_key)
            if existing_count >= 10:
                continue
        except Exception:
            continue

        base_price = DEFAULT_BENCHMARK_PRICES_PAISE.get(sub.symbol, 200000)
        prices = [base_price]
        cur_price = base_price

        # Walk backwards to generate realistic historical trajectory
        for i in range(count - 1):
            drift = (math.sin(i / 10.0) + math.cos(i / 14.0)) * 0.0005
            shock = (random.random() - 0.495) * 0.006
            cur_price = max(100, int(round(cur_price * (1.0 - drift - shock))))
            prices.insert(0, cur_price)

        candles = []
        for i, price in enumerate(prices):
            bucket = current_bucket - (count - 1 - i)
            spread = max(5, int(price * 0.002))
            wick = int(spread * (0.5 + random.random() * 0.8))
            open_paise = prices[i - 1] if i > 0 else price
            close_paise = price
            high_paise = max(open_paise, close_paise) + wick
            low_paise = max(1, min(open_paise, close_paise) - wick)
            vol = int(5000 + random.random() * 25000)
            candles.append({
                "timestamp": bucket * 60,
                "open_paise": open_paise,
                "high_paise": high_paise,
                "low_paise": low_paise,
                "close_paise": close_paise,
                "volume": vol,
            })

        try:
            with client.pipeline() as pipe:
                pipe.delete(history_key)
                for candle in reversed(candles):
                    pipe.rpush(history_key, json.dumps(candle))
                pipe.ltrim(history_key, 0, max_items - 1)
                pipe.expire(history_key, history_ttl)

                quote_key = f"market:quote:{sub.symbol}"
                quote = {
                    "symbol": sub.symbol,
                    "price_paise": candles[-1]["close_paise"],
                    "source": "synthetic_seed",
                    "updated_at": now.isoformat(),
                }
                pipe.hset(quote_key, mapping=quote)
                pipe.execute()
            print(f"market worker: seeded {len(candles)} historical candles in Redis for {sub.symbol}", flush=True)
        except Exception as error:
            print(f"market worker: failed to seed candles for {sub.symbol}: {error}", flush=True)


def clean(value: Any) -> str:
    return str(value or "").strip()


def integer(value: Any) -> int:
    try:
        return int(Decimal(clean(value)))
    except (InvalidOperation, ValueError):
        return 0


def paise(value: Any) -> int:
    parsed = integer(value)
    if parsed <= 0:
        raise ValueError("tick has no positive last traded price")
    return parsed


def make_candle(latest: str | None, bucket: int, price_paise: int, volume: int) -> dict[str, int]:
    timestamp = bucket * 60
    if latest:
        try:
            candle = json.loads(latest)
            if candle.get("timestamp") == timestamp:
                candle["high_paise"] = max(integer(candle.get("high_paise")), price_paise)
                candle["low_paise"] = min(integer(candle.get("low_paise")) or price_paise, price_paise)
                candle["close_paise"] = price_paise
                candle["volume"] = integer(candle.get("volume")) + volume
                return candle
        except (TypeError, ValueError, json.JSONDecodeError):
            pass
    return {"timestamp": timestamp, "open_paise": price_paise, "high_paise": price_paise,
            "low_paise": price_paise, "close_paise": price_paise, "volume": volume}


def has_angel_credentials() -> bool:
    required = ["ANGEL_API_KEY", "ANGEL_CLIENT_ID", "ANGEL_PASSWORD", "ANGEL_TOTP_SECRET"]
    return all(bool(os.getenv(k, "").strip()) for k in required)


def refresh_daily(store: InstrumentStore, control: FeedControl) -> None:
    while True:
        time.sleep(24 * 60 * 60)
        try:
            if store.refresh():
                control.reconnect("instrument subscriptions changed")
        except Exception as error:
            print(f"market worker: daily instrument refresh failed: {error}", flush=True)


def run_feed(store: InstrumentStore, writer: QuoteWriter, control: FeedControl) -> bool:
    api_key = os.getenv("ANGEL_API_KEY", "").strip()
    client_id = os.getenv("ANGEL_CLIENT_ID", "").strip()
    password = os.getenv("ANGEL_PASSWORD", "").strip()
    totp_secret = os.getenv("ANGEL_TOTP_SECRET", "").strip()

    if not (api_key and client_id and password and totp_secret):
        raise RuntimeError("Angel One credentials incomplete")

    smart_api = SmartConnect(api_key=api_key)
    session = smart_api.generateSession(client_id, password, pyotp.TOTP(totp_secret).now())
    if not session.get("status"):
        raise RuntimeError(f"Angel One login failed: {session.get('message', 'unknown error')}")
    auth_token = session["data"]["jwtToken"]
    feed_token = smart_api.getfeedToken()
    websocket = SmartWebSocketV2(auth_token, api_key, client_id, feed_token)
    control.attach(websocket)

    def on_open(_wsapp: Any) -> None:
        grouped: dict[int, list[str]] = {}
        for item in store.subscriptions():
            grouped.setdefault(item.exchange_type, []).append(item.token)
        websocket.subscribe("stock-simulator", 1, [{"exchangeType": exchange_type, "tokens": tokens} for exchange_type, tokens in grouped.items()])
        control.opened()
        print("market worker: Angel One WebSocket connected", flush=True)

    def on_data(_wsapp: Any, message: dict[str, Any]) -> None:
        try:
            exchange_type = integer(message.get("exchange_type"))
            subscription = store.lookup(clean(message.get("token")), exchange_type)
            if subscription is None:
                return
            price_paise = paise(message.get("last_traded_price"))
            volume = integer(message.get("volume_trade_for_the_day"))
            control.tick()
            writer.write(subscription, price_paise, volume, source="angelone_live")
        except (ValueError, redis.RedisError) as error:
            print(f"market worker: discarded Angel One tick: {error}", flush=True)

    websocket.on_open = on_open
    websocket.on_data = on_data
    websocket.on_error = lambda _wsapp, error: print(f"market worker: Angel One WebSocket error: {error}", flush=True)
    websocket.on_close = lambda _wsapp: print("market worker: Angel One WebSocket closed", flush=True)
    try:
        websocket.connect()
    finally:
        opened = control.healthy_connection_opened()
        control.detach(websocket)
    return opened


def watch_feed(control: FeedControl, stale_after_seconds: int) -> None:
    check_interval = max(1, min(10, stale_after_seconds // 2))
    while True:
        time.sleep(check_interval)
        if control.stale(stale_after_seconds):
            control.reconnect(f"no market tick for {stale_after_seconds}s")


def main() -> None:
    mode = os.getenv("MARKET_FEED_MODE", "auto").strip().lower()
    symbols = [item.strip().upper() for item in os.getenv("MARKET_SYMBOLS", "RELIANCE,TCS,INFY,HDFCBANK,NIFTY,BANKNIFTY,ETERNAL").split(",") if item.strip()]
    if not symbols:
        raise RuntimeError("MARKET_SYMBOLS must contain at least one symbol")

    client = redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379/0"), decode_responses=True,
                            socket_connect_timeout=5, socket_timeout=5, health_check_interval=30)
    db_url = os.getenv("DATABASE_URL", "").strip()
    store = InstrumentStore(db_url, symbols)

    refresh_backoff = 1
    while True:
        try:
            store.refresh()
            break
        except Exception as error:
            print(f"market worker: initial instrument refresh failed: {error}; retrying in {refresh_backoff}s", flush=True)
            time.sleep(refresh_backoff)
            refresh_backoff = min(refresh_backoff * 2, 60)

    quote_ttl = int(os.getenv("QUOTE_TTL_SECONDS", "300"))
    history_ttl = int(os.getenv("HISTORY_TTL_SECONDS", "86400"))
    history_max = int(os.getenv("HISTORY_MAX_ITEMS", "500"))
    writer = QuoteWriter(client, quote_ttl, history_ttl, history_max)

    # Seed historical candles if needed
    seed_historical_candles(client, store.subscriptions(), history_ttl, history_max)

    # Synthetic Feed Mode
    if mode == "synthetic" or (mode == "auto" and not has_angel_credentials()):
        print(f"market worker: running in SYNTHETIC feed mode (mode={mode})", flush=True)
        tick_interval = float(os.getenv("SYNTHETIC_TICK_INTERVAL_SECONDS", "1.0"))
        synthetic_feed = SyntheticFeed(store.subscriptions(), writer, tick_interval_seconds=tick_interval)
        synthetic_feed.run()
        return

    # Live Feed Mode (with automatic failover in auto mode)
    control = FeedControl()
    threading.Thread(target=refresh_daily, args=(store, control), daemon=True).start()
    stale_after_seconds = int(os.getenv("MARKET_FEED_STALE_SECONDS", "120"))
    threading.Thread(target=watch_feed, args=(control, stale_after_seconds), daemon=True).start()

    backoff = 1
    fail_count = 0
    while True:
        try:
            opened = run_feed(store, writer, control)
            fail_count = 0
        except Exception as error:
            print(f"market worker: live feed error: {error}", flush=True)
            opened = False
            fail_count += 1

        if mode == "auto" and fail_count >= 3:
            print("market worker: live feed failed 3 times in auto mode; switching to synthetic feed fallback", flush=True)
            tick_interval = float(os.getenv("SYNTHETIC_TICK_INTERVAL_SECONDS", "1.0"))
            synthetic_feed = SyntheticFeed(store.subscriptions(), writer, tick_interval_seconds=tick_interval)
            synthetic_feed.run()
            return

        if opened:
            backoff = 1
        time.sleep(backoff)
        backoff = min(backoff * 2, 60)


if __name__ == "__main__":
    main()
