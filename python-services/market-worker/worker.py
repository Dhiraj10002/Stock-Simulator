import json
import base64
import logging
import math
import os
import random
import re
import socket
import ssl
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs
from dataclasses import dataclass
from zoneinfo import ZoneInfo
from datetime import date, datetime, timezone, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any
import uuid
from settlement_store import SettlementRecorder

class SensitiveDataFilter(logging.Filter):
    """Redacts sensitive API keys, JWT tokens, and private keys from vendor and application logs."""
    PATTERNS = [
        (re.compile(r"(['\"]?Authorization['\"]?:\s*['\"]?Bearer\s+)[^'\"}\s,]+(['\"]?)", re.IGNORECASE), r"\1[REDACTED]\2"),
        (re.compile(r"(['\"]?(?:X-PrivateKey|X-API-Key|Cookie|Set-Cookie)['\"]?:\s*['\"]?)[^'\"}\s,]+(['\"]?)", re.IGNORECASE), r"\1[REDACTED]\2"),
        (re.compile(r"(Bearer\s+ey[A-Za-z0-9._\-]+)", re.IGNORECASE), r"Bearer [REDACTED]"),
        (re.compile(r"\bey[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\b"), r"[REDACTED_JWT]"),
        (re.compile(r"(['\"]?(?:api[_-]?key|client[_-]?secret|jwt[_-]?secret|password|private[_-]?key|totp[_-]?secret)['\"]?\s*[:=]\s*['\"]?)[^'\"\s,;&]+(['\"]?)", re.IGNORECASE), r"\1[REDACTED]\2"),
    ]

    def redact_text(self, text: str) -> str:
        for pattern, repl in self.PATTERNS:
            text = pattern.sub(repl, text)
        return text

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = self.redact_text(record.msg)
        if record.args:
            if isinstance(record.args, dict):
                record.args = {
                    k: (self.redact_text(v) if isinstance(v, str) else v)
                    for k, v in record.args.items()
                }
            elif isinstance(record.args, (list, tuple)):
                record.args = tuple(
                    self.redact_text(v) if isinstance(v, str) else v
                    for v in record.args
                )
        return True

def install_log_sanitizer() -> None:
    sanitizer = SensitiveDataFilter()
    root_logger = logging.getLogger()
    root_logger.addFilter(sanitizer)
    for h in root_logger.handlers:
        h.addFilter(sanitizer)

    logging.getLogger("smartConnect").addFilter(sanitizer)

    try:
        import logzero
        logzero.logger.addFilter(sanitizer)
        for h in logzero.logger.handlers:
            h.addFilter(sanitizer)
    except Exception:
        pass

# Force IPv4 socket resolution to avoid IPv6 network timeouts
_orig_getaddrinfo = socket.getaddrinfo

def _ipv4_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
    return _orig_getaddrinfo(host, port, socket.AF_INET, type, proto, flags)

socket.getaddrinfo = _ipv4_getaddrinfo

# Automatically load backend/.env if environment variables are not set
def load_env_file():
    env_paths = [
        os.path.join(os.path.dirname(__file__), "../../backend/.env"),
        os.path.join(os.getcwd(), "backend/.env"),
        os.path.join(os.getcwd(), ".env"),
    ]
    for path in env_paths:
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            k, v = line.split("=", 1)
                            k, v = k.strip(), v.strip()
                            if k not in os.environ:
                                os.environ[k] = v
            except Exception as e:
                print(f"market worker: could not read {path}: {e}", flush=True)
            break

load_env_file()
install_log_sanitizer()

import pyotp
import redis
from SmartApi import SmartConnect
from SmartApi.smartWebSocketV2 import SmartWebSocketV2
from websocket import WebSocketApp
install_log_sanitizer()


class VerifiedSmartWebSocket(SmartWebSocketV2):
    """The SDK disables certificate checks; enforce verified TLS in our transport."""
    def connect(self):
        headers = {"Authorization": self.auth_token, "x-api-key": self.api_key,
                   "x-client-code": self.client_code, "x-feed-token": self.feed_token}
        self.wsapp = WebSocketApp(self.ROOT_URI, header=headers, on_open=self.on_open,
            on_error=self.on_error, on_close=lambda ws, code, message: self.on_close(ws),
            on_data=self._on_data, on_ping=self._on_ping, on_pong=self._on_pong)
        self.wsapp.run_forever(sslopt={"cert_reqs": ssl.CERT_REQUIRED, "check_hostname": True},
                              ping_interval=self.HEART_BEAT_INTERVAL)


INSTRUMENT_MASTER_URL = "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json"
LOCAL_CACHE_PATH = "/tmp/OpenAPIScripMaster.json"
EXCHANGE_TYPES = {"NSE": 1, "NFO": 2, "BSE": 3, "BFO": 4, "MCX": 5, "NCDEX": 7}

FALLBACK_INSTRUMENT_MASTER = [
    {"token": "2885", "symbol": "RELIANCE-EQ", "name": "RELIANCE", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "11536", "symbol": "TCS-EQ", "name": "TCS", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "1594", "symbol": "INFY-EQ", "name": "INFY", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "1333", "symbol": "HDFCBANK-EQ", "name": "HDFCBANK", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "3456", "symbol": "TATAMOTORS-EQ", "name": "TATAMOTORS", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "3456", "symbol": "TMPV-EQ", "name": "TMPV", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "10604", "symbol": "BHARTIARTL-EQ", "name": "BHARTIARTL", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "5097", "symbol": "ETERNAL-EQ", "name": "ETERNAL", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "12018", "symbol": "SUZLON-EQ", "name": "SUZLON", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "1964", "symbol": "TRENT-EQ", "name": "TRENT", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "25", "symbol": "ADANIENT-EQ", "name": "ADANIENT", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "11915", "symbol": "YESBANK-EQ", "name": "YESBANK", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "383", "symbol": "BEL-EQ", "name": "BEL", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "3045", "symbol": "SBIN-EQ", "name": "SBIN", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "4963", "symbol": "ICICIBANK-EQ", "name": "ICICIBANK", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "6066", "symbol": "ATGL-EQ", "name": "ATGL", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "11403", "symbol": "POONAWALLA-EQ", "name": "POONAWALLA", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "3405", "symbol": "TATACHEM-EQ", "name": "TATACHEM", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "3426", "symbol": "TATAPOWER-EQ", "name": "TATAPOWER", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "3351", "symbol": "SUNPHARMA-EQ", "name": "SUNPHARMA", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "3499", "symbol": "TATASTEEL-EQ", "name": "TATASTEEL", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "1660", "symbol": "ITC-EQ", "name": "ITC", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "24398", "symbol": "EMCURE-EQ", "name": "EMCURE", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "11821", "symbol": "WELCORP-EQ", "name": "WELCORP", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "380", "symbol": "BBTC-EQ", "name": "BBTC", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "21334", "symbol": "JYOTICNC-EQ", "name": "JYOTICNC", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "9617", "symbol": "SPLPETRO-EQ", "name": "SPLPETRO", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "3363", "symbol": "SUPREMEIND-EQ", "name": "SUPREMEIND", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "23799", "symbol": "GODIGIT-EQ", "name": "GODIGIT", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "20293", "symbol": "TATATECH-EQ", "name": "TATATECH", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "399", "symbol": "NIACL-EQ", "name": "NIACL", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "9683", "symbol": "KPITTECH-EQ", "name": "KPITTECH", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "13404", "symbol": "SUNTV-EQ", "name": "SUNTV", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "1576", "symbol": "GILLETTE-EQ", "name": "GILLETTE", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "14732", "symbol": "DLF-EQ", "name": "DLF", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "2705", "symbol": "PRAJIND-EQ", "name": "PRAJIND", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "317", "symbol": "BAJFINANCE-EQ", "name": "BAJFINANCE", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "5900", "symbol": "AXISBANK-EQ", "name": "AXISBANK", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "1922", "symbol": "KOTAKBANK-EQ", "name": "KOTAKBANK", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "11491", "symbol": "APARINDS-EQ", "name": "APARINDS", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "99926000", "symbol": "NIFTY 50", "name": "NIFTY", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "25", "instrumenttype": "AMXIDX", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "99926009", "symbol": "NIFTY BANK", "name": "BANKNIFTY", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "15", "instrumenttype": "AMXIDX", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "99926037", "symbol": "NIFTY FIN SERVICE", "name": "FINNIFTY", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "25", "instrumenttype": "AMXIDX", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "99926074", "symbol": "NIFTY MID SELECT", "name": "MIDCPNIFTY", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "50", "instrumenttype": "AMXIDX", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "99919000", "symbol": "SENSEX", "name": "SENSEX", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "10", "instrumenttype": "AMXIDX", "exch_seg": "BSE", "tick_size": "5.000000"},
]

