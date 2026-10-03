#!/usr/bin/env python3
"""Assert the application's LIVE data and optional paper execution paths.
No broker credentials, SmartConnect initialization, or real broker orders.
Use a dedicated empty paper account for --paper-orders. Every failed assertion exits 1.
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from urllib.parse import urlparse
from datetime import datetime, timezone


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def quote_check(quote, symbol, executable=False):
    require(quote.get("symbol") == symbol, f"Wrong quote identity for {symbol}")
    require(quote.get("source") == "angelone_live", f"Non-live source for {symbol}")
    require(isinstance(quote.get("price_paise"), int) and quote["price_paise"] > 0, f"Price missing for {symbol}")
    stamp = datetime.fromisoformat(quote["updated_at"].replace("Z", "+00:00"))
    age = (datetime.now(timezone.utc) - stamp).total_seconds()
    require(age >= -5, f"Future quote for {symbol}")
    if executable:
        require(age <= 120 and not quote.get("is_quote_stale"), f"Stale execution quote for {symbol}")
    return {key: quote.get(key) for key in ("symbol", "price_paise", "source", "updated_at", "previous_close_paise", "day_change_available", "open_interest_available")}


def run(args, result=None):
    parsed = urlparse(args.base_url)
    require(parsed.scheme in ("http", "https") and parsed.hostname and not parsed.username and not parsed.password and not parsed.query and not parsed.fragment, "Use an HTTP(S) application URL without credentials or query parameters")
    result = result if result is not None else {"passed": False, "checks": [], "paper_orders": []}
    result["started_at"] = datetime.now(timezone.utc).isoformat()
    result["session_requirement"] = "OPEN" if args.expect_open or args.paper_orders else "DISPLAY"
    result["stage"] = "readiness"
    token = os.environ.get(args.token_env, "")
    def api(path, method="GET", payload=None, unwrap=True):
        headers = {"Accept": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        if payload is not None:
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(args.base_url.rstrip("/") + path, data=json.dumps(payload).encode() if payload is not None else None, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                payload_result = json.load(response)
        except urllib.error.HTTPError as error:
            # Readiness deliberately returns 503 with useful structured evidence.
            if path == "/ready" and error.code == 503:
                payload_result = json.load(error)
            else:
                raise RuntimeError(f"Application request failed: HTTP {error.code}") from None
        except urllib.error.URLError:
            raise RuntimeError("Application could not be reached; run this script on the machine hosting the backend") from None
        if unwrap:
            require(payload_result.get("success") is True, f"API failure for {path}")
            return payload_result["data"]
        return payload_result

    ready = api("/ready", unwrap=False)
    # Retain diagnostic states on failure, without raw DB/broker error messages.
    result["readiness"] = {"ready": ready.get("ready"), "status": ready.get("status"), "services": {
        name: {key: value for key, value in values.items() if key in ("status", "mode", "market_state", "supervisor_state", "last_tick_age_seconds", "subscribed_tokens_count", "active_version", "master_version", "tradable_count", "total_tradable")}
        for name, values in ready.get("services", {}).items() if isinstance(values, dict)
    }}
    require(ready.get("ready"), "Application readiness failed")
    require(ready["services"]["market_feed"]["mode"] == "LIVE", "Application is not configured for LIVE")
    state = ready["services"]["calendar"]["market_state"]
    if args.expect_open or args.paper_orders:
        require(state == "OPEN", "A sourced open session is required")
    result["stage"] = "canonical_master"
    master = api("/instruments/snapshots/active")
    require(master.get("status") == "ACTIVE" and master.get("total_instruments", 0) > 0, "Active master missing")
    result["master_version"] = master["version"]
    # Explicit equity, index, future, call and put coverage.
    instruments = api(f"/instruments?underlying={args.underlying}&active=true&limit=500")
    future = next((row for row in instruments if row["instrument_type"] in ("FUTIDX", "FUTSTK")), None)
    chain = api(f"/fno/option-chain?symbol={args.underlying}")
    rows = chain.get("strikes") or []
    require(rows, "Option chain empty")
    atm = next((row for row in rows if row.get("is_atm")), rows[len(rows)//2])
    if future is None:
        raise RuntimeError("Canonical future missing")
    calls = [("future", future["symbol"], future["lot_size"]), ("call", atm["call"]["symbol"], atm["call"]["lot_size"]), ("put", atm["put"]["symbol"], atm["put"]["lot_size"])]
    for kind, symbol, lot in [("equity", args.equity, 1), ("index", args.underlying, 1)] + calls:
        result["stage"] = f"quote_{kind}"
        require(lot > 0, f"Invalid lot size: {symbol}")
        quote = api(f"/market/quotes/{symbol}?purpose=display")
        result["checks"].append({"kind": kind, **quote_check(quote, symbol, executable=state == "OPEN")})
        if kind in ("future", "call", "put"):
            require(quote.get("open_interest_available"), f"OI unavailable for {symbol}; coverage cannot be certified")
    for interval in ("ONE_MINUTE", "ONE_HOUR", "ONE_DAY"):
        result["stage"] = f"history_{interval}"
        candles = api(f"/market/quotes/{args.equity}/history?interval={interval}&limit=100")
        require(candles, f"Archive {interval} missing; allow backfill then retry")
        for candle in candles:
            require(candle["source"] == "angelone_live" and candle["feed_mode"] == "LIVE", f"Bad archive provenance: {interval}")
            require(0 < candle["low_paise"] <= min(candle["open_paise"], candle["close_paise"]) <= max(candle["open_paise"], candle["close_paise"]) <= candle["high_paise"], f"Bad OHLC: {interval}")
        result["checks"].append({"interval": interval, "candles": len(candles)})
    if args.paper_orders:
        result["stage"] = "paper_account_preflight"
        require(token, f"Set {args.token_env} to a dedicated paper-account access token")
        portfolio = api("/portfolio")
        require(not portfolio["positions"], "Paper-order smoke requires an empty dedicated account")
        require(all(row.get("status") in ("EXECUTED", "CANCELLED", "REJECTED", "EXPIRED") for row in api("/orders")), "Paper-order smoke requires no pending orders")
        def order(symbol, product, quantity, side):
            result["stage"] = f"paper_{product}_{side}"
            placed = api("/orders", "POST", {"symbol": symbol, "product": product, "quantity": quantity, "side": side, "type": "MARKET", "price_paise": 0})
            identity = placed["uuid"]
            for _ in range(20):
                matches = [item for item in api("/orders") if item["uuid"] == identity]
                if matches and matches[0]["status"] == "EXECUTED":
                    result["paper_orders"].append({"uuid": identity, "symbol": symbol, "side": side, "product": product})
                    return
                require(not matches or matches[0]["status"] not in ("REJECTED", "CANCELLED", "EXPIRED"), "Paper order failed")
                time.sleep(0.5)
            raise RuntimeError("Paper order not executed; inspect account before retrying")
        for symbol, product, qty, direction in [(args.equity, "DELIVERY", 1, "BUY"), (args.equity, "INTRADAY", 1, "BUY"), (args.equity, "INTRADAY", 1, "SELL")] + [(symbol, "FNO", lot, direction) for _, symbol, lot in calls for direction in ("BUY", "SELL")]:
            order(symbol, product, qty, direction)
            order(symbol, product, qty, "SELL" if direction == "BUY" else "BUY")
        require(not api("/portfolio")["positions"], "Paper positions did not flatten")
        require(all(row.get("status") in ("EXECUTED", "CANCELLED", "REJECTED", "EXPIRED") for row in api("/orders")), "Pending paper orders remain; inspect account before retrying")
    result["stage"] = "complete"
    result["passed"] = True
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://localhost:8080/api/v1")
    parser.add_argument("--token-env", default="STOCK_SIM_SMOKE_TOKEN")
    parser.add_argument("--equity", default="RELIANCE")
    parser.add_argument("--underlying", default="NIFTY")
    parser.add_argument("--expect-open", action="store_true")
    parser.add_argument("--paper-orders", action="store_true")
    parser.add_argument("--output")
    args = parser.parse_args()
    report = {"passed": False, "checks": [], "paper_orders": []}
    try:
        run(args, report)
    except (RuntimeError, KeyError, ValueError, OSError, urllib.error.URLError) as error:
        report["error"] = str(error) if isinstance(error, RuntimeError) else f"Invalid or unavailable application evidence ({type(error).__name__})"
        report["cleanup_required"] = bool(args.paper_orders and report.get("stage", "").startswith("paper_") and report["stage"] != "paper_account_preflight")
    report["finished_at"] = datetime.now(timezone.utc).isoformat()
    rendered = json.dumps(report, indent=2)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as output:
            output.write(rendered + "\n")
    print(rendered)
    return 0 if report["passed"] else 1

if __name__ == "__main__":
    sys.exit(main())
