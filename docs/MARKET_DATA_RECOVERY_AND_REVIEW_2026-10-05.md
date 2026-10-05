# Market data recovery and repository review — 5 October 2026

## What was reviewed

Base: `main` at `8671ee307f8f1dcf66c7dc51421dab41309b2d75`.
Branch: `codex/market-data-chart-recovery-20261005`.

The four supplied screenshots show: a holiday card stretched beyond its content; a stale TCS option with unavailable preview funds; an LT future waiting for a preview; and a live SENSEX quote without historical candles. This review traces those screens through the frontend, Go market/order services, Redis demand queues, canonical instruments, and the Python Angel One worker. It is a targeted cross-stack review, not a certification that every repository feature or deployment is production ready.

## Confirmed bugs fixed in this branch

| Finding | Correction |
| --- | --- |
| Holiday panel stretched to match its much taller neighbouring market-movers card. Its own scrolling content left a large empty area underneath. | Align the panel to the start of the grid; show compact date cards and upcoming holidays first, with a full-year toggle and a concise official-calendar link. |
| Every five-second ticket preview refresh cleared both funds fields even after a successful estimate. | Keep the last successful required-funds estimate visible during refresh. Read available virtual funds independently from the authoritative wallet. Block submission during refresh or after a failed estimate/account refresh. |
| A preview request could hang indefinitely. | Add a twelve-second timeout and query cancellation. The server still revalidates price and funds when an order is submitted. |
| F&O ticket offered MIS although the backend explicitly rejects derivatives in the `INTRADAY` product. | Disable this unsupported choice with an explanation; supported F&O paper orders use `FNO`/NRML. Cash-stock MIS remains available. |
| Ticket displayed ₹20 brokerage although execution accounting does not charge that fee. | Label paper fees as not charged by the simulator. |
| Worker quote/history loops held the original SmartConnect instance for the life of a WebSocket connection. Shared-session renewal did not update these callers. | Resolve the shared broker session when each REST request executes; invalidate expired authentication responses so the next bounded request renews the session. Do not expose raw provider responses or tokens. |
| REST quote recovery waited for a WebSocket open event and retried stale contracts slowly. | Recover exact demanded contracts independently of the open event, using batches of at most fifty. Prioritize cold identities; refresh aging snapshots earlier, with cooldowns and the shared request pacer. |
| Historical backfill did not fence an in-flight response against canonical instrument activation. | Check the master epoch before committing backfilled bars. Discard responses belonging to a previous identity. |
| Dashboard could not distinguish a queued backfill from a rejected or empty broker response. | Store bounded, sanitized history outcome states. When no valid cached bars exist, return `HISTORY_UNAVAILABLE` for provider failure/empty results; show loading, waiting, error details, and a retry control. Retain authentic existing bars. |
| Search parsed `TCS26DEC1920PE` as year `19`, strike `20`. This matches the incorrect screenshot label. | Use canonical master strikes in rupees in backend and frontend formatting; preserve the exact symbol when strike metadata is missing. Do not scale a normalized strike again. Keep the canonical exchange segment. |
| Futures browser was accessible only through a query parameter/test flag, and the flag implementation failed ESLint. | Expose a collapsed “Browse all futures” control to normal users. Stock-card actions open filtered genuine futures. Keep the removed All stocks/option-chain UI removed. |

## How real paper trading works

`Angel One → market worker → Redis authentic quotes/history → Go validation and paper ledger → frontend`.

The worker uses the active canonical master for tokens, segments, lots and expiries. Quotes use FULL market snapshots and targeted streams; charts use Angel One historical candles. The backend uses the application's virtual wallet and simulated positions. These changes do not call broker order-placement endpoints.

An old exchange timestamp remains old after a REST refresh. A positive last price does not establish executable freshness. Missing provider data does not become a fabricated price, margin, candle, day change or account balance. Illiquid or distant-expiry options may have only a last available quote: select a current liquid contract, or wait for a genuinely fresh broker quote. Execution remains blocked on stale quotes.

The chart and quote APIs are separate. A SENSEX quote cannot produce an authentic one-month chart by itself. BSE historical requests must use the canonical SENSEX token and `BSE`, not an NSE substitute. A broker rejection or empty history is now visible rather than silently looking like a frontend chart bug.

`INDIAN_API_KEY` is optional company-fundamentals configuration. It does not supply Angel One F&O prices, historical candles, virtual funds or order execution, and cannot resolve these feed failures.

## Validation and limits

- Frontend: unit tests, TypeScript, ESLint, production build, and browser regression suite.
- Browser coverage includes compact holiday layout, SENSEX history rejection/recovery, native intervals, mobile widths, genuine contract discovery, preview polling, failed estimates, wallet availability, pending/uncertain order outcomes, closed sessions and invalid lots.
- Worker: dependency-backed tests cover request-time session resolution, auth expiry, cold derivatives without a WebSocket open event, bounded/prioritized batches, original exchange timestamps, master changes, safe historical diagnostics, genuine zero-volume index candles and retained caches.
- Go: vet and backend suite; market-service recovery also exercised against disposable Redis. GitHub CI supplies disposable PostgreSQL/Redis for full database integration and order-accounting race checks, and uses a production frontend server for browser tests.
- Startup/script and news-worker checks are included. A local launcher test may skip when its OS utility is unavailable; CI checks its supported environment.