DEFAULT_BENCHMARK_PRICES_PAISE = {
    "PRAJIND": 31215,      # ₹312.15
    "BAJFINANCE": 102130,   # ₹1,021.30
    "AXISBANK": 125000,     # ₹1,250.00
    "KOTAKBANK": 41480,     # ₹414.80
    "APARINDS": 1894500,    # ₹18,945.00
    "RELIANCE": 124740,     # ₹1,247.40
    "TCS": 212870,          # ₹2,128.70
    "INFY": 103850,         # ₹1,038.50
    "HDFCBANK": 164280,     # ₹1,642.80
    "TATAMOTORS": 30165,    # ₹301.65 (TMPV)
    "TMPV": 30165,          # ₹301.65
    "TMCV": 44450,          # ₹444.50
    "BHARTIARTL": 189330,   # ₹1,893.30
    "ETERNAL": 33590,       # ₹335.90
    "ZOMATO": 33590,        # ₹335.90
    "SUZLON": 7450,         # ₹74.50
    "TRENT": 714000,        # ₹7,140.00
    "ADANIENT": 302000,     # ₹3,020.00
    "YESBANK": 2272,        # ₹22.72
    "BEL": 39330,           # ₹393.30
    "NIFTY": 2335000,       # ₹23,350.00
    "BANKNIFTY": 5625000,   # ₹56,250.00
    "FINNIFTY": 2552000,    # ₹25,520.00
    "MIDCPNIFTY": 1448000,  # ₹14,480.00
    "SENSEX": 7450000,      # ₹74,500.00
    "SBIN": 78500,          # ₹785.00
    "ICICIBANK": 121530,    # ₹1,215.30
    "ATGL": 66070,          # ₹660.70
    "POONAWALLA": 47940,    # ₹479.40
    "TATACHEM": 69325,      # ₹693.25
    "TATAPOWER": 37480,     # ₹374.80
    "SUNPHARMA": 183730,    # ₹1,837.30
    "TATASTEEL": 18554,     # ₹185.54
    "ITC": 49410,           # ₹494.10
    "EMCURE": 200380,       # ₹2,003.80
    "WELCORP": 266010,      # ₹2,660.10
    "BBTC": 151210,         # ₹1,512.10
    "JYOTICNC": 104970,     # ₹1,049.70
    "SPLPETRO": 86570,      # ₹865.70
    "SUPREMEIND": 358030,   # ₹3,580.30
    "GODIGIT": 23900,       # ₹239.00
    "TATATECH": 72245,      # ₹722.45
    "NIACL": 18766,         # ₹187.66
    "KPITTECH": 164000,     # ₹1,640.00
    "SUNTV": 45170,         # ₹451.70
    "GILLETTE": 707300,     # ₹7,073.00
    "DLF": 64435,           # ₹644.35
    "MARUTI": 1245000,      # ₹12,450.00
    "HINDUNILVR": 272000,   # ₹2,720.00
    "LT": 365000,           # ₹3,650.00
    "WIPRO": 53500,         # ₹535.00
}


GLOBAL_SMART_API: Any = None
SMART_API_SESSION_LOCK = threading.Lock()
SMART_API_SESSION: dict[str, Any] | None = None
SMART_API_SESSION_EXPIRES = 0.0
SMART_API_LOGIN_RETRY_AFTER = 0.0
GLOBAL_WRITER: Any = None
GLOBAL_SUPERVISOR: Any = None
GLOBAL_TOKEN_MAP: dict[str, dict[str, Any]] = {}
BROKER_REST_LOCK = threading.Lock()
BROKER_REST_LAST_CALL = 0.0
QUOTE_SUBSCRIPTION_MODE = 3  # SNAP_QUOTE includes OI as well as close and volume.

DEFAULT_CANONICAL_SYMBOL_ALIASES: dict[str, str] = {
    "ZOMATO": "ETERNAL",
    "TATAMOTORS": "TMPV",
    "LTI": "LTIM",
    "MINDTREE": "LTIM",
}

CANONICAL_SYMBOL_ALIASES: dict[str, str] = dict(DEFAULT_CANONICAL_SYMBOL_ALIASES)


def parse_alias_mapping(data: Any) -> dict[str, str]:
    """Parses a mapping dict or string into a sanitized {alias: target} dict."""
    result: dict[str, str] = {}
    if isinstance(data, dict):
        mapping = data.get("aliases", data) if "aliases" in data and isinstance(data.get("aliases"), dict) else data
        for k, v in mapping.items():
            if isinstance(k, str) and isinstance(v, str):
                alias_clean = k.strip().upper().replace("-EQ", "").replace("-BE", "").replace("-SM", "")
                target_clean = v.strip().upper().replace("-EQ", "").replace("-BE", "").replace("-SM", "")
                if alias_clean and target_clean and alias_clean != target_clean:
                    result[alias_clean] = target_clean
    elif isinstance(data, str):
        text = data.strip()
        if text.startswith("{"):
            try:
                parsed = json.loads(text)
                return parse_alias_mapping(parsed)
            except Exception:
                pass
        for pair in text.split(","):
            delimiter = ":" if ":" in pair else ("=" if "=" in pair else None)
            if delimiter:
                parts = pair.split(delimiter, 1)
                alias_clean = parts[0].strip().upper().replace("-EQ", "").replace("-BE", "").replace("-SM", "")
                target_clean = parts[1].strip().upper().replace("-EQ", "").replace("-BE", "").replace("-SM", "")
                if alias_clean and target_clean and alias_clean != target_clean:
                    result[alias_clean] = target_clean
    return result


def load_canonical_aliases(client: Any = None, config_path: str | None = None) -> dict[str, str]:
    """
    Loads symbol aliases from external sources in priority order:
    1. Built-in defaults (DEFAULT_CANONICAL_SYMBOL_ALIASES)
    2. External JSON file (config_path, SYMBOL_ALIASES_FILE, SYMBOL_ALIASES_PATH, or symbol_aliases.json)
    3. Environment variable (SYMBOL_ALIASES)
    4. Redis hash 'market:symbol_aliases' (runtime dynamic updates)
    """
    global CANONICAL_SYMBOL_ALIASES
    aliases = dict(DEFAULT_CANONICAL_SYMBOL_ALIASES)

    # 1. External file source
    target_path = (
        config_path
        or os.getenv("SYMBOL_ALIASES_FILE")
        or os.getenv("SYMBOL_ALIASES_PATH")
        or os.path.join(os.path.dirname(__file__), "symbol_aliases.json")
    )
    if os.path.exists(target_path):
        try:
            with open(target_path, "r", encoding="utf-8") as f:
                file_data = json.load(f)
            file_aliases = parse_alias_mapping(file_data)
            aliases.update(file_aliases)
            print(f"market worker: loaded {len(file_aliases)} symbol aliases from {target_path}", flush=True)
        except Exception as e:
            print(f"market worker: error loading symbol aliases from {target_path}: {e}", flush=True)

    # 2. Environment variable source
    env_str = os.getenv("SYMBOL_ALIASES", "").strip()
    if env_str:
        try:
            env_aliases = parse_alias_mapping(env_str)
            aliases.update(env_aliases)
            print(f"market worker: loaded {len(env_aliases)} symbol aliases from SYMBOL_ALIASES env", flush=True)
        except Exception as e:
            print(f"market worker: error parsing SYMBOL_ALIASES env: {e}", flush=True)

    # 3. Redis dynamic source
    if client:
        try:
            redis_aliases = client.hgetall("market:symbol_aliases")
            if redis_aliases:
                sanitized_redis = parse_alias_mapping(redis_aliases)
                aliases.update(sanitized_redis)
                print(f"market worker: loaded {len(sanitized_redis)} symbol aliases from Redis 'market:symbol_aliases'", flush=True)
            else:
                # Seed Redis with aliases so Go backend and other services can read them
                mapping = {k: v for k, v in aliases.items()}
                if mapping:
                    client.hset("market:symbol_aliases", mapping=mapping)
        except Exception as e:
            print(f"market worker: error querying Redis for symbol aliases: {e}", flush=True)

    CANONICAL_SYMBOL_ALIASES = aliases
    return aliases


# Load initial aliases from file/env at module load
load_canonical_aliases()


def resolve_canonical_symbol(symbol: str) -> str:
    """
    Normalizes a symbol and resolves any known corporate renames / aliases.
    e.g. 'ZOMATO-EQ' -> 'ETERNAL', 'TATAMOTORS' -> 'TMPV', 'PRAJIND-EQ' -> 'PRAJIND'
    """
    sym = symbol.strip().upper()
    sym_clean = sym.replace("-EQ", "").replace("-BE", "").replace("-SM", "")
    return CANONICAL_SYMBOL_ALIASES.get(sym_clean, sym_clean)


def get_symbol_aliases(canonical_symbol: str) -> list[str]:
    """Returns all aliases that map to this canonical symbol or vice-versa."""
    aliases = []
    canonical = resolve_canonical_symbol(canonical_symbol)
    for alias, target in CANONICAL_SYMBOL_ALIASES.items():
        if target == canonical and alias != canonical:
            aliases.append(alias)
    return aliases


def init_global_token_map() -> None:
    if get_feed_mode() == "live":
        return  # LIVE map comes exclusively from the activated DB master.
    global GLOBAL_TOKEN_MAP
    for item in FALLBACK_INSTRUMENT_MASTER:
        GLOBAL_TOKEN_MAP[item["name"].upper()] = item
        GLOBAL_TOKEN_MAP[item["symbol"].replace("-EQ", "").upper()] = item
    if os.path.exists(LOCAL_CACHE_PATH):
        try:
            with open(LOCAL_CACHE_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
            for d in data:
                exch = d.get("exch_seg")
                inst_type = d.get("instrumenttype")
                if exch == "NSE" and d.get("symbol", "").endswith("-EQ"):
                    name = d.get("name", "").strip().upper()
                    if name:
                        GLOBAL_TOKEN_MAP[name] = d
                    sym = d.get("symbol", "").replace("-EQ", "").strip().upper()
                    if sym:
                        GLOBAL_TOKEN_MAP[sym] = d
                elif exch == "BSE" and inst_type == "AMXIDX":
                    name = d.get("name", "").strip().upper()
                    if name:
                        GLOBAL_TOKEN_MAP[name] = d
                elif exch in ("NFO", "BFO"):
                    sym = d.get("symbol", "").strip().upper()
                    if sym:
                        GLOBAL_TOKEN_MAP[sym] = d
            print(f"market worker: indexed {len(GLOBAL_TOKEN_MAP)} symbols in global token map", flush=True)
        except Exception as e:
            print(f"market worker: error loading scrip master: {e}", flush=True)


def smart_api_session() -> tuple[Any, dict[str, Any]]:
    """Share one REST/WebSocket login and bound retries after provider rejection."""
    global GLOBAL_SMART_API, SMART_API_SESSION, SMART_API_SESSION_EXPIRES, SMART_API_LOGIN_RETRY_AFTER
    if get_feed_mode() != "live":
        raise RuntimeError("broker authentication requires LIVE mode")
    api_key = os.getenv("ANGEL_API_KEY", "").strip()
    client_id = os.getenv("ANGEL_CLIENT_ID", "").strip()
    password = os.getenv("ANGEL_PASSWORD", "").strip()
    totp_secret = os.getenv("ANGEL_TOTP_SECRET", "").strip()
    if not (api_key and client_id and password and totp_secret):
        raise RuntimeError("Angel One credentials incomplete")
    with SMART_API_SESSION_LOCK:
        now = time.monotonic()
        if GLOBAL_SMART_API is not None and SMART_API_SESSION and now < SMART_API_SESSION_EXPIRES:
            return GLOBAL_SMART_API, SMART_API_SESSION
        if now < SMART_API_LOGIN_RETRY_AFTER:
            raise RuntimeError("Angel One login retry cooling down")
        # Failed/expired sessions must not remain available to REST requests.
        GLOBAL_SMART_API = None
        SMART_API_SESSION = None
        SMART_API_LOGIN_RETRY_AFTER = now + 30
        api = SmartConnect(api_key=api_key)
        session = api.generateSession(client_id, password, pyotp.TOTP(totp_secret).now())
        data = session.get("data") or {}
        if not session.get("status") or not data.get("jwtToken") or not data.get("feedToken"):
            raise RuntimeError("Angel One login failed or returned incomplete session tokens")
        lifetime = 900.0
        try:
            # This unverified payload only schedules renewal; the broker authenticates every request.
            payload = data["jwtToken"].removeprefix("Bearer ").split(".")[1]
            expiry = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4))).get("exp")
            if expiry is not None:
                lifetime = min(lifetime, float(expiry) - time.time() - 30)
        except (ValueError, TypeError, IndexError, json.JSONDecodeError):
            pass
        if lifetime <= 0:
            raise RuntimeError("Angel One returned an expired session")
        GLOBAL_SMART_API, SMART_API_SESSION = api, data
        SMART_API_SESSION_EXPIRES = time.monotonic() + lifetime
        SMART_API_LOGIN_RETRY_AFTER = 0.0
        return api, data


