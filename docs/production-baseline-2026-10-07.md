# Production baseline after PR 26

Source inspected: `e65b568ee3a0ed7e7dc84fb6123892313ce095fe`.
PR 26 was independently confirmed merged. Public homepage returned HTTP 200,
anonymous `/api/backend/auth/me` returned HTTP 401, and the NIFTY OPTIONS search
returned 100 NFO contracts. These checks do not certify private-account flows.

## Public database probes

Values below came from the deployed API's `/api/v1/ready` response on 7 October
2026. They are API-process database pings, not a direct Oracle warm SELECT 1
profile and not browser page load time.

| API timestamp (IST) | Ready | DB ping | Redis ping | DB open / in use | Cumulative pool waits |
| --- | --- | --- | --- | --- | --- |
| 16:48:36 | true | 402.4 ms | 0.1 ms | 9 / 1 | 31 |
| 16:48:48 | true | 402.7 ms | 0.1 ms | 9 / 0 | 31 |
| 16:48:57 | true | 441.1 ms | 0.1 ms | 9 / 0 | 31 |

The maximum pool size was 25 and cumulative wait duration stayed at 4685.5 ms.
The unchanged counters do not indicate new pool contention in this short window.
Do not increase the pool or migrate the database based on these three samples.
The market was CLOSED; old market ticks in this window do not establish an
open-session feed outage or current quote latency.

Next measurement: run the existing `/profile-db -samples 20 -plans` binary from
the Oracle deployment, as described in `account-sync-release-validation.md`.
Compare warm round trips with PostgreSQL plan execution time and verify both
regions in their consoles before selecting an index or placement change.

## Confirmed code gaps addressed

1. `/options` used a five-second portfolio observer, while its Explore child used
   another ten-second observer. They bypassed the shared private-stream polling
   policy. Both now use the shared hook, including five-second active-position
   valuation and disconnected-stream fallback. The browser regression exercises
   the actual options route with a private stream fixture and a server change.
2. The F&O benchmark strip substituted hard-coded prices and movement when
   quotes were absent. It now uses genuine last-available quotes or explicit
   unavailable states. No homepage layout or effects change.
3. The profiler previously reported zero account requests even for an anonymous
   run. Account measurements now require a verified session; public runs say
   `not_measured`. API durations, SSE responses and WebSocket frame counts help
   diagnose connectivity without collecting tokens or account response bodies.

## Evidence and remaining acceptance

CI records mobile-emulated and desktop public profiles for `/`, `/login`,
`/stocks` and `/options`, with two cold runs per route. Results describe the
deployed release, not this unmerged branch. CI runner location, network
throttling and cold loads must accompany any numbers. These are not physical
phone measurements, field p75 or measured INP. The homepage before/after job
continues to use identical conditions and builds to check for regressions.

| Check | Status / required access |
| --- | --- |
| Public readiness and DB probe samples | Recorded above |
| Deployed public browser lab | CI artifact `homepage-performance-and-deployed-profile` |
| Oracle warm DB plans and regions | Pending: no Oracle SSH credential or agent in this workspace |
| Deployed private polling and two-tab session checks | Pending: no signed-in paper-account session available |
| Physical phone and field Web Vitals | Pending: owner device / Speed Insights access |
| Delivery/MIS/futures/options ledger reconciliation | Pending: dedicated paper account and open session |
| Alert delivery and actual production backup restore | Pending: deployment access and alert destination |

The claimed custom `Dockerfile.prebuilt` was not present in the inspected main
tree. Before the next backend rollout, retain its build recipe, exact source
revision, Go version, ARM64 binary checksums and previous image digest. The
checked-in `backend/Dockerfile` builds all four standard executables. Avoid
rebuilding from unrecorded local binaries. A container becoming healthy does
not by itself demonstrate zero-downtime or preservation of open connections.

SENSEX is present as a benchmark in the frontend. Public NIFTY contract results
alone are not a test of every unsupported-exchange order path. Keep the existing
backend exchange restrictions and include an explicit BFO rejection check in
the dedicated-account acceptance run. No claim that a SENSEX option chain was
independently verified is made here.
