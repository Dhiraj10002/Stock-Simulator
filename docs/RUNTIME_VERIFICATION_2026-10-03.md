# Existing-work runtime verification

Reviewed main `d59d7a6a746c0a09ea0366d2442376b797468ec7` after PR #7 was merged. Main's CI passed (run 37139837815). Also reviewed the supplied terminal output from 3 October 2026, 22:50–22:52 IST. No broker credentials, account IDs or session hashes from that output are reproduced here.

## Findings and corrections

| Finding | Evidence and correction |
| --- | --- |
| Frontend starts before API initialization completes | The launcher waited only ten seconds, then continued even without success. The log shows frontend fetch failures before the HTTP server started. Startup now requires successful HTTP health responses, aborts on timeout/child exit, and launches workers after backend migrations complete. Default timeout is 180 seconds; `STARTUP_TIMEOUT_SECONDS` accepts 1–900. |
| Duplicate Angel One authentication | Startup called `generateSession`, then the WebSocket cycle called it again. The log records a provider access-rate denial between these attempts. REST and WebSocket now share one synchronized session. Reconnects reuse it, expired sessions renew, and failed login attempts cool down for at least 30 seconds. Renewal uses broker JWT expiry with a 30-second buffer and a maximum 15-minute cache; unverified JWT parsing is only a scheduling hint. |
| Worker exits when the activated master is initially unavailable | LIVE startup previously raised and terminated before exposing health or reconciliation. It now remains alive, publishes unavailable state, maintains its independent heartbeat and retries canonical activation. Broker login remains blocked until a canonical version is loaded. LIVE never fills the lookup map from fallback/cache instruments, including when DATABASE_URL is missing. |
| In-flight responses can span a canonical token reassignment | Feed frames previously resolved tokens through the latest mutable subscription map. They now require the connection's canonical version and modification signature before resolving identity. REST responses from a replaced token map are discarded, and demand refresh cannot restore subscriptions from an older master. Regression tests simulate provider token reuse during an active connection and REST request. |
| Reconnect churn during closed sessions | The no-tick watchdog previously ignored trading hours and holidays. It now suppresses the no-tick reconnect only when a fresh backend calendar request confirms CLOSED, HOLIDAY, PRE_OPEN or POST_MARKET. Open, unknown, malformed and failed calendar responses retain the watchdog. Set `MARKET_STATUS_URL` to the backend status endpoint; Compose uses the backend service hostname. Transport failure and heartbeat readiness checks remain independent. |
| Missing `account_daily_snapshots` in the supplied log | Current main already requires this additive upgrade before listening, so these errors indicate an older or otherwise mismatched local checkout/database startup path. Required upgrades are now explicitly logged and tested against an existing database with a missing baseline table and a legacy table without reset epochs. Existing baseline values are preserved, and reset epochs remain distinct. Upgrade failure prevents startup. |
| Expensive instrument existence queries | The log contains instrument COUNT queries and requests delayed by tens of seconds. Existence checks now use SELECT EXISTS instead of counting all matching rows. Listing no longer swallows database errors and substitutes default instruments. This reduces unnecessary scans; it does not establish a latency guarantee for the user's remote database/network. |
| Shutdown can affect unrelated processes or hide failures | Startup used `kill 0` and cleanup returned success even after errors. Children now run in owned process groups, cleanup is bounded and preserves failure/signal exit codes. Occupied ports cause an explicit startup failure. `stop.sh` checks each candidate's checkout directory, includes port 8085, and leaves other checkouts' workers alone. The hardcoded Neon hostname/system DNS modification is removed. These scripts target Linux/Fedora. |

## What the log does not prove

- A successful HTTP response alone does not prove a correct quote or portfolio value. Worker/master readiness, timestamp/source labels and actual order status still matter.
- The supplied run is on Saturday night. The project's calendar also marks 2 October as a holiday. An exchange timestamp from 1 October can be a legitimate last-session timestamp; new market movement is not expected during a closed session. Do not fabricate ticks or reset quote timestamps to make the UI look live.
- Zero-price provider messages are discarded intentionally. They must not become executable prices.
- Unknown/missing/unavailable quotes and rejected order previews are distinct from missing database tables. After updating, inspect canonical identity, the provider response and quote purpose before diagnosing a stock's unavailable state.

## Verification

- Go tests and vet; PostgreSQL/Redis integration and order race checks in CI.
- Regression for required schema creation, repeat upgrades, baseline preservation and legacy reset-epoch uniqueness. DDL runs in an isolated schema inside a disposable transaction.
- Instrument tests prove lookup failures return errors and a populated master returns canonical records.
- 80 market-worker tests, including shared/concurrent authentication, cooldown, expiry renewal, master startup recovery, strict LIVE lookup, token reuse during canonical activation and closed-session watchdog behavior.
- Five launcher/cleanup tests with mock services and no real broker/database/Docker operations. The process-directory ownership test needs Linux `/proc` visibility and is skipped in the restricted local runtime; CI executes it.
- Frontend lint/types, 60 unit tests, production build and six production Chromium journeys remain CI gates.

The automated browser journeys use API fixtures. This review cannot inspect the running processes, database permissions or broker responses on the user's Fedora computer.

## Apply and confirm on the laptop

1. Merge the correction PR after its checks pass. In the intended checkout, run `git pull --ff-only origin main` and confirm `git log -1 --oneline`. Avoid running a second checkout or stale worker against the same Redis instance.
2. Run `./stop.sh`, then `./start-dev.sh`. Startup must print the required schema upgrade verification before backend availability, and must confirm worker and frontend HTTP availability before claiming the processes are available.
3. Inspect `http://localhost:8080/api/v1/ready`. UI/API liveness can be available while trading readiness is degraded. For LIVE, require a recent worker heartbeat, one activated nonempty canonical master and matching worker/master versions.
4. If the canonical master is not activated, follow the importer instructions in the existing deployment/handoff documents (`backend/cmd/sync-instruments`). The worker should recover after reconciliation without injecting fallback instruments. Do not switch LIVE to synthetic to hide an activation or provider error.
5. Confirm there are no repeated missing-table errors, early frontend fetch failures or duplicate immediate broker logins. For sustained slow SQL, inspect the configured DB/network and pool/query metrics; the supplied remote runtime is not accessible from this workspace.
6. Check portfolio, stock archives, canonical futures/options and a dedicated paper account during a supported open session. Preserve the smoke report and inspect any residual orders/positions before broader release.

Example local checks after restart:

```bash
curl --fail --silent http://localhost:8080/api/v1/health
curl --silent http://localhost:8080/api/v1/ready
curl --silent http://localhost:8080/api/v1/market/status
curl --silent http://localhost:8085/ready
```

These are inspection commands; unavailable readiness should remain visible rather than be bypassed.