def init_smart_api() -> None:
    if get_feed_mode() != "live" or not has_angel_credentials():
        return
    try:
        smart_api_session()
        print("market worker: shared Angel One REST/WebSocket session authenticated", flush=True)
    except Exception as error:
        print(f"market worker: failed to initialize broker session: {error}", flush=True)


def get_feed_mode() -> str:
    """Returns the canonical market feed mode: 'live', 'synthetic', or 'unavailable'/'disabled'."""
    mode = os.getenv("MARKET_FEED_MODE", "live").strip().lower()
    if mode == "auto":
        return "live"
    if mode in ("synthetic", "unavailable", "disabled", "live"):
        return mode
    return "live"


def rupees_to_paise(value: Any) -> int:
    try:
        number = Decimal(str(value))
        return int((number * 100).quantize(Decimal('1'))) if number.is_finite() and number > 0 else 0
    except (InvalidOperation, ValueError, TypeError):
        return 0


def broker_quote_time(value: Any) -> datetime | None:
    """Keep exchange time; a REST fetch must never make yesterday's price fresh."""
    try:
        if isinstance(value, (int, float)):
            return datetime.fromtimestamp(value / 1000, timezone.utc)
        raw = str(value or '').strip()
        for fmt in ('%d-%b-%Y %H:%M:%S', '%d-%b-%Y %H:%M:%S.%f', '%Y-%m-%d %H:%M:%S'):
            try:
                return datetime.strptime(raw, fmt).replace(tzinfo=ZoneInfo('Asia/Kolkata')).astimezone(timezone.utc)
            except ValueError:
                pass
        stamp = datetime.fromisoformat(raw.replace('Z', '+00:00'))
        return stamp.astimezone(timezone.utc) if stamp.tzinfo else None
    except (ValueError, TypeError, OverflowError, OSError):
        return None


def broker_call(call):
    """Serialize SDK requests and pace quote/history calls together below 1/sec."""
    global BROKER_REST_LAST_CALL
    with BROKER_REST_LOCK:
        wait = 1.1 - (time.monotonic() - BROKER_REST_LAST_CALL)
        if wait > 0:
            time.sleep(wait)
        try:
            return call()
        finally:
            BROKER_REST_LAST_CALL = time.monotonic()


def fetch_full_snapshots(api, subscriptions) -> dict:
    groups = {}
    expected = set()
    for item in subscriptions[:50]:
        groups.setdefault(item.exchange_segment, []).append(item.token)
        expected.add((item.exchange_segment, item.token))
    if not groups:
        return {}
    result = broker_call(lambda: api.getMarketData('FULL', groups))
    if not isinstance(result, dict) or result.get('status') is not True:
        # Never print a raw broker response: it can contain private session data.
        print(f'market worker: FULL snapshot request rejected; requested={len(expected)}', flush=True)
        return {}
    snapshots = {(row.get('exchange'), str(row.get('symbolToken'))): row
            for row in (result.get('data') or {}).get('fetched', [])
            if (row.get('exchange'), str(row.get('symbolToken'))) in expected}
    if len(snapshots) != len(expected):
        print(f'market worker: FULL snapshot coverage incomplete; requested={len(expected)} matched={len(snapshots)}', flush=True)
    return snapshots


def full_snapshot_time(data) -> datetime | None:
    # Both are exchange-provided times. Missing feed time may use the older
    # last-trade time; never substitute retrieval time to make a price fresh.
    return broker_quote_time(data.get('exchFeedTime')) or broker_quote_time(data.get('exchTradeTime'))


def fetch_full_snapshot(api, segment: str, token: str) -> dict | None:
    item = Subscription('', token, segment, EXCHANGE_TYPES[segment])
    return fetch_full_snapshots(api, [item]).get((segment, token))


HISTORY_INTERVALS = {'ONE_MINUTE': 7, 'ONE_HOUR': 31, 'ONE_DAY': 370}


def normalize_broker_candles(rows, now: datetime) -> list[dict]:
    candles = {}
    for row in rows:
        try:
            stamp = datetime.fromisoformat(str(row[0]).replace('Z', '+00:00'))
            if stamp.tzinfo is None or stamp > now:
                continue
            o, h, l, c = [rupees_to_paise(v) for v in row[1:5]]
            volume = int(row[5])
            if min(o, h, l, c) <= 0 or not l <= o <= h or not l <= c <= h or volume < 0:
                continue
            timestamp = int(stamp.timestamp())
            candles[timestamp] = dict(timestamp=timestamp, open_paise=o, high_paise=h,
                                      low_paise=l, close_paise=c, volume=volume,
                                      source='angelone_live', feed_mode='LIVE')
        except (ValueError, TypeError, IndexError):
            continue
    return [candles[t] for t in sorted(candles, reverse=True)]


def backfill_history(writer, api, subscription, interval: str) -> bool:
    if writer.feed_mode != 'live' or interval not in HISTORY_INTERVALS:
        return False
    now = datetime.now(timezone.utc)
    local_now = now.astimezone(ZoneInfo('Asia/Kolkata'))
    params = {'exchange': subscription.exchange_segment, 'symboltoken': subscription.token,
              'interval': interval, 'fromdate': (local_now - timedelta(days=HISTORY_INTERVALS[interval])).strftime('%Y-%m-%d %H:%M'),
              'todate': local_now.strftime('%Y-%m-%d %H:%M')}
    result = broker_call(lambda: api.getCandleData(params))
    if not isinstance(result, dict) or result.get('status') is not True:
        return False
    candles = normalize_broker_candles(result.get('data') or [], now)
    if not candles:
        return False
    symbol = subscription.symbol
    key = f'market:history:{symbol}' if interval == 'ONE_MINUTE' else f'market:history:{symbol}:{interval}'
    with writer.history_lock:
        # Merge at commit time, preserving newer stream buckets received during REST.
        merged = {c['timestamp']: c for c in candles}
        for raw in writer.client.lrange(key, 0, writer.history_max_items - 1):
            try:
                existing = json.loads(raw)
                if existing.get('source') == 'angelone_live' and existing.get('feed_mode') == 'LIVE':
                    merged.setdefault(int(existing['timestamp']), existing)
            except (ValueError, TypeError, KeyError):
                pass
        newest = sorted(merged, reverse=True)[:writer.history_max_items]
        with writer.client.pipeline() as pipe:
            pipe.delete(key)
            pipe.rpush(key, *[json.dumps(merged[t]) for t in newest])
            pipe.expire(key, writer.history_ttl)
            pipe.execute()
    return True


def history_demand_loop(store, writer, api, stopped):
    attempts = {}
    while not stopped.wait(2):
        try:
            cutoff = time.time() - 300
            writer.client.zremrangebyscore('market:history:demand', '-inf', cutoff)
            requests = writer.client.zrevrangebyscore('market:history:demand', '+inf', cutoff, start=0, num=900)
            requests.sort(key=lambda request: attempts.get(request.decode() if isinstance(request, bytes) else request, 0))
            for request in requests:
                request = request.decode() if isinstance(request, bytes) else request
                if time.monotonic() - attempts.get(request, 0) < 60:
                    continue
                symbol, interval = request.rsplit('|', 1)
                attempts[request] = time.monotonic()
                subscriptions = store._build_subscriptions(store._rows, [symbol])
                if subscriptions and interval in HISTORY_INTERVALS:
                    backfill_history(writer, api, subscriptions[0], interval)
                    break
            # Bound cooldown memory to the active demand set.
            active = {r.decode() if isinstance(r, bytes) else r for r in requests}
            attempts = {k: v for k, v in attempts.items() if k in active}
        except Exception as error:
            print(f'market worker: historical backfill failed: {type(error).__name__}', flush=True)


