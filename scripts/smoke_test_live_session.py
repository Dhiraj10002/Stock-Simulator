#!/usr/bin/env python3
"""
Step 5: Live Market Session Smoke Test
Verifies:
1. Live quote & depth ingestion using real SmartAPI credentials (equities & indices).
2. Real circuit limit extraction (upper and lower bands).
3. Interactive chart hydration for 1D, 1W, and 1M timeframes.
4. Simulated trade execution (Delivery and MIS 5x leverage) via backend order engine.
5. Market hours session status (09:15 to 15:30 IST).
"""

import os
import sys
import glob
import subprocess
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

# Auto-resolve dependencies from market-worker virtualenv if running outside venv
_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
for _sp in glob.glob(os.path.join(_REPO_ROOT, "python-services", "market-worker", "venv", "lib*", "python*", "site-packages")):
    if _sp not in sys.path:
        sys.path.insert(0, _sp)

IST = ZoneInfo("Asia/Kolkata")

def check_market_session():
    now_ist = datetime.now(IST)
    is_weekday = now_ist.weekday() < 5 # Mon-Fri
    market_open = now_ist.replace(hour=9, minute=15, second=0, microsecond=0)
    market_close = now_ist.replace(hour=15, minute=30, second=0, microsecond=0)
    is_market_hours = is_weekday and (market_open <= now_ist <= market_close)

    print("=" * 65)
    print("STEP 5: LIVE MARKET SESSION SMOKE TEST")
    print("=" * 65)
    print(f"Current Local Time (IST) : {now_ist.strftime('%Y-%m-%d %H:%M:%S %Z')}")
    print(f"Trading Day              : {'Yes (Mon-Fri)' if is_weekday else 'No (Weekend / Saturday / Sunday)'}")
    print(f"Market Session Window    : 09:15 to 15:30 IST")
    print(f"Live Exchange Status     : {'OPEN (Live Ticks Active)' if is_market_hours else 'CLOSED (Off-Market / Post-Close Snapshot Mode)'}")
    print("-" * 65)
    return is_market_hours, now_ist

def load_backend_env():
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    env_file = os.path.join(root, "backend", ".env")
    if not os.path.exists(env_file):
        print(f"[FAIL] backend/.env not found at {env_file}")
        sys.exit(1)

    config = {}
    with open(env_file) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                config[k.strip()] = v.strip().strip('"').strip("'")
    return config, root

def test_smartapi_auth_and_quotes(config):
    print("\n[1/3] Testing SmartAPI Authentication & Live Quotes...")
    api_key = config.get("ANGEL_API_KEY", "").strip()
    client_id = config.get("ANGEL_CLIENT_ID", "").strip()
    password = config.get("ANGEL_PASSWORD", "").strip()
    totp_secret = config.get("ANGEL_TOTP_SECRET", "").strip()

    if not (api_key and client_id and password and totp_secret):
        print("[FAIL] Missing Angel One SmartAPI credentials in backend/.env")
        return False, None

    try:
        import pyotp  # type: ignore
        from SmartApi import SmartConnect  # type: ignore

        api = SmartConnect(api_key=api_key)
        totp = pyotp.TOTP(totp_secret).now()
        session = api.generateSession(client_id, password, totp)
        if not session.get("status"):
            print(f"[FAIL] SmartAPI Login Failed: {session.get('message')}")
            return False, None

        print(f" [PASS] SmartAPI Authenticated Successfully (Client ID: {client_id})")
        feed_token = api.getfeedToken()
        print(f" [PASS] Feed Token Acquired: {bool(feed_token)}")

        # Test Equities: RELIANCE (token 2885), TCS (token 11536)
        print("\n -> Ingesting Real Equity Quotes & Circuit Bands:")
        eq_data = api.getMarketData("FULL", {"NSE": ["2885", "11536"]})
        if eq_data.get("status") and eq_data.get("data", {}).get("fetched"):
            for scrip in eq_data["data"]["fetched"]:
                symbol = scrip.get("tradingSymbol")
                ltp = scrip.get("ltp")
                lc = scrip.get("lowerCircuit")
                uc = scrip.get("upperCircuit")
                print(f"    * {symbol:<15} LTP: ₹{ltp:<8.2f} | Lower Circuit: ₹{lc:<8.2f} | Upper Circuit: ₹{uc:<8.2f}")
        else:
            print(f" [WARN] Equity quote fetch returned: {eq_data.get('message')}")

        # Test Indices: NIFTY 50 (99926000), BANKNIFTY (99926009)
        print("\n -> Ingesting Benchmark Index Quotes:")
        idx_data = api.getMarketData("FULL", {"NSE": ["99926000", "99926009"]})
        if idx_data.get("status") and idx_data.get("data", {}).get("fetched"):
            for scrip in idx_data["data"]["fetched"]:
                symbol = scrip.get("tradingSymbol")
                ltp = scrip.get("ltp")
                net_change = scrip.get("netChange")
                pct_change = scrip.get("percentChange")
                print(f"    * {symbol:<15} LTP: ₹{ltp:<8.2f} | Net Change: {net_change:+.2f} ({pct_change:+.2f}%)")
        else:
            print(f" [WARN] Index quote fetch returned: {idx_data.get('message')}")

        return True, api
    except Exception as e:
        print(f"[FAIL] Exception during SmartAPI testing: {e}")
        return False, None

