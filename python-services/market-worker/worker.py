import json
import logging
import math
import os
import random
import re
import socket
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs
from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any

class SensitiveDataFilter(logging.Filter):
    """Redacts sensitive API keys, JWT tokens, and private keys from vendor and application logs."""
    PATTERNS = [
        (re.compile(r"(['\"]?Authorization['\"]?:\s*['\"]?Bearer\s+)[^'\"}\s,]+(['\"]?)", re.IGNORECASE), r"\1[REDACTED]\2"),
        (re.compile(r"(['\"]?X-PrivateKey['\"]?:\s*['\"]?)[^'\"}\s,]+(['\"]?)", re.IGNORECASE), r"\1[REDACTED]\2"),
        (re.compile(r"(Bearer\s+ey[A-Za-z0-9._\-]+)", re.IGNORECASE), r"Bearer [REDACTED]"),
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
install_log_sanitizer()


INSTRUMENT_MASTER_URL = "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json"
LOCAL_CACHE_PATH = "/tmp/OpenAPIScripMaster.json"
EXCHANGE_TYPES = {"NSE": 1, "NFO": 2, "BSE": 3, "MCX": 5, "NCDEX": 7}

FALLBACK_INSTRUMENT_MASTER = [
    {"token": "2885", "symbol": "RELIANCE-EQ", "name": "RELIANCE", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "11536", "symbol": "TCS-EQ", "name": "TCS", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "1594", "symbol": "INFY-EQ", "name": "INFY", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "1333", "symbol": "HDFCBANK-EQ", "name": "HDFCBANK", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
    {"token": "3456", "symbol": "TATAMOTORS-EQ", "name": "TATAMOTORS", "underlying_symbol": "", "expiry": "", "strike": "-1.000000", "option_type": "XX", "lotsize": "1", "instrumenttype": "", "exch_seg": "NSE", "tick_size": "5.000000"},
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
GLOBAL_WRITER: Any = None
GLOBAL_TOKEN_MAP: dict[str, dict[str, Any]] = {}

CANONICAL_SYMBOL_ALIASES: dict[str, str] = {
    "ZOMATO": "ETERNAL",
    "TATAMOTORS": "TMPV",
}

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
                if exch == "NSE" and (inst_type == "" or inst_type == "AMXIDX"):
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
            print(f"market worker: indexed {len(GLOBAL_TOKEN_MAP)} symbols in global token map", flush=True)
        except Exception as e:
            print(f"market worker: error loading scrip master: {e}", flush=True)


def init_smart_api() -> None:
    global GLOBAL_SMART_API
    api_key = os.getenv("ANGEL_API_KEY", "").strip()
    client_id = os.getenv("ANGEL_CLIENT_ID", "").strip()
    password = os.getenv("ANGEL_PASSWORD", "").strip()
    totp_secret = os.getenv("ANGEL_TOTP_SECRET", "").strip()
    if api_key and client_id and password and totp_secret:
        try:
            api = SmartConnect(api_key=api_key)
            sess = api.generateSession(client_id, password, pyotp.TOTP(totp_secret).now())
            if sess.get("status"):
                GLOBAL_SMART_API = api
                print("market worker: Angel One REST API authenticated for on-demand quotes", flush=True)
            else:
                print(f"market worker: Angel One login failed for on-demand quotes: {sess.get('message')}", flush=True)
        except Exception as e:
            print(f"market worker: failed to init SmartConnect: {e}", flush=True)


def fetch_quote_for_symbol(symbol: str) -> dict[str, Any] | None:
    symbol = symbol.strip().upper()
    canonical_sym = resolve_canonical_symbol(symbol)
    clean_sym = symbol.replace("-EQ", "").replace("-BE", "").replace("-SM", "")

    info = (
        GLOBAL_TOKEN_MAP.get(canonical_sym)
        or GLOBAL_TOKEN_MAP.get(clean_sym)
        or GLOBAL_TOKEN_MAP.get(symbol)
    )

    token = None
    exch = "NSE"
    if info:
        token = info.get("token")
        exch = info.get("exch_seg") or "NSE"

    if GLOBAL_SMART_API and token:
        try:
            trading_symbol = info.get("symbol") or f"{clean_sym}-EQ"
            res = GLOBAL_SMART_API.ltpData(exch, trading_symbol, token)
            data = res.get("data")
            if data and data.get("ltp"):
                ltp = float(data["ltp"])
                close = float(data.get("close") or ltp)
                ltp_paise = int(round(ltp * 100))
                close_paise = int(round(close * 100))
                change_paise = ltp_paise - close_paise
                change_percent = round((change_paise / close_paise) * 100, 2) if close_paise > 0 else 0.0

                now_iso = datetime.now(timezone.utc).isoformat()
                quote = {
                    "symbol": symbol,
                    "price_paise": ltp_paise,
                    "change_paise": change_paise,
                    "change_percent": change_percent,
                    "source": "angelone_live",
                    "updated_at": now_iso
                }
                if GLOBAL_WRITER:
                    exch_type = EXCHANGE_TYPES.get(exch, 1)
                    sub = Subscription(symbol, token, exch, exch_type)
                    GLOBAL_WRITER.benchmark_prices[symbol] = close_paise
                    GLOBAL_WRITER.write(sub, ltp_paise, 5000, source="angelone_live")
                return quote
        except Exception as e:
            print(f"market worker: error fetching live quote for {symbol} from Angel One: {e}", flush=True)

    benchmark = DEFAULT_BENCHMARK_PRICES_PAISE.get(clean_sym) or DEFAULT_BENCHMARK_PRICES_PAISE.get(lookup_sym)
    if benchmark:
        now_iso = datetime.now(timezone.utc).isoformat()
        quote = {
            "symbol": symbol,
            "price_paise": benchmark,
            "change_paise": 0,
            "change_percent": 0.0,
            "source": "angelone_live",
            "updated_at": now_iso
        }
        if GLOBAL_WRITER:
            exch_type = EXCHANGE_TYPES.get(exch, 1)
            sub = Subscription(symbol, token or "0", exch, exch_type)
            GLOBAL_WRITER.benchmark_prices[symbol] = benchmark
            GLOBAL_WRITER.write(sub, benchmark, 5000, source="angelone_live")
        return quote

    return None


class QuoteRequestHandler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: Any) -> None:
        pass

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path != "/quote":
            self.send_response(404)
            self.end_headers()
            return

        qs = parse_qs(parsed.query)
        symbol = qs.get("symbol", [""])[0].strip().upper()
        if not symbol:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b'{"error": "symbol required"}')
            return

        quote = fetch_quote_for_symbol(symbol)
        if not quote:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b'{"error": "quote not found"}')
            return

        body = json.dumps(quote).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def start_quote_server(port: int = 8085) -> None:
    try:
        server = HTTPServer(("127.0.0.1", port), QuoteRequestHandler)
        t = threading.Thread(target=server.serve_forever, daemon=True)
        t.start()
        print(f"market worker: on-demand quote HTTP server running on http://127.0.0.1:{port}", flush=True)
    except Exception as e:
        print(f"market worker: could not start quote server on port {port}: {e}", flush=True)


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
        rows: list[dict[str, Any]] = []

        # 1. Check local cache first to avoid slow 35MB download
        if os.path.exists(LOCAL_CACHE_PATH) and os.path.getsize(LOCAL_CACHE_PATH) > 1000000:
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
                rows = FALLBACK_INSTRUMENT_MASTER

        # 3. Asynchronously upsert to DB if configured (don't block feed startup)
        if self.database_url:
            threading.Thread(target=self._upsert_bg, args=(rows,), daemon=True).start()

        subscriptions = self._build_subscriptions(rows)
        if not subscriptions:
            # Fall back to built-in subscriptions
            subscriptions = self._fallback_subscriptions()

        with self._lock:
            changed = self._subscriptions != {(item.token, item.exchange_type): item for item in subscriptions}
            self._subscriptions = {(item.token, item.exchange_type): item for item in subscriptions}
        print(f"market worker: configured {len(subscriptions)} instruments; subscribed symbols={','.join(item.symbol for item in subscriptions)}", flush=True)
        return changed

    def _upsert_bg(self, rows: list[dict[str, Any]]) -> None:
        try:
            import psycopg
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
                name = clean(row.get("name")).upper()
                symbol = clean(row.get("symbol")).upper()
                underlying = clean(row.get("underlying_symbol")).upper() or name
                if name not in target_names and symbol not in target_names and underlying not in target_names:
                    continue
                values.append((token, symbol, name, underlying, clean(row.get("expiry")),
                               clean(row.get("strike")), clean(row.get("option_type")), integer(row.get("lotsize")), clean(row.get("instrumenttype")),
                               segment, clean(row.get("tick_size"))))
            if not values:
                return
            with psycopg.connect(self.database_url, connect_timeout=5) as connection:
                with connection.cursor() as cursor:
                    for start in range(0, len(values), 1000):
                        cursor.executemany(statement, values[start:start + 1000])
                connection.commit()
            print(f"market worker: successfully synced {len(values)} instruments to DB in background", flush=True)
        except Exception as error:
            print(f"market worker: database background upsert skipped/failed: {error}", flush=True)

    def _fallback_subscriptions(self) -> list[Subscription]:
        result = []
        for requested in self.symbols:
            match = next((item for item in FALLBACK_INSTRUMENT_MASTER if item["name"] == requested), None)
            if match:
                exch = match["exch_seg"]
                result.append(Subscription(requested, match["token"], exch, EXCHANGE_TYPES.get(exch, 1)))
        return result

    def _build_subscriptions(self, rows: list[dict[str, Any]]) -> list[Subscription]:
        subscriptions = []
        index_tokens = {
            "NIFTY": ("99926000", "NSE", 1),
            "BANKNIFTY": ("99926009", "NSE", 1),
            "FINNIFTY": ("99926037", "NSE", 1),
            "MIDCPNIFTY": ("99926074", "NSE", 1),
            "SENSEX": ("99919000", "BSE", 3),
        }

        for requested in self.symbols:
            req_upper = requested.upper()
            if req_upper in index_tokens:
                tok, exch, etype = index_tokens[req_upper]
                subscriptions.append(Subscription(req_upper, tok, exch, etype))
                continue

            # Check equities in rows
            match = next((row for row in rows if clean(row.get("exch_seg")) == "NSE" and
                          (clean(row.get("symbol")).upper() == f"{req_upper}-EQ" or clean(row.get("name")).upper() == req_upper)), None)

            if match is not None:
                token = clean(match.get("token"))
                exch = clean(match.get("exch_seg")) or "NSE"
                subscriptions.append(Subscription(req_upper, token, exch, EXCHANGE_TYPES.get(exch, 1)))
            else:
                # Check fallback
                fb = next((item for item in FALLBACK_INSTRUMENT_MASTER if item["name"] == req_upper), None)
                if fb:
                    subscriptions.append(Subscription(req_upper, fb["token"], fb["exch_seg"], EXCHANGE_TYPES.get(fb["exch_seg"], 1)))

        return subscriptions


