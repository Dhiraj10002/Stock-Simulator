# Stock Simulator — Release Candidate Verification & Production Hardening Guide

**Document:** `docs/RELEASE_CANDIDATE_AUDIT_AND_DOS_GUIDE.md`  
**Date:** 27 September 2026  
**Repository:** `Dhiraj10002/Stock-Simulator`  
**Branch:** `main`  
**Target:** Indian Financial Markets Paper Trading Simulator Release Candidate (RC-1)

---

## 1. Executive Code & Architecture Review

A comprehensive review of the current implementation against the Release Candidate requirements has been conducted across the 8 primary architectural domains:

### 1.1 Market Feed & Ingestion Engine (`python-services/market-worker/`)
- **Current State:**
  - `worker.py` contains `FeedSupervisor` managing connection retries to Angel One's `SmartWebSocketV2`.
  - In `main()`, `mode == "auto"` is already deprecated at runtime with a notice: `'auto' feed mode is deprecated; strictly enforcing LIVE feed mode with explicit UNAVAILABLE state`.
  - When connection failures exceed `max_failures`, `publish_feed_state` marks the feed state as `UNAVAILABLE` (`is_synthetic=False`) while continuing background reconnection loops.
  - **Risk Found:** In `fetch_quote_for_symbol` (used by the on-demand `/quote` endpoint), if Angel One is unavailable, the function falls back to `DEFAULT_BENCHMARK_PRICES_PAISE` with source `benchmark_fallback` and writes to Redis via `GLOBAL_WRITER.write()`. Additionally, NFO derivatives fall back to `simulated_deriv`. 
  - **Reconciliation Target:** When `FEED_MODE=live`, `fetch_quote_for_symbol` must **never** fall back to `benchmark_fallback` or `simulated_deriv` or write simulated ticks into Redis. It must fail closed and return 404 / Unavailable.

### 1.2 Go Market Service & Execution Guard (`backend/internal/market/service/`)
- **Current State:**
  - `CurrentQuote()` in `redis.go` is strictly read-only.
  - `ValidateExecutableQuoteWithFeedMode()` enforces the rule that under `FeedModeLive`, only quotes with `source == QuoteSourceAngelOneLive` are eligible for order execution (`IsSourceExecutableInMode`).
  - Stale quotes older than 120 seconds return `ErrQuoteStale` and are rejected for execution.
  - Static seeds (`initial_seed`, `auto_seeded`, `benchmark_fallback`, `mock`) are classified under `QuoteSourceSeed` and rejected during `FeedModeLive`.

### 1.3 F&O Derivatives & Greeks Engine (`backend/internal/fno/service/`)
- **Current State:**
  - `buildFromRealInstruments()` queries real database contracts and reads quotes strictly from Redis under `FeedModeLive`. If quotes are missing in Redis, `IsAvailable = false`, `LTPPaise = 0`, and `QuoteStatus = "unavailable"`.
  - In `buildSimulationChain()`, Black-Scholes greeks and Redis seeding (`SetQuote`) are strictly gated by `mode == FeedModeSynthetic`. In `FeedModeLive`, it reads live Redis quotes and sets unquoted strikes to unavailable with 0 LTP.
  - **Reconciliation Target:** Ensure that under `FeedModeLive`, if real instruments are completely missing from the database, the API returns an explicit `UNAVAILABLE` error or empty list rather than generating synthetic strike symbols.

### 1.4 Portfolio Valuation & Degraded Semantics (`backend/internal/portfolio/service/`)
- **Current State:**
  - `PortfolioService.Get()` inspects quote availability and age. Missing quotes set `QuoteStatus = "UNAVAILABLE"`, `IsQuoteAvailable = false`, and `ValuationStatus = "DEGRADED"`.
  - Frontend `PositionsTable.tsx` properly renders an `UNAVAILABLE` badge instead of `₹0.00` or cost-basis fallback.
  - **Reconciliation Target:** Verify that `UnrealizedPnlPaise` and `CurrentValuePaise` in degraded mode are clearly distinguished and never visually masqueraded as real-time market value.

### 1.5 Order Engine, RMS Risk & Ledger Accounting (`backend/internal/order/` & `internal/risk/`)
- **Current State:**
  - Strict 64-bit integer paise arithmetic across all margins, orders, trades, and wallets.
  - Market orders execute at server-authoritative Redis fill price at fill time.
  - ACID transaction boundaries ensure order reservations, trade records, and wallet balances mutate atomically.

### 1.6 Documentation Reconciliation (`README.md` & Deployment Guides)
- **Current State:**
  - `README.md` still advertises `AUTO` mode as "live -> synthetic fallback after 3 failures" and describes the system as "production-grade".
  - **Reconciliation Target:** Reconcile documentation to state: `MARKET_FEED_MODE=live` is strictly fail-closed. Reconcile tone to "production-style paper-trading simulator" with documented runtime operational guarantees.

---

## 2. Phase 21 Repository Audit & Search Classification