def fetch_quote_for_symbol(symbol: str) -> dict[str, Any] | None:
    mode = get_feed_mode()
    symbol = symbol.strip().upper()
    canonical_sym = resolve_canonical_symbol(symbol)
    clean_sym = symbol.replace("-EQ", "").replace("-BE", "").replace("-SM", "")

    token_map = GLOBAL_TOKEN_MAP
    info = (
        token_map.get(canonical_sym)
        or token_map.get(clean_sym)
        or token_map.get(symbol)
    )

    token = None
    exch = "NSE"
    inst_type = ""
    if info:
        token = info.get("token")
        exch = info.get("exch_seg") or "NSE"
        inst_type = info.get("instrumenttype") or ""

    if mode == "live" and GLOBAL_SMART_API and token:
        try:
            data = fetch_full_snapshot(GLOBAL_SMART_API, exch, str(token))
            if GLOBAL_TOKEN_MAP is not token_map:
                # Provider tokens can be reused after canonical activation.
                # Never assign an in-flight response using the previous identity.
                return None
            if data:
                ltp_paise = rupees_to_paise(data.get("ltp"))
                close_paise = rupees_to_paise(data.get("close"))
                stamp = full_snapshot_time(data)
                if ltp_paise <= 0 or stamp is None:
                    return None
                lower_c = rupees_to_paise(data.get("lowerCircuit") or data.get("lower_circuit") or data.get("lower_circuit_limit"))
                upper_c = rupees_to_paise(data.get("upperCircuit") or data.get("upper_circuit") or data.get("upper_circuit_limit"))
                quote = {
                    "symbol": symbol, "price_paise": ltp_paise,
                    "previous_close_paise": close_paise,
                    "day_change_available": close_paise > 0, "open_interest": integer(data.get("opnInterest")),
                    **provider_market_fields(data),
                    "volume": integer(data.get("tradeVolume")),
                    "source": "angelone_live", "updated_at": stamp.isoformat()
                }
                if lower_c > 0:
                    quote["lower_circuit_paise"] = lower_c
                if upper_c > 0:
                    quote["upper_circuit_paise"] = upper_c
                if close_paise > 0:
                    quote["change_paise"] = ltp_paise - close_paise
                    quote["change_percent"] = round((ltp_paise - close_paise) * 100 / close_paise, 2)
                if GLOBAL_WRITER:
                    sub = Subscription(symbol, str(token), exch, EXCHANGE_TYPES[exch])
                    GLOBAL_WRITER.write(sub, ltp_paise, quote["volume"], source="angelone_live",
                                        previous_close_paise=close_paise, event_time=stamp, build_history=False,
                                        open_interest=integer(data.get("opnInterest")),
                                        lower_circuit_paise=lower_c, upper_circuit_paise=upper_c, market_fields=provider_market_fields(data))
                return quote
        except Exception as e:
            print(f"market worker: error fetching live quote for {symbol} from Angel One: {e}", flush=True)

    # In LIVE, DISABLED, or UNAVAILABLE feed modes, strictly fail closed.
    # Never return benchmark fallbacks or simulated derivatives, and never write them to Redis.
    if mode != "synthetic":
        return None

    # Below here is EXPLICIT SYNTHETIC MODE ONLY
    benchmark = DEFAULT_BENCHMARK_PRICES_PAISE.get(clean_sym) or DEFAULT_BENCHMARK_PRICES_PAISE.get(canonical_sym)
    if benchmark:
        now_iso = datetime.now(timezone.utc).isoformat()
        quote = {
            "symbol": symbol,
            "price_paise": benchmark,
            "change_paise": 0,
            "change_percent": 0.0,
            "source": "benchmark_fallback",
            "updated_at": now_iso
        }
        if GLOBAL_WRITER:
            exch_type = EXCHANGE_TYPES.get(exch, 1)
            sub = Subscription(symbol, token or "0", exch, exch_type)
            GLOBAL_WRITER.benchmark_prices[symbol] = benchmark
            GLOBAL_WRITER.write(sub, benchmark, 5000, source="benchmark_fallback")
        return quote

    # If quote not found directly and symbol is NFO derivative (Future or Option)
    deriv_match = re.match(r"^([A-Z&]+?)(\d{1,2})?([A-Z]{3})(\d{2})?(?:(\d+(?:\.\d+)?)(CE|PE)|FUT)$", symbol)
    if deriv_match:
        underlying = deriv_match.group(1)
        under_quote = fetch_quote_for_symbol(underlying)
        if under_quote and under_quote.get("price_paise"):
            spot_paise = under_quote["price_paise"]
            spot_rs = spot_paise / 100.0
            under_change_pct = under_quote.get("change_percent", 0.0)
            now_iso = datetime.now(timezone.utc).isoformat()
            
            if symbol.endswith("FUT"):
                fut_price_paise = int(round(spot_paise * 1.0035))
                fut_change_paise = int(round(under_quote.get("change_paise", 0) * 1.0035))
                fut_quote = {
                    "symbol": symbol,
                    "price_paise": fut_price_paise,
                    "change_paise": fut_change_paise,
                    "change_percent": under_change_pct,
                    "source": "simulated_deriv",
                    "updated_at": now_iso
                }
                if GLOBAL_WRITER:
                    GLOBAL_WRITER.benchmark_prices[symbol] = fut_price_paise
                    GLOBAL_WRITER.write(Subscription(symbol, token or "0", "NFO", 2), fut_price_paise, 5000, source="simulated_deriv")
                return fut_quote
            else:
                strike_str = deriv_match.group(5)
                opt_type = deriv_match.group(6)
                if strike_str:
                    strike_rs = max(1.0, float(strike_str))
                    import math
                    time_years = 7.0 / 365.0
                    vol = 0.16
                    r = 0.065
                    d1 = (math.log(spot_rs / strike_rs) + (r + 0.5 * vol ** 2) * time_years) / (vol * math.sqrt(time_years))
                    d2 = d1 - vol * math.sqrt(time_years)
                    def norm_cdf(x):
                        return (1.0 + math.erf(x / math.sqrt(2.0))) / 2.0
                    if opt_type == "CE":
                        price_rs = max(0.5, spot_rs * norm_cdf(d1) - strike_rs * math.exp(-r * time_years) * norm_cdf(d2))
                        delta = norm_cdf(d1)
                    else:
                        price_rs = max(0.5, strike_rs * math.exp(-r * time_years) * norm_cdf(-d2) - spot_rs * norm_cdf(-d1))
                        delta = norm_cdf(d1) - 1.0
                    opt_price_paise = int(round(price_rs * 100))
                    leverage = abs(delta * spot_rs / max(1.0, price_rs))
                    opt_change_pct = round(under_change_pct * min(8.0, max(0.5, leverage)), 2)
                    opt_change_paise = int(round(opt_price_paise * (opt_change_pct / 100.0)))
                    opt_quote = {
                        "symbol": symbol,
                        "price_paise": opt_price_paise,
                        "change_paise": opt_change_paise,
                        "change_percent": opt_change_pct,
                        "source": "simulated_deriv",
                        "updated_at": now_iso
                    }
                    if GLOBAL_WRITER:
                        GLOBAL_WRITER.benchmark_prices[symbol] = opt_price_paise
                        GLOBAL_WRITER.write(Subscription(symbol, token or "0", "NFO", 2), opt_price_paise, 5000, source="simulated_deriv")
                    return opt_quote

    return None


class QuoteRequestHandler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: Any) -> None:
        pass

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/ready":
            ready, error = worker_readiness()
            body = json.dumps({"ready": ready, "error": error}).encode()
            self.send_response(200 if ready else 503)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers(); self.wfile.write(body)
            return

        if parsed.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            body = b'{"status": "ok", "service": "market-worker"}'
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if parsed.path != "/quote":
            self.send_response(404)
            self.send_header("Content-Type", "application/json")
            body = b'{"error": "not found"}'
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        qs = parse_qs(parsed.query)
        symbol = qs.get("symbol", [""])[0].strip().upper()
        if not symbol:
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            body = b'{"error": "symbol required"}'
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        quote = fetch_quote_for_symbol(symbol)
        if not quote:
            self.send_response(404)
            self.send_header("Content-Type", "application/json")
            body = b'{"error": "quote not found"}'
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        body = json.dumps(quote).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


GLOBAL_QUOTE_SERVER: HTTPServer | None = None


def start_quote_server(host: str = "", port: int = 8085) -> HTTPServer | None:
    global GLOBAL_QUOTE_SERVER
    host = os.getenv("QUOTE_SERVER_HOST", host or "0.0.0.0")
    try:
        port = int(os.getenv("QUOTE_SERVER_PORT", str(port)))
    except ValueError:
        port = 8085
    try:
        server = HTTPServer((host, port), QuoteRequestHandler)
        GLOBAL_QUOTE_SERVER = server
        t = threading.Thread(target=server.serve_forever, daemon=True)
        t.start()
        print(f"market worker: on-demand quote HTTP server running on http://{host}:{port}", flush=True)
        return server
    except Exception as e:
        print(f"market worker: could not start quote server on {host}:{port}: {e}", flush=True)
        return None


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


def format_display_symbol(symbol: str, expiry: str, strike: str, option_type: str, name: str) -> str:
    sym = symbol.strip().upper()
    if sym.endswith("-EQ"):
        return sym[:-3]
    if "FUT" in sym:
        for m in ("JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"):
            if m in sym:
                parts = sym.split(m)
                under = parts[0].rstrip("0123456789")
                return f"{under} {m} FUT"
        return sym
    if (sym.endswith("CE") or sym.endswith("PE")) and strike and strike != "-1":
        try:
            s_val = float(strike)
            if s_val > 100000:
                s_val = s_val / 100.0
            s_fmt = f"{s_val:.0f}"
        except Exception:
            s_fmt = strike
        opt = option_type or ("CE" if sym.endswith("CE") else "PE")
        under = name or sym.rstrip("0123456789CEPE ")
        for m in ("JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"):
            if m in sym:
                parts = sym.split(m)
                under = parts[0].rstrip("0123456789")
                return f"{under} {m} {s_fmt} {opt}"
        return f"{under} {s_fmt} {opt}"
    return sym


