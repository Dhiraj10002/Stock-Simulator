# Stock and F&O UI — current Codex / Gemini handoff

## What boss asked for

Restore the readable stock-detail layout from the earlier screenshot, with actual Angel One prices, native candles, market depth and price ranges. Make the F&O landing page match the compact cards on Stocks, with these sections in order:

1. **Trending stocks** — RELIANCE, HDFCBANK and TCS, when present in the current eligible NSE instrument master.
2. **F&O stocks** — Gainers / Losers table based on genuine provider day movement.
3. **Top traded index futures** — four compact contracts ranked by genuine provider volume.

Keep All stocks and Option Chain removed. Cards, spacing, light/dark contrast and responsive layout follow the Stocks page. Screenshot prices, example Greeks, chart bars, obsolete contracts and lot sizes are visual examples, not market evidence.

This document supersedes the presentation decisions in `FNO_SCREENSHOT_LAYOUT_2026-10-04.md` and `FNO_FOCUSED_DESK_2026-10-04.md`. Work is on `codex/fno-focused-responsive-desk-20261004`, [PR #12](https://github.com/Dhiraj10002/Stock-Simulator/pull/12). Do not automatically merge or deploy.

## Findings and fixes

| Finding | Result |
| --- | --- |
| Stock details mixed hardcoded dark-theme text with surfaces rendered light. | Explicit light/dark surfaces, readable identity and price header, watchlist and BUY / SELL shortcuts, native chart left and depth above the order ticket on the right. Mobile uses one column. |
| Bare equity lookup could select a later BSE import while quote aliases were NSE. | Backend instrument resolution and both worker identity indexes prefer NSE for shared cash aliases, independently of import order. A retired NSE identity is not silently replaced by BSE. Explicit unique BSE identities remain distinguishable. |
| Redis stored `depth_json`, but the stream decoder expected `depth`. | One wire serializer turns the Redis book into a typed `depth` object for pub/sub and worker HTTP quotes. |
| Provider availability flags were Redis strings in outgoing JSON. Go expected booleans and could discard the entire tick. | HTTP and streamed payloads convert `open_interest_available` and `volume_available` to JSON booleans. Redis retains valid string storage. |
| SDK depth order counts use `no of orders`, which the parser did not read. | Normalize that key and the legacy underscore spelling. Unknown counts remain absent; genuine zero order counts remain zero. |
| A book with fewer than five levels was rejected completely. | Preserve up to five actual levels per side; missing levels show dashes. Reject invalid or crossed books. Displayed bid/ask quantities and share use only supplied levels; exchange-wide totals are separately labeled. |
| 52-week ranges and total buy/sell quantities were discarded. | Carry provider fields through the worker, Redis DTO and stream into price-performance/depth panels. No synthetic ranges. |
| Stock charts and badges could imply live data in a closed session. | Live status requires a recent authoritative OPEN exchange status, Angel One LIVE feed and a fresh authentic quote. Closed sessions retain timestamps, label prices Last available and pause execution. Charts accept native Angel One candles only. |
| “Top traded” would be misleading if contracts were alphabetically sorted. | Batch the complete current index-futures catalog, rank verified positive volumes from the latest supplied IST session, state coverage and session date, and subscribe to the four displayed cards. A known current zero suppresses yesterday's volume ranking. |
| Featured identities changed when one requested stock lacked a quote. | Retain the requested three when eligible; missing quotes stay explicit rather than replacing them with unrelated stocks. Master-absent identities are never invented. |
| Futures filters crowded the landing page. | Put search, exchange, underlying, expiry and pagination in an expandable Browse futures section. Stock Trade opens its underlying in that browser; the canonical futures ticket still checks lots, expiry, quote freshness, market status and funds. |
| Cash orders could be posted again after an uncertain response. | Lock the ticket as soon as POST starts, preserve PENDING as unconfirmed execution, and direct uncertain results to Orders. Account or route changes reset ticket state; routine access-token refresh for the same account preserves the lock. Server execution remains authoritative. |
| Top index-futures tickets depended on quotes in an unrelated or collapsed browser. | Include the selected ticket contract in the parent's bounded quote batch. Top cards can open an executable ticket without expanding the browser, while OPEN/LIVE and freshness checks still apply. |
| Missing navbar P&L defaulted to a fabricated zero. | Missing P&L shows Unavailable; verified zero remains zero. |
| Popular stock cards displayed hardcoded market caps as data. | Remove that displayed sample cap and use a quote-source caption. Other unrelated stock-discovery demonstration fields still need their own audit. |

## Data sources and optional fundamentals

Angel One **SNAP_QUOTE (mode 3)** already supplies depth, OHLC, OI, volume and 52-week fields. Do not switch to deprecated depth mode 4. Preserve provider/exchange timestamps; receiving a response is not a new trade time.

Angel One's FULL quote schema does not supply company valuation ratios such as P/E or EPS. The added backend-only fundamentals adapter uses IndianAPI's documented `/stock?name=<symbol>` endpoint. It is **optional and not live-accepted with a real provider account in this change**.

Add these values only to your ignored `backend/.env` or deployment secret environment:

```dotenv
INDIAN_API_KEY=<your-own-fundamentals-provider-key>
INDIAN_API_PLAN=free
```

Supported plan values: `free`, `developer`, `analyst`, `pro`. Origins are restricted to the provider's official hosts. Do not add `NEXT_PUBLIC_`, put keys in URLs, send credentials in chat or commit them. Both Compose configurations already read `backend/.env`. Restart the backend after changing these settings; restart the market worker after updating its code.

`GET /api/v1/market/quotes/:symbol/fundamentals` returns one of `AVAILABLE`, `NOT_CONFIGURED`, `UNAVAILABLE`, `UPDATING`, `RATE_LIMITED`, with `metrics: []` when unavailable. A response must identify the exact provider `tickerId` corresponding to the current NSE cash instrument. Unverified identities or unknown metric shapes fail closed. Provider labels, units, periods, legitimate zero and negative metrics are preserved. Unsupported array shapes are omitted instead of guessed. The UI labels **Retrieved** time, not a fabricated financial reporting date.

Requests are bounded to six seconds, payloads to 2 MiB, successful snapshots cached for 12 hours, failures for five minutes, with a Redis lock, shared burst gate and conservative 25-fetch UTC daily budget. Cache outages do not trigger unbounded vendor calls. Vendor error bodies are never exposed. Fundamentals are display-only and never enter fills, margin, valuation or settlement.

A real IndianAPI account and an identity-bearing sample response are required to accept this integration. The public documentation leaves much of `keyMetrics` unspecified; if your plan returns a different shape, add a recorded, redacted provider fixture and extend the parser with documented field meanings and units. Do not assume missing identity or units.

Provider references: [IndianAPI company endpoint](https://indianapi.in/documentation/indian-stock-market), [current Pro schema](https://pro.indianapi.in/openapi.json), and [Angel One's official Python WebSocket SDK](https://github.com/angel-one/smartapi-python/blob/main/SmartApi/smartWebSocketV2.py). Review any provider schema changes before altering field meanings.

## Important implementation entry points

- `frontend/src/components/stocks/StockDetailsPage.tsx`: stock desk, symbol/account-scoped state, ranges, company metrics and cash order ticket.
- `frontend/src/components/stocks/MarketDepthPanel.tsx`: actual partial L2 book and displayed quantities.
- `frontend/src/components/trading/FnoStockOverview.tsx`: compact requested stocks and complete eligible movers.
- `frontend/src/components/trading/TopIndexFutures.tsx`: volume-ranked index-futures discovery.
- `frontend/src/components/trading/FnoExplorePage.tsx`: expandable current-contract browser, account summary and order modal.
- `frontend/src/lib/fnoStockOverview.ts`: provider candle validation, requested identities and session-aware volume ranking.
- `python-services/market-worker/worker.py`: identity indexing, provider-field normalization and shared HTTP/pub/sub wire serializer.
- `backend/internal/market/dto/quote.go` and `backend/internal/market/service/redis.go`: optional market fields, unknown-count handling and partial-book validation.
- `backend/internal/market/fundamentals/`: optional company-data adapter with bounded caching, budget and identity checks.
- `backend/internal/router/openapi.yaml`: quote and fundamentals contracts.

Quote reads use cached/batched backend endpoints. Discovery quote batches are at most 100 symbols and at most three simultaneous batches; they never invoke per-symbol synchronous broker rescue. The normal landing page subscribes only to visible featured/mover/top-index cards; opening the browser adds its visible contracts. Expired, inactive, nontradable and exchange-test derivatives are excluded. No option-chain requests or simulated price fallback are reintroduced.

## Verification and remaining acceptance

Automated verification uses disposable fixtures and local test infrastructure, never the user's database or broker credentials. Tests cover SDK keys, typed wire payloads, ranges, partial/crossed books, source timestamps, NSE/BSE alias selection, unknown versus zero volume, reporting units, fundamentals identity mismatch, cache/backoff/budget, dynamic volume ranking, mobile/light/dark layout, chart intervals, canonical lot quantities, and pending/uncertain cash/F&O orders.

Local results: frontend lint and TypeScript passed; **76 unit tests**, the **production build** and **23 browser tests** passed. All Go packages passed locally with PostgreSQL-dependent cases skipped; Go vet and formatting passed. The market/instrument/fundamentals tests also passed against a disposable Redis, including the shared provider cache/budget. **90 market-worker tests** passed. PR CI supplies PostgreSQL integration and the order-accounting race check; see PR #12 for its final outcome.

Run frontend lint, TypeScript, unit tests, production build and Playwright; run Go tests with disposable PostgreSQL/Redis and Python worker tests. To capture optional fixture previews locally, set `STOCK_UI_SCREENSHOTS` to an absolute output directory when running Playwright. Screenshot previews are fixtures, not proof of live market data.

[Issue #9](https://github.com/Dhiraj10002/Stock-Simulator/issues/9) remains open. During an actual OPEN exchange session, confirm:

1. Backend/worker use the same activated instrument snapshot and NSE cash token; active derivatives have correct lot/expiry.
2. A new Angel One tick moves the stock header, chart and F&O cards without reload. JSON availability flags are booleans and depth is an object.
3. Stock depth matches a direct provider snapshot; bid ≤ ask, partial sides and zero/absent counts stay honest. Day and 52-week ranges use the quote timestamp.
4. Volume ranking uses one identified IST session, exposes partial coverage and updates when actual volume moves.
5. Delivery, intraday, futures long and futures short paper orders produce confirmed order states and reconcile funds, positions and P&L. PENDING does not mean executed.
6. Feed disconnection, stale data and market close pause new execution while retaining available historical marks. An uncertain POST is reconciled in Orders before another submission.
7. If fundamentals is configured, a redacted real response passes exact ticker identity and documented units/periods. Missing metrics never become fabricated zeros.

Next work after acceptance: audit the remaining unrelated stock-discovery demo metrics, monitor provider/API rate limits and quote/depth coverage, and repeat the PostgreSQL deployment smoke checks. No claim that all website functionality is production-accepted is made by this UI change. Existing closed-session evidence is preserved unchanged.