Results of the 17-term repository audit across the codebase:

| Term / Identifier | Location(s) | Classification | Finding & Required Action |
| :--- | :--- | :---: | :--- |
| `benchmark_fallback` | `worker.py` (lines 452, 459), `redis.go`, `taxonomy.go` | **LEGACY / DEV** | Guard in `worker.py`: reject write to Redis when `FEED_MODE=live`. |
| `simulated_deriv` | `worker.py` (lines 481, 516), `taxonomy.go` | **LEGACY / DEV** | Guard in `worker.py`: reject write to Redis when `FEED_MODE=live`. |
| `FALLBACK_INSTRUMENT_MASTER` | `worker.py` (line 111) | **DEV / FIXTURE** | Hardcoded 45 symbols used when Angel One master fails; acceptable as fallback token map if real master is unreachable. |
| `DEFAULT_BENCHMARK_PRICES_PAISE` | `worker.py` (line 159) | **DEV / FIXTURE** | Static reference prices; strictly disallow writing into Redis when in `LIVE` mode. |
| `buildSimulationChain` | `option_chain_service.go` (line 361) | **DEV/SIMULATION** | Verified: Black-Scholes pricing and Redis writes are strictly gated to `FeedModeSynthetic`. |
| `Math.random` | `LandingPage.tsx`, `AuthModal.tsx`, `ToastProvider.tsx` | **PRODUCTION (UI)** | Verified: Exclusively used for Canvas background particles and UUID generation; zero financial logic. |
| `mock` / `demo` | Test files (`*_test.go`, `test_worker.py`), UI labels | **TEST / UI** | All production mock datasets (`mockData.ts`, `OrdersDemoData.ts`) permanently deleted. |
| `seed` / `ALLOW_SEEDED_QUOTES` | `redis.go`, `config.go`, `taxonomy.go` | **DEV / CONFIG** | `ALLOW_SEEDED_QUOTES` is strictly gated to `FeedModeSynthetic`; rejected under `FeedModeLive`. |
| `CurrentQuote` | `redis.go`, `market_service.go` | **PRODUCTION** | Verified strictly read-only; never writes or mutates Redis keys. |
| `ExecutableQuote` | `redis.go` | **PRODUCTION** | Validates age (< 120s), positive price, and source compatibility against current `FeedMode`. |
| `MARKET_FEED_MODE` | `worker.py`, `config.go`, `README.md` | **PRODUCTION** | Reconcile: `live` fails closed; `synthetic` allows practice; `auto` deprecated. |

---

## 3. Canonical Feed-Mode State Machine

```
                              ┌───────────────────────────────┐
                              │       MARKET_FEED_MODE        │
                              └───────────────┬───────────────┘
                                              │
                     ┌────────────────────────┼────────────────────────┐
                     ▼                        ▼                        ▼
              [Mode: LIVE]           [Mode: SYNTHETIC]       [Mode: DISABLED]
                     │                        │                        │
         ┌───────────┴───────────┐            │                        │
         ▼                       ▼            ▼                        ▼
   [CONNECTING]             [RETRYING]   [SYNTHETIC]             [UNAVAILABLE]
         │                       │    (GBM / Black-Scholes)   (Fail-Closed Halt)
         ▼                       ▼
      [LIVE]              [UNAVAILABLE]
(SmartWebSocketV2)     (Max Retries Exceeded;
                        Zero Fake Prices)
```

1. **LIVE Mode:**
   - **`CONNECTING`:** Initial handshake with Angel One SmartAPI / SmartWebSocketV2.
   - **`LIVE`:** Real exchange ticks streaming into Redis with `source="angelone_live"`.
   - **`RETRYING`:** Reconnection backoff after connection drop; ticks held; stale timers advance.
   - **`UNAVAILABLE`:** Consecutive failure threshold exceeded. Redis feed state set to `UNAVAILABLE`. No synthetic ticks injected; no fake prices; market orders reject execution.
2. **SYNTHETIC Mode:**
   - Explicit paper-practice environment. Generates Geometric Brownian Motion ticks and theoretical Black-Scholes option chain ladder. Source labeled `synthetic_gbm` or `fno_engine`.
3. **DISABLED Mode:**
   - Market data ingestion disabled. System reports `UNAVAILABLE`.

---

## 4. Definitive List of DO's (and DO NOT's)

### Phase 21: Release Candidate Repository & State Machine Audit
- [ ] **DO** perform a read-only audit of `worker.py` and reconcile all fallback pricing paths so they are physically inaccessible when `MARKET_FEED_MODE=live`.
- [ ] **DO** update `README.md` and `.env.prod.example` to remove claims of automatic synthetic fallback during `LIVE` mode.
- [ ] **DO** update `README.md` positioning from "production-grade" to "production-style paper-trading simulator with institutional-grade risk and ledger invariants".
- [ ] **DO** verify canonical symbol alias resolution for all top instruments (`RELIANCE`, `TCS`, `INFY`, `HDFCBANK`, `NIFTY`, `BANKNIFTY`, `FINNIFTY`, `MIDCPNIFTY`, `SENSEX`).
- [ ] **DO NOT** delete test fixtures simply because they contain the word `mock` or `fake`.
- [ ] **DO NOT** modify existing database schema or alter backend API contracts without regression tests.

