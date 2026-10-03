# Restart and unavailable-data review — 4 October 2026 IST

**Latest update:** the next restart log showed an aborted Git pull and worker startup timeout. Use [the worker startup recovery guide](WORKER_STARTUP_RECOVERY_2026-10-04.md) for the current branch, a targeted local-edit backup and separate-terminal verification.

## Current conclusion

The latest supplied log shows a running backend and an Angel One WebSocket connection to 49 canonical instruments. It does **not** establish that any valid quotes were received: `last_tick` is empty and several zero-price messages were discarded. The dashboard was captured after midnight on Sunday with `MARKET CLOSED`.

A connection is evidence of transport/authentication progress, not proof of live prices. Keep missing data unavailable. Valid last-session provider quotes can be displayed with their original exchange timestamps and a delayed/last-available label; they cannot authorize stale paper execution.

The old duplicate-index startup failure is absent from this log. Startup/schema checks are progressing, but complete trading readiness still needs the actual `/ready` response.

This review builds on [the earlier runtime review](RUNTIME_VERIFICATION_2026-10-03.md), [PR #8](https://github.com/Dhiraj10002/Stock-Simulator/pull/8), and [live acceptance issue #9](https://github.com/Dhiraj10002/Stock-Simulator/issues/9).

## Findings and corrections

| Finding | Correction | Practical limit |
| --- | --- | --- |
| Expiry lifecycle loaded 72,601 full derivative rows; observed queries took approximately 66–89 seconds | Fetch distinct expiry strings, parse the existing supported formats once per date, and retire expired contracts in one filtered update | Reduces transferred rows and SQL parameters; remote database latency still needs measurement after restart |
| Single-symbol quote helper used the execution endpoint | Request `purpose=display`, retaining sourced older quotes and their stale flag | Requires an actual provider quote; never fabricates a missing price |
| Index cards said “Connecting…” indefinitely without quotes | Use explicit unavailable/closed-session states, provenance-aware quote labels and unavailable daily movement | Closed-session data may remain missing after an empty Redis restart |
| Header/banner claimed a live feed with no exchange tick | Distinguish connection progress, closed session, awaiting quotes and delayed/fresh quotes; failed status fetch stays unknown | Broker transport state alone cannot certify executable prices |
| Zero breadth showed a fabricated 50/50 split | No percentages or colored split without observations; unchanged stocks remain neutral | Breadth/rankings cover fresh observed quotes, not every NSE listing |
| Missing sector changes were green `+Unavailable`; nonexistent leaders linked to a stock page | Neutral unavailable labels, no fake leader/change, no placeholder leader link; observed-stock denominators include unchanged quotes | These are manually selected stock samples, not official sector index returns |
| Empty portfolio had “Live Valuation” | Show “No open positions” | A valid zero position value does not establish market-feed health |
| Backend aggregation counted unknown movement as unchanged and admitted future/nonfinite movement data | Require an explicit previous-close/day-change baseline and valid numeric movement/time | Missing baselines correctly reduce covered stocks |
| FULL snapshot failures/missing fields were silent | Log only rejection/coverage/positive-price/time diagnostics, never raw broker responses; allow a valid provider `exchTradeTime` when feed time is absent | Keep the original, potentially old trade timestamp; never replace it with fetch time |
| Smoke failure discarded earlier checks and readiness evidence | Preserve stage, sanitized readiness and completed paper legs; flag cleanup after a failed order stage | A failed report is not acceptance evidence and cleanup must be inspected |
| Paper smoke checked positions but not pending orders | Reject accounts with pending/open/trigger-pending orders before placing any paper order, and check them again at completion | Use a dedicated account without concurrent trading |
| Python tooling could not narrow a future after a custom assertion | Use an explicit `None` guard before accessing canonical future fields | Unsupported underlyings still fail clearly |

## Evidence and unresolved checks

- Supplied portfolio responses were HTTP 200 but took approximately 5–9 seconds, even with no positions. Several remote database round trips exceeded one second. Re-measure after the full-contract expiry scan is removed; inspect pool/query metrics if latency persists.
- Initial equity-universe discovery loaded 9,965 rows and took roughly 11 seconds before its cache warmed. This is an additional performance follow-up, not evidence that all those stocks have subscribed quotes.
- HTTP 200 history/movers responses do not prove nonempty candles or complete quote coverage. Inspect the JSON arrays, sources, exchange timestamps and readiness before claiming success.
- The worker already requests FULL REST snapshots and native historical candles. New diagnostics separate provider rejection, unmatched identities, zero prices and missing exchange times. A Sunday screenshot cannot determine which response field failed.
- HTTPS connectivity checks from this workspace to the Angel One API and official instrument-master host timed out. The user's Fedora localhost is a different machine and is not reachable here. No supplied credentials were used, and no application/broker orders or remote database changes were performed in this review.
- Real OPEN-session price changes, chart backfill, all delivery/intraday/F&O paper directions, portfolio/ledger reconciliation and recovery remain **unverified**. Issue #9 must stay open.

Angel One's [official Market Data documentation](https://smartapi.angelone.in/docs/MarketData) documents FULL quote fields, including exchange feed and trade times. Those provider timestamps determine display age; a retrieved price must not acquire a new exchange time merely because it was fetched again.

## Apply on the Fedora checkout

Keep any local Gemini edits before updating; `git status --short` must be reviewed so a pull does not overwrite unfinished local work. Continue on the existing PR branch, or use main after the PR is merged.

```bash
git switch codex/runtime-verification-fixes-20261003
git pull --ff-only origin codex/runtime-verification-fixes-20261003
./stop.sh
./start-dev.sh
```

Check privately on the same machine:

```bash
curl --silent http://localhost:8080/api/v1/ready
curl --silent http://localhost:8080/api/v1/market/status
curl --silent 'http://localhost:8080/api/v1/market/quotes/NIFTY?purpose=display'
curl --silent 'http://localhost:8080/api/v1/market/quotes/RELIANCE?purpose=display'
curl --silent 'http://localhost:8080/api/v1/market/quotes/NIFTY/history?interval=ONE_MINUTE&limit=100'
```

Interpret readiness by subsystem: LIVE mode, one trusted active canonical master, matching API/worker versions, recent heartbeat and correct calendar state. A healthy closed-session service may still have no cached quotes. Inspect the new FULL snapshot diagnostics rather than bypassing unavailable states.

Run display verification now (read-only application requests):

```bash
python3 scripts/smoke_test_live_session.py --output closed-session-evidence.json
```

The report records `session_requirement: DISPLAY`; it cannot complete issue #9. A first run can request quote/history demand and fail while backfill is pending. Retry after the worker has processed demand, and retain a failed report if the provider still rejects it.

During a session that `/market/status` and `/ready` both confirm OPEN:

```bash
python3 scripts/smoke_test_live_session.py --expect-open --output live-data-evidence.json
```

Only after those checks pass, use an empty dedicated paper account and provide its application access token privately through `STOCK_SIM_SMOKE_TOKEN`:

```bash
python3 scripts/smoke_test_live_session.py --expect-open --paper-orders --output live-paper-evidence.json
```

The execution run opens/closes nine paper directions: delivery BUY, intraday BUY/SELL, and future/call/put BUY/SELL. It never initializes a broker trading client. A failed run retains completed legs and marks possible cleanup; inspect/cancel pending paper orders and flatten any residual positions before retrying.

Run a separate supported stock-underlying check with `--equity RELIANCE --underlying RELIANCE` for stock F&O, then complete issue #9's UI, price-movement, margin/ledger and controlled recovery observations.

## Credential handling

Credentials supplied in conversation and screenshots are excluded from this report and repository changes. Rotate the exposed database password, application JWT secret and Angel One credentials through their respective private settings. Keep replacements in ignored server-side environment files or a secret manager. Share only sanitized readiness/smoke evidence; never publish `.env`, raw broker payloads or screenshots containing secrets.

## Validation

Local Go tests/vet and the distinct-expiry retirement regression pass; PostgreSQL/Redis integration checks require CI's disposable services. The expiry regression covers mixed date formats, the precise 15:30 IST boundary, unexpired/invalid/non-derivative preservation, repeated retirement and retained contract identities.

82 market-worker tests, 63 frontend unit tests, lint/types and six smoke-evidence tests pass locally. The local browser run could not launch because Chromium is absent. CI installs Chromium and runs seven browser journeys, including the new closed-session empty-dashboard case, plus the production build and PostgreSQL/Redis regressions. Record the exact CI result in the PR before review.
