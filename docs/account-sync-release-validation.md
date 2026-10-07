# Account synchronization and release validation

This change preserves the existing homepage layout, particle count, colors and
motion. Account event streams and market price streams are separate. The Go
market WebSocket remains directly connected to the Oracle gateway: quote
delivery does not go through the Next.js account gateway.

## Account freshness and limits

JWT-protected `GET /api/v1/account/events` emits private SSE invalidation hints.
The browser accesses it through `/api/backend/account/events`; credentials
remain HttpOnly. There are no balances, financial rows, broker credentials or
access tokens in events or BroadcastChannel messages. The authenticated JWT
identity determines the account, regardless of supplied query parameters.

Each API process has one Redis pattern subscription. Hints are queued after
successful transaction commits; queue saturation and failures do not fail
trading. A Redis revision key (seven-day retention) and 15-second heartbeats
recover missed Pub/Sub messages. The stream ends after 45 seconds, below the
60-second gateway/API deadlines, and reconnects with outage backoff and jitter.
The stream is limited to four connections per user and 1,024 per API process.
Excess connections use polling. Hidden tabs stop their private event stream.

Wallet, orders, trades and empty-portfolio polling moves from five to thirty
seconds while the private stream is healthy. Active positions retain
five-second portfolio valuation refreshes. A market WebSocket being healthy
alone never slows account polling. A missing handshake, invalid MIME, stream
failure or heartbeat timeout restores five-second reconciliation. Account
acceptance, server fills, cancellation, deposits and reset trigger shared
refetches. Account scopes prevent hints from invalidating another user's cache.
Focus/reconnect reconciles changes missed while away.

The stream is an optimization with fallback, not a transaction log. A process
crash immediately after a commit can lose the asynchronous hint; periodic
reconciliation remains necessary. Preview and executable-price validation
continue to read authoritative backend state. Execution never trusts browser
display caches.

Bounded SSE works with the current Node.js route handler runtime. It consumes
Vercel function duration while open: monitor function usage before scaling.
For a larger deployment, consider authenticated ticket-based WebSockets at the
Oracle gateway rather than unbounded serverless connections.

## Measurement evidence

CI runs the existing full suite plus private stream parsing, scope isolation,
authenticated gateway streaming, two-tab refresh/logout and polling tests.
The backend race check includes the Redis fanout package. The real Caddy/Go
HTTPS smoke also checks that authenticated account events deliver their first
frame immediately and bypass compression; anonymous streams are rejected. Existing accounting
regressions cover delivery/MIS/futures/options reconciliation and durable order
intent replay without a second fill.

The backend performance artifact contains warm database round trips,
EXPLAIN ANALYZE plans and isolated restore verification. It describes a local
CI PostgreSQL service, not Oracle-to-Neon production latency.

The browser artifacts record fixed-window account request counts, public mobile
LCP/CLS, scripted interaction timings, CDP CPU/heap data and actual OPTIONS
preflights. The homepage comparison uses the PR base and branch builds under
identical conditions. CI emulates mobile; it cannot certify a real phone or
field INP. The read-only deployed profile describes the release currently live,
which can differ from the PR. No orders, account writes or login credentials are
submitted by the deployed profiler. Artifacts do not include session storage.

Public body-less GETs already omitted JSON headers; a regression test protects
that behavior. JSON POST bodies and private security headers remain required.

## Deployment sequence

1. Review CI and merge the PR.
2. Pull the merged commit on Oracle and rebuild the backend using the existing
   production runbook. There are no new secrets or database migrations in this PR.
3. Deploy the frontend. If it is deployed first, the old backend returns 404 for
   account events and five-second polling continues.
4. Verify the private event response is streamed with `private, no-store` and
   a 15-second heartbeat. Then confirm fills in another tab update the wallet.
5. Confirm reconnect/fallback behavior and inspect Vercel function duration,
   Redis requests, database request counts and failures before reducing cadence
   further.

Secret rotation was deferred by the owner and is not performed in this change.
Do not copy secret values into issues, artifacts or terminal output.

## Deployment-side acceptance still required

Use a dedicated paper account during an open session. Verify delivery, MIS,
one valid future and one option entry and exit. Save the starting wallet,
reservations, resulting positions, order/fill UUIDs and ending ledger. Replay
one exact request with the same idempotency key and confirm a single order and
fill. Verify mismatched payloads with that key are rejected. Do not run account
reset or trading experiments on another user's account.

From Oracle, run the existing read-only database profiler:

```sh
sudo docker compose --env-file .env -f docker-compose.prod.yml run --rm --no-deps --entrypoint /profile-db backend -samples 20 -plans
```

Record VM region and the Neon branch/compute region from their consoles; a
database hostname is insufficient proof of placement. Compare warm SELECT 1
round trips with the plans' server execution time before choosing a migration
or index change. Keep connection credentials out of the report.

Enable `NEXT_PUBLIC_ENABLE_SPEED_INSIGHTS=true` in the Vercel deployment if
desired. Collect mobile/desktop p75 LCP, INP and CLS after deployment; targets
are LCP <= 2.5s, INP <= 200ms and CLS <= 0.1, not measured guarantees.

For a dedicated account, save a local Playwright storage state with restrictive
file permissions, never commit it, and run:

```sh
node frontend/scripts/profile-mobile.mjs --url https://stock-simulator-gules.vercel.app --paths /,/stocks,/stocks/RELIANCE --storage-state /private/path/session.json --account-window 60 --runs 3
```

This is a read-only lab run. Also test loading, scroll, search, chart and order
ticket on a physical phone. Record the model, browser, network and session time.

## Monitoring and restore

The monitor now requires both API readiness and running/healthy core containers.
An unhealthy broker proxy prevents worker restart storms. Its existing
systemd OnFailure service emits a local journal/syslog alert; external delivery
is not configured without an owner-supplied destination.

Install the existing service/timer using the production runbook and verify:

```sh
sudo systemctl status stocksim-monitor.timer
sudo systemctl start stocksim-alert.service
sudo journalctl -t stocksim-alert -n 10 --no-pager
```

A real feed outage must produce a failure event and trigger the alert locally.
Do not interrupt a healthy production feed just to test it during trading.

CI dumps its disposable database and restores the dump in a new Docker
PostgreSQL container with no network or published ports. Full-row fingerprints
for users, wallets, orders, trades, positions and wallet transactions are
compared; the durable order-intent index must exist after restore. The container
is always removed. Production backup files are never uploaded to CI.

To verify a privately retained custom-format backup on the VM:

```sh
python3 scripts/verify_backup_restore.py /private/path/backup.dump
```

This command never connects to the source or an existing target database.
It requires the PostgreSQL 16 Docker image and sufficient disposable disk space.
Without an expected fingerprint it verifies restoration, table reads and the
intent index; it does not claim a point-in-time match to a moving live source.
Verify the actual Neon backup retention and restore policy separately.