Mocked browser/provider tests prove application behavior, not that the user's Angel One account currently supplies executable quotes. No private user database, local broker credentials, deployed host or live market account was accessed for this review. Issue [#9](https://github.com/Dhiraj10002/Stock-Simulator/issues/9) stays open until real OPEN-session evidence is collected.

## Apply and verify locally

Preserve local edits before switching branches. Keep private credentials only in ignored local/server configuration. After the PR is merged, update `main`; to review beforehand, check out this branch. Restart the full stack so the Python worker also receives the fixes. Frontend-only/light modes cannot supply a fresh worker feed by themselves.

```bash
git fetch origin
git switch codex/market-data-chart-recovery-20261005
git pull --ff-only
./stop.sh
./start-dev.sh
```

Leave the launcher running. In a second terminal:

```bash
curl --silent http://localhost:8085/health
curl --silent http://localhost:8085/ready
curl --silent http://localhost:8080/api/v1/ready
curl --silent 'http://localhost:8080/api/v1/market/quotes/SENSEX/history?interval=ONE_HOUR&limit=500'
```

Open Dashboard → SENSEX → 1M. Wait for the queued historical fetch, or inspect the displayed provider diagnostic and worker logs if it fails. Open a current F&O contract, check its lot size/expiry and fresh quote, and verify the ticket shows your virtual wallet balance. A missing/stale quote must leave submission disabled.

For issue #9, use a dedicated paper account and the existing live-session smoke script. Keep its application access token in the local `STOCK_SIM_SMOKE_TOKEN` environment variable, never in a commit or issue comment. Compare virtual-wallet changes, fills, positions and P&L for futures, calls and puts in both directions; check quote movement, depth where supplied, charts, reconnects and stale-feed rejection. A CLOSED/DISPLAY-only report does not complete this acceptance.

## Remaining confirmed gaps and next priorities

| Priority | Evidence in current code | Recommended next change |
| --- | --- | --- |
| P1 | `backend/internal/market/calendar/calendar.go`, product expiry, stock search cutoff and smoke selection still use a common 15:30 close. Current NSE documentation specifies distinct CAS cash phases and an equity-derivative close at 15:40. | Implement a versioned, segment-aware calendar using official NSE/BSE schedules. Audit preview, new/exit orders, matcher, MIS policy, retirement, settlement archive, health and frontend together. Do not globally replace every 15:30 constant. |
| P1 | `StocksExplorePage.tsx` returns an empty zero-value portfolio after HTTP/network failure. | Use the authoritative account query/error model; show unavailable/stale valuation instead of a successful empty account. |
| P1 | The same Stocks page hardcodes market caps, most-traded volume/turnover and constructs sparklines from invented intermediate prices. | Use sourced metrics and native candles or hide unsupported fields; do not present sample values as market statistics. |
| P1 | `ParseAngelScripItem` accepts only NSE/NFO/BSE even though catalog and worker paths mention BFO. | Treat BFO as currently unsupported. Add verified BFO master parsing, units, canonical activation and subscription/settlement tests before promising SENSEX derivatives. |
| P1 | `product/rules.go` uses fixed simulated margin percentages; short-option margin is calculated from premium notional. | Keep explicit simulator labeling. Design an underlying/contract-aware paper-risk policy or a verified broker-margin adapter before claiming SPAN/exposure realism. Implement derivative MIS only with end-to-end accounting and square-off tests. |
| P2 | `chartUtils.ts` gives zero-volume bars artificial weight one for VWAP. | Leave VWAP unavailable for volume-less index data; never imply a genuine volume-weighted indicator from fabricated weights. |
| P2 | Large Dashboard/F&O/Stocks components combine transport, selection, account state and rendering; API/formatting contracts are duplicated. | Extract feature hooks and focused view components; align generated/shared DTOs and documentation with the backend. Preserve financial failure-state browser regressions. |
| Release gate | Live acceptance and staging evidence are still missing. | Complete issue #9 on the configured host, then staging TLS/WSS/CORS, backups/restore, worker health, migrations, ledger reconciliation and rate-limit coverage. Keep publishing separate from code review. |

Recommended sequence: verify this PR on the configured local host; implement the segment calendar; remove misleading Stocks account/statistics states; add and test BFO/derivative MIS and realistic risk policies as separate changes; then complete OPEN-session/staging acceptance.

## Instructions for the next Codex/Gemini task

Start from the latest reviewed `main` on a new focused branch. Read `frontend/AGENTS.md` and the installed Next.js documentation before frontend edits. Use disposable integration services, keep genuine quote freshness and master identity checks, and preserve the compact UI. Do not reintroduce sample price fallbacks, fake capital, synthetic LIVE candles, a permanent Live badge or hidden test-only product features. Do not close issue #9 on CI evidence alone.

Official provider/schedule references checked during this review:

- [Angel One SmartAPI documentation: FULL quotes, fifty-symbol batches, historical exchange/interval parameters and authentication errors](https://smartapi.angelone.in/docs).
- [NSE Closing Auction Session: cash applicability, phase timings and equity-derivative session](https://www.nseindia.com/static/products-services/closing-auction-session).

The previous [main integration review](MAIN_INTEGRATION_REVIEW_2026-10-04.md) remains useful background; this document records the newer base and screenshot-specific fixes.
