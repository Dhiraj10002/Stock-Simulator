# Stock Simulator: audit, market-data fixes and release handoff

Date: 2026-09-30
Repository: https://github.com/Dhiraj10002/Stock-Simulator
Reviewed GitHub base: `aa367add09d1427d64f186036f4e092534b22b4e` (`main`). The tracked files in the uploaded `Stock-Simulator-main (4).zip` matched this base by Git blob SHA.

## Goal and current verdict

The user wants a production-grade **paper-trading** website using real Angel One SmartAPI market data for delivery equities, intraday equities, futures and options. The reported failures are missing dashboard prices/charts, unavailable portfolio daily changes and missing F&O prices. Screenshots also show duplicate TCS/HCLTECH contracts and a NIFTY 50 delivery holding.

This change implements concrete market-data and UI corrections. **Production readiness is not established.** No live SmartAPI credentials, production database, deployment access or authenticated trading browser session were supplied. Live provider behavior and the deployed website were not verified. Database/Redis-dependent tests skipped locally. Do not represent this as a completed production launch.

“Delivery” means a simulated delivery position here. SmartAPI is used for market data; simulated orders must never be sent to Angel One's real order-placement endpoints.

## Architecture and data contract

- Frontend: Next.js 16.2.11, React 19, TypeScript, React Query, Zustand and lightweight-charts.
- API and paper execution: Go/Gin/GORM; PostgreSQL stores instruments, users, orders, positions, cash accounting and settlement references.
- Redis carries quotes, historical candles, feed status, demand and Pub/Sub updates.
- Python market worker authenticates SmartAPI, refreshes its instrument master, streams broker ticks and hydrates missing quotes/history.
- Python news worker ingests news separately. SmartAPI market data does not provide this application's IPO, economic or earnings calendar.
- Provider identity is `(exchange_segment, token)`. Preserve exact derivative symbols, expiry, strike, lot size and option side. Never derive an option LTP from the underlying in LIVE mode.
- Quote and OHLC prices in application APIs are integer paise. REST quotes/candles are converted from rupees; WebSocket native prices are already paise.
- The quote's `updated_at` comes from the broker's exchange time. Fetch time is not price freshness.
- `previous_close_paise` and `day_change_available` distinguish a valid zero change from missing daily information. `open_interest` is independent of traded `volume`.

## Findings and implemented corrections

| Finding | Cause / evidence | Correction |
|---|---|---|
| Portfolio daily values disappear after ticks | `frontend/src/providers/market-provider.tsx` copied only selected quote fields, dropping `change_paise` | Preserve the complete quote object from the backend WebSocket |
| Unchanged prices become “unavailable” | Go quote DTO omitted zero-valued change fields from JSON | Serialize zero changes and explicitly indicate whether a previous close exists |
| Dashboard shows 0 while header shows an index quote | Dashboard quote selector contained stocks but no indices | Include NIFTY, BANKNIFTY and SENSEX in its reactive selector |
| Dashboard chart is empty after startup | LIVE history consisted only of ticks collected since worker startup; there was no broker candle backfill | Queue bounded asynchronous historical demand in Redis and fetch authentic SmartAPI candles |
| Timeframe buttons all show the same history | Every timeframe requested 50 minute candles | Support ONE_MINUTE, ONE_HOUR and ONE_DAY; request up to 500 bars, select the requested window and use IST labels |
| Cold F&O symbols have no prices | Initial snapshots excluded derivatives/indices; demand rescue requested one LTP at a time | Pace FULL snapshots, up to 50 exact identities per call across subscribed segments, including indices and F&O |
| Daily changes are fabricated or always zero | LTP-only stream plus hardcoded benchmarks; missing REST close fell back to LTP | SNAP_QUOTE stream; FULL REST snapshots; use the broker's previous close only in LIVE mode |
| On-demand quote volume is fabricated | `/quote` wrote 5000 regardless of response | Use broker `tradeVolume`; absent values are not replaced by invented activity |
| Price fetches make stale values executable | REST response used current server time | Preserve `exchFeedTime`; ticks use `exchange_timestamp`; reject unknown times |
| Closed-market prices disappear from cache | Short quote retention | Keep LIVE last-known quotes for at least seven days while retaining exchange time; execution freshness rules remain strict |
| Portfolio falls back to old fill values after close | Portfolio requested execution-fresh quotes for display | Use cached display quotes and retain stale valuation status |
| Portfolio total can hide missing day data | Sum became available if any holding had a daily value | Require all holdings' daily movement inputs; do not present that sum as full account daily P&L |
| Search duplicates and dead demo contracts | Legacy symbols/tokens coexist with imported master rows | Hide nonnumeric demo tokens in LIVE search; deduplicate same exchange + normalized cash symbol, preferring the master `-EQ` symbol |
| Most stock derivatives are never imported | Worker imported derivatives only for a small target-underlying list | Import current eligible NFO/BFO futures/options; reject missing derivative lot sizes instead of guessing |
| BFO demand is ignored | Subscription builder only indexed NFO derivatives | Resolve and subscribe exact BFO contracts as well |
| Option chain reports volume as OI | `option_chain_service.go` assigned `q.Volume` to OI | Carry native SNAP_QUOTE OI through worker/Go DTO and use `q.OpenInterest` |
| Live chain uses fabricated spot/contract skeleton | Default spot and synthetic contract builder ran when broker/master data was missing | In LIVE/degraded mode return an empty chain until actual master contracts and a sourced spot exist; exclude inactive, expired and demo-token rows |
| NIFTY 50 can be bought as delivery equity | Order validation did not distinguish a cash index from a tradable contract | Reject cash index orders and incompatible cash/FNO product combinations |
| API publishes fabricated circuit bands | Quote handler constructed ±10% around current LTP | Remove the fabricated response fields; real circuit ingestion/execution policy still needs work below |
| Dashboard claims fixtures are live filings | IPO/news/calendar/earnings rows were static arrays | Hide fixture rows by default; optional `NEXT_PUBLIC_SHOW_DEMO_DATA=true` clearly labels them as demo |
| SDK disables certificate verification | Angel One SDK's WebSocket transport uses `CERT_NONE` | Wrap its transport with certificate and hostname verification |
| Unit tests require an IPC socket / external API | tsx CLI IPC failed in this runtime; Gemini fallback test called the real endpoint with a fake key | Use `node --import tsx --test`; make Gemini rejection a local HTTP transport mock |

