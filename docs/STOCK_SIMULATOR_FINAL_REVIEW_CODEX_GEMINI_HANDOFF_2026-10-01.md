# Stock Simulator — Final Review & Codex/Gemini Handoff (2026-10-01)

Repository: `https://github.com/Dhiraj10002/Stock-Simulator`

## Review baseline

- `main`: `f95244911fc543d84009374ada0ae68d4fd5dde6`
- Existing PR #2 head: `c01ff7c58bfa2351bc704e2e7753d35596856527`
- New hardening branch: `codex/final-review-hardening-20261001` (branched from PR #2 head)
- Existing PR #2 CI run: `36834783061` — completed successfully.
- This handoff is a follow-up hardening pass. It does **not** mean production readiness or broker/live-account certification.

## Overall assessment

The project is moving according to the intended architecture: real market-data provenance is kept separate from paper execution, execution quotes remain freshness/source validated, stale data is being made visible instead of fabricated, and expiry settlement has moved toward durable same-session references.

The current implementation is materially better than the earlier baseline, but it is not yet release-complete. CI is green, while several correctness and operational gates still depend on disposable-service integration, authenticated browser E2E, live SmartAPI acceptance, calendar/master-data verification, and accounting/operations work.

## Verified in PR #2

### Settlement / execution

- `finalQuotePrice` now validates a durable settlement reference before using it.
- Current quote fallback is now validated for exact symbol, source, feed mode, session date, and closing-window observation before persistence.
- Missing/nil quote data no longer becomes a successful settlement.
- Production execution no longer substitutes `Position.CurrentPricePaise` as a fresh market quote.
- Expired manual square-off reserves the exit intent first and settles after the reservation transaction commits.
- Expiry settlement can complete the original exit intent and cancel other unreserved duplicate intents.
- Strict execution freshness remains separate from display-only stale quotes.

### Market display

- Option-chain display uses cached sourced quotes so closed-market prices can remain visible as stale.
- Portfolio degradation is no longer silently upgraded to a live state.
- Dashboard failures are no longer intentionally converted into empty portfolios.
- Unknown day-change values remain unknown rather than being converted to `0`.
- News is sourced through the existing news service; hardcoded live-looking news/IPO fixtures were removed from the active dashboard.
- Calendar information is exposed through a shared API surface.

## Issues found in this final review

### P0 — accounting/execution gate: still needs end-to-end proof

The source-level settlement changes are strong, but the most important guarantee is that a production-wired path cannot create money movement from unavailable or wrong-session market data.

Required proof:
- disposable PostgreSQL + Redis,
- production-wired delivery/MIS/F&O quote-loss tests,
- concurrent duplicate exits,
- process/restart retry,
- constrained connection pool,
- authenticated browser E2E,
- ledger invariants after repeated execution attempts.

Do not treat unit/CI success alone as live-account certification.

### P1 — stale display provenance

`CachedQuote` previously read the raw Redis hash after `CurrentQuote` returned `ErrQuoteStale`, but the raw read did not enforce the active feed-mode/source matrix. That could expose an old synthetic/provider-mismatched value in a LIVE display.

**Implemented on this branch:** `rawCachedQuote` now validates feed mode, source eligibility, seeded-quote policy, and timestamp shape before a stale value is returned for display. Future-dated cached quotes are rejected.

### P1 — expiry worker with unavailable database

`ProcessFNOExpiry` and `recordExpiryRisk` assumed a global DB connection existed. An expiry worker starting during database initialization could otherwise dereference a nil DB.

**Implemented on this branch:** both paths fail safely when the DB is not configured, and an expired position missing from the canonical instrument master is now recorded as a pending settlement-risk condition rather than silently skipped.

### P1 — 2026 holiday source drift

The previous PR calendar copied weekday closures plus weekend observances into one `nseHolidays` map. That made weekend observations look like separate weekday exchange closures and omitted the later 15-Jan-2026 F&O holiday update.

The current NSE holiday publication lists these 2026 weekday equity holidays: 15-Jan, 26-Jan, 03-Mar, 26-Mar, 31-Mar, 03-Apr, 14-Apr, 01-May, 28-May, 26-Jun, 14-Sep, 02-Oct, 20-Oct, 10-Nov, 24-Nov, 25-Dec. It separately notes 08-Nov-2026 as a trading holiday with Muhurat Trading to be notified later. The Jan-15 F&O holiday was subsequently issued by NSE on 12-Jan-2026.

**Implemented on this branch:** weekend-only dates are no longer duplicated in the weekday holiday map, 15-Jan is included, 08-Nov remains fail-closed with `SPECIAL_TIMES_UNCONFIRMED`, and the calendar source metadata points to the current NSE holiday publication.

### P1 — calendar/segment provenance is still narrower than the product goal

The simulator currently exposes `NSE cash and equity derivatives` in the shared calendar. BSE/BFO parity and verified special-session activation are still operator work. Do not infer BSE behavior from NSE data.

### P1 — session times need an explicit simulator-vs-exchange policy

The code currently uses 09:15–15:30 regular trading and a 15:20 MIS cutoff. This is consistent with the simulator's current policy, but exchange session definitions can include additional closing/auction windows. Keep this as an explicit simulator rule unless the product requirement changes; do not silently change it during this hardening pass.

### P1 — instrument master lifecycle

Current instrument upserts are not yet a fully versioned, atomic activate/deactivate lifecycle. Required next step:
1. download/validate a master snapshot,
2. stage it,
3. validate duplicates, segment, expiry, strike and token identity,
4. atomically activate the new version,
5. retire missing contracts without deleting historical identity,
6. test token reuse and restart recovery.

Only exchange-eligible current F&O instruments should be surfaced.

### P1 — exact daily account P&L

`daily_pnl_paise` is still not a reliable account-level metric without a persisted session-opening baseline, realized cash flows, fees and adjustments. Holdings Day Movement is not equivalent to total account daily P&L.

### P1 — margin, circuit bands, Greeks/IV

- Margin remains a simulator approximation rather than portfolio SPAN/exposure methodology.
- Circuit bands are still inferred rather than sourced from instrument metadata.
- Greeks/IV are modeled estimates; they must stay visibly labeled as such.
- OI needs explicit availability so real zero is distinct from missing.

### P1 — readiness/operations

`/ready` currently checks database reachability but is not a complete feed/Redis/worker readiness gate.

Next operational layer should expose:
- DB connected,
- Redis connected,
- market feed state,
- worker heartbeat/last tick,
- instrument-master version,
- readiness reasons.

Also required: rate budgets, metrics/alerts, outage recovery, durable history policy, backup/restore and load testing.

### P1 — live SmartAPI acceptance remains outstanding

Before calling the simulator “production-ready,” compare the deployed system with actual broker data for:
- one NSE equity,
- one index,
- one current stock future,
- one liquid call,
- one liquid put.

Verify segment/token identity, paise scaling, exchange timestamp, previous close, OI, stale behavior and reconnect behavior. Keep broker credentials server-side only.

## Current branch changes

1. Harden stale cached-quote display provenance.
2. Make the expiry worker safe around missing DB state.
3. Record an explicit settlement-risk event when an expired F&O position has no canonical instrument master entry.
4. Refresh the 2026 calendar representation using the current NSE publication and later 15-Jan F&O holiday update.
5. Add focused Redis regressions for cross-mode stale data and future timestamps.
6. Update the source-calendar test to assert the corrected 17-entry weekday/special-session dataset.
7. This document is the current Codex/Gemini handoff; older handoff files should be treated as historical context only.

## Validation plan

Run from repository root after dependencies are available:

```bash
cd frontend
npm ci
npm test
npm run lint
npx tsc --noEmit
npm run build

cd ../python-services/market-worker
python -m pip install -r requirements.txt
python -m unittest discover -v -p 'test_*.py'

cd ../news-worker
python -m pip install -r requirements.txt
python -m unittest discover -v -p 'test_*.py'

cd ../../
bash scripts/run-disposable-tests.sh

cd backend
go vet ./...
go test -count=1 -p 1 ./...
go test -race -count=1 -p 1 ./...
```

Use disposable PostgreSQL/Redis only. Never run destructive fixtures against production.

## Release gates

Do not merge/deploy merely because CI is green. Merge only after:
- the hardening branch CI is green,
- disposable PostgreSQL/Redis integration passes,
- race gate passes,
- authenticated E2E covers the critical execution/settlement paths,
- live SmartAPI data acceptance is completed,
- calendar/master-data provenance is verified,
- accounting reconciliation is completed for any historical anomaly,
- remaining operational gaps are consciously accepted and documented.

## Suggested next execution order

**Step 1 — finish this hardening PR**
- run CI and confirm new regressions,
- review the diff,
- keep PR #2 separate; do not merge blindly.

**Step 2 — production data contract**
- complete SmartAPI live acceptance,
- finalize quote/source/timestamp/OI contracts,
- add readiness reporting.

**Step 3 — instrument and calendar control plane**
- versioned instrument master,
- sourced calendar versions,
- special-session configuration,
- BSE/BFO validation.

**Step 4 — accounting**
- daily P&L baseline,
- fees/taxes/charges policy,
- margin stress cases,
- ledger invariant checks.

**Step 5 — operational acceptance**
- outage/reconnect,
- concurrent users,
- load,
- backup/restore,
- monitoring/alerts.

**Step 6 — final release review**
- freeze source,
- run full release gate,
- record exact commit and evidence,
- only then decide whether to merge/deploy.

## External sources checked on 2026-10-01

- NSE Market Timings & Holidays: `https://www.nseindia.com/resources/exchange-communication-holidays`
- NSE F&O contract specifications: `https://www.nseindia.com/static/products-services/equity-derivatives-contract-specifications`
- NSE individual-securities F&O: `https://www.nseindia.com/static/products-services/equity-derivatives-individual-securities`
- NSE F&O January 15 holiday circular: `https://nsearchives.nseindia.com/content/circulars/FAOP72262.pdf`

Important: exchange pages/circulars are external facts for calendar/contract behavior; they are not evidence that the simulator has been live-verified.

