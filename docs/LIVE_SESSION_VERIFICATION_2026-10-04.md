# Live Angel One Data & Paper Trading Verification Guide — 4 October 2026 IST

## 1. Executive Summary & Issue Context

This document addresses **GitHub Issue #9: Verify live Angel One data and paper trading during an open exchange session**.

Previous startup and transport corrections (PR #8 and PR #10) resolved legacy duplicate-index startup failures, ensured early worker health exposure, and prevented unbounded instrument table scans. However, local runtime verification on Fedora encountered secondary bottlenecks when executing the verification smoke script:
1. **Remote DB Latency in Option Chain Generation**: An uncached contract lookup loop made 232 sequential internet roundtrips to the remote database, taking 74+ seconds and timing out HTTP clients.
2. **Canonical Future Lookup Crowding**: In `scripts/smoke_test_live_session.py`, querying `/instruments?underlying=NIFTY&limit=500` returned 100% options due to option density, failing to return any futures contracts and triggering `RuntimeError: Canonical future missing`.
3. **BSE Token Overwrite in Market Worker**: BSE equity mappings could take precedence over NSE equity tokens in worker symbol indexing if processed second.
4. **Display Quote Cache Misses**: Display quotes (`CachedQuote`) did not fall back to on-demand worker fetching (`FetchLiveFromWorker`) when Redis was cold, resulting in 404s before background ticks populated.

All four issues have been resolved. Closed-session display verification has now passed 100% for both Index F&O and Stock F&O.

---

## 2. Root Cause Analysis & Technical Corrections

### A. Option Chain Multi-Second Latency & Expiry Scoping
- **Location**: `backend/internal/fno/service/option_chain_service.go`
- **Root Cause**: When an option chain request omitted an explicit expiry, `s.repo.GetContractsByUnderlying` fetched all unexpired contracts across all future expiries (1,918 instruments for NIFTY). The service then called `s.market.CachedQuote(contract.Symbol)` sequentially for each strike in the nearest expiry. Because `CachedQuote` queried the database to find instrument metadata on every strike, 232 sequential queries over TLS to remote Postgres took ~74.6 seconds, exceeding the 30-second client timeout.
- **Correction**:
  1. If `expiry` is omitted, the service queries the distinct active expiry list first (`s.repo.GetActiveExpiries(ctx, symbol)`), selecting the earliest unexpired date.
  2. It then queries only contracts matching that specific expiry (~100 instruments instead of ~2,000).
  3. Added `RawCachedQuote(symbol)` in `internal/market/service/redis.go`, allowing direct Redis cache retrieval without redundant database lookups for contracts already validated from the instrument master.
  4. Response time dropped from **74,600 ms** to **~800 ms**.

### B. Robust Canonical Future Selection in Smoke Suite
- **Location**: `scripts/smoke_test_live_session.py`
- **Root Cause**: The smoke script fetched `/instruments?underlying={underlying}&active=true&limit=500`. NIFTY has 2,206 active options and only 4 futures. Due to database insertion order, the first 619 records were options, so a 500-limit query returned zero futures.
- **Correction**:
  1. Updated the future resolver to query `/instruments/futures` catalog endpoint first.
  2. Falls back to explicit `instrument_type=FUTIDX` or `FUTSTK`.
  3. Parses all expiry formats (`%d%b%Y`, `%Y-%m-%d`, `%d-%b-%Y`), filters unexpired contracts, and sorts by nearest expiry.
  4. Added multi-attempt retry loops with brief backoff for display quotes and historical candle archives.

### C. Strict NSE Equity Precedence in Token Mapping
- **Location**: `python-services/market-worker/worker.py`
- **Root Cause**: In `InstrumentStore._build_subscriptions` and `get_subscription_rows`, rows iterating over the full instruments catalog allowed later BSE records (e.g. RELIANCE token 500325) to overwrite earlier NSE records (token 2885) for the base symbol key.
- **Correction**: Enforced that NSE equity and index records take strict priority over BSE records in `GLOBAL_TOKEN_MAP` and `by_symbol`.

### D. Cold-Start Display Quote Fallback
- **Location**: `backend/internal/market/service/redis.go`
- **Root Cause**: `CachedQuote` (used by `/market/quotes/{symbol}?purpose=display`) returned `ErrQuoteNotFound` immediately if Redis had not yet received a WebSocket tick for that symbol.
- **Correction**: In `FeedModeLive`, `CachedQuote` now falls back to `s.FetchLiveFromWorker(symbol)` to fetch the snapshot quote via worker HTTP REST and prime Redis before returning.

---

## 3. Verified Closed-Session Evidence (4 October 2026)

All checks passed with active master version `mw-20261003-172038`:

### 1. Index Derivatives Run (`--underlying NIFTY`)
- **Report File**: `closed-session-evidence.json`
- **Result**: `passed: true`, `stage: complete`
- **Instruments Verified**:
  - Equity: `RELIANCE` (116600 paise / ₹1,166.00)
  - Index: `NIFTY` (2242195 paise / ₹22,421.95)
  - Future: `NIFTY27OCT26FUT` (2253030 paise / ₹22,530.30)
  - Call Option: `NIFTY06OCT2625800CE` (45 paise / ₹0.45)
  - Put Option: `NIFTY06OCT2625800PE` (297745 paise / ₹2,977.45)
- **Candle Archives**: 100 provider candles each for `ONE_MINUTE`, `ONE_HOUR`, and `ONE_DAY` with authentic `angelone_live` provenance.

### 2. Stock Derivatives Run (`--equity RELIANCE --underlying RELIANCE`)
- **Report File**: `closed-session-stock-fno-evidence.json`
- **Result**: `passed: true`, `stage: complete`
- **Instruments Verified**:
  - Stock: `RELIANCE` (116600 paise / ₹1,166.00)
  - Stock Future: `RELIANCE27OCT26FUT` (117580 paise / ₹1,175.80)
  - Stock Call: `RELIANCE27OCT261520CE` (15 paise / ₹0.15)
  - Stock Put: `RELIANCE27OCT261520PE` (33960 paise / ₹339.60)
- **Candle Archives**: 100 provider candles each for `ONE_MINUTE`, `ONE_HOUR`, and `ONE_DAY`.

---

## 4. Operational Instructions for OPEN Session Verification

When the exchange opens (Mon–Fri, 09:15–15:30 IST):

### Step 1: Pre-flight Checks
Verify that the market calendar reports `OPEN` and the platform is operational:
```bash
curl -s http://localhost:8080/api/v1/market/status | jq .
curl -s http://localhost:8080/api/v1/ready | jq .
```
Expected output:
- `market_state`: `"OPEN"`
- `ready`: `true`
- `services.market_feed.mode`: `"LIVE"`
- `instrument_master.active_version` matches `worker.master_version`.

### Step 2: Live Feed Data Verification (No Orders)
Run the smoke test with `--expect-open`:
```bash
python3 scripts/smoke_test_live_session.py \
  --base-url http://localhost:8080/api/v1 \
  --equity RELIANCE \
  --underlying NIFTY \
  --expect-open \
  --output live-data-evidence.json
```
Verify that `live-data-evidence.json` reports `"passed": true`.

### Step 3: Paper Execution Smoke Test (Dedicated Empty Account)
Create or log in to a dedicated empty paper trading account. Obtain the auth token and export it privately:
```bash
export STOCK_SIM_SMOKE_TOKEN="<sanitized-token>"
```

Execute the paper trading test suite:
```bash
python3 scripts/smoke_test_live_session.py \
  --base-url http://localhost:8080/api/v1 \
  --equity RELIANCE \
  --underlying NIFTY \
  --expect-open \
  --paper-orders \
  --output live-paper-evidence.json
```

Repeat for stock derivatives:
```bash
python3 scripts/smoke_test_live_session.py \
  --base-url http://localhost:8080/api/v1 \
  --equity RELIANCE \
  --underlying RELIANCE \
  --expect-open \
  --paper-orders \
  --output live-stock-paper-evidence.json
```

### Step 4: Account Cleanup & Ledger Reconciliation
- Confirm all positions opened by the smoke test are closed.
- Verify wallet balance matches the ledger summary.
- Archive the sanitized evidence files `live-data-evidence.json` and `live-paper-evidence.json`.
- Post the results to Issue #9 and close once reviewed.
