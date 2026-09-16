import json
import os
import time
import urllib.request
import xml.etree.ElementTree as element_tree
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import redis

POSITIVE = {
    "gain", "gains", "growth", "profit", "profits", "surge", "surges", "rally",
    "rallies", "beat", "strong", "upgrade", "bullish", "record", "recovery", "wins",
    "breakout", "dividend", "expansion", "soars", "highs", "outperforms"
}
NEGATIVE = {
    "loss", "losses", "fall", "falls", "drop", "drops", "decline", "declines",
    "weak", "downgrade", "bearish", "risk", "crisis", "fraud", "penalty", "miss",
    "misses", "plunge", "plunges", "slump", "investigation", "default", "selloff"
}

SYMBOL_ALIASES = {
    "RELIANCE": ["RELIANCE", "RIL", "MUKESH AMBANI", "JIO"],
    "TCS": ["TCS", "TATA CONSULTANCY", "TATA SONS"],
    "INFY": ["INFOSYS", "INFY", "SALIL PAREKH"],
    "HDFCBANK": ["HDFC", "HDFCBANK", "HDFC BANK"],
    "NIFTY": ["NIFTY", "NIFTY50", "NIFTY 50", "BENCHMARK INDEX"],
    "BANKNIFTY": ["BANK NIFTY", "BANKNIFTY", "BANKING INDEX"],
}

SECTOR_KEYWORDS = {
    "BANKING": ["BANK", "FINANCIAL", "LENDING", "CREDIT", "RBI", "REPO", "NPA", "DEPOSIT"],
    "IT": ["TECH", "SOFTWARE", "IT", "CLOUD", "AI", "OUTSOURCING", "DIGITAL"],
    "ENERGY": ["OIL", "PETROL", "CRUDE", "GAS", "REFINERY", "POWER", "RENEWABLE"],
    "MACRO": ["INFLATION", "GDP", "DEFICIT", "RUPEE", "FISCAL", "BUDGET", "FED"],
}


def sentiment(title: str) -> tuple[str, int]:
    words = {word.strip(".,:;!?()[]\"'").lower() for word in title.split()}
    pos_matches = len(words & POSITIVE)
    neg_matches = len(words & NEGATIVE)
    score = pos_matches - neg_matches
    if score > 0:
        return "POSITIVE", score
    if score < 0:
        return "NEGATIVE", score
    return "NEUTRAL", 0


def published_at(value: str | None) -> str:
    if not value:
        return datetime.now(timezone.utc).isoformat()
    try:
        return parsedate_to_datetime(value).astimezone(timezone.utc).isoformat()
    except (TypeError, ValueError):
        return datetime.now(timezone.utc).isoformat()


def matching_symbols(title: str) -> list[str]:
    uppercase = title.upper()
    matched = []
    for symbol, aliases in SYMBOL_ALIASES.items():
        for alias in aliases:
            if alias in uppercase:
                matched.append(symbol)
                break
    return matched


def matching_sectors(title: str) -> list[str]:
    uppercase = title.upper()
    sectors = []
    for sector, keywords in SECTOR_KEYWORDS.items():
        if any(kw in uppercase for kw in keywords):
            sectors.append(sector)
    return sectors


def fetch_items(rss_url: str) -> list[dict]:
    with urllib.request.urlopen(rss_url, timeout=15) as response:
        root = element_tree.fromstring(response.read())
    items = []
    for item in root.findall("./channel/item")[:30]:
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        if not title or not link:
            continue
        label, score = sentiment(title)
        source_node = item.find("source")
        items.append({
            "title": title,
            "url": link,
            "source": source_node.text.strip() if source_node is not None and source_node.text else "RSS",
            "published_at": published_at(item.findtext("pubDate")),
            "sentiment": label,
            "score": score,
            "symbols": matching_symbols(title),
            "sectors": matching_sectors(title),
        })
    return items


def store(client: redis.Redis, items: list[dict], items_ttl: int, seen_ttl: int, max_items: int) -> None:
    with client.pipeline() as pipe:
        for item in items:
            identity = f"news:seen:{item['url']}"
            if client.set(identity, "1", nx=True, ex=seen_ttl):
                pipe.lpush("news:items", json.dumps(item))
        pipe.ltrim("news:items", 0, max_items - 1)
        pipe.expire("news:items", items_ttl)
        pipe.execute()


def main() -> None:
    client = redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379/0"), decode_responses=True,
                            socket_connect_timeout=5, socket_timeout=5, health_check_interval=30)
    rss_url = os.getenv("NEWS_RSS_URL", "https://news.google.com/rss/search?q=Indian+stock+market&hl=en-IN&gl=IN&ceid=IN:en")
    interval = max(60, int(os.getenv("NEWS_POLL_INTERVAL_SECONDS", "600")))
    items_ttl = int(os.getenv("NEWS_TTL_SECONDS", "604800"))
    seen_ttl = int(os.getenv("NEWS_SEEN_TTL_SECONDS", "604800"))
    max_items = int(os.getenv("NEWS_MAX_ITEMS", "200"))

    print(f"news worker: started polling {rss_url} every {interval}s", flush=True)
    while True:
        try:
            items = fetch_items(rss_url)
            store(client, items, items_ttl, seen_ttl, max_items)
            print(f"news worker: processed {len(items)} items", flush=True)
        except Exception as error:
            print(f"news worker error: {error}", flush=True)
        time.sleep(interval)


if __name__ == "__main__":
    main()