## Historical ingestion behavior

`GET /api/v1/market/quotes/{symbol}/history?limit=500&interval=ONE_MINUTE` retains the existing route; `interval` is optional and defaults to ONE_MINUTE. ONE_HOUR and ONE_DAY are also accepted. Unsupported intervals are rejected. Equity aliases normalize to the canonical cache identity.

Redis keys:

- `market:quote:demand`: existing sorted set for quote demand.
- `market:history:demand`: members `SYMBOL|INTERVAL`, refreshed by API calls; inactive demand expires after five minutes.
- `market:history:SYMBOL`: newest-first minute candles, shared with stream candles.
- `market:history:SYMBOL:ONE_HOUR` and `...:ONE_DAY`: separate interval histories.

The worker makes historical requests for 7 days of minute data, 31 days of hourly data or 370 days of daily data, retaining at most `HISTORY_MAX_ITEMS` (default 500). Requests are paced together with FULL snapshots through one SDK request lock. Each active historical demand has a 60-second retry cooldown; demand processing favors requests not yet attempted.

Only valid, sourced LIVE OHLC rows are stored. Conversion checks timestamps, positive prices, OHLC bounds, nonnegative volume and duplicates. Zero volume is valid for indices. Empty/provider-error responses leave retained history intact. Backfill merges retained stream buckets under a writer lock. REST snapshots do not manufacture minute candles or volumes. Historical reads retain provenance filtering.

A cold chart may initially return no rows, then populate after backfill; the dashboard polls every five seconds while empty and every minute once populated. This is asynchronous, not a synchronous broker call in each API request.

## Portfolio meaning and existing data

The “Holdings Day Movement” card is current holding quantity × (last quote − broker previous close), requiring all relevant inputs. It is **not** an exact account-wide daily return: purchases/sales during the session, realized P&L, fees and opening quantities need a persisted session baseline. The backend's `daily_pnl_paise` intentionally remains null without that accounting baseline.

The screenshot's NIFTY 50 delivery holding is invalid as a realistic stock-market instrument. New such orders are blocked. Existing positions and cash records were not rewritten or reset. Run the read-only reconciliation tooling and agree a concrete historical repair before changing those records.

## Validation performed

- Frontend: **49 tests passed**, ESLint passed, TypeScript passed, Next.js production build passed with all 16 routes generated.
- Market worker: **56 tests passed**, including exact NFO identity, valid zero daily change, no fabricated LIVE benchmark/volume, historical OHLC conversion, empty-history preservation, stream/backfill merge and verified TLS behavior.
- Full Go suite after replacing the external Gemini test request: **410 passing test events and 90 skipped test events**, no failing packages. Counts include subtests. Database/Redis integration coverage is not implied by that success.
- Affected Go market, portfolio, product, order, search and F&O packages were rerun after changes; Go vet passed.
- No live broker requests using user credentials, production database reconciliation, load test, authenticated browser E2E or deployment verification was completed.

The initial full Go run encountered an automatic approval rejection because an existing fallback test contacted Google's Gemini endpoint with an unknown outbound payload. The test now uses an in-process rejection transport; it sends no external request.

## Operator setup and acceptance checks

