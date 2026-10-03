# F&O Explore UI restoration and real-data handoff

## Request and observed problem

The user confirmed localhost now starts successfully after the startup correction in PR #10. The current `/options` Explore page looked unlike the earlier interface: dark panels inside a light theme, a low-contrast repeated heading, a large wall of underlying buttons (including derivative-only test symbols), and plain tables. The supplied reference shows stock cards with candle previews, an F&O stocks table, a margin sidebar and index futures cards.

Restore that visual hierarchy while keeping canonical identities, real provider quotes and honest unavailable states. The screenshot's historical prices, expired contracts, old lot sizes and demonstration balances are not source data.

Branch: `codex/fno-explore-real-data-ui-20261004`. It starts from the startup fix in `codex/worker-startup-liveness-20261004` (PR #10), so checking out this branch retains the working launcher. The PR targets main; until PR #10 is merged its already-reviewed startup changes are also present in the diff. Merge through GitHub review; do not deploy or merge automatically.

## Resulting interface

- Three featured eligible stock cards, preferring RELIANCE, HDFCBANK and TCS only when present in the canonical eligible universe. Other eligible stocks fill remaining slots.
- Names and equity prices come from canonical NSE equities and quote APIs. Futures lot labels use each stock's earliest active futures contract, never the equity lot or a hardcoded lot.
- Small SVG candle previews use the last available native daily OHLC archive. Missing/failed archives display `Chart unavailable`; no generated trend is drawn.
- Searchable, paginated F&O equity table with All stocks / Gainers / Losers. Ranking uses provider day-change availability; unknown movement cannot enter either ranking. Volume is displayed only when supplied.
- Responsive light and dark panels matching the previous card/table/sidebar structure. The navbar search width/gap is reduced on small screens to contain the profile control; tables scroll inside their panel.
- Active index futures cards show current contract identity, expiry, lot, quote state, day change and provider OI. They are not labelled “top traded” without a trading-volume ranking.
- Stock Trade actions select that underlying's futures desk. Chain actions select its existing option-chain desk. Buy/Sell opens the existing paper order flow with the canonical instrument and quantity.
- Right-hand account panel uses authenticated wallet and portfolio values. It reports derivative-only positions/P&L and blocked derivative margin. The displayed available balance is shared paper-account capital, not broker SPAN or a dedicated F&O cash allocation.

## Data contracts

| UI value | Source | Failure/display rule |
| --- | --- | --- |
| Eligible NSE equities | `GET /instruments/derivative-stocks` | Dependency errors return 503; no demo universe |
| Contract selectors | `GET /instruments/derivative-underlyings` | Canonical active/unexpired derivative names |
| Equity/future quote grids | `GET /market/quotes/batch?symbols=...` | At most 100 symbols per request; missing entries stay unavailable |
| Live updates | Existing targeted WebSocket subscriptions | Subscribe visible stocks/cards/contracts; newer ticks replace older REST quotes |
| Daily candle previews | `GET /market/quotes/{symbol}/history?interval=ONE_DAY&limit=5` | Native OHLC only; no illustrative candles |
| Current futures | `GET /instruments?instrument_type=FUTSTK&underlying=...&active=true&limit=500` | Request futures before filtering; options cannot crowd out futures |
| Index futures | Same instrument list with `instrument_type=FUTIDX` | Canonical expiry ordering; no stale demo contracts |
| Account values | Authenticated `/wallet`, `/portfolio` | Error never becomes zero funds or an empty portfolio |
| Order funds/quantity | Authenticated `/orders/preview`, `/orders` | Server preview and canonical lots; pending status never claims execution |

`DerivativeStocks` intersects the complete active/unexpired derivative universe with active, tradable NSE EQUITY records by canonical symbol (including `-EQ`). It avoids a truncated general equity search. A derivative-only name such as NSETEST without an eligible cash equity does not appear in the stock table. `DerivativeUnderlyings` reads distinct underlying/expiry columns instead of transferring every complete option record. Public instrument DTOs now retain the master name.

Portfolio DTOs include `instrument_type`. Cash-equity INTRADAY positions are excluded from F&O summaries; derivative INTRADAY positions remain included. Legacy FNO positions are also recognized. Missing or stale derivative valuation makes aggregate F&O P&L unavailable rather than presenting a partial total as complete.

## Authenticity and execution rules

Prices retain source and provider timestamp. Old quotes remain visible with `Last available`; simulated sources retain their label. Failed quote refresh marks cached values stale. Nonfinite/invalid/future-dated prices are not rendered. Daily movement requires the provider availability flag, so missing movement is not +0.00%.

Explore Buy/Sell requires an authenticated app session, OPEN market state, LIVE feed state and a fresh Angel One quote. The server's own calendar, instrument/version and freshness checks still govern execution. The order ticket no longer falls back to an instrument's attached example price or change; it displays quote state and missing day movement. Margin remains the server's paper preview, and MIS is labelled intraday without an unsupported fixed leverage claim.

Greeks remain existing model estimates using assumed volatility. The sidebar explains this instead of claiming broker-provided real-time analytics. No broker orders, credential changes, user database migrations or trading-account resets are part of this UI change.

## Verification and remaining acceptance

Local validation covers TypeScript, ESLint, 67 frontend unit tests, the production build, instrument/portfolio/router Go tests and Go vet. New Go coverage checks an eligible equity beyond 510 cash-only records, option-only eligibility, canonical identity, expired/retired/BSE exclusion, derivative-only names and unavailable master errors. Four frontend helper regressions cover rankings, freshness, expiry sorting/lot identity and incomplete derivative P&L.

Five additional Playwright journeys cover provider price refresh/native candles, correct future selection/canonical quantity and pending status, closed-session price display with disabled orders, missing data/account errors, and light/dark/mobile layouts. The existing seven paper-trading journeys remain required. Browser quotes/orders are controlled API fixtures; these tests certify UI integration and do not certify a live Angel One session. GitHub CI results are recorded on the pull request for its exact head commit.

[Issue #9](https://github.com/Dhiraj10002/Stock-Simulator/issues/9) remains open for genuine OPEN-session quotes, archives, OI and paper-trading round trips on the user's machine. Do not close it based on screenshots, fixture tests, closed-session last prices or HTTP liveness.

## Apply on Fedora

Inspect and preserve local edits with `git status --short` first. Do not blindly restore the previously stashed smoke script or use a destructive reset. From the repository, in terminal 1:

```bash
git fetch origin &&
git switch codex/fno-explore-real-data-ui-20261004 &&
git pull --ff-only origin codex/fno-explore-real-data-ui-20261004 &&
./stop.sh &&
./start-dev.sh
```

Leave the launcher running. Open `http://localhost:3000/options`; refresh if an old frontend is cached. In terminal 2, run the existing smoke reporter when the platform is available. During a closed exchange session, last available prices and disabled execution are expected. If quotes or the universe fail, capture sanitized endpoint states and logs instead of inserting sample prices.