class InstrumentStore:
    def __init__(self, database_url: str, symbols: list[str]) -> None:
        self.database_url = database_url
        self.symbols = symbols
        self.master_version = ""
        self._master_signature = None
        self._rows: list[dict[str, Any]] = []
        self._subscriptions: dict[tuple[str, int], Subscription] = {}
        self._lock = threading.Lock()

    def subscriptions(self) -> list[Subscription]:
        with self._lock:
            return list(self._subscriptions.values())

    def canonical_epoch(self) -> tuple:
        with self._lock:
            return self.master_version, self._master_signature

    def lookup(self, token: str, exchange_type: int, expected_epoch: tuple | None = None) -> Subscription | None:
        with self._lock:
            if expected_epoch is not None and expected_epoch != (self.master_version, self._master_signature):
                return None
            return self._subscriptions.get((token, exchange_type))

    def refresh(self) -> bool:
        rows: list[dict[str, Any]] = []

        if get_feed_mode() == "live":
            # The Go importer owns activation; subscribing from a second master can corrupt identity.
            if not self.database_url:
                raise RuntimeError("LIVE feed requires the canonical database master")
            import psycopg
            from psycopg.rows import dict_row
            with psycopg.connect(self.database_url, connect_timeout=5, row_factory=dict_row) as connection:
                with connection.cursor() as cursor:
                    cursor.execute("SELECT version FROM instrument_snapshots WHERE status = 'ACTIVE'")
                    versions = list(cursor.fetchall())
                    if len(versions) != 1:
                        raise RuntimeError("LIVE requires exactly one activated master")
                    version = versions[0]["version"]
                    cursor.execute("SELECT COUNT(*) AS count, MAX(updated_at) AS modified FROM instruments WHERE active = true AND is_tradable = true AND snapshot_version = %s", (version,))
                    meta = cursor.fetchone()
                    if not meta or meta["count"] == 0:
                        raise RuntimeError("activated master is empty")
                    signature = (version, meta["count"], str(meta["modified"]))
                    if signature == self._master_signature:
                        return False
                    cursor.execute("SELECT token,symbol,name,underlying_symbol,expiry,strike,lot_size AS lotsize,instrument_type AS instrumenttype,exchange_segment AS exch_seg,tick_size FROM instruments WHERE active = true AND is_tradable = true AND snapshot_version = %s", (version,))
                    rows = list(cursor.fetchall())
            if not rows:
                raise RuntimeError("active master is empty; run sync-instruments before starting LIVE")
            for row in rows:
                for key in ("lotsize","strike","tick_size"):
                    row[key] = str(row[key])
                if re.fullmatch(r"\d{4}-\d{2}-\d{2}",row.get("expiry") or ""):
                    row["expiry"] = datetime.strptime(row["expiry"],"%Y-%m-%d").strftime("%d%b%Y").upper()
            global GLOBAL_TOKEN_MAP
            mapping = {}
            for row in rows:
                sym = clean(row["symbol"]).upper()
                mapping[sym] = row
                if row["instrumenttype"] in ("EQUITY","INDEX","AMXIDX",""):
                    mapping[sym.removesuffix("-EQ")] = row
                    mapping[resolve_canonical_symbol(sym.removesuffix("-EQ"))] = row
                    if row["instrumenttype"] in ("INDEX","AMXIDX"):
                        mapping[resolve_canonical_symbol(clean(row["name"]))] = row
            subscriptions = self._build_subscriptions(rows)
            with self._lock:
                GLOBAL_TOKEN_MAP = mapping
                self._rows = rows
                self.master_version = version
                self._master_signature = signature
                changed = self._subscriptions != {(item.token,item.exchange_type):item for item in subscriptions}
                self._subscriptions = {(item.token,item.exchange_type):item for item in subscriptions}
            return changed

        # 1. Check local cache first to avoid slow 35MB download
        if (os.path.exists(LOCAL_CACHE_PATH) and os.path.getsize(LOCAL_CACHE_PATH) > 1000000
                and time.time() - os.path.getmtime(LOCAL_CACHE_PATH) < 86400):
            print(f"market worker: loading instruments from local cache ({LOCAL_CACHE_PATH})", flush=True)
            try:
                with open(LOCAL_CACHE_PATH, "r", encoding="utf-8") as f:
                    rows = json.load(f)
            except Exception as e:
                print(f"market worker: failed reading local cache: {e}", flush=True)

        # 2. Download if not cached
        if not rows:
            print("market worker: downloading Angel One instrument master", flush=True)
            try:
                request = urllib.request.Request(INSTRUMENT_MASTER_URL, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(request, timeout=20) as response:
                    content = response.read()
                    rows = json.loads(content.decode("utf-8"))
                    # Save to local cache
                    try:
                        with open(LOCAL_CACHE_PATH, "wb") as f:
                            f.write(content)
                    except Exception:
                        pass
            except Exception as error:
                print(f"market worker: instrument master download failed: {error}; using fallback master", flush=True)
                rows = self._rows
                if not rows and os.path.exists(LOCAL_CACHE_PATH):
                    try:
                        with open(LOCAL_CACHE_PATH, "r", encoding="utf-8") as cached:
                            rows = json.load(cached)
                    except (OSError, ValueError):
                        pass
                if not rows:
                    rows = FALLBACK_INSTRUMENT_MASTER

        self._rows = rows
        init_global_token_map()
        subscriptions = self._build_subscriptions(rows)
        if not subscriptions:
            # Fall back to built-in subscriptions
            subscriptions = self._fallback_subscriptions()

        with self._lock:
            changed = self._subscriptions != {(item.token, item.exchange_type): item for item in subscriptions}
            self._subscriptions = {(item.token, item.exchange_type): item for item in subscriptions}
        print(f"market worker: configured {len(subscriptions)} instruments; subscribed symbols={','.join(item.symbol for item in subscriptions)}", flush=True)
        return changed

    def _fallback_subscriptions(self) -> list[Subscription]:
        result = []
        for requested in self.symbols:
            match = next((item for item in FALLBACK_INSTRUMENT_MASTER if item["name"] == requested), None)
            if match:
                exch = match["exch_seg"]
                result.append(Subscription(requested, match["token"], exch, EXCHANGE_TYPES.get(exch, 1)))
        return result

    def _build_subscriptions(self, rows: list[dict[str, Any]], requested_symbols=None) -> list[Subscription]:
        # Exact NFO symbols and NSE equities share the same subscription path.
        today = datetime.now(ZoneInfo("Asia/Kolkata")).date()
        cached_rows, cached_day, cached_index = getattr(self, "_subscription_index", (None, None, None))
        if cached_rows is rows and cached_day == today:
            by_symbol = cached_index
        else:
            by_symbol = {}
            for row in rows:
                segment, symbol = clean(row.get("exch_seg")), clean(row.get("symbol")).upper()
                if segment in ("NFO", "BFO"):
                    try:
                        expiry = datetime.strptime(clean(row.get("expiry")), "%d%b%Y").date()
                    except ValueError:
                        continue
                    if expiry < datetime.now(timezone.utc).astimezone(ZoneInfo("Asia/Kolkata")).date():
                        continue
                    by_symbol[symbol] = row
                elif segment in ("NSE","BSE") and (symbol.endswith("-EQ") or clean(row.get("instrumenttype")) in ("EQUITY","INDEX","AMXIDX")):
                    by_symbol[symbol] = row
                    by_symbol[symbol.removesuffix("-EQ")] = row
                    by_symbol[resolve_canonical_symbol(symbol.removesuffix("-EQ"))] = row
                    if clean(row.get("instrumenttype")) in ("INDEX","AMXIDX"):
                        by_symbol[resolve_canonical_symbol(clean(row.get("name")))] = row
            self._subscription_index = (rows, today, by_symbol)
        indexes = {"NIFTY": ("99926000", "NSE"), "BANKNIFTY": ("99926009", "NSE"),
                   "FINNIFTY": ("99926037", "NSE"), "MIDCPNIFTY": ("99926074", "NSE"),
                   "SENSEX": ("99919000", "BSE")}
        subscriptions = {}
        for requested in (self.symbols if requested_symbols is None else requested_symbols):
            symbol = resolve_canonical_symbol(requested)
            if symbol in indexes and get_feed_mode() != "live":
                token, segment = indexes[symbol]
            else:
                row = by_symbol.get(symbol) or by_symbol.get(requested.upper())
                if row is None and get_feed_mode() != "live":
                    row = next((r for r in FALLBACK_INSTRUMENT_MASTER if r["name"] == symbol and r["symbol"].endswith("-EQ")), None)
                if row is None:
                    continue
                token, segment = clean(row.get("token")), clean(row.get("exch_seg"))
                if segment in ("NFO", "BFO"):
                    symbol = clean(row.get("symbol")).upper()
            if not token or segment not in EXCHANGE_TYPES:
                continue
            key = (token, EXCHANGE_TYPES[segment])
            subscriptions[key] = Subscription(symbol, token, segment, key[1])
        return list(subscriptions.values())

    def demanded_subscriptions(self, client) -> list[Subscription]:
        # Demand expires when no screen/matcher requests the symbol for five minutes.
        cutoff = int(time.time()) - 300
        client.zremrangebyscore("market:quote:demand", "-inf", cutoff)
        demand = client.zrevrangebyscore("market:quote:demand", "+inf", cutoff, start=0, num=900)
        demand = [s.decode() if isinstance(s, bytes) else s for s in demand]
        return self._build_subscriptions(self._rows, self.symbols + demand)


def sync_demand_subscriptions(store, client, websocket) -> list[Subscription]:
    epoch = store.canonical_epoch()
    desired = {(s.token, s.exchange_type): s for s in store.demanded_subscriptions(client)}
    current = {(s.token, s.exchange_type): s for s in store.subscriptions()}
    added = [s for k, s in desired.items() if k not in current]
    removed = [s for k, s in current.items() if k not in desired]
    def groups(items):
        grouped = {}
        for item in items:
            grouped.setdefault(item.exchange_type, []).append(item.token)
        return [{"exchangeType": k, "tokens": v} for k, v in grouped.items()]
    # Install lookup before subscription so the first incoming tick is recognized.
    with store._lock:
        if epoch != (store.master_version, store._master_signature):
            return []
        store._subscriptions = {**current, **desired}
    try:
        if removed:
            websocket.unsubscribe("demand", QUOTE_SUBSCRIPTION_MODE, groups(removed))
        if added:
            websocket.subscribe("demand", QUOTE_SUBSCRIPTION_MODE, groups(added))
    except Exception:
        with store._lock:
            if epoch == (store.master_version, store._master_signature):
                store._subscriptions = current
        websocket.input_request_dict = {QUOTE_SUBSCRIPTION_MODE: {g["exchangeType"]: g["tokens"] for g in groups(current.values())}}
        raise
    with store._lock:
        if epoch != (store.master_version, store._master_signature):
            return []
        store._subscriptions = desired
    # The installed SDK appends tokens and does not correctly prune unsubscribe
    # state. Keep its reconnect snapshot equal to the actual desired subscriptions.
    websocket.input_request_dict = {QUOTE_SUBSCRIPTION_MODE: {g["exchangeType"]: g["tokens"] for g in groups(desired.values())}}
    return added


def publish_feed_state(
    client: Any,
    feed_provider: str,
    feed_state: str,
    is_synthetic: bool = False,
    last_tick: str | None = None,
    subscribed_tokens_count: int | None = None,
) -> dict[str, Any]:
    now_iso = datetime.now(timezone.utc).isoformat()
    market_event_id = f"mkt_feed_{int(time.time() * 1000)}_{uuid.uuid4().hex[:6]}"
    state_payload = {
        "market_event_id": market_event_id,
        "feed_provider": feed_provider,
        "feed_state": feed_state,
        "is_synthetic": is_synthetic,
        "updated_at": now_iso
    }
    if last_tick:
        state_payload["last_tick"] = last_tick
    if subscribed_tokens_count is not None:
        state_payload["subscribed_tokens_count"] = subscribed_tokens_count
    try:
        mapping = {
            "market_event_id": market_event_id,
            "feed_provider": feed_provider,
            "feed_state": feed_state,
            "is_synthetic": "true" if is_synthetic else "false",
            "updated_at": now_iso,
        }
        if last_tick:
            mapping["last_tick"] = last_tick
        if subscribed_tokens_count is not None:
            mapping["subscribed_tokens_count"] = str(subscribed_tokens_count)
        client.hset("market:feed_state", mapping=mapping)
        event = {
            "type": "feed_status",
            **state_payload
        }
        client.publish("market:updates", json.dumps(event))
        print(f"market worker: authoritative feed state -> event_id={market_event_id}, provider={feed_provider}, state={feed_state}, synthetic={is_synthetic}", flush=True)
    except Exception as e:
        print(f"market worker: error updating feed state in Redis: {e}", flush=True)
    return state_payload


def provider_market_fields(data: dict[str, Any], scaled: bool = False) -> dict[str, Any]:
    """Only transport provider fields. Missing OHLC/OI/depth never becomes zero data."""
    fields: dict[str, Any] = {}
    convert = integer if scaled else rupees_to_paise
    for dest, key in (("open_paise", "open_price_of_the_day" if scaled else "open"),
                      ("high_paise", "high_price_of_the_day" if scaled else "high"),
                      ("low_paise", "low_price_of_the_day" if scaled else "low")):
        value = convert(data.get(key))
        if value > 0:
            fields[dest] = value
    oi_key = "open_interest" if scaled else "opnInterest"
    fields["open_interest_available"] = "true" if oi_key in data and data[oi_key] is not None else "false"
    depth = data.get("depth") or {}
    book = {}
    for side, key in (("bids", "best_5_buy_data"), ("asks", "best_5_sell_data")):
        rows = data.get(key) if scaled else depth.get("buy" if side == "bids" else "sell")
        clean_rows = []
        for row in rows or []:
            price = convert(row.get("price"))
            quantity = integer(row.get("quantity"))
            orders = integer(row.get("no_of_orders") if scaled else row.get("orders"))
            if price > 0 and quantity > 0:
                clean_rows.append({"price_paise": price, "quantity": quantity, "orders": orders})
        if len(clean_rows) == 5:
            book[side] = clean_rows
    if len(book) == 2:
        fields["depth_json"] = json.dumps(book)
    return fields


class QuoteWriter:
    def __init__(self, client: redis.Redis, quote_ttl: int, history_ttl: int, history_max_items: int, feed_mode: str | None = None) -> None:
        self.client = client
        self.quote_ttl = max(quote_ttl, 7 * 86400) if (feed_mode or get_feed_mode()) == "live" else quote_ttl
        self.history_ttl = history_ttl
        self.history_max_items = history_max_items
        self._daily_volume: dict[str, tuple[date, int]] = {}
        self.benchmark_prices = dict(DEFAULT_BENCHMARK_PRICES_PAISE)
        self.history_lock = threading.RLock()
        self._feed_mode = feed_mode
        self.settlement_recorder = SettlementRecorder(os.getenv("DATABASE_URL", ""))

    @property
    def feed_mode(self) -> str:
        return self._feed_mode if self._feed_mode is not None else get_feed_mode()

    def write(self, subscription: Subscription, price_paise: int, volume: int, source: str = "synthetic",
              previous_close_paise: int = 0, event_time: datetime | None = None,
              build_history: bool = True, open_interest: int = 0,
              lower_circuit_paise: int = 0, upper_circuit_paise: int = 0,
              market_fields: dict[str, Any] | None = None) -> None:
        mode = self.feed_mode
        if mode == "live" and source != "angelone_live":
            print(f"market worker: rejected non-live quote write to Redis in LIVE mode (source={source}, symbol={subscription.symbol})", flush=True)
            return
        if mode in ("unavailable", "disabled"):
            print(f"market worker: rejected quote write to Redis in {mode.upper()} mode (source={source}, symbol={subscription.symbol})", flush=True)
            return

        if price_paise <= 0:
            return
        now = event_time or datetime.now(timezone.utc)
        if now.tzinfo is None or now > datetime.now(timezone.utc) + timedelta(seconds=5):
            return
        benchmark = previous_close_paise if mode == "live" else self.benchmark_prices.get(subscription.symbol, price_paise)
        change_paise = price_paise - benchmark if benchmark > 0 else 0
        change_percent = round((change_paise / benchmark) * 100, 2) if benchmark > 0 else 0.0
        market_event_id = f"mkt_tick_{int(now.timestamp() * 1000)}_{subscription.symbol}_{uuid.uuid4().hex[:8]}"

        quote = {
            "market_event_id": market_event_id,
            "symbol": subscription.symbol,
            "price_paise": price_paise,
            "change_paise": change_paise,
            "change_percent": change_percent,
            "volume": volume,
            "previous_close_paise": benchmark,
            "open_interest": max(open_interest, 0),
            "day_change_available": benchmark > 0,
            "source": source,
            "updated_at": now.isoformat()
        }
        if lower_circuit_paise > 0:
            quote["lower_circuit_paise"] = lower_circuit_paise
        if upper_circuit_paise > 0:
            quote["upper_circuit_paise"] = upper_circuit_paise
        if market_fields:
            quote.update(market_fields)

        bucket = int(now.timestamp()) // 60
        quote_key, history_key = f"market:quote:{subscription.symbol}", f"market:history:{subscription.symbol}"

        symbols_to_write = [subscription.symbol]
        canonical = resolve_canonical_symbol(subscription.symbol)
        for alias in get_symbol_aliases(canonical):
            if alias not in symbols_to_write:
                symbols_to_write.append(alias)
        if canonical not in symbols_to_write:
            symbols_to_write.append(canonical)

        for sym in symbols_to_write:
            self.settlement_recorder.record(sym, price_paise, source, mode, now)

        t0 = time.perf_counter()
        with self.history_lock, self.client.pipeline() as pipe:
            existing = self.client.hgetall(quote_key)
            old_stamp = broker_quote_time(existing.get("updated_at")) if existing else None
            if existing.get("source") == source and old_stamp is not None and old_stamp > now:
                return
            pipe.hset("market:feed_state", mapping={"last_tick": now.isoformat()})
            for sym in symbols_to_write:
                q_key = f"market:quote:{sym}"
                h_key = f"market:history:{sym}"
                sym_quote = dict(quote)
                sym_quote["symbol"] = sym
                if benchmark <= 0:
                    sym_quote.pop("change_paise", None)
                    sym_quote.pop("change_percent", None)
                    pipe.hdel(q_key, "change_paise", "change_percent")
                # Remove stale optional fields rather than preserving a prior guessed band/book.
                for field in ("lower_circuit_paise", "upper_circuit_paise", "depth_json", "open_paise", "high_paise", "low_paise", "open_interest_available"):
                    if field not in sym_quote:
                        pipe.hdel(q_key, field)
                pipe.hset(q_key, mapping={**sym_quote, "day_change_available": str(sym_quote["day_change_available"]).lower()})
                pipe.expire(q_key, self.quote_ttl)

                if build_history:
                    sym_latest = self.client.lindex(h_key, 0)
                    candle = make_candle(sym_latest, bucket, price_paise, self.volume_delta(sym, now.date(), volume), source, mode.upper())
                    try:
                        same_bucket = json.loads(sym_latest).get("timestamp") == bucket * 60 if sym_latest else False
                    except (TypeError, ValueError):
                        same_bucket = False
                    if same_bucket:
                        pipe.lset(h_key, 0, json.dumps(candle))
                    else:
                        pipe.lpush(h_key, json.dumps(candle))
                    pipe.ltrim(h_key, 0, self.history_max_items - 1)
                    pipe.expire(h_key, self.history_ttl)
                pipe.publish("market:updates", json.dumps(sym_quote))
            pipe.execute()
        redis_latency_ms = round((time.perf_counter() - t0) * 1000, 2)
        # Periodic or trace logging for tick persistence without log flooding
        if random.random() < 0.01:
            print(f"market worker: tick emitted -> event_id={market_event_id}, symbol={subscription.symbol}, price={price_paise}, redis_latency_ms={redis_latency_ms}", flush=True)

    def volume_delta(self, symbol: str, trading_day: date, cumulative_volume: int) -> int:
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

            drift = (target_price - cur_price) * 0.0008
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
        if self.writer and getattr(self.writer, "client", None):
            publish_feed_state(self.writer.client, feed_provider="synthetic", feed_state="LIVE", is_synthetic=True, subscribed_tokens_count=len(self.subscriptions))
        print(f"market worker: synthetic GBM feed started for {len(self.subscriptions)} symbols ({','.join(s.symbol for s in self.subscriptions)})", flush=True)
        while not self._stop_event.is_set():
            try:
                self.step()
            except Exception as error:
                print(f"market worker: synthetic tick generation error: {error}", flush=True)
            self._stop_event.wait(self.tick_interval_seconds)
        if self.writer and getattr(self.writer, "client", None):
            publish_feed_state(self.writer.client, feed_provider="synthetic", feed_state="STOPPED", is_synthetic=True)


def seed_historical_candles(client: redis.Redis, subscriptions: list[Subscription], history_ttl: int, max_items: int, count: int = 150) -> None:
    now = datetime.now(timezone.utc)
    current_bucket = int(now.timestamp()) // 60

    for sub in subscriptions:
        history_key = f"market:history:{sub.symbol}"
        base_price = DEFAULT_BENCHMARK_PRICES_PAISE.get(sub.symbol, 200000)

        try:
            existing_count = client.llen(history_key)
            if existing_count >= 10:
                continue
        except Exception:
            continue

        prices = [base_price]
        cur_price = base_price
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
                "source": "seed",
                "feed_mode": "SYNTHETIC",
            })

        try:
            with client.pipeline() as pipe:
                pipe.delete(history_key)
                for candle in reversed(candles):
                    pipe.rpush(history_key, json.dumps(candle))
                pipe.ltrim(history_key, 0, max_items - 1)
                pipe.expire(history_key, history_ttl)
                pipe.execute()
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


