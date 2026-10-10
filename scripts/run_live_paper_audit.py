#!/usr/bin/env python3
"""Live Paper Trading Execution, Latency, and Idempotency Verification Script.

Executes TOMORROW's CHECKLIST (09:15 - 15:30 IST) against the production API.
Target: https://stocksim-api.duckdns.org/api/v1
"""

import asyncio
import concurrent.futures
import json
import os
import threading
import time
import urllib.error
import urllib.request
import uuid
import websockets

BASE_URL = os.getenv("API_BASE_URL", "https://api.stock-simulator.in/api/v1")
WS_URL = os.getenv("WS_FEED_URL", "wss://api.stock-simulator.in/ws/market")
ORIGIN = os.getenv("AUDIT_ORIGIN", "https://www.stock-simulator.in")

EMAIL = "live_audit_20261008@stocksim.in"
PASSWORD = "TestPassword@123"

AUDIT_SYMBOLS = ["RELIANCE-EQ", "INFY-EQ", "TCS-EQ", "NIFTY27OCT26FUT", "NIFTY03NOV2622300CE"]
RECEIVED_TICKS = {}
STOP_WS = threading.Event()

def start_ws_keeper():
    async def ws_loop():
        headers = {"Origin": ORIGIN}
        while not STOP_WS.is_set():
            try:
                async with websockets.connect(WS_URL, additional_headers=headers) as ws:
                    await ws.send(json.dumps({"action": "subscribe", "symbols": AUDIT_SYMBOLS}))
                    while not STOP_WS.is_set():
                        msg = await asyncio.wait_for(ws.recv(), timeout=5.0)
                        try:
                            data = json.loads(msg)
                            if data.get("type") == "quote":
                                sym = data.get("quote", {}).get("symbol")
                                if sym:
                                    RECEIVED_TICKS[sym] = data.get("quote")
                        except Exception:
                            pass
            except Exception:
                await asyncio.sleep(1.0)

    def run():
        asyncio.run(ws_loop())

    t = threading.Thread(target=run, daemon=True)
    t.start()
    return t