1. Review the draft changes. Set `MARKET_FEED_MODE=live` consistently for API and market worker. Keep synthetic/seeded execution disabled in this environment.
2. Configure `ANGEL_API_KEY`, `ANGEL_CLIENT_ID`, `ANGEL_PASSWORD` and `ANGEL_TOTP_SECRET` only in server-side secrets/environment. Confirm the account and SmartAPI app actually authorize the required market-data segments. Do not paste credentials into chat, browser code, GitHub, logs or this document.
3. Configure `DATABASE_URL`, `REDIS_URL`, backend/frontend origins and strong auth secrets using the existing `.env.prod.example` and deployment documentation. Keep the worker quote port private to the service network.
4. Build/restart API, market worker and frontend together. Old workers do not produce the new daily-change metadata. Allow the master import to finish; inspect worker health and ingestion failures without printing credentials.
5. During an open session, compare an actual NSE equity, NIFTY index, current stock future and liquid call/put against broker prices. Verify segment/token, exchange timestamp, previous close, quantity multiples and paise scaling.
6. Verify dashboard 1D/1W/1M/1Y windows and cache hydration. Clear only isolated test caches to test cold startup. A chart must not synthesize candles when the provider refuses data.
7. Verify valid zero changes display as zero. Stop the worker: prices must be visibly stale/degraded and fills rejected. Reconnect and confirm subscription demand and quotes recover.
8. Exercise paper delivery buy/partial sell; MIS long/short and square-off; long-option premium; short-option/future margin; cancellation, stop-limit gap-through, duplicate/retried exits and expiry recovery.
9. Test close → reopen → exit retry, browser reload, concurrent tabs, server restart, Redis eviction and database outage against disposable services.
10. Run isolated integration/race tests and reconciliation before release; verify reverse-proxy TLS, secret handling, backups/restore and alerts. Do not use production accounts as destructive test fixtures.

Local verification commands from the repository (with installed dependencies):

```bash
cd frontend
npm ci
npm test
npm run lint
npx tsc --noEmit
npm run build
```

```bash
cd backend
go test ./...
go vet ./...
```

```bash
cd python-services/market-worker
pip install -r requirements.txt
python3 -m unittest discover -p 'test_*.py'
```

Database/Redis tests need isolated services and the existing disposable runner/CI configuration. Report skipped tests explicitly. Never infer that integration tests passed from a suite that skipped them.

## Remaining production gaps for Codex/Gemini

| Priority | Gap | Next work / acceptance criterion |
|---|---|---|
| P0 | Live deployment/provider verification | Prove actual SmartAPI authentication, segment coverage, token mapping, tick freshness and browser behavior on the intended server |
| P0 | Database/Redis test skips | Provision disposable PostgreSQL/Redis and pass integration + race checks, including startup/upgrade and worker/API contracts |
| P0 | Exact account daily P&L | Persist dated opening holdings/positions and flows; reconcile realized/unrealized session P&L and fees; retain null when unknown |
| P0 | Margin realism | Current configurable percentage/leverage rules are simulator approximations, not Angel One/NSE portfolio SPAN/exposure margin. Source real margin data or clearly label approximation and stress expiry/short options |
| P0 | Instrument lifecycle | Stage/validate a full master, activate one version atomically, deactivate removed/expired rows, preserve historical identities and audit duplicate numeric-token/symbol records. Search deduplication does not repair the database |
| P1 | Circuit limits | Order creation still has an inferred ±10%/±20% validation policy in `order_service.go`. Ingest broker/exchange bands, preserve them through cache/stream and use explicit missing-band handling |
| P1 | F&O analytics provenance | Live chain Greeks/IV still use mathematical estimates and assumed volatility; distinguish modeled analytics from broker-provided analytics. Track OI availability independently from a valid zero |
| P1 | Broader segment coverage | Worker demand/master changes include BFO; audit operator Go importer and full BSE-equity paths separately for equivalent segment/scaling support |
| P1 | Scalability/resilience | One worker with request pacing is not a cross-process rate limiter. Add distributed request budgets, session-generation cancellation, provider error/backoff metrics, fair demand admission and quote ordering guarantees across multiple processes |
| P1 | History durability | Current history is Redis-backed and bounded. Persist larger chart histories if required; test cache eviction, incomplete candles, exchange corrections, corporate actions and timezone/session boundaries |
| P1 | Calendar/IPO/earnings | Integrate verified independent sources; until then keep these feeds unavailable. SmartAPI does not replace those missing integrations |
| P1 | Readiness | Existing readiness checks database connectivity; incorporate Redis/feed health and market-session-aware expectations |
| P1 | Historical account repair | Reconcile the screenshot's cash-index holding and any malformed contracts; no silent reset, cost-basis substitution or balance invention |
| P1 | Browser and operational acceptance | Run authenticated E2E against disposable accounts, outage recovery, load tests, backup restoration, deployment smoke and alert delivery |

Earlier audit documents in `docs/` describe historical states. Several older claims (refresh coordination, stop-limit activation, settlement archive and news fallback issues) have since changed in this uploaded base; reverify source and tests before repeating them as open bugs. This document's table describes this review, not a blanket certification of every subsystem.

## Instructions for the next coding agent

Read `frontend/AGENTS.md` and the installed Next.js docs before frontend work. Read this handoff, current source, deployment configuration and test skips. Preserve unrelated changes and the paper-only execution boundary. Never solve “unavailable” with benchmark/entry prices, fabricated candles, simulated option prices or newly stamped stale quotes in LIVE mode. Fix shared data contracts first, then the corresponding UI. Add regressions for observed failures and run the relevant isolated checks. Update this document with concrete evidence and unresolved blockers after each implementation batch.
