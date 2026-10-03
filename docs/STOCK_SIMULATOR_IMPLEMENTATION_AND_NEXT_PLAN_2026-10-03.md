# Stock Simulator: fixes and release plan

Base reviewed: `c3e955f56a0feca4d3cff2d99a086057f54511f9` on main.
Implementation branch: `codex/market-accounting-lifecycle-20261003`.
This document supersedes completion claims in earlier roadmaps. It is a handoff for the owner, Codex and Gemini. Code changes do not establish live broker acceptance or production readiness.

## What changed

| Area | Finding | Implementation |
|---|---|---|
| Stock detail | Invented order book, fundamentals and badges obscured missing prices | Replaced fixture panels with provider quotes, authentic five-level depth and explicit unavailable states; retained delivery/intraday paper orders with server preview and confirmation |
| Charts | Wrong interval selection, synthetic badge without evidence, cached mark creating a present-time candle | Hour/day request native archives; 5/15-minute aggregate from one-minute bars at the IST session anchor. Only fresh one-minute ticks update candles, using their event timestamp; other intervals refresh from archives |
| F&O discovery | Static futures, prices, OI and rankings | Discover eligible underlyings and canonical futures from activated instruments. Quote every contract independently; retain call/put option-chain and paper order flows |
| OI and statistics | Missing OI was indistinguishable from actual zero | Transport availability separately; missing OI suppresses totals, PCR and max-pain inference. Greeks remain labelled model estimates |
| Circuits | Guessed circuit bands looked like broker data | Show and enforce only positive provider bands; no fabricated fallback. Missing bands remain unavailable |
| Daily account P&L | Blocked margin counted as loss; late snapshot could omit sold overnight holdings; reset/deposit races | Transactionally build session-opening equity from wallet/trade ledgers and real previous closes; product-specific equity, durable unique epoch/session baseline, wallet serialization, atomic deposits and capital-flow adjustment |
| Instrument master | Staging modified live rows; reused tokens overwrote history | Immutable staged payload, atomic validated activation, contract identity by symbol/segment, recyclable provider tokens, historical retention and expiry filtering |
| Import races | Python worker had another writer to canonical instruments | Remove worker writes. LIVE subscriptions read only the database's activated master and fail when it is absent |
| Readiness | Unsupported year/unavailable mode/empty activated universe could appear healthy | Fail readiness closed for unsupported calendar years, unavailable feed and empty active universe; report actual tradable count |
| Build | Nine Go files failed formatting | Format backend and extend regression coverage; sync-instruments binary now included in backend image |
| Acceptance | Smoke script directly initialized broker SDK and only printed checks | Assert application LIVE readiness, equity/index/future/call/put identity, provenance, timestamps, OI and native history; optionally exercise all eight paper directions |

## Accounting rules to preserve

Cash means the full wallet balance. A reserved order or blocked margin changes spendable cash, not account equity.
Delivery contributes signed quantity × mark. Intraday and futures contribute signed quantity × (mark − average). Long/short options contribute signed quantity × premium mark. Amounts use integer paise, checked multiplication, and canonical derivative kind.
Daily P&L = current account equity − session-opening account equity − deposits after the session boundary. The latest reset creates a separate capital epoch while preserving prior snapshots.
Opening holdings come from pre-boundary trades, including holdings fully sold later that session. Use authenticated previous-close metadata for that session. If history, previous close or derivative identity is incomplete, daily P&L is unavailable; do not substitute average price, stale position marks or zero.
Baseline creation, deposit writes and consistent account reads lock the wallet. Snapshot insert conflicts select the durable winner. Do not bypass these paths with direct wallet SQL in new features.

## Instrument rules to preserve

Only sync-instruments stages/activates the production canonical master. Staging must not affect the live universe. Activation rejects empty, partial, malformed, duplicate, invalid-lot/expiry masters and material unexpected shrinkage. PostgreSQL advisory lock and a transaction serialize activation; old contract identities stay available for settlement/history.
Provider token and exchange identify current subscriptions; symbol and segment identify persistent contracts. Never update historical positions to a new token's different contract. The worker requires an ACTIVE snapshot and does not bootstrap LIVE with built-in instruments or downloaded overrides.
Expiry filtering removes expired instruments from current discovery; immutable settlement references and the existing safe manual-exit retry logic remain separate.

## Validation and evidence

