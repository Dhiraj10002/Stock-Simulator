# F&O desk review and implementation — 4 October 2026

## What you requested

After merging the previous F&O UI branch, you requested removal of the unavailable All stocks section and the option chain, clearer futures information, a dynamic responsive page, and a review of related defects. This change starts from merged main `5590b5dd447b16e23d2ec4feb636f9320d915367` and is isolated on `codex/fno-focused-responsive-desk-20261004`.

## Findings and changes

| Finding | What changed |
| --- | --- |
| Cash-equity cards/table distracted from futures and displayed unavailable or exchange test quotes. | Removed the featured equity cards, All stocks/Gainers/Losers table, cash history requests and their quote polling from this page. Stock **futures** remain available as requested. |
| Option chain was no longer wanted and its controls were difficult to read. | Removed the chain tab, chain buttons and mounted chain component from `/options`. Existing option positions, order history, settlement services and APIs remain intact. |
| Index futures appeared twice, with a small fixed selection and duplicated current-underlying section. | Replaced both sections with one current futures browser. It starts with nearest index expiries and supports index/stock/all categories, text search, exchange, underlying, nearest-month/all/individual expiry, and pagination. |
| General instrument searches were capped at 500 contracts. | Added `GET /api/v1/instruments/futures`, returning the complete active, tradable, unexpired FUTIDX/FUTSTK catalog. No hardcoded default universe. |
| `011NSETEST` and other exchange test identities were advertised as regular contracts. | Exclude identities containing `NSETEST`/`BSETEST` from the desk catalog and defensively from its UI. Do not delete these master/history records or change account positions. |
| Tiny text, faded disabled controls and translucent global surfaces reduced legibility. | Solid light/dark card surfaces, 30px prices, 12px+ metadata, readable timestamps and disabled controls, and larger touch targets. |
| The margin sidebar could hide behind the navigation bar. | Removed its sticky positioning. It stays in normal document flow. |
| Shared navigation overflowed at tablet widths. | Allow its utility row to wrap when the available width is insufficient. |
| Dependency requests could leave a loader indefinitely. | Catalog, market status and visible-page quote requests have an 8-second timeout, no automatic retry loop, explicit unavailable states and a manual refresh/retry. Invalid catalog payloads become recoverable errors. |
| Market-store state alone could enable a ticket while current exchange status was unknown. | Require a recently fetched authoritative status, OPEN session, non-synthetic LIVE Angel One feed, fresh authentic contract quote, valid canonical token/lot and unexpired contract. Continue checking these while a ticket is open. Server preview/execution remain authoritative. |
| An uncertain order response could permit another submission from the same ticket. | Lock the ticket once submission starts. Show the actual returned status, including PENDING; after uncertainty, instruct the user to review Orders before another order. |
| Removing the chain could hide a previous partial/uncertain strategy journal. | Positions includes a read-only recovery panel for existing session journals, scoped to the signed-in account. It never replays old submissions. Server Orders and Portfolio remain the source of truth. |
| CI was only triggered after pushing to main. | Restore pull-request CI so this branch is checked before merge. |

## How the live data flow works

1. The instrument master supplies canonical futures identities, exchanges, expiries and lot quantities. The dedicated catalog refreshes every 60 seconds.
2. The desk displays up to 12 contracts per page (six on small phones). It subscribes to those futures through the existing WebSocket reference-counted subscription system and requests one REST quote batch every 10 seconds. The shared provider's normal benchmark/watchlist subscriptions are unchanged.
3. Newer stream/provider timestamps win over older REST prices. Quotes are never replaced by random prices, generated charts or a default instrument list.
4. Quote freshness is reevaluated every second while the futures view is active. Switching to Positions pauses the desk's catalog/status/quote polling and targeted futures subscriptions, while retaining its filters.
5. A failed quote refresh retains a valid last price with a last-available label and blocks execution. Missing prices, day movement, volume or OI remain explicitly unavailable. Missing OI is never presented as zero.
6. Closed sessions show a clear banner and sourced last-available timestamps in IST. A closed market does not become a live market because an old price exists. Buying and selling stay disabled.
7. Buy/Long and Sell/Short open the paper order ticket. One lot uses the master quantity; funds and margin are calculated by the existing server preview. Accepted HTTP responses are not automatically described as executed trades.
8. Paper account values use the authenticated wallet/portfolio APIs. The derivatives summary excludes equity intraday positions and does not report partial or stale derivative P&L as a complete live total.