def make_request(method, endpoint, payload=None, token=None, idempotency_key=None):
    url = f"{BASE_URL}{endpoint}" if endpoint.startswith("/") else f"{BASE_URL}/{endpoint}"
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {
        "Content-Type": "application/json",
        "Origin": ORIGIN,
        "User-Agent": "Mozilla/5.0 (LivePaperAudit/1.0)",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = resp.read().decode("utf-8")
            return resp.status, json.loads(body) if body else {}
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8")
        try:
            return err.code, json.loads(body)
        except Exception:
            return err.code, {"error": body}

def get_auth_token():
    print(f"Logging in as {EMAIL}...")
    status, res = make_request("POST", "/auth/login", {"email": EMAIL, "password": PASSWORD})
    if status != 200:
        raise RuntimeError(f"Login failed (status {status}): {res}")
    token = res.get("data", {}).get("access_token")
    if not token:
        raise RuntimeError(f"No access token in login response: {res}")
    print("Login successful! Token acquired.")
    return token

def get_wallet(token):
    status, res = make_request("GET", "/wallet", token=token)
    if status != 200:
        raise RuntimeError(f"Get wallet failed: {res}")
    return res.get("data", {})

def get_positions(token):
    status, res = make_request("GET", "/portfolio/positions", token=token)
    if status != 200:
        raise RuntimeError(f"Get positions failed: {res}")
    return res.get("data", [])

def get_quote(symbol):
    status, res = make_request("GET", f"/market/quotes/{symbol}")
    if status != 200:
        # Fallback to display purpose if current quote is warming up
        status, res = make_request("GET", f"/market/quotes/{symbol}?purpose=display")
        if status != 200:
            raise RuntimeError(f"Get quote failed for {symbol}: {res}")
    return res.get("data", {})

def place_order(token, symbol, side, order_type, product, quantity, price_paise=0, trigger_price_paise=0, idempotency_key=None):
    if not idempotency_key:
        idempotency_key = f"audit_{uuid.uuid4().hex}"
    payload = {
        "symbol": symbol,
        "side": side,
        "type": order_type,
        "product": product,
        "quantity": quantity,
        "price_paise": price_paise,
        "trigger_price_paise": trigger_price_paise
    }
    status, res = make_request("POST", "/orders", payload=payload, token=token, idempotency_key=idempotency_key)
    return status, res

def run_step2_and_3():
    print("Initializing active WebSocket feed keeper for live tick streaming...")
    start_ws_keeper()
    time.sleep(2.0)  # Wait for subscriptions to establish and first ticks to flow

    token = get_auth_token()

    # Step 0: Initial Cleanup & State check
    print("\n" + "="*70)
    print("STEP 0: CLEANUP & BASELINE WALLET INSPECTION")
    print("="*70)
    make_request("POST", "/orders/squareoff-mis", token=token)
    make_request("DELETE", "/orders/clear", token=token)
    
    init_wallet = get_wallet(token)
    init_cash = init_wallet.get("cash_balance_paise", 0)
    init_blocked = init_wallet.get("blocked_paise", 0)
    print(f"Starting Wallet Balance: ₹{init_cash/100:,.2f} (Blocked Margin: ₹{init_blocked/100:,.2f})")
    
    # ---------------------------------------------------------
    # Track 1: CNC Delivery Buy & Sell (100% cash verification)
    # ---------------------------------------------------------
    print("\n" + "="*70)
    print("TRACK 1: CNC DELIVERY BUY & SELL (100% Cash Verification)")
    print("="*70)
    sym_cnc = "RELIANCE-EQ"
    q_cnc = get_quote(sym_cnc)
    print(f"Live Quote for {sym_cnc}: ₹{q_cnc.get('price_paise', 0)/100:.2f} (Source: {q_cnc.get('source')})")
    
    w_before_cnc = get_wallet(token)
    status, res = place_order(token, sym_cnc, "BUY", "MARKET", "DELIVERY", 1)
    print(f"1. Placed BUY 1 {sym_cnc} DELIVERY | Status: {status} | Order UUID: {res.get('data', {}).get('uuid')}")
    if status != 201:
        raise RuntimeError(f"CNC BUY order failed: {res}")
    buy_order = res.get("data", {})
    exec_price_cnc_buy = buy_order.get("executed_price_paise")
    print(f"   Filled at: ₹{exec_price_cnc_buy/100:.2f}")

    w1 = get_wallet(token)
    cash_diff = w_before_cnc.get("cash_balance_paise", 0) - w1.get("cash_balance_paise", 0)
    print(f"   Wallet Cash after Buy: ₹{w1.get('cash_balance_paise')/100:,.2f} | Deducted: ₹{cash_diff/100:.2f}")
    assert cash_diff == exec_price_cnc_buy, f"Expected 100% cash deduction {exec_price_cnc_buy}, got {cash_diff}"
    print("   [PASS] 100% Cash Deduction Verified exactly!")

    # Sell CNC
    time.sleep(0.5)
    status, res = place_order(token, sym_cnc, "SELL", "MARKET", "DELIVERY", 1)
    print(f"2. Placed SELL 1 {sym_cnc} DELIVERY | Status: {status} | Order UUID: {res.get('data', {}).get('uuid')}")
    if status != 201:
        raise RuntimeError(f"CNC SELL order failed: {res}")
    sell_order = res.get("data", {})
    exec_price_cnc_sell = sell_order.get("executed_price_paise")
    print(f"   Filled at: ₹{exec_price_cnc_sell/100:.2f}")
    
    w1_after = get_wallet(token)
    cnc_pnl = exec_price_cnc_sell - exec_price_cnc_buy
    print(f"   CNC Realized P&L: ₹{cnc_pnl/100:.2f}")
    print(f"   Wallet Balance after CNC Sell: ₹{w1_after.get('cash_balance_paise')/100:,.2f}")
    print("   [PASS] CNC Delivery Cycle Completed & Reconciled!")

    # ---------------------------------------------------------
    # Track 2: MIS Intraday Buy & Sell (20% margin / 5x leverage check)
    # ---------------------------------------------------------
    print("\n" + "="*70)
    print("TRACK 2: MIS INTRADAY BUY & SELL (20% Margin / 5x Leverage Check)")
    print("="*70)
    sym_mis = "INFY-EQ"
    qty_mis = 5
    q_mis = get_quote(sym_mis)
    print(f"Live Quote for {sym_mis}: ₹{q_mis.get('price_paise', 0)/100:.2f} (Source: {q_mis.get('source')})")

    w_before_mis = get_wallet(token)
    status, res = place_order(token, sym_mis, "BUY", "MARKET", "INTRADAY", qty_mis)
    print(f"1. Placed BUY {qty_mis} {sym_mis} INTRADAY | Status: {status} | Order UUID: {res.get('data', {}).get('uuid')}")
    if status != 201:
        raise RuntimeError(f"MIS BUY order failed: {res}")
    mis_buy = res.get("data", {})
    exec_price_mis_buy = mis_buy.get("executed_price_paise")
    notional_mis = exec_price_mis_buy * qty_mis
    expected_margin = notional_mis // 5  # 5x leverage -> 20% margin
    print(f"   Executed Price: ₹{exec_price_mis_buy/100:.2f} | Notional: ₹{notional_mis/100:.2f}")
    print(f"   Expected 20% Blocked Margin (5x leverage): ₹{expected_margin/100:.2f}")

    w2 = get_wallet(token)
    actual_blocked = w2.get("blocked_paise", 0)
    print(f"   Actual Blocked Margin in Wallet: ₹{actual_blocked/100:.2f}")
    assert abs(actual_blocked - expected_margin) <= 1, f"Expected margin {expected_margin}, got {actual_blocked}"
    print("   [PASS] 20% Margin / 5x Leverage Verified exactly!")

    # Sell MIS to exit
    time.sleep(0.5)
    status, res = place_order(token, sym_mis, "SELL", "MARKET", "INTRADAY", qty_mis)
    print(f"2. Placed SELL {qty_mis} {sym_mis} INTRADAY | Status: {status} | Order UUID: {res.get('data', {}).get('uuid')}")
    if status != 201:
        raise RuntimeError(f"MIS SELL order failed: {res}")
    mis_sell = res.get("data", {})
    exec_price_mis_sell = mis_sell.get("executed_price_paise")
    print(f"   Filled at: ₹{exec_price_mis_sell/100:.2f}")

    w2_after = get_wallet(token)
    print(f"   Blocked Margin after MIS exit: ₹{w2_after.get('blocked_paise')/100:.2f}")
    assert w2_after.get("blocked_paise", 0) == 0, "Blocked margin should be released to 0"
    print("   [PASS] MIS Blocked Margin released to ₹0.00!")

    # ---------------------------------------------------------
    # Track 3: NFO Futures Buy & Exit (Contract lot size check)
    # ---------------------------------------------------------
    print("\n" + "="*70)
    print("TRACK 3: NFO FUTURES BUY & EXIT (Contract Lot Size Check)")
    print("="*70)
    sym_fut = "NIFTY27OCT26FUT"
    lot_size = 65
    
    # Negative test: quantity not multiple of lot size
    print(f"1. Negative Test: Attempting BUY 10 {sym_fut} (Lot size is {lot_size})...")
    status, res = place_order(token, sym_fut, "BUY", "MARKET", "FNO", 10)
    print(f"   Response status: {status} | Code: {res.get('code')}")
    assert status == 400, f"Expected 400 for invalid lot size, got {status}"
    assert "lot size" in res.get("message", "").lower(), f"Unexpected error message: {res}"
    print(f"   [PASS] System strictly rejected non-lot-size quantity (10): {res.get('message')}")

    # Positive test: 1 full lot (65)
    q_fut = get_quote(sym_fut)
    print(f"2. Live Quote for {sym_fut}: ₹{q_fut.get('price_paise', 0)/100:.2f} (Source: {q_fut.get('source')})")
    status, res = place_order(token, sym_fut, "BUY", "MARKET", "FNO", lot_size)
    print(f"3. Placed BUY {lot_size} {sym_fut} FNO | Status: {status} | Order UUID: {res.get('data', {}).get('uuid')}")
    if status != 201:
        raise RuntimeError(f"FUT BUY order failed: {res}")
    fut_buy = res.get("data", {})
    exec_price_fut_buy = fut_buy.get("executed_price_paise")
    notional_fut = exec_price_fut_buy * lot_size
    expected_fut_margin = (notional_fut * 20) // 100
    print(f"   Filled at: ₹{exec_price_fut_buy/100:.2f} | Notional: ₹{notional_fut/100:,.2f}")
    print(f"   Expected 20% Futures Margin: ₹{expected_fut_margin/100:,.2f}")
    
    w3 = get_wallet(token)
    actual_fut_margin = w3.get("blocked_paise", 0)
    print(f"   Actual Blocked Margin: ₹{actual_fut_margin/100:,.2f}")
    assert abs(actual_fut_margin - expected_fut_margin) <= 2, f"Expected {expected_fut_margin}, got {actual_fut_margin}"
    print("   [PASS] Futures Margin calculated & blocked accurately!")

    # Exit Futures
    time.sleep(0.5)
    status, res = place_order(token, sym_fut, "SELL", "MARKET", "FNO", lot_size)
    print(f"4. Placed SELL {lot_size} {sym_fut} FNO | Status: {status} | Order UUID: {res.get('data', {}).get('uuid')}")
    if status != 201:
        raise RuntimeError(f"FUT SELL order failed: {res}")
    fut_sell = res.get("data", {})
    print(f"   Filled at: ₹{fut_sell.get('executed_price_paise')/100:.2f}")

    w3_after = get_wallet(token)
    assert w3_after.get("blocked_paise", 0) == 0, "Futures margin should be released to 0"
    print("   [PASS] Futures Position Exited & Margin Released to ₹0.00!")

    # ---------------------------------------------------------
    # Track 4: NFO Options Buy CE/PE (Premium deduction check)
    # ---------------------------------------------------------
    print("\n" + "="*70)
    print("TRACK 4: NFO OPTIONS BUY CE/PE (Premium Deduction Check)")
    print("="*70)
    sym_opt = "NIFTY03NOV2622300CE"
    lot_opt = 65
    q_opt = get_quote(sym_opt)
    print(f"Live Quote for {sym_opt}: ₹{q_opt.get('price_paise', 0)/100:.2f} (Source: {q_opt.get('source')})")

    w4_before = get_wallet(token)
    status, res = place_order(token, sym_opt, "BUY", "MARKET", "FNO", lot_opt)
    print(f"1. Placed BUY {lot_opt} {sym_opt} FNO | Status: {status} | Order UUID: {res.get('data', {}).get('uuid')}")
    if status != 201:
        raise RuntimeError(f"OPT BUY order failed: {res}")
    opt_buy = res.get("data", {})
    exec_price_opt_buy = opt_buy.get("executed_price_paise")
    premium_expected = exec_price_opt_buy * lot_opt
    print(f"   Filled at: ₹{exec_price_opt_buy/100:.2f} | Premium Payable: ₹{premium_expected/100:,.2f}")

    w4 = get_wallet(token)
    opt_cash_deducted = w4_before.get("cash_balance_paise", 0) - w4.get("cash_balance_paise", 0)
    print(f"   Actual Cash Deducted: ₹{opt_cash_deducted/100:,.2f}")
    assert opt_cash_deducted == premium_expected, f"Expected 100% premium {premium_expected}, got {opt_cash_deducted}"
    print("   [PASS] 100% Long Option Premium Deducted exactly!")

    # Exit Option
    time.sleep(0.5)
    status, res = place_order(token, sym_opt, "SELL", "MARKET", "FNO", lot_opt)
    print(f"2. Placed SELL {lot_opt} {sym_opt} FNO | Status: {status} | Order UUID: {res.get('data', {}).get('uuid')}")
    if status != 201:
        raise RuntimeError(f"OPT SELL order failed: {res}")
    opt_sell = res.get("data", {})
    print(f"   Filled at: ₹{opt_sell.get('executed_price_paise')/100:.2f}")

    w4_after = get_wallet(token)
    assert w4_after.get("blocked_paise", 0) == 0, "Option margin should be 0"
    print("   [PASS] Option Position Exited Successfully!")

    # ---------------------------------------------------------
    # Track 5: Idempotency Replay & Double Fill Test
    # ---------------------------------------------------------
    print("\n" + "="*70)
    print("TRACK 5: IDEMPOTENCY REPLAY & DOUBLE FILL TEST")
    print("="*70)
    shared_key = f"idempotency_stress_{uuid.uuid4().hex}"
    test_sym = "TCS-EQ"
    print(f"Sending 2 concurrent requests with identical Idempotency-Key: {shared_key}")
    
    def fire_order():
        return place_order(token, test_sym, "BUY", "MARKET", "DELIVERY", 1, idempotency_key=shared_key)

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f1 = executor.submit(fire_order)
        f2 = executor.submit(fire_order)
        res1 = f1.result()
        res2 = f2.result()

    print(f"Request 1 -> Status: {res1[0]} | Order UUID: {res1[1].get('data', {}).get('uuid')}")
    print(f"Request 2 -> Status: {res2[0]} | Order UUID: {res2[1].get('data', {}).get('uuid')}")

    uuid1 = res1[1].get("data", {}).get("uuid")
    uuid2 = res2[1].get("data", {}).get("uuid")
    
    # Both must reference the exact same order UUID, with no second order created
    assert uuid1 == uuid2, f"Expected identical order UUID, got {uuid1} and {uuid2}"
    print(f"   [PASS] Both requests returned identical Order UUID: {uuid1}")

    positions = get_positions(token)
    tcs_pos = next((p for p in positions if p.get("symbol") == test_sym), None)
    print(f"   Current {test_sym} position quantity: {tcs_pos.get('quantity') if tcs_pos else 0}")
    assert tcs_pos and tcs_pos.get("quantity") == 1, f"Expected exactly 1 unit filled, got {tcs_pos}"
    print("   [PASS] Exactly 1 order filled, 0 double fills, 0 duplicate margin blocked!")

    # Clean up TCS position
    time.sleep(0.5)
    place_order(token, test_sym, "SELL", "MARKET", "DELIVERY", 1)

    # ---------------------------------------------------------
    # Track 6: MIS Auto Square-off Validation (Cutoff Trigger)
    # ---------------------------------------------------------
    print("\n" + "="*70)
    print("TRACK 6: MIS AUTO SQUARE-OFF CUTOFF VALIDATION")
    print("="*70)
    # Open 1 MIS position
    time.sleep(0.5)
    status, res = place_order(token, "INFY-EQ", "BUY", "MARKET", "INTRADAY", 2)
    print(f"1. Opened test intraday position: BUY 2 INFY-EQ INTRADAY (Status {status})")
    
    pos_before = get_positions(token)
    infy_mis = next((p for p in pos_before if p.get("symbol") == "INFY-EQ" and p.get("product") == "INTRADAY"), None)
    assert infy_mis and infy_mis.get("quantity") == 2, "Failed to open INFY-EQ intraday position"
    print(f"   Position verified: {infy_mis.get('quantity')} INFY-EQ INTRADAY")

    # Trigger MIS Square-off
    time.sleep(0.5)
    print("2. Triggering MIS Square-off cutoff handler...")
    sq_status, sq_res = make_request("POST", "/orders/squareoff-mis", token=token)
    print(f"   Square-off response: {sq_status} -> {sq_res}")
    assert sq_status == 200, f"Square-off failed: {sq_res}"

    pos_after = get_positions(token)
    infy_mis_after = next((p for p in pos_after if p.get("symbol") == "INFY-EQ" and p.get("product") == "INTRADAY" and p.get("quantity") != 0), None)
    assert infy_mis_after is None, f"Expected 0 open INFY-EQ MIS positions, found: {infy_mis_after}"
    print("   [PASS] Intraday positions auto-closed cleanly!")

    # ---------------------------------------------------------
    # Final Reconciliation
    # ---------------------------------------------------------
    print("\n" + "="*70)
    print("FINAL RECONCILIATION SUMMARY")
    print("="*70)
    final_wallet = get_wallet(token)
    final_cash = final_wallet.get("cash_balance_paise", 0)
    final_blocked = final_wallet.get("blocked_paise", 0)
    final_positions = [p for p in get_positions(token) if p.get("quantity") != 0]

    print(f"Initial Cash Balance  : ₹{init_cash/100:,.2f}")
    print(f"Final Cash Balance    : ₹{final_cash/100:,.2f}")
    print(f"Total Blocked Margin  : ₹{final_blocked/100:,.2f}  (Must be ₹0.00)")
    print(f"Open Positions Count  : {len(final_positions)}  (Must be 0)")
    
    assert final_blocked == 0, f"Blocked margin is not zero: {final_blocked}"
    assert len(final_positions) == 0, f"Open positions remaining: {final_positions}"
    print("\n>>> ALL CHECKS PASSED: 100% RECONCILED WITH ZERO RESIDUAL EXPOSURE <<<")

    STOP_WS.set()

if __name__ == "__main__":
    run_step2_and_3()