Local checks: Go formatting, `go test ./...`, `go vet ./...`; frontend lint, TypeScript, 55 unit tests and Next production build; 60 market-worker tests. The local backend run skips tests that require TEST_DATABASE_URL/TEST_REDIS_URL. The draft PR runs those integrations with PostgreSQL 16 and Redis 7, plus the order-accounting race gate. Check that run before merging.
New regressions cover equity by product/direction, blocked-margin neutrality, a fully sold overnight holding, staging isolation, token reuse, malformed/empty masters, native depth units, missing OI, stale source labels and candle aggregation.
No live SmartAPI login, deployed-site browser acceptance, backup restore or load benchmark was performed here. Missing screenshots in the conversation were not available for visual comparison. Do not describe those checks as passed.

## Release checklist

1. Review the branch/draft PR and require all CI jobs to pass. Run authenticated browser tests for dashboard, stock detail, option chain, portfolio, order status, logout and unavailable states. The stock and F&O pages intentionally remove invented rankings/fundamentals and simplify their prior fixture UI.
2. Back up PostgreSQL. Test migrations against a restored production copy first. Existing duplicate symbol/segment rows must be reconciled with history before adding the unique contract index. The schema upgrade removes the obsolete token uniqueness constraint, adds immutable snapshot payload and reset epoch, and rebuilds the daily snapshot uniqueness index. Avoid rolling old and new schema writers simultaneously.
3. Build the backend image and run its `/sync-instruments` binary with the deployment database environment, before starting the LIVE worker. Example: `docker compose -f docker-compose.prod.yml run --rm --entrypoint /sync-instruments backend`. Confirm that compose file/service names match your installation. Import the complete trusted Angel One master; filtered staging imports cannot be activated as the global production master.
4. Confirm active snapshot version, tradable count, expiries, lot sizes and token/segment identity. Start the worker with LIVE mode and DATABASE_URL. It must fail if no activated canonical master exists. Keep broker credentials only in server deployment secrets.
5. During a supported open exchange session, run `python scripts/smoke_test_live_session.py --base-url https://YOUR-API/api/v1 --expect-open --output live-evidence.json`. Require equity, index, future, call, put, OI and one-minute/hour/day history assertions to pass.
6. Use a dedicated empty paper account for execution evidence: set `STOCK_SIM_SMOKE_TOKEN` privately, then add `--paper-orders`. This places simulated application orders only. On failure inspect and close/cancel its pending orders/positions before retrying; do not assume automatic cleanup. All six F&O directions plus delivery and intraday must open and close without residual positions.
7. Compare sampled prices, OHLC, previous close, OI, lot size and timestamps with authorized SmartAPI responses; record symbol/token/segment and time. Test stale feed, broker expiry/reconnect, Redis outage, missing archive, midnight/weekend, reset/deposit while orders are pending, and expiry settlement recovery.
8. Test load and restart recovery, verify alerts and backup restore, then approve merge and deployment separately. Monitor `/api/v1/ready`, fresh-feed age, activated master version, worker heartbeat Redis key `market:worker:heartbeat`, pending intents and failed settlements.

## Remaining work requiring deployment evidence or another feature

- Authenticated browser E2E and visual review are release gates, not implemented coverage in this patch.
- Worker heartbeat is emitted with a 90-second TTL; deployment monitoring must alert on expiry. Readiness currently reports feed state/tick age rather than enforcing this independent heartbeat.
- Refresh the exchange calendar using official published circulars before 2027. Unsupported years now deliberately fail readiness.
- Implement sourced fundamentals/52-week data, licensed rankings and full derivative-universe analytics only with verified providers and freshness metadata. Do not reintroduce fixture numbers.
- Margin and Greeks are simulator models; exact broker SPAN/exposure and exchange-equivalent settlement require separate validated integrations. This remains paper trading.
- Demonstrate recovery, rate-limit budgets, secret rotation, backups, operational dashboards and load targets in the actual hosting environment. No production-ready claim until recorded acceptance passes.

## Instructions for Codex/Gemini

Read this file, relevant AGENTS.md and changed tests first. Reproduce CI failures before editing. Keep strict executable quote validation distinct from cached display. Preserve archive-based expired exits, atomic wallet accounting, idempotent retries and immutable historical contracts. Never send broker orders for smoke tests. Attach actual test commands/results and market-session evidence to the PR; leave unavailable data explicit. Do not merge or deploy merely because local unit tests pass.
