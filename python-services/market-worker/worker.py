import hashlib
import json
import os
import time
from datetime import datetime, timezone

import redis


def number(seed: str, maximum: int) -> int:
    digest = hashlib.sha256(seed.encode()).digest()
    return int.from_bytes(digest[:4], "big") % maximum


def quote(symbol: str, bucket: int) -> dict:
    base = 100000 + number(symbol, 490000)
    movement = number(f"{symbol}:{bucket}", 4001) - 2000
    price = max(1, base + (base * movement) // 100000)
    return {"symbol": symbol, "price_paise": price, "source": "simulated", "updated_at": datetime.now(timezone.utc).isoformat()}


def candle(symbol: str, bucket: int) -> dict:
    current = quote(symbol, bucket)["price_paise"]
    opening = max(1, current + number(f"open:{symbol}:{bucket}", 2001) - 1000)
    closing = max(1, current + number(f"close:{symbol}:{bucket}", 2001) - 1000)
    return {"timestamp": bucket * 60, "open_paise": opening, "high_paise": max(opening, closing) + 100,
            "low_paise": max(1, min(opening, closing) - 100), "close_paise": closing,
            "volume": 1000 + number(f"volume:{symbol}:{bucket}", 50000)}


def main() -> None:
    client = redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379/0"), decode_responses=True,
                            socket_connect_timeout=5, socket_timeout=5, health_check_interval=30)
    symbols = [item.strip().upper() for item in os.getenv("MARKET_SYMBOLS", "RELIANCE,TCS,INFY").split(",") if item.strip()]
    interval = int(os.getenv("POLL_INTERVAL_SECONDS", "60"))
    quote_ttl = int(os.getenv("QUOTE_TTL_SECONDS", "300"))
    history_ttl = int(os.getenv("HISTORY_TTL_SECONDS", "86400"))
    history_max_items = int(os.getenv("HISTORY_MAX_ITEMS", "500"))
    while True:
        bucket = int(time.time()) // 60
        try:
            for symbol in symbols:
                current = quote(symbol, bucket)
                key = f"market:quote:{symbol}"
                history_key = f"market:history:{symbol}"
                with client.pipeline() as pipe:
                    pipe.hset(key, mapping=current)
                    pipe.expire(key, quote_ttl)
                    pipe.lpush(history_key, json.dumps(candle(symbol, bucket)))
                    pipe.ltrim(history_key, 0, history_max_items - 1)
                    pipe.expire(history_key, history_ttl)
                    pipe.publish("market:updates", json.dumps(current))
                    pipe.execute()
        except redis.RedisError as error:
            print(f"market worker Redis error: {error}", flush=True)
        time.sleep(interval)


if __name__ == "__main__":
    main()