def make_candle(latest: str | None, bucket: int, price_paise: int, volume: int, source: str = "", feed_mode: str = "") -> dict:
    timestamp = bucket * 60
    if latest:
        try:
            candle = json.loads(latest)
            if candle.get("timestamp") == timestamp and (not source or (candle.get("source") == source and candle.get("feed_mode") == feed_mode)):
                candle["high_paise"] = max(integer(candle.get("high_paise")), price_paise)
                candle["low_paise"] = min(integer(candle.get("low_paise")) or price_paise, price_paise)
                candle["close_paise"] = price_paise
                candle["volume"] = integer(candle.get("volume")) + volume
                return candle
        except (TypeError, ValueError, json.JSONDecodeError):
            pass
    return {"timestamp": timestamp, "open_paise": price_paise, "high_paise": price_paise,
            "low_paise": price_paise, "close_paise": price_paise, "volume": volume, "source": source, "feed_mode": feed_mode}


def has_angel_credentials() -> bool:
    required = ["ANGEL_API_KEY", "ANGEL_CLIENT_ID", "ANGEL_PASSWORD", "ANGEL_TOTP_SECRET"]
    return all(bool(os.getenv(k, "").strip()) for k in required)


def worker_readiness() -> tuple[bool, str]:
    try:
        if GLOBAL_WRITER is None or GLOBAL_WRITER.client is None:
            return False, "worker not initialized"
        values = GLOBAL_WRITER.client.hgetall("market:feed_state")
        stamp = datetime.fromisoformat(values.get("worker_heartbeat", "").replace("Z", "+00:00"))
        age = (datetime.now(timezone.utc) - stamp).total_seconds()
        if age < -5 or age > 90:
            return False, "worker heartbeat expired or future dated"
        if get_feed_mode() == "live" and not values.get("worker_master_version"):
            return False, "activated master missing"
        if get_feed_mode() == "live" and values.get("feed_state") in ("UNAVAILABLE", "DISCONNECTED", "RETRYING"):
            return False, "live provider unavailable"
        return True, ""
    except Exception:
        return False, "worker state unavailable"