### Phase 22: Market Feed & Provenance Hardening
- [ ] **DO** gate `worker.py` `fetch_quote_for_symbol` so that when `FEED_MODE=live`, it **never** falls back to `DEFAULT_BENCHMARK_PRICES_PAISE` or `simulated_deriv`.
- [ ] **DO** verify that `CurrentQuote()` in Go never mutates Redis under any failure condition.
- [ ] **DO** verify that `ValidateExecutableQuoteWithFeedMode` under `FeedModeLive` rejects all sources other than `angelone_live`.
- [ ] **DO** test Redis failure modes (key missing, key expired > 120s, Redis down) to confirm deterministic `ErrQuoteNotFound`, `ErrQuoteStale`, and `ErrQuoteUnavailable`.
- [ ] **DO** verify WebSocket connection multiplexing: ensure client disconnects clean up hub subscriptions without duplicate provider connections.
- [ ] **DO NOT** fake live Angel One credentials if unavailable in the current local environment. If credentials are unset, report: `LIVE PROVIDER VERIFICATION BLOCKED (No SmartAPI Keys)` and verify via deterministic integration suites.

### Phase 23: End-to-End Trading & Account Invariants
- [ ] **DO** verify end-to-end execution of CNC Delivery (1x equity), MIS Intraday (5x margin with 15:20 IST auto-cancellation), and F&O Derivatives (Call/Put Long & Short).
- [ ] **DO** verify that every order fill updates wallet balance, reserved margin, position quantity, and trade history in a single ACID database transaction.
- [ ] **DO** verify order safety against: double-click submission, duplicate client request IDs, stale quotes (> 120s), missing quotes, circuit limit breaches, and insufficient margin.
- [ ] **DO** verify that portfolio P&L strictly calculates Long: `(LTP - Avg) * Qty` and Short: `(Avg - LTP) * Qty`.
- [ ] **DO NOT** allow client-provided prices to execute Market orders.

### Phase 24: Frontend Direct Flows & Degraded UI
- [ ] **DO** verify the 4 primary direct trading flows:
  - Stock Details (`/stocks/[symbol]`) -> direct `OrderConfirmationModal` (CNC / MIS 5x).
  - F&O Hub (`/options`) -> direct `FnoOrderModal` triggered from strike rows.
  - Portfolio (`/portfolio`) -> one-click position exit & square-off.
  - Global Search (`Ctrl/Cmd + K`) -> direct routing to equity and derivative tickets.
- [ ] **DO** verify that missing or stale quotes display explicit `UNAVAILABLE` or `STALE` badges with disabled execution buttons rather than `₹0.00` or fake values.
- [ ] **DO NOT** re-introduce any dedicated trading terminal or multi-column desk.

### Phase 25 & 26: Performance & Resource Audits
- [ ] **DO** inspect React component re-renders and Zustand selectors on `/stocks/[symbol]`, `/options`, and `/portfolio` to eliminate redundant query invalidation.
- [ ] **DO** verify that Redis quote keys have appropriate TTLs (120s max age) and do not leak memory.
- [ ] **DO** audit PostgreSQL queries on `orders`, `trades`, `positions`, and `ledger_entries` to verify index coverage.
- [ ] **DO NOT** optimize blindly without profiler evidence or query execution plans.

### Phase 27 & 28: Observability & Deployment Verification
- [ ] **DO** maintain structured logging with `request_id`, `user_id`, `order_id`, `symbol`, `quote_source`, and `quote_timestamp`.
- [ ] **DO** ensure credentials, JWT secrets, and API keys are strictly sanitized and never printed in logs.
- [ ] **DO** verify container definitions in `docker-compose.prod.yml` and test container restart resilience (market-worker, Go backend, Redis).
- [ ] **DO NOT** report the service as healthy if the market feed is broken; separate `/livez`, `/readyz`, and `/market/status`.

### Phase 29 & 30: Security Audit & Release Candidate Gate
- [ ] **DO** audit JWT authentication, refresh token rotation with JTI reuse detection, and token-bucket rate limiting (`X-RateLimit-*`).
- [ ] **DO** execute the complete quality gate:
  - `gofmt -l .` clean
  - `go vet ./...` clean
  - `go test ./... -count=1` 100% pass across all 53 packages
  - Python worker tests: 100% pass
  - Frontend: `npx tsc --noEmit`, `npm run lint` (0 errors), `npm test` (33/33 pass), `npm run build` (16/16 routes compiled)
- [ ] **DO** publish the final `Stock Simulator — Release Candidate Verification Report`.
- [ ] **DO NOT** declare the system production-ready until every automated gate and data-truth invariant is verified.
