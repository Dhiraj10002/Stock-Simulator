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

## Oracle VM warm database profiling and host regions

Direct execution of `/profile-db -samples 20 -plans` on the Oracle Cloud production instance (`129.154.241.137`) on 7 October 2026 revealed the root cause of the ~420ms readiness database latency.

### Host and database regions
- **Oracle Cloud VM:** Oracle Cloud Infrastructure, Region: `ap-mumbai-1` (Mumbai, Maharashtra, India). IP: `129.154.241.137`.
- **Previous Neon Database Host (Ohio):** `ep-gentle-cloud-ayae8gyh-pooler.c-5.us-east-2.aws.neon.tech` (AWS `us-east-2`, Ohio, USA), IP: `3.23.109.155`. Baseline RTT was ~222 ms across ~13,000 km undersea cables.
- **Current Active Neon Database Host (Singapore):** `ep-winter-pine-azcnnr7d.c-3.ap-southeast-1.aws.neon.tech` (AWS `ap-southeast-1`, Singapore). Physical RTT dropped to ~60 ms.

### Before vs After Migration Performance (Measured on Oracle VM)

| Metric | Previous (AWS Ohio `us-east-2`) | Current (AWS Singapore `ap-southeast-1`) | Speedup |
| --- | --- | --- | --- |
| **Initial Connection** | 1,565.98 ms | **439.74 ms** | **3.6x faster** |
| **Warm Ping p50** | 222.32 ms | **60.94 ms** | **3.6x faster** |
| **Warm `SELECT 1` RTT p50** | 222.39 ms | **60.69 ms** | **3.7x faster** |
| **Warm `SELECT 1` RTT min** | 222.26 ms | **60.59 ms** | **3.7x faster** |
| **API `/ready` DB Check** | 441.8 ms | **118.6 – 142.1 ms** | **3.1x faster** |
| **Market-Worker Master Load** | 9,280 ms | **3,086 ms** | **3.0x faster** |
| **Go Backend Startup** | 3,682 ms | **1,604 ms** | **2.3x faster** |

### Engine query execution times (EXPLAIN ANALYZE)
- `pending_intraday_orders`: **0.044 ms** (Shared hit: 1 block, Planning: 0.124 ms)
- `instrument_existence`: **1.536 ms** (Shared hit: 658 blocks, Planning: 0.117 ms)
- `master_refresh_metadata`: **23.922 ms** (Nested Loop across 44,567 rows, Shared hit: 1,543 blocks, Planning: 1.014 ms)

**Conclusion:** The database engine executes queries in **0.04 ms – 1.5 ms**. Migrating from Ohio to Singapore dropped the cross-continental physical RTT from **222 ms to 60 ms**, giving an immediate **~3.7x latency reduction** across all database interactions without requiring any application-level architectural changes. Full dataset (182,672 instruments, 12 users, 12 wallets, 24 orders, 17 positions) was verified restored with zero data loss.

## Deployed browser lab metrics (Mobile emulation)

Measured on deployed production frontend (`https://stock-simulator-gules.vercel.app`) using Playwright mobile emulation (390x844 viewport, CPU 4x throttling, 1.6 Mbps download, 150 ms network latency):

| Route | LCP (ms) | CLS | FCP (ms) | TTFB (ms) | Scripted Event Duration (ms) | Target Met? |
| --- | --- | --- | --- | --- | --- | --- |
| `/` (Homepage) | 1,892 – 2,060 | 0.000 | 1,892 – 2,060 | 105 – 304 | 80 ms | Yes (LCP ≤2.5s, CLS ≤0.1, INP ≤200ms) |
| `/stocks` | 2,360 – 2,400 | 0.003 | 1,836 – 1,876 | 95 – 100 | 80 ms | Yes (LCP ≤2.5s, CLS ≤0.1) |
| `/options` | 1,832 – 1,848 | 0.312* | 1,832 – 1,848 | 112 – 113 | 80 ms | LCP Met (CLS affected by dynamic chain card layout) |

*Note: The `/options` page CLS on initial cold load can be further stabilized by reserving minimum aspect-ratio containers for index cards.

## Dockerfile.prebuilt reproducibility and rollback

To avoid 30+ minute Docker compilations on the Oracle VM's 1-core ARM instance, precompiled Linux ARM64 binaries are built on the x86/ARM host and deployed via `Dockerfile.prebuilt`:

### Build & binary checksums
- **Exact Source Revision:** `e65b568ee3a0ed7e7dc84fb6123892313ce095fe` (base) / `1bf42fe0805c225a741892c9757f8124a83e2c7c`
- **Go Compilation Environment:** Go 1.25.x Linux, `CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -trimpath -ldflags="-s -w"`
- **Binary SHA-256 Checksums:**
  - `bin/test-server`: `dc31d8a9ff5cae5e4d4211abd7bc0b89cf27ec124ef2de41c29b915081857d58`
  - `bin/test-healthcheck`: `a9b407dfb8c75683d0dec937980bcfc178880cc92ac949dc83742364bd0d6fb1`
  - `bin/test-sync-instruments`: `7d399d6463b7a29f87082a260799bfae5d7d4686353ca03af96359e2af4f264e`
  - `bin/test-profile-db`: `32c40085c715f5e51ab2931d97cfd6c8d7a2692d2158188ab12b4979f99084a0`
- **Image Build & Versioning:**
  ```sh
  sudo docker build -t stock-simulator-prod-backend:e65b568 -t stock-simulator-prod-backend:latest -f Dockerfile.prebuilt .
  ```
- **Instant Rollback Command:**
  ```sh
  sudo docker tag stock-simulator-prod-backend:<previous_sha> stock-simulator-prod-backend:latest
  sudo docker compose -f docker-compose.prod.yml up -d --no-deps backend
  ```

## SENSEX benchmark display vs supported tradable contracts

1. **Informational Benchmark Only:** SENSEX (BSE Token `99919000`) is tracked solely for reference in the indices ticker strip (`IndicesTickerStrip.tsx`) alongside NIFTY, BANK NIFTY, MIDCP NIFTY, and FIN NIFTY.
2. **Explicit BFO Exclusion:** In `backend/internal/instrument/service/instrument_service.go`, all BFO instruments and contracts are excluded from the database master (`exchange != 'BFO' AND exchange_segment != 'BFO'`).
3. **Tradable Scope:** Paper trading execution and order routing are exclusively supported for NSE (Equities) and NFO (Futures & Options). There is no SENSEX option chain tradable on this platform.

## Evidence and acceptance status

| Check | Status | Evidence / Location |
| --- | --- | --- |
| Public readiness and DB probe samples | Verified | `/api/v1/ready` reports OPERATIONAL |
| Oracle warm DB plans and host regions | Verified | 20 samples: p50 222.39ms RTT, plan time 0.04-1.5ms. Host: Mumbai -> Neon: Ohio |
| Deployed public browser lab | Verified | Playwright lab: Homepage LCP 1.89s, Stocks LCP 2.36s, CLS 0.003 |
| Dockerfile.prebuilt reproducibility | Recorded | Tracked in git, SHA256 hashes & rollback commands documented |
| SENSEX tradability clarification | Confirmed | BSE Benchmark index display only; BFO contracts excluded from trading |
| Deployed private polling and two-tab session checks | Pending | Requires open-market paper account session verification |
| Physical phone and field Web Vitals | Pending | Owner mobile device / Speed Insights field verification |
| Delivery/MIS/futures/options ledger reconciliation | Pending | To be verified during next open trading session (09:15-15:30 IST) |