## Relevant code

- `backend/internal/instrument/service/futures_catalog.go` and its tests: full current catalog and safe master failures.
- `backend/internal/instrument/handler/instrument_handler.go`, `backend/internal/router/router.go`, `backend/internal/router/openapi.yaml`: public catalog route and API contract.
- `frontend/src/app/(trading)/options/page.tsx`: Futures/Positions views, responsive derivative position cards.
- `frontend/src/components/trading/FnoExplorePage.tsx`: filters, visible-page quotes, clock, status gates, account sidebar and readable futures cards.
- `frontend/src/components/trading/FnoOrderModal.tsx`: current status gate, responsive ticket and uncertain-submission lock.
- `frontend/src/components/trading/PaperOrderRecovery.tsx`: account-scoped old strategy recovery.
- `frontend/src/lib/fnoExplore.ts` and tests: deterministic 15:30 IST expiry parsing, catalog validation, filters and trade gates.
- `frontend/src/components/layout/Navbar.tsx`: responsive utility-row wrapping.
- `frontend/e2e/fno-explore.spec.ts`, `frontend/e2e/paper-trading.spec.ts`: updated browser regressions and preserved account recovery coverage.

The original `OptionChainDesk.tsx` is retained as unused source to avoid mixing a requested page redesign with destruction of recovery/order functionality elsewhere. It is no longer mounted or offered by this page. Earlier recommendations in `docs/FNO_UI_REAL_DATA_2026-10-04.md` about keeping the chain/stock table are superseded by your latest request.

## Validation

- Go formatting, vet and local backend tests, including the complete 511-contract catalog fixture and missing-master cases.
- Frontend lint and TypeScript passed; all 70 unit tests passed; the production build passed; all 15 browser tests passed against the production server.
- Browser coverage includes stream and REST price changes; filtered/paged request limits; closed, missing, failing and hanging data; canonical buy/sell quantities; PENDING and uncertain order responses; old journal reload/account switching; theme contrast; 360/390/640/768/1024/1440px layouts and mobile ticket bounds.
- Browser market/broker responses are controlled fixtures. Fixture contract dates/prices are not real market evidence. Local database tests use temporary fixtures; PostgreSQL/Redis integration and the order race check run in GitHub CI against disposable services.
- The PR records the final CI result for its exact head commit. Do not claim live brokerage acceptance from these automated checks.

## What remains to verify on your machine

Issue [#9 — Verify live Angel One data and paper trading during an open exchange session](https://github.com/Dhiraj10002/Stock-Simulator/issues/9) remains open. The supplied screenshots were from a Sunday closed session. They cannot establish that actual Angel One streaming, archives, OI or execution repricing work during OPEN.

During an actual OPEN session, confirm an index future and a stock future from the current master: changing provider timestamps, price/day movement, original lot quantities, available volume/OI where supported, and honest missing-field labels. Then perform paper buy/sell and carry-forward/intraday round trips, verify order status, wallet/blocked margin/P&L reconciliation, and reconnect after interrupting the feed. Use only paper orders. Keep credentials in local ignored environment files and keep credentials, tokens and account data out of evidence and commits. Record contract identity and provider timing; do not substitute synthetic data.

## Install and review this branch locally

```bash
git fetch origin
git switch codex/fno-focused-responsive-desk-20261004
git pull --ff-only origin codex/fno-focused-responsive-desk-20261004
./stop.sh
./start-dev.sh
```

Leave the development services running and open `http://localhost:3000/options`. Restart both backend and frontend: the new UI requires the dedicated futures catalog endpoint. Review the PR and CI before merging; this change does not deploy or merge automatically.

## Instructions for the next Codex or Gemini session

Read this file and the existing runtime/startup recovery documents before changing the feed or settlement logic. Preserve this futures-only navigation, genuine provider timestamps, master-derived identity/lot sizes, missing-data semantics, derivative/cash position distinction, and account-scoped recovery. Do not restore demonstration prices or the removed option chain as a workaround. Finish issue #9 with actual open-session evidence before declaring the platform production-ready. Continue release monitoring and API/worker operational checks only after that acceptance result is known.