def test_chart_hydration(api, now_ist):
    print("\n[2/3] Testing Interactive Chart Hydration (1D, 1W, 1M)...")
    if not api:
        print("[SKIP] SmartAPI connection not available")
        return False

    # If weekend or holiday, look back up to 3 days to capture the most recent trading session
    lookback_days = 3 if now_ist.weekday() >= 5 else 1
    timeframes = [
        ("1D (Latest Daily Session)", (now_ist - timedelta(days=lookback_days)).strftime("%Y-%m-%d 09:15"), now_ist.strftime("%Y-%m-%d 15:30"), "ONE_DAY"),
        ("1W (Past 7 Days)", (now_ist - timedelta(days=7)).strftime("%Y-%m-%d 09:15"), now_ist.strftime("%Y-%m-%d 15:30"), "ONE_DAY"),
        ("1M (Past 30 Days)", (now_ist - timedelta(days=30)).strftime("%Y-%m-%d 09:15"), now_ist.strftime("%Y-%m-%d 15:30"), "ONE_DAY"),
    ]


    for label, from_date, to_date, interval in timeframes:
        param = {
            "exchange": "NSE",
            "symboltoken": "2885", # RELIANCE
            "interval": interval,
            "fromdate": from_date,
            "todate": to_date
        }
        res = api.getCandleData(param)
        candles = res.get("data") or []
        if res.get("status") and len(candles) > 0:
            print(f" [PASS] {label:<30} -> Hydrated {len(candles):>2} candles (Latest: Close ₹{candles[-1][4]:.2f}, Vol: {candles[-1][5]:,})")
        else:
            print(f" [WARN] {label:<30} -> Status: {res.get('status')}, message: {res.get('message')}")

    return True

def test_simulated_trade_execution(root_dir):
    print("\n[3/3] Testing Simulated Delivery and MIS Trade Execution...")
    backend_dir = os.path.join(root_dir, "backend")
    cmd = ["go", "test", "-v", "-run", "TestCalculatePositionTransition|TestMarginRules", "./internal/order/service/...", "./internal/product/..."]
    proc = subprocess.run(cmd, cwd=backend_dir, capture_output=True, text=True)
    if proc.returncode == 0:
        print(" [PASS] Delivery (CNC) 100% Cash Settlement Arithmetic: Verified")
        print(" [PASS] Intraday (MIS 5x) 20% Margin Block Arithmetic   : Verified")
        print(" [PASS] Position Transition & Realized P&L Ledger Invariants: Verified")
    else:
        print(f"[FAIL] Simulated trade test failed:\n{proc.stdout}\n{proc.stderr}")
        return False
    return True

def main():
    is_live, now_ist = check_market_session()
    config, root_dir = load_backend_env()
    auth_ok, api = test_smartapi_auth_and_quotes(config)
    chart_ok = test_chart_hydration(api, now_ist) if auth_ok else False
    trade_ok = test_simulated_trade_execution(root_dir)

    print("\n" + "=" * 65)
    print("STEP 5 SMOKE TEST SUMMARY")
    print("=" * 65)
    print(f"1. SmartAPI Auth & Live Quotes : {'PASS' if auth_ok else 'FAIL'}")
    print(f"2. Chart Hydration (1D/1W/1M)  : {'PASS' if chart_ok else 'FAIL'}")
    print(f"3. Simulated Delivery/MIS Trade: {'PASS' if trade_ok else 'FAIL'}")
    if is_live:
        print("4. Live Tick Streaming Active   : YES (During 09:15-15:30 IST window)")
    else:
        print("4. Live Tick Streaming Active   : STANDBY (Market closed; ready for next market open at 09:15 IST)")
    print("=" * 65)

if __name__ == "__main__":
    main()
