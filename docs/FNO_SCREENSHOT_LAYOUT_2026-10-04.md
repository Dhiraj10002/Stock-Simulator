# F&O screenshot layout — current Codex / Gemini handoff

## Current decision

The user chose **option 1: restore the previous screenshot layout** on 4 October 2026. This supersedes the futures-only presentation in `FNO_FOCUSED_DESK_2026-10-04.md`. Restore the featured stock cards, Gainers / Losers table, compact futures cards and right account sidebar. Keep the **All stocks tab and Option Chain removed**. Use the screenshots for layout only: their example prices, expired contracts, lot quantities, chart bars and live badges are not market evidence.

Work is on `codex/fno-focused-responsive-desk-20261004`, in [PR #12](https://github.com/Dhiraj10002/Stock-Simulator/pull/12), based on merged main `5590b5dd447b16e23d2ec4feb636f9320d915367`. Do not merge or deploy automatically.

## What changed and why

| Panel / finding | Current behavior |
| --- | --- |
| Previous visual hierarchy was preferred. | Explore starts with three featured underlying-equity cards, then the F&O Stocks movers table, followed by a compact current-futures browser. Positions and Orders remain accessible. |
| Featured cards previously depended on demonstration content. | Cards come from the actual eligible NSE cash-equity master. RELIANCE, HDFCBANK and TCS are preferred only when present; available provider quotes take priority. No fallback instrument identities or made-up prices. |
| Small charts must represent real history. | Request up to five native `ONE_DAY` archive bars per featured symbol. Accept only `angelone_live` / `LIVE` provenance with coherent positive OHLC and past timestamps. Missing, invalid, synthetic or failed archives show Chart unavailable. |
| Gainers / Losers require a meaningful eligible universe. | Fetch the complete derivative-eligible cash catalog, rank only genuine available Angel One quotes with explicit positive / negative day movement, and paginate six rows. Missing day movement, synthetic quotes and zero movement do not become fake ranked rows. |
| Partial quote coverage can mislead rankings. | Show provider quote coverage over the eligible universe and state that rankings use available movement. Closed sessions retain genuine cached prices with their original timestamps and a last-session label. |
| Exchange test instruments could appear as ordinary equities. | Exclude NSETEST / BSETEST identities in both derivative-underlying and derivative-stock service results, and defensively in the UI. Master records and account history remain intact. |
| Futures cards were too large. | Compact cards retain canonical expiry / lot, readable 24px prices, sourced timestamps, movement, volume / OI, and Buy / Long and Sell / Short actions. Dynamic search, category, exchange, underlying, expiry and pagination remain. |
| Right sidebar must stay clear and responsive. | Solid light / dark surfaces, authenticated available paper balance, derivative-only positions / P&L / blocked margin, and links to equities, positions and Orders. No invented balances, Greeks or income-proof flow. Sidebar stays in document flow. |
| Phone / tablet widths must remain usable. | Featured cards stack on narrow screens; the stock table scrolls within its own panel; futures use one / two / three / four columns as space permits. Shared navigation wraps. There is no page-wide horizontal overflow. |

The table contains **underlying equity prices**, clearly labeled as such. The futures browser contains **contract prices**. Trade actions on stock cards/table select the underlying's current stock futures; they do not submit an order at the equity spot price. A master-derived valid futures lot is required to enable that navigation action.

## Data requests and freshness

- `GET /instruments/derivative-stocks`: complete eligible cash catalog, refreshed every 60 seconds. No truncated general-search universe.
- Eligible equity quotes: Redis-backed `/market/quotes/batch` requests in chunks of at most 100, with at most three chunks in flight, refreshed every 20 seconds. These requests enqueue normal worker demand; they do not synchronously rescue each missing quote through the broker.
- Stream subscriptions: only the three featured stocks and six visible movers are added by the restored panel, through existing reference-counted subscriptions. The shared provider's normal benchmark/watchlist subscriptions remain separate.
- Featured native daily history: three requests at most for the current cards, refreshed every 60 seconds. No random candles or one-minute substitutes for daily bars.
- Futures: full active / tradable / unexpired catalog every 60 seconds; visible-page quotes and authoritative market status every 10 seconds; maximum 12 contracts per page, six on small phones.
- Catalog/status/quote/archive requests have an eight-second timeout and explicit failures. Refresh controls permit recovery. Switching to Positions pauses the Explore panel's periodic requests and targeted subscriptions.
- Source timestamps remain in IST and are never replaced by fetch times. Valid zero movement / volume is distinct from missing data. OI requires its explicit availability flag.

## Financial safeguards retained

Paper buy/sell still requires a signed-in account, canonical token and lot, unexpired contract, recently confirmed OPEN exchange status, non-synthetic LIVE Angel One feed and fresh authentic contract quote. The ticket continues checking status while open; backend preview and execution remain authoritative. A closed session permits reading cached prices but disables execution.

The ticket locks when submission starts. PENDING is preserved as PENDING; an uncertain response directs the user to Orders without permitting a duplicate submission from the same ticket. Existing account-scoped strategy journals stay visible under Positions, without replaying submissions. Cash intraday positions do not enter the derivative summary. Missing/stale derivative valuation never becomes a complete live P&L or a fake zero balance.

## Relevant files

- `frontend/src/components/trading/FnoStockOverview.tsx`: eligible stock catalog, quote batches, featured cards, native candle previews and movers table.
- `frontend/src/components/trading/FnoQuoteDetails.tsx`: common authentic day movement and source/timestamp display.
- `frontend/src/lib/fnoStockOverview.ts` and tests: catalog validation, preferred actual instruments, authentic rankings, native candle validation.
- `frontend/src/components/trading/FnoExplorePage.tsx`: restored layout, current futures filters/cards, session gates and account sidebar.
- `frontend/src/app/(trading)/options/page.tsx`: compact Explore / Positions navigation.
- `backend/internal/instrument/service/instrument_service.go`, `futures_catalog.go`, `derivative_stocks_test.go`: exchange test exclusions and regression coverage.
- `frontend/e2e/fno-explore.spec.ts`: market layout, dynamic requests, streaming, missing/failing data, native previews, canonical trades and responsive checks.
- Existing `FnoOrderModal.tsx`, `PaperOrderRecovery.tsx`, `fnoExplore.ts` and paper-trading tests retain the prior financial/recovery behavior.

## Validation and acceptance

Local verification covers lint, TypeScript, 74 unit tests, the production build, 18 browser tests and backend instrument tests. Browser fixtures cover 360 / 390 / 640 / 768 / 1024 / 1440px, light/dark surfaces, actual quote changes, unavailable archives, stock-catalog retries, a 211-equity batched universe, canonical buy/sell lots, pending/uncertain responses and account recovery. The PR records GitHub CI for its latest head, including disposable PostgreSQL/Redis integration and the order race check.

These automated market responses are **fixtures**, not proof that the brokerage integration works during an open exchange session. [Issue #9](https://github.com/Dhiraj10002/Stock-Simulator/issues/9) stays open until actual OPEN-session verification on the user's machine. Verify fresh changing index/stock futures, provider archives, master lot quantities, genuine day change / OI / volume where supported, paper round trips, wallet / margin / P&L reconciliation and feed reconnect. Keep secrets in ignored local environment files; never put credentials, tokens or account details into commits or evidence. Production readiness remains conditional on this acceptance check and operational monitoring.

## Run the current branch

```bash
git fetch origin
git switch codex/fno-focused-responsive-desk-20261004
git pull --ff-only origin codex/fno-focused-responsive-desk-20261004
./stop.sh
./start-dev.sh
```

Open `http://localhost:3000/options`. Restart both frontend and backend, since the current page uses the dedicated futures catalog and updated eligible-stock endpoint.

## Next Codex / Gemini session

Read this handoff first, then the runtime / worker-startup documents. Preserve the latest screenshot layout, removed All stocks / Option Chain, genuine sources and timestamps, native archives, canonical lots and order safeguards. Never fill unavailable data with demo values to make a panel look active. Finish issue #9 with real open-session evidence before claiming production readiness.