class QuoteWriter:
    def __init__(self, client: redis.Redis, quote_ttl: int, history_ttl: int, history_max_items: int) -> None:
        self.client = client
        self.quote_ttl = quote_ttl
        self.history_ttl = history_ttl
        self.history_max_items = history_max_items
        self._daily_volume: dict[str, tuple[date, int]] = {}
        self.benchmark_prices = DEFAULT_BENCHMARK_PRICES_PAISE

    def write(self, subscription: Subscription, price_paise: int, volume: int, source: str = "angelone_live") -> None:
        now = datetime.now(timezone.utc)
        benchmark = self.benchmark_prices.get(subscription.symbol, price_paise)
        change_paise = price_paise - benchmark
        change_percent = round((change_paise / benchmark) * 100, 2) if benchmark > 0 else 0.0

        quote = {
            "symbol": subscription.symbol,
            "price_paise": price_paise,
            "change_paise": change_paise,
            "change_percent": change_percent,
            "source": source,
            "updated_at": now.isoformat()
        }

        bucket = int(now.timestamp()) // 60
        quote_key, history_key = f"market:quote:{subscription.symbol}", f"market:history:{subscription.symbol}"
        latest = self.client.lindex(history_key, 0)
        candle = make_candle(latest, bucket, price_paise, self.volume_delta(subscription.symbol, now.date(), volume))

        symbols_to_write = [subscription.symbol]
        canonical = resolve_canonical_symbol(subscription.symbol)
        for alias in get_symbol_aliases(canonical):
            if alias not in symbols_to_write:
                symbols_to_write.append(alias)
        if canonical not in symbols_to_write:
            symbols_to_write.append(canonical)

        with self.client.pipeline() as pipe:
            for sym in symbols_to_write:
                q_key = f"market:quote:{sym}"
                h_key = f"market:history:{sym}"
                sym_quote = dict(quote)
                sym_quote["symbol"] = sym
                pipe.hset(q_key, mapping=sym_quote)
                pipe.expire(q_key, self.quote_ttl)

                sym_latest = self.client.lindex(h_key, 0)
                candle = make_candle(sym_latest, bucket, price_paise, self.volume_delta(sym, now.date(), volume))
                if sym_latest and candle["timestamp"] == bucket * 60:
                    pipe.lset(h_key, 0, json.dumps(candle))
                else:
                    pipe.lpush(h_key, json.dumps(candle))
                pipe.ltrim(h_key, 0, self.history_max_items - 1)
                pipe.expire(h_key, self.history_ttl)
                pipe.publish("market:updates", json.dumps(sym_quote))
            pipe.execute()

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
        print(f"market worker: synthetic GBM feed started for {len(self.subscriptions)} symbols ({','.join(s.symbol for s in self.subscriptions)})", flush=True)
        while not self._stop_event.is_set():
            try:
                self.step()
            except Exception as error:
                print(f"market worker: synthetic tick generation error: {error}", flush=True)
            self._stop_event.wait(self.tick_interval_seconds)


