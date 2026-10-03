# Feed, options and strategy follow-up

Base: merged PR #6, main `c0c1c86c445fabb108f503089fae64702791a37b`.
Branch: `codex/feed-strategy-browser-hardening-20261003`.

## Changes

- `/api/v1/ready` now requires an independent worker heartbeat, age within 90 seconds and no more than five seconds in the future, including closed/holiday sessions. LIVE additionally requires exactly one ACTIVE database snapshot, nonempty tradable members and agreement with the worker's loaded version. Legacy bootstrap rows do not satisfy LIVE readiness. Future feed timestamps fail closed.
- The worker emits one heartbeat loop, removes the duplicate loop with an undefined client, exposes `/ready` separately from `/health`, and shares loaded master version through Redis feed state. Production Compose checks worker readiness, explicitly supplies DATABASE_URL and sets INSTRUMENT_REFRESH_SECONDS (default 60, bounded 10–300).
- Canonical master reconciliation checks active version/count/update signature every minute. It loads member rows only when that signature changes, reconciles subscriptions and reconnects when identities change. A failed canonical refresh invalidates lookup/subscriptions and marks LIVE feed unavailable rather than continuing with a stale universe. Restored master recovery reloads on the next poll. Redis write failures do not prevent disconnecting invalid subscriptions or stop subsequent reconciliation attempts.
- Option-chain selection reads eligible underlyings from the backend. Fixed lot chips and numeric execution fallbacks are removed, including the modal's prior lot-size-of-one fallback. Single-contract orders fetch full canonical identity before opening the modal. The modal uses reactive authentication and reports the returned order status; PENDING acceptance is never called execution, and a known submission disables duplicate clicks. Strategies require known whole-number contract lots, fresh available quotes, matching model lot sizes and distinct legs.
- Strategy submission is sequential and stops unless each preceding leg is confirmed EXECUTED. HTTP success means acceptance only. Rejected, pending, lost-response and status-error outcomes retain per-leg identities and show partial results. There is no automatic retry of an uncertain submission. Recovery offers server-status refresh, cancellation of known pending orders and links to Orders/Portfolio to inspect or close filled positions. Status is rechecked after cancellation because a fill can win that race.
- Strategy tracking is kept in sessionStorage under the account's user_id, without tokens. Refreshing the page retains recovery state. Account changes stop further submission and hide the other account's records. Clearing tracking requires explicit acknowledgement after reviewing orders/positions and is disabled while known pending legs exist. This is tracking, not an atomic multi-leg exchange execution engine.
- Authentication-dependent stock/F&O UI, order previews and wallet queries use a reactive auth snapshot that matches server HTML during hydration, then updates from browser storage. It also responds to logout and account changes. Browser-discovered hydration mismatches are fixed without suppressing errors.
- Playwright tests exercise login, dashboard, portfolio, orders/logout, native chart interval selection, unavailable data, canonical option discovery/missing lots and partial-strategy recovery across reload. A separate GitHub CI job installs Chromium, tests an actual production build and uploads failure traces. Unhandled browser errors and flaky retries fail the job.

## Testing and limitations

Backend unit/integration/race CI remains in place; new regressions cover worker heartbeat age, future ticks and strict activated-master requirements. Frontend unit tests cover pending acceptance, partial fills, unknown POST results, missing lots and confirmed completion. Worker tests cover heartbeat/version metadata and canonical refresh failure/reconciliation.
Browser tests render the real Next.js UI with intercepted API fixtures and a test login token. They cover frontend journeys and response handling, not server authentication or live broker availability. Existing backend integration tests cover authenticated server order paths. Deployment still needs real SmartAPI open-session smoke evidence, actual browser acceptance, schema rehearsal, recovery/load checks and backup restoration before production certification.

## Operator sequence

1. Deploy backend and worker changes together; the prior worker does not emit readiness metadata. Keep backend liveness as the Compose startup dependency, not full trading readiness.
2. Back up and rehearse migrations, activate a complete trusted instrument snapshot with `/sync-instruments`, then start the LIVE worker with DATABASE_URL and server-side broker secrets.
3. Confirm `/api/v1/ready` shows worker UP, a recent heartbeat, and equal `services.worker.master_version` / `services.instrument_master.active_version`. A new activation may temporarily degrade readiness until the next reconciliation poll.
4. Alert on expired heartbeat, master mismatch and open-session stale ticks. Do not interpret a closed market as permission to ignore a stopped worker.
5. Run `python scripts/smoke_test_live_session.py --base-url https://YOUR-API/api/v1 --expect-open --output live-evidence.json` during a supported open session. Use a dedicated empty paper account for `--paper-orders` and inspect residual orders/positions after any failure.
6. Test partial strategies deliberately in staging: second-leg rejection, lost first POST response, pending fill, cancellation race, reload and account switch. Never resend UNKNOWN orders automatically. A recovery acknowledgement does not close any position.

Run browser suite locally: `cd frontend`, `npm ci`, `npx playwright install chromium`, `npm run test:e2e`. CI uses the Chromium dependency installer. Keep future enhancements consistent with these readiness, canonical identity and execution-status rules.
