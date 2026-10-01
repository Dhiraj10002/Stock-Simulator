# Stock Simulator implementation handoff — 2026-10-01

Repository: https://github.com/Dhiraj10002/Stock-Simulator

Base reviewed: `f95244911fc543d84009374ada0ae68d4fd5dde6`. This implementation follows the final review of the matching uploaded ZIP. It preserves real Angel One market-data provenance and virtual paper execution.

## Implemented fixes

### Settlement and exit accounting

- `finalQuotePrice` no longer returns a positive current quote before validating its session. Source/feed mode, exact symbol, expiry date and closing-window timestamp must qualify. Nil quotes and database errors are explicit failures. Accepted references are persisted and reread so a concurrent writer cannot create inconsistent settlement prices across restart.
- Delivery and margin-product exits no longer fill from a recorded position mark or stamp it as a fresh quote. A missing executable quote leaves the immutable exit intent pending for retry.
- Expired F&O exits resolve the archive before asking for a post-expiry quote. A missing archive/eligible reference remains unresolved; option intrinsic settlement cannot fall back to the last option premium.
- Manual square-off reserves the exit intent, commits that transaction, and executes afterward. It no longer starts expiry settlement while holding the outer wallet/position locks.
- Expiry settlement can complete the original exit order, preserving its retry key and identity. Other unreserved pending exit intents for the closed position are cancelled transactionally. Repeating the same key does not create another trade.

### Market-data display

- Option chains use cached sourced prices for display and expose `updated_at`, `quote_source`, `is_quote_stale`, day-change availability/value, and modeled analytics provenance. Strict executable-quote validation remains separate.
- Stale chain prices remain visible with a warning; direct trade actions are disabled for stale/unavailable contracts. Unknown day changes remain unavailable rather than fabricated zero changes. Greeks/IV display identifies assumed-volatility model values.
- Portfolio summary respects authoritative `DEGRADED` and `STALE` status even when some holdings retain positive prices.
- Dashboard portfolio/reset requests use shared authenticated API handling. HTTP/network failures are surfaced rather than converted into empty successful accounts. Retained portfolio data is marked stale after failed refresh; an explicit degraded status remains degraded.
- Dashboard unknown index price/day change renders unavailable. History errors are visible, plotted/quote timestamps are shown in IST, and chart extrema are labeled close-price extrema.
- Sector samples include every configured constituent in quote demand. Stocks without day-change inputs do not count as flat gainers; genuine zero changes are distinct from positive/negative moves. These remain explicitly sample calculations, not official sector indices.

### News and calendar

- Removed hardcoded IPO/news fixtures from the active dashboard. The news panel uses existing `/news` and `/news/status`, publication timestamps and source links. IPO feed is explicitly unavailable until connected to a verified source.
- Added `/api/v1/market/calendar`, shared with execution's calendar policy. Corrected the 2026 dataset from NSE's Capital Market and F&O circulars, including missing March 26/31, June 26, September 14 and November 10 holidays and incorrect March 20/May 27 closures.
- Sources: https://nsearchives.nseindia.com/content/circulars/CMTR71775.pdf and https://nsearchives.nseindia.com/content/circulars/FAOP71777.pdf (2025-12-12).
- The dashboard labels the supported exchange/segments and source version. Special-session hours are unconfirmed, so no invented Muhurat trading hours are enabled. Unverified calendar years fail closed until a new sourced dataset is installed. BSE-specific calendar provenance and configurable special-session activation remain operator work.

## Regression coverage

- Settlement rejects next-session, outside-closing-window, wrong-source and nil quotes; a valid reference is archived.
- Production-wired delivery/MIS exits cannot substitute position marks during data loss, and retain pending intents.
- Expired manual exit uses an archive with a one-connection PostgreSQL pool and retains one order/trade across retries.
- Cached option prices display as stale while remaining non-executable; valid zero daily movement remains available.
- Calendar UI dataset and admission agree; old incorrectly closed dates are regular sessions; unsupported future year is unavailable.
- Frontend helpers distinguish unknown movement from valid zero, preserve degraded valuation, and block stale option trade actions.
- CI now includes an order-accounting/exit-retry race check. Expiry integration fixtures clean up persisted references for repeatability.

## Validation and limitations

Local frontend: **52 tests pass**, lint and TypeScript pass. Next.js production build passed with 16 routes before the final timestamp-label-only edit; final CI also builds the submitted tree.

Local Go suite: **411 passing test events**, **93 skipped events** before the additional cached-option integration test was added; no failing packages; vet passed. Added cached-option test compiles and passes its suite with integration skipped locally. Local PostgreSQL/Redis are unavailable, so these local counts are not integration evidence. The new branch's GitHub workflow must run the disposable services and race gate before merge.

The market worker was not modified. Its local rerun remains blocked by automatic approval review because SDK initialization attempted an ipify public-IP metadata request. The base revision's GitHub CI passed 56 market-worker tests and 9 news-worker tests; the branch reruns those checks.

No user credentials, live broker calls, production account repairs, merge or deployment were performed. Do not describe this change as production-certified.

## Remaining work and release requirements

1. Verify SmartAPI login/entitlements and real NSE equity/index/current stock future/liquid call-put quotes on the deployment. Confirm exact segment/token, paise scale, timestamp, previous close and OI. Only eligible exchange-listed equities have F&O contracts.
2. Require successful disposable PostgreSQL/Redis integration and race CI for this branch. Exercise expired manual exits, repeated/reopened exits, cache loss and feed outage in authenticated browser E2E.
3. Add versioned atomic instrument-master activation/deactivation, token-reuse handling and broader BSE/BFO acceptance. Current upserts are not an atomic master lifecycle.
4. Exact account daily P&L still needs persisted session opening positions/flows/fees. `daily_pnl_paise` remains null without that accounting baseline; Holdings Day Movement is a different measure.
5. Margin remains a configurable simulator approximation, not portfolio SPAN/exposure margin. Circuit validation still uses inferred percentages and needs real broker/exchange bands. OI availability needs an independent flag for missing versus actual zero. IV/Greeks remain model estimates, now labeled.
6. Install subsequently sourced calendar years and verified special-session hours; confirm BSE calendar parity. Never silently enable unsupported future-year trading.
7. Complete feed/Redis-aware readiness, distributed provider rate budgets, durable history/corporate-action policy, load/outage recovery, backup restore and alerts.
8. Reconcile historical invalid cash-index holdings read-only before any separately authorized repair. Do not reset accounts or invent balances.

## Instructions for Codex/Gemini

Read this handoff and the latest branch source. Older audit files describe earlier states and may no longer apply. Read `frontend/AGENTS.md` and installed Next.js docs before frontend edits. Preserve the paper-only order boundary and all user's unrelated changes. Never fill unavailable LIVE data with entry/benchmark/model prices or newly timestamped stale marks. Keep credentials server-side and out of code/logs/reports.

Run frontend tests/lint/typecheck/build, worker tests in an approved environment, and backend tests/vet/race using **disposable** PostgreSQL/Redis. Never run destructive fixtures against production. Record the exact tested commit, skips, live acceptance and remaining blockers before merge/deployment.