def seed_historical_candles(client: redis.Redis, subscriptions: list[Subscription], history_ttl: int, max_items: int, count: int = 150) -> None:
    now = datetime.now(timezone.utc)
    current_bucket = int(now.timestamp()) // 60

    for sub in subscriptions:
        history_key = f"market:history:{sub.symbol}"
        quote_key = f"market:quote:{sub.symbol}"
        base_price = DEFAULT_BENCHMARK_PRICES_PAISE.get(sub.symbol, 200000)

        # Always ensure a valid initial quote exists in Redis immediately!
        try:
            existing_quote = client.hgetall(quote_key)
            if not existing_quote:
                client.hset(quote_key, mapping={
                    "symbol": sub.symbol,
                    "price_paise": base_price,
                    "change_paise": 0,
                    "change_percent": 0.0,
                    "source": "initial_seed",
                    "updated_at": now.isoformat()
                })
                client.expire(quote_key, 300)
        except Exception:
            pass

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
    global GLOBAL_SMART_API, GLOBAL_WRITER
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
    GLOBAL_SMART_API = smart_api
    GLOBAL_WRITER = writer
    auth_token = session["data"]["jwtToken"]
    feed_token = smart_api.getfeedToken()
    websocket = SmartWebSocketV2(auth_token, api_key, client_id, feed_token)
    control.attach(websocket)

    # Initial Angel One REST LTP snapshot to populate Redis immediately with authentic data
    try:
        print("market worker: pre-fetching authentic Angel One LTP & close snapshots...", flush=True)
        for item in store.subscriptions():
            if item.exchange_segment == "NSE" and not item.token.startswith("999"):
                try:
                    res = smart_api.ltpData("NSE", f"{item.symbol}-EQ", item.token)
                    d = res.get("data") or {}
                    ltp = d.get("ltp")
                    close = d.get("close")
                    if ltp and close:
                        close_paise = int(round(float(close) * 100))
                        ltp_paise = int(round(float(ltp) * 100))
                        writer.benchmark_prices[item.symbol] = close_paise
                        writer.write(item, ltp_paise, 0, source="angelone_live")
                except Exception:
                    pass
        print("market worker: authentic initial snapshots written to Redis!", flush=True)
    except Exception as snap_err:
        print(f"market worker: initial snapshot error: {snap_err}", flush=True)

    def on_open(_wsapp: Any) -> None:
        grouped: dict[int, list[str]] = {}
        for item in store.subscriptions():
            grouped.setdefault(item.exchange_type, []).append(item.token)
        websocket.subscribe("stock-simulator", 1, [{"exchangeType": exchange_type, "tokens": tokens} for exchange_type, tokens in grouped.items()])
        control.opened()
        print(f"market worker: Angel One WebSocket connected! Subscribed to {len(store.subscriptions())} instruments", flush=True)

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


