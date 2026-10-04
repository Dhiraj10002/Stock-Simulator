# Stock Simulator: integration review and next plan

Reviewed 4 October 2026. This is the current Codex/Gemini handoff. The selected Gemini F&O card design is retained with genuine data and guarded paper orders. Green CI does not certify live Angel One acceptance or a production deployment.

## PR integration order

| PR | Reviewed scope | Decision |
| --- | --- | --- |
| [#12](https://github.com/Dhiraj10002/Stock-Simulator/pull/12) | Stock detail, native candles, supplied depth/ranges, optional fundamentals, compact F&O and account recovery | Merge first. Head `983a29c635177de579ff63a79d376b492361ee85` passed four CI jobs. |
| [#13](https://github.com/Dhiraj10002/Stock-Simulator/pull/13) | Option-chain cache reads and verification tooling | Merge second after corrections. Head `f76b197d352b49fb57460a4b6117db66f9f257ec` passed four jobs in [CI run 37206365570](https://github.com/Dhiraj10002/Stock-Simulator/actions/runs/37206365570). |
| [#14](https://github.com/Dhiraj10002/Stock-Simulator/pull/14) | Gemini UI, ticker and watchlist contract | Merge last after correction and green CI. Original head `ce1a25367f74c68d2ec87ca60c3a8f9ef638261d` failed 15 browser cases; use the corrected branch. |

Merge commits preserve the stacked ancestry. Do not deploy automatically. PR #13 no longer auto-closes issue #9.

## Findings corrected before integration

- **Invented financial data:** removed Gemini's sample stock/index prices, generated preview candles, six-row mover fallbacks and fabricated future tokens/lots/expiries. Show fewer genuine cards or unavailable states rather than filling a layout with sample values.
- **Unprotected Buy/Sell:** use canonical identity/lots, the card's own quote, account identity and confirmed session/feed status. Closed, stale or unavailable data disables execution. A top card works while the futures browser is collapsed.
- **Account/recovery regressions:** removed invented ₹10 lakh balance, zero F&O P&L, “SPAN + Exposure” and an unconditional “Live” badge. Wallet is authoritative; derivative-only positions determine P&L/blocked margin. Positions and account-scoped pending/uncertain-order recovery remain reachable. Unknown is not zero or a successful empty account.
- **Unsupported feature claim:** removed the sidebar claim of live Greeks/PCR/Max Pain without an implemented/verified analytics path.
- **Broker request fan-out:** display reads remain cache-only and queue asynchronous worker demand. Already validated options use direct cache reads, retaining cold-cache demand and avoiding repeated metadata DB lookups.
- **Wrong contract selection:** nearest chain expiry comes from eligible options, excluding inactive/non-tradable records and malformed/expired dates; DB failures propagate. Smoke futures require exact underlying, correct futures kind/exchange, numeric token, positive lot, active/tradable flags and expiry cutoff. No expired fallback or NIFTY-to-NIFTYBANK prefix match.
- **Watchlist contract:** retain Gemini's backend snake_case tags and guarded legacy `Symbol` compatibility. A model regression verifies the serialized client fields.
- **Responsive margin panel:** retain compact cards and responsive desktop columns; the sidebar stays in normal flow to avoid sticky overlap.

## Data and UI rules to preserve

1. Trending stocks prefer RELIANCE/HDFCBANK/TCS when present in the eligible master. Alternatives also come from the master. Native provider OHLC renders previews; failed archives say chart unavailable.
2. F&O gainers/losers rank authentic supplied day movement. Keep coverage and timestamps. Subscribe only to visible featured/mover instruments; use batches of at most 100 and at most three concurrent cache requests.
3. Top index futures rank latest supplied IST-session volume. When volume is missing, identify genuine master contracts as unranked. Do not invent instruments or assume missing volume/change is zero.
4. Keep the option-chain UI removed as previously requested; its backend remains for verification. The complete futures browser is collapsed by default and preserves search/filters.
5. The index strip uses sourced prices. Without its own confirmed session state it says last available, not live. Stock depth shows only supplied levels, never a fabricated five-level book.
6. Preserve pending/unknown submission locks, recovery identity and account scoping. HTTP acceptance is not execution. Never blindly repeat an uncertain POST or dispatch a later strategy leg before confirmed fills.

## Validation and limits

Local checks include Go tests/vet, frontend lint/types, 76 unit tests and production build. The authenticated browser suite retains assertions for canonical lots, pending/uncertain submissions, session failures, real candles, quote coverage, account recovery and light/dark responsive layouts. Added cases cover an empty master producing no invented cards, closed-session top-card Buy/Sell guards and sourced ticker labels. See PR #14's final checks for its complete browser result.

Market-worker: 90 tests passed. News-worker: 9 passed. Script tests cover smoke safety and startup/cleanup; one environment-dependent case skips locally. Local PostgreSQL/Redis cases can skip because no user credentials/database are used. GitHub CI supplies disposable PostgreSQL/Redis, integration tests and accounting race checks. New backend regressions cover exchange-local expiry-day selection, cold demand without worker HTTP and watchlist JSON.

Consult final PR checks and the resulting main push before release. Browser screenshots/tests use deterministic API fixtures, not live broker data. Committed CLOSED/DISPLAY reports are supplied historical evidence, not independently repeated open-session acceptance. No broker login, real broker order, production database mutation or deployment was performed.

## Next work in order

### 1. Segment-aware session calendar — high priority

The code shares a 09:15–15:30 session and 15:20 MIS cutoff across cash/F&O; expiry parsing uses 15:30. [NSE's current CAS publication](https://www.nseindia.com/static/products-services/closing-auction-session) specifies a 15:15–15:35 auction for applicable cash stocks, normal cash trading until 15:30 for non-CAS securities, and equity derivatives until 15:40. A global replacement of 15:30 with 15:40 would be incorrect.

Audit these together: `backend/internal/market/calendar/calendar.go`, `internal/handler/health_handler.go`, product expiry policy, order placement/preview/exit, MIS square-off/settlement, worker session state, archive boundaries, frontend `format.ts`/`fnoExplore.ts` and the smoke script. Build a versioned schedule with exchange, segment, phase and CAS eligibility; keep MIS cutoff an explicit simulator risk policy. Validate current NSE/BSE circulars and amendments independently. Test continuous close, auction entry/matching, derivatives close, expiry, holiday and special-session boundaries. PR #13 fixes expiry-day selection within the present application policy; it does not implement the new schedule.

### 2. Finish Stocks/dashboard authenticity — high priority

`StocksExplorePage.tsx` still contains static market caps, most-traded volumes/turnover, intraday labels and generated mover sparklines. Its live catalog can turn unknown movement into zero and lacks the same provenance checks as the corrected F&O desk. Audit the shared dashboard catalog/sector summaries too.

Replace each financial metric with a sourced API value/timestamp, hide it, or show unavailable. Discover from the active master instead of a fixed demo universe. Reuse `dayMovement`, source checks and native OHLC. Regression: provider failure cannot expose a sample market cap/volume, invent a chart or mark unknown change as flat.

### 3. Complete actual OPEN-session [issue #9](https://github.com/Dhiraj10002/Stock-Simulator/issues/9)

After calendar correction, run `scripts/smoke_test_live_session.py --expect-open` on the backend host during an actual sourced OPEN session. For `--paper-orders`, use a dedicated empty paper account and privately set `STOCK_SIM_SMOKE_TOKEN` to its application token. Run NIFTY index and RELIANCE stock derivatives; exact commands/cleanup are in `LIVE_SESSION_VERIFICATION_2026-10-04.md`.

Add depth, moving-price and automated wallet/ledger reconciliation assertions: the current smoke script does not certify them. Verify provider timestamps, volume/OI, supplied depth, native candles, delivery, intraday long/short, futures long/short and call/put directions. Exercise reconnect, stale/missing data, partial orders and restart recovery. Inspect the account after failure before retrying. Close #9 only after sanitized OPEN-session evidence is reviewed.

### 4. Label paper margin policy accurately

`backend/internal/product/rules.go` uses configurable simulator rules (defaults: MIS 5x, futures 20%, short options 30%). This is not a sourced exchange SPAN/exposure engine. If exact margin realism is required, design a verified contract-aware adapter, underlying exposure for short options and portfolio risk limits in a separate change. Include small-premium short-option and portfolio-offset tests. Do not label current percentage estimates exchange margin.

### 5. Staging release and operation

Run production Compose against staging/disposable services. Verify TLS/WSS, explicit CORS, worker networking/health, matching master versions, existing-schema migrations, restart recovery, database backup/restore, read-only reconciliation and bounded provider demand. Monitor freshness, master mismatch, quote/depth coverage, latency, rejections and reconciliation failures. CI does not test the actual Oracle/Vercel deployment or the user's upstream session.

## What INDIAN_API_KEY means

This optional company-fundamentals key comes from [IndianAPI](https://indianapi.in/indian-stock-market), separately from Angel One SmartAPI. The adapter calls allowed `*.indianapi.in/stock` hosts with `X-API-Key`, not the RapidAPI gateway. A RapidAPI key/subscription in the earlier screenshot is not automatically compatible.

Privately configure `INDIAN_API_KEY` and `INDIAN_API_PLAN` in ignored backend configuration for verified fundamentals such as P/E/EPS. Angel One prices/depth/native candles/paper orders do not require this key. Without it, fundamentals remain not configured. Never put it in frontend `NEXT_PUBLIC_*`, git, screenshots or chat.

## Next Codex/Gemini task

Start from merged main and create a focused calendar/phase branch. Read `frontend/AGENTS.md` and the installed Next.js guides before frontend edits. Use disposable integration services. Preserve the chosen compact UI and financial failure/recovery assertions; never restore screenshot sample values to make unavailable data look populated. Review that calendar change before issue #9 acceptance, then continue the discovery audit and staging release. This handoff and green CI do not authorize real broker orders or deployment.
