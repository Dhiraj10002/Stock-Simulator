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

DEFAULT_KEYWORD_ALIASES: dict[str, list[str]] = {
    "RELIANCE": ["RELIANCE", "RIL", "MUKESH AMBANI", "JIO"],
    "TCS": ["TCS", "TATA CONSULTANCY", "TATA SONS"],
    "INFY": ["INFOSYS", "INFY", "SALIL PAREKH"],
    "HDFCBANK": ["HDFC", "HDFCBANK", "HDFC BANK"],
    "NIFTY": ["NIFTY", "NIFTY50", "NIFTY 50", "BENCHMARK INDEX"],
    "BANKNIFTY": ["BANK NIFTY", "BANKNIFTY", "BANKING INDEX"],
    "TMPV": ["TATAMOTORS", "TATA MOTORS", "TMPV"],
    "ETERNAL": ["ZOMATO", "ETERNAL", "BLINKIT"],
    "PRAJIND": ["PRAJIND", "PRAJ INDUSTRIES"],
}

DEFAULT_CANONICAL_ALIASES: dict[str, str] = {
    "ZOMATO": "ETERNAL",
    "TATAMOTORS": "TMPV",
}

CANONICAL_ALIASES: dict[str, str] = dict(DEFAULT_CANONICAL_ALIASES)
KEYWORD_ALIASES: dict[str, list[str]] = {k: list(v) for k, v in DEFAULT_KEYWORD_ALIASES.items()}


def resolve_canonical_symbol(symbol: str) -> str:
    sym = (symbol or "").strip().upper()
    return CANONICAL_ALIASES.get(sym, sym)


def load_symbol_aliases(client: redis.Redis | None = None, config_path: str | None = None) -> dict[str, str]:
    """
    Dynamically loads symbol aliases from:
    1. Built-in defaults
    2. External JSON file (config_path, SYMBOL_ALIASES_FILE, SYMBOL_ALIASES_PATH, symbol_aliases.json)
    3. Environment variable (SYMBOL_ALIASES - JSON or CSV)
    4. Redis hash 'market:symbol_aliases'
    """
    global CANONICAL_ALIASES, KEYWORD_ALIASES
    aliases = dict(DEFAULT_CANONICAL_ALIASES)

    # 1. External JSON file
    candidate_paths = [
        config_path,
        os.getenv("SYMBOL_ALIASES_FILE"),
        os.getenv("SYMBOL_ALIASES_PATH"),
        "symbol_aliases.json",
        "/app/symbol_aliases.json",
        "../market-worker/symbol_aliases.json",
        "../../python-services/market-worker/symbol_aliases.json",
    ]
    for path in candidate_paths:
        if path and os.path.isfile(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    file_aliases = json.load(f)
                if isinstance(file_aliases, dict):
                    for k, v in file_aliases.items():
                        if isinstance(k, str) and isinstance(v, str):
                            aliases[k.strip().upper()] = v.strip().upper()
                    print(f"news worker: loaded {len(file_aliases)} symbol aliases from {path}", flush=True)
                    break
            except Exception as e:
                print(f"news worker: error loading symbol aliases from {path}: {e}", flush=True)

    # 2. Environment variable
    env_str = os.getenv("SYMBOL_ALIASES", "").strip()
    if env_str:
        try:
            if env_str.startswith("{"):
                env_aliases = json.loads(env_str)
                if isinstance(env_aliases, dict):
                    for k, v in env_aliases.items():
                        if isinstance(k, str) and isinstance(v, str):
                            aliases[k.strip().upper()] = v.strip().upper()
            else:
                for pair in env_str.split(","):
                    pair = pair.strip()
                    if ":" in pair:
                        k, v = pair.split(":", 1)
                        aliases[k.strip().upper()] = v.strip().upper()
        except Exception as e:
            print(f"news worker: error parsing SYMBOL_ALIASES env: {e}", flush=True)

    # 3. Redis hash
    if client is not None:
        try:
            redis_aliases = client.hgetall("market:symbol_aliases")
            if redis_aliases and isinstance(redis_aliases, dict):
                for k, v in redis_aliases.items():
                    aliases[str(k).strip().upper()] = str(v).strip().upper()
        except Exception as e:
            print(f"news worker: error loading symbol aliases from Redis: {e}", flush=True)

    CANONICAL_ALIASES = aliases

    # Synchronize keyword search aliases
    new_kw: dict[str, list[str]] = {k: list(v) for k, v in DEFAULT_KEYWORD_ALIASES.items()}
    for alias_sym, canonical_target in CANONICAL_ALIASES.items():
        if canonical_target not in new_kw:
            new_kw[canonical_target] = [canonical_target, alias_sym]
        else:
            if alias_sym not in new_kw[canonical_target]:
                new_kw[canonical_target].append(alias_sym)
    KEYWORD_ALIASES = new_kw
    return aliases


def matching_symbols(title: str) -> list[str]:
    uppercase = title.upper()
    matched = []
    for symbol, aliases in KEYWORD_ALIASES.items():
        for alias in aliases:
            if alias in uppercase:
                canonical = resolve_canonical_symbol(symbol)
                if canonical not in matched:
                    matched.append(canonical)
                break
    return matched


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
    load_symbol_aliases(client)
    while True:
        try:
            load_symbol_aliases(client)
            items = fetch_items(rss_url)
            store(client, items, items_ttl, seen_ttl, max_items)
            print(f"news worker: processed {len(items)} items", flush=True)
        except Exception as error:
            print(f"news worker error: {error}", flush=True)
        time.sleep(interval)


if __name__ == "__main__":
    main()