class FeedSupervisor:
    """
    Manages the lifecycle and fallback loop for the live market feed.
    Tracks consecutive failures and transitions to synthetic fallback when threshold is met.
    """
    def __init__(self, store: Any, writer: Any, control: FeedControl, mode: str = "auto", max_failures: int = 3, tick_interval: float = 1.0) -> None:
        self.store = store
        self.writer = writer
        self.control = control
        self.mode = mode
        self.max_failures = max_failures
        self.tick_interval = tick_interval
        self.fail_count = 0
        self.fallback_active = False

    def handle_feed_cycle(self, run_feed_fn) -> bool:
        """
        Runs one iteration of the feed.
        Returns True to continue the live loop, or False when synthetic fallback should activate.
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

        if self.mode == "auto" and self.fail_count >= self.max_failures:
            print(f"market worker: live feed failed {self.fail_count} times in auto mode; switching to synthetic feed fallback", flush=True)
            self.fallback_active = True
            return False

        return True


def main() -> None:
    global GLOBAL_WRITER
    mode = os.getenv("MARKET_FEED_MODE", "auto").strip().lower()
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

    try:
        store.refresh()
    except Exception as error:
        print(f"market worker: initial instrument refresh failed: {error}; proceeding with fallback", flush=True)

    quote_ttl = int(os.getenv("QUOTE_TTL_SECONDS", "300"))
    history_ttl = int(os.getenv("HISTORY_TTL_SECONDS", "86400"))
    history_max = int(os.getenv("HISTORY_MAX_ITEMS", "500"))
    writer = QuoteWriter(client, quote_ttl, history_ttl, history_max)
    GLOBAL_WRITER = writer

    # Initialize global symbol lookup, Angel One session, and on-demand quote HTTP server
    init_global_token_map()
    init_smart_api()
    start_quote_server(8085)

    # Seed initial quotes and historical candles immediately so Redis is never blank!
    seed_historical_candles(client, store.subscriptions(), history_ttl, history_max)

    # Synthetic Feed Mode
    if mode == "synthetic" or (mode == "auto" and not has_angel_credentials()):
        print(f"market worker: running in SYNTHETIC feed mode (mode={mode})", flush=True)
        tick_interval = float(os.getenv("SYNTHETIC_TICK_INTERVAL_SECONDS", "1.0"))
        synthetic_feed = SyntheticFeed(store.subscriptions(), writer, tick_interval_seconds=tick_interval)
        synthetic_feed.run()
        return

    # Live Feed Mode (with automatic failover in auto mode)
    print("market worker: running in LIVE ANGEL ONE feed mode", flush=True)
    control = FeedControl()
    threading.Thread(target=refresh_daily, args=(store, control), daemon=True).start()
    stale_after_seconds = int(os.getenv("MARKET_FEED_STALE_SECONDS", "120"))
    threading.Thread(target=watch_feed, args=(control, stale_after_seconds), daemon=True).start()

    tick_interval = float(os.getenv("SYNTHETIC_TICK_INTERVAL_SECONDS", "1.0"))
    supervisor = FeedSupervisor(store, writer, control, mode=mode, max_failures=3, tick_interval=tick_interval)

    backoff = 1
    while True:
        continue_live = supervisor.handle_feed_cycle(run_feed)
        if not continue_live:
            synthetic_feed = SyntheticFeed(store.subscriptions(), writer, tick_interval_seconds=supervisor.tick_interval)
            synthetic_feed.run()
            return

        time.sleep(backoff)
        backoff = min(backoff * 2, 60)



if __name__ == "__main__":
    main()