def write_worker_heartbeat(client: Any, store: InstrumentStore) -> None:
    stamp = datetime.now(timezone.utc).isoformat()
    client.set("market:worker:heartbeat", stamp, ex=90)
    client.hset("market:feed_state", mapping={"worker_heartbeat": stamp, "worker_master_version": store.master_version})


def refresh_once(store: InstrumentStore, control: FeedControl, client: Any) -> None:
    try:
        if store.refresh():
            control.reconnect("activated master or tradable contracts changed")
    except Exception as error:
        if get_feed_mode() == "live":
            global GLOBAL_TOKEN_MAP
            with store._lock:
                GLOBAL_TOKEN_MAP = {}
                store.master_version = ""
                store._master_signature = None
                store._rows = []
                store._subscriptions = {}
            # Disconnect stale subscriptions even when Redis is also unavailable.
            control.reconnect("canonical master unavailable")
            publish_feed_state(client, feed_provider="angel_one", feed_state="UNAVAILABLE", is_synthetic=False)
            try:
                write_worker_heartbeat(client, store)
            except Exception as heartbeat_error:
                print(f"market worker: invalidated master heartbeat failed: {heartbeat_error}", flush=True)
        print(f"market worker: instrument refresh failed: {error}", flush=True)


def refresh_daily(store: InstrumentStore, control: FeedControl, client: Any = None) -> None:
    # Keep the function name for compatibility; reconcile within one minute, including expiry retirement.
    interval = max(10, min(300, int(os.getenv("INSTRUMENT_REFRESH_SECONDS", "60"))))
    while True:
        time.sleep(interval)
        try:
            refresh_once(store, control, client)
            write_worker_heartbeat(client, store)
        except Exception as error:
            # A transient Redis outage must not kill canonical reconciliation.
            print(f"market worker: reconciliation state update failed: {error}", flush=True)


def run_feed(store: InstrumentStore, writer: QuoteWriter, control: FeedControl) -> bool:
    global GLOBAL_SMART_API, GLOBAL_WRITER
    if not store.master_version:
        raise RuntimeError("activated canonical master unavailable")
    api_key = os.getenv("ANGEL_API_KEY", "").strip()
    client_id = os.getenv("ANGEL_CLIENT_ID", "").strip()
    smart_api, session = smart_api_session()
    master_epoch = store.canonical_epoch()
    if not master_epoch[0]:
        raise RuntimeError("activated canonical master unavailable")
    GLOBAL_WRITER = writer
    auth_token = session["jwtToken"]
    feed_token = session["feedToken"]
    websocket = VerifiedSmartWebSocket(auth_token, api_key, client_id, feed_token)
    websocket.input_request_dict = {}
    control.attach(websocket)
    if writer and getattr(writer, "client", None):
        publish_feed_state(writer.client, feed_provider="angel_one", feed_state="CONNECTING", is_synthetic=False)

    # Snapshot all segments asynchronously after connection.
    stopped = threading.Event()
    connected = threading.Event()

    snapshot_attempts = {}

    def demand_loop():
        while not stopped.wait(2):
            if not connected.is_set():
                continue
            try:
                if store.canonical_epoch() != master_epoch:
                    control.reconnect("canonical master changed during feed")
                    return
                sync_demand_subscriptions(store, writer.client, websocket)
                # Up to 50 exact identities per FULL request, across all segments.
                pending = []
                active = store.subscriptions()
                active_symbols = {item.symbol for item in active}
                for symbol in list(snapshot_attempts):
                    if symbol not in active_symbols:
                        snapshot_attempts.pop(symbol, None)
                for item in active:
                    if time.monotonic() - snapshot_attempts.get(item.symbol, 0) < 60:
                        continue
                    updated = writer.client.hget(f"market:quote:{item.symbol}", "updated_at")
                    stamp = broker_quote_time(updated)
                    if stamp and (datetime.now(timezone.utc) - stamp).total_seconds() < 90:
                        continue
                    snapshot_attempts[item.symbol] = time.monotonic()
                    pending.append(item)
                    if len(pending) == 50:
                        break
                snapshots = fetch_full_snapshots(smart_api, pending)
                if store.canonical_epoch() != master_epoch:
                    control.reconnect("canonical master changed during snapshot request")
                    return
                for item in pending:
                    data = snapshots.get((item.exchange_segment, item.token))
                    stamp = full_snapshot_time(data) if data else None
                    price = rupees_to_paise(data.get("ltp")) if data else 0
                    if data and stamp and price > 0:
                        writer.write(item, rupees_to_paise(data.get("ltp")), integer(data.get("tradeVolume")),
                                     source="angelone_live", previous_close_paise=rupees_to_paise(data.get("close")),
                                     event_time=stamp, build_history=False, open_interest=integer(data.get("opnInterest")), market_fields=provider_market_fields(data),
                                     lower_circuit_paise=rupees_to_paise(data.get("lowerCircuit")), upper_circuit_paise=rupees_to_paise(data.get("upperCircuit")))
                    elif data:
                        print(f'market worker: FULL snapshot discarded; positive_price={price > 0} exchange_time={stamp is not None}', flush=True)
            except Exception as error:
                print(f"market worker: demand subscription refresh failed: {error}", flush=True)

    def on_open(_wsapp: Any) -> None:
        if store.canonical_epoch() != master_epoch:
            control.reconnect("canonical master changed before connection opened")
            return
        if writer and getattr(writer, "client", None):
            publish_feed_state(writer.client, feed_provider="angel_one", feed_state="LIVE", is_synthetic=False, subscribed_tokens_count=len(store.subscriptions()))
        grouped: dict[int, list[str]] = {}
        for item in store.subscriptions():
            grouped.setdefault(item.exchange_type, []).append(item.token)
        websocket.subscribe("stock-sim", QUOTE_SUBSCRIPTION_MODE, [{"exchangeType": exchange_type, "tokens": tokens} for exchange_type, tokens in grouped.items()])
        control.opened()
        connected.set()
        print(f"market worker: Angel One WebSocket connected! Subscribed to {len(store.subscriptions())} instruments", flush=True)

    def on_data(_wsapp: Any, message: dict[str, Any]) -> None:
        try:
            exchange_type = integer(message.get("exchange_type"))
            subscription = store.lookup(clean(message.get("token")), exchange_type, master_epoch)
            if subscription is None:
                return
            price_paise = paise(message.get("last_traded_price"))
            volume = integer(message.get("volume_trade_for_the_day"))
            control.tick()
            stamp = broker_quote_time(message.get("exchange_timestamp"))
            if stamp is None:
                return
            lower_c = paise(message.get("lower_circuit_limit") or message.get("lower_circuit") or message.get("lowerCircuit"))
            upper_c = paise(message.get("upper_circuit_limit") or message.get("upper_circuit") or message.get("upperCircuit"))
            writer.write(subscription, price_paise, volume, source="angelone_live",
                         previous_close_paise=paise(message.get("closed_price")), event_time=stamp,
                         open_interest=integer(message.get("open_interest")),
                         lower_circuit_paise=lower_c, upper_circuit_paise=upper_c, market_fields=provider_market_fields(message, scaled=True))
        except (ValueError, redis.RedisError) as error:
            print(f"market worker: discarded Angel One tick: {error}", flush=True)

    def on_error(_wsapp: Any, error: Any) -> None:
        print(f"market worker: Angel One WebSocket error: {error}", flush=True)
        if writer and getattr(writer, "client", None):
            publish_feed_state(writer.client, feed_provider="angel_one", feed_state="DISCONNECTED", is_synthetic=False)

    def on_close(_wsapp: Any) -> None:
        connected.clear()
        print("market worker: Angel One WebSocket closed", flush=True)
        if writer and getattr(writer, "client", None):
            publish_feed_state(writer.client, feed_provider="angel_one", feed_state="DISCONNECTED", is_synthetic=False)

    websocket.on_open = on_open
    websocket.on_data = on_data
    websocket.on_error = on_error
    websocket.on_close = on_close
    threading.Thread(target=demand_loop, daemon=True).start()
    threading.Thread(target=history_demand_loop, args=(store, writer, smart_api, stopped), daemon=True).start()
    try:
        websocket.connect()
    finally:
        stopped.set()
        opened = control.healthy_connection_opened()
        control.detach(websocket)
    return opened


def confirmed_closed_session() -> bool:
    """Use the backend calendar, including holidays; failures never suppress a watchdog."""
    url = os.getenv("MARKET_STATUS_URL", "http://127.0.0.1:8080/api/v1/market/status")
    try:
        with urllib.request.urlopen(url, timeout=2) as response:
            payload = json.load(response)
        data = payload.get("data") or {}
        return payload.get("success") is True and data.get("is_open") is False and data.get("status") in ("CLOSED", "HOLIDAY", "PRE_OPEN", "POST_MARKET")
    except Exception:
        return False


def check_feed_watchdog(control: FeedControl, stale_after_seconds: int) -> None:
    if control.stale(stale_after_seconds) and not confirmed_closed_session():
        control.reconnect(f"no market tick for {stale_after_seconds}s")


def watch_feed(control: FeedControl, stale_after_seconds: int) -> None:
    check_interval = max(1, min(10, stale_after_seconds // 2))
    while True:
        time.sleep(check_interval)
        check_feed_watchdog(control, stale_after_seconds)


class FeedSupervisor:
    """
    Manages the lifecycle and retry loop for the live market feed.
    In LIVE feed mode, consecutive failures transition the published feed state to UNAVAILABLE
    while continuing to retry connecting to Angel One.
    Automatic hidden mode switching to synthetic ticks is strictly disallowed.
    """
    def __init__(self, store: Any, writer: Any, control: FeedControl, mode: str = "live", max_failures: int = 3, tick_interval: float = 1.0) -> None:
        global GLOBAL_SUPERVISOR
        self.store = store
        self.writer = writer
        self.control = control
        self.mode = mode
        self.max_failures = max_failures
        self.tick_interval = tick_interval
        self.fail_count = 0
        self.fallback_active = False
        GLOBAL_SUPERVISOR = self

    def handle_feed_cycle(self, run_feed_fn) -> bool:
        """
        Runs one iteration of the feed.
        Returns True to continue the live feed retry loop.
        Never switches automatically to synthetic fallback.
        """
        try:
            opened = run_feed_fn(self.store, self.writer, self.control)
            if opened:
                self.fail_count = 0
            else:
                self.fail_count += 1
                print(f"market worker: live feed disconnected or failed to open (failure count {self.fail_count}/{self.max_failures})", flush=True)
        except Exception as error:
            self.fail_count += 1
            print(f"market worker: live feed error: {error} (failure count {self.fail_count}/{self.max_failures})", flush=True)

        if self.fail_count >= self.max_failures:
            print(f"market worker: live feed failed {self.fail_count} times; marking state as UNAVAILABLE (retrying live feed; no synthetic fallback)", flush=True)
            if self.writer and getattr(self.writer, "client", None):
                publish_feed_state(self.writer.client, feed_provider="angel_one", feed_state="UNAVAILABLE", is_synthetic=False)
            return True

        if self.fail_count > 0:
            if self.writer and getattr(self.writer, "client", None):
                publish_feed_state(self.writer.client, feed_provider="angel_one", feed_state="RETRYING", is_synthetic=False)

        return True


def main() -> None:
    global GLOBAL_WRITER
    mode = get_feed_mode()
    if os.getenv("MARKET_FEED_MODE", "").strip().lower() == "auto":
        print("market worker: 'auto' feed mode is deprecated; strictly enforcing LIVE feed mode with explicit UNAVAILABLE state", flush=True)

    default_symbols = (
        "RELIANCE,TCS,INFY,HDFCBANK,TATAMOTORS,TMPV,TMCV,BHARTIARTL,ETERNAL,ZOMATO,SUZLON,TRENT,ADANIENT,YESBANK,BEL,"
        "NIFTY,BANKNIFTY,FINNIFTY,MIDCPNIFTY,SENSEX,SBIN,ICICIBANK,ATGL,POONAWALLA,TATACHEM,TATAPOWER,"
        "SUNPHARMA,TATASTEEL,ITC,EMCURE,WELCORP,BBTC,JYOTICNC,SPLPETRO,SUPREMEIND,GODIGIT,TATATECH,NIACL,"
        "KPITTECH,SUNTV,GILLETTE,DLF,PRAJIND,BAJFINANCE,AXISBANK,KOTAKBANK,APARINDS,MARUTI,HINDUNILVR,LT,WIPRO"
    )
    symbols = [item.strip().upper() for item in os.getenv("MARKET_SYMBOLS", default_symbols).split(",") if item.strip()]
    if not symbols:
        raise RuntimeError("MARKET_SYMBOLS must contain at least one symbol")

    client = redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379/0"), decode_responses=True,
                            socket_connect_timeout=5, socket_timeout=5, health_check_interval=30)
    db_url = os.getenv("DATABASE_URL", "").strip()
    store = InstrumentStore(db_url, symbols)

    # Load canonical symbol aliases from file, env, and Redis
    load_canonical_aliases(client)

    try:
        store.refresh()
    except Exception as error:
        print(f"market worker: initial instrument refresh failed: {error}", flush=True)
        # Keep liveness/heartbeat available and retry canonical activation through reconciliation.

    quote_ttl = int(os.getenv("QUOTE_TTL_SECONDS", "300"))
    history_ttl = int(os.getenv("HISTORY_TTL_SECONDS", "86400"))
    history_max = int(os.getenv("HISTORY_MAX_ITEMS", "500"))
    writer = QuoteWriter(client, quote_ttl, history_ttl, history_max)
    GLOBAL_WRITER = writer
    if mode == "live" and not store.master_version:
        publish_feed_state(client, feed_provider="angel_one", feed_state="UNAVAILABLE", is_synthetic=False)
    def heartbeat() -> None:
        while True:
            try:
                write_worker_heartbeat(client, store)
            except Exception:
                pass
            time.sleep(20)
    threading.Thread(target=heartbeat, daemon=True).start()

    # Initialize global symbol lookup, Angel One session, and on-demand quote HTTP server
    init_global_token_map()
    if mode == "live" and store.master_version:
        init_smart_api()
    start_quote_server()

    # Seed historical candles only in explicit synthetic simulation mode; never inject fake candles in LIVE mode
    if mode == "synthetic":
        seed_historical_candles(client, store.subscriptions(), history_ttl, history_max)

    # Synthetic Feed Mode (explicit only)
    if mode == "synthetic":
        print("market worker: running in explicit SYNTHETIC feed mode", flush=True)
        publish_feed_state(client, feed_provider="synthetic", feed_state="LIVE", is_synthetic=True)
        tick_interval = float(os.getenv("SYNTHETIC_TICK_INTERVAL_SECONDS", "1.0"))
        synthetic_feed = SyntheticFeed(store.subscriptions(), writer, tick_interval_seconds=tick_interval)
        synthetic_feed.run()
        return

    # Unavailable or Disabled Mode (explicit)
    if mode in ("unavailable", "disabled"):
        print(f"market worker: running in explicit {mode.upper()} feed mode", flush=True)
        publish_feed_state(client, feed_provider="none", feed_state="UNAVAILABLE", is_synthetic=False)
        while True:
            time.sleep(30)
            publish_feed_state(client, feed_provider="none", feed_state="UNAVAILABLE", is_synthetic=False)
        return

    # Live Feed Mode (strict Angel One, no automatic fallback)
    print("market worker: running in LIVE ANGEL ONE feed mode", flush=True)
    control = FeedControl()
    threading.Thread(target=refresh_daily, args=(store, control, client), daemon=True).start()
    if not has_angel_credentials():
        print("market worker: Angel One credentials missing in LIVE mode; setting state to UNAVAILABLE (no hidden synthetic fallback)", flush=True)
        publish_feed_state(client, feed_provider="angel_one", feed_state="UNAVAILABLE", is_synthetic=False)
        while True:
            time.sleep(30)
            publish_feed_state(client, feed_provider="angel_one", feed_state="UNAVAILABLE", is_synthetic=False)
        return

    publish_feed_state(client, feed_provider="angel_one", feed_state="CONNECTING" if store.master_version else "UNAVAILABLE", is_synthetic=False)
    stale_after_seconds = int(os.getenv("MARKET_FEED_STALE_SECONDS", "120"))
    threading.Thread(target=watch_feed, args=(control, stale_after_seconds), daemon=True).start()

    tick_interval = float(os.getenv("SYNTHETIC_TICK_INTERVAL_SECONDS", "1.0"))
    supervisor = FeedSupervisor(store, writer, control, mode=mode, max_failures=3, tick_interval=tick_interval)

    backoff = 1
    while True:
        supervisor.handle_feed_cycle(run_feed)
        time.sleep(backoff)
        backoff = min(backoff * 2, 60)


if __name__ == "__main__":
    main()
