# Mobile profiling, display polling and standalone runtime

The cinematic homepage and current Stocks/F&O design remain unchanged. This
change reduces redundant display requests and the files shipped in the frontend
container. It also adds reproducible mobile navigation and touch diagnostics.
The site is not deployed yet, so the recorded measurements are local production
lab observations. Live-host profiling and field INP remain pending deployment.

## Display refresh policy

| Request/state | Policy |
| --- | --- |
| Stock detail, index strip, visible futures batch | Initial REST fetch, then suspend its timer only when **every requested symbol** has a subscribed, fresh, authentic WebSocket quote |
| Missing, capped-out, stale, synthetic or disconnected stream | Keep/restore the existing 10-second display fallback |
| Silent socket | A shared one-second clock detects quote expiry at 15 seconds; the next fallback fetch follows the normal 10-second interval |
| Confirmed `CLOSED` / `HOLIDAY` | Display quotes, movers, breadth and whole-universe ranking snapshots refresh every 60 seconds |
| `PRE_OPEN`, `POST_MARKET`, unknown/stale status | Normal display cadence; the equity status endpoint cannot establish the derivative session close |
| Wallet, portfolio, order previews, risk and order status | Existing authoritative refresh cadence; stream prices cannot replace account state |
| Order/fund/reset mutation | Existing query invalidation remains immediate, even when a display timer is suspended |

REST merges cannot renew WebSocket health. Quote exchange timestamps and browser
arrival times must both be fresh; stale/invalid/future-dated messages cannot prove
stream health. Disconnects and removed subscriptions discard those observations.
Session evidence expires after 45 seconds rather than treating the default
`CLOSED` value as an authoritative response. The provider still refreshes status
every 30 seconds, while order-ticket status checks retain their 10-second cadence.

A 50-symbol subscription limit means a whole market universe cannot be treated as
fully streamed. Movers, breadth, popular-stock rankings and top-index-futures
rankings still fetch their full universe during open sessions. They only slow on
confirmed closed sessions. The display policy changes `refetchInterval`, keeping
queries enabled so manual refreshes, initial requests and invalidation still work.
No backend execution freshness or pricing rules change.

## Measured results

| Observation | Main baseline | This change |
| --- | --- | --- |
| Homepage median LCP, no-preference | 2,112 ms | 2,108 ms |
| Homepage median LCP, reduce | 2,080 ms | 1,960 ms |
| Login median LCP, no-preference | Not sampled | 2,008 ms |
| Login median LCP, reduce | Not sampled | 2,016 ms |
| Healthy-stream display polls in 30 seconds, after initial fetch | 3 | 0 |
| Silent-stall display polls in following 35 seconds | 3 | 1 (fallback restored) |
| Order-preview requests during healthy-stream window | 7 | 7 |
| Approximate uncompressed runtime files | 705.4 MB | 57.9 MB (91.8% reduction) |
| Homepage median encoded JavaScript | 162,268 bytes | 162,268 bytes |
| Navigation CLS / horizontal overflow | 0 / none | 0 / none |

Navigation samples use three cold contexts per route/motion setting. Homepage
JavaScript is unchanged; the small LCP differences do **not** establish a loading
speed improvement. Final homepage/login runs had zero page errors or failed HTTP
requests. The baseline sampled homepage navigation only. Its preview-anchor
interaction was skipped because the original selector chose a hidden link; the
final profiler targets the visible link, so interaction samples are not compared
as a before/after claim.

The separate stock touch diagnostic captured a maximum scripted Event Timing
sample of 248 ms under CPU 4× throttling. This exceeds the 200 ms field-INP target
for that individual lab sample; it is not a field-INP score, a proven regression,
or a claim that all interactions meet the target. Repeat on actual mobile hardware
after deployment and use traces to isolate any consistently slow control.

Runtime bytes compare local production files, not compressed image layers or
Vercel bundles. Docker CI records the actual runtime image size separately.


Raw observations are under [performance/](performance/):
[before mobile](performance/mobile-polling-before.json),
[after mobile](performance/mobile-polling-after.json),
[before polling](performance/stream-polling-before.json),
[after polling](performance/stream-polling-after.json),
[runtime files](performance/standalone-runtime.json), and
[stock touch samples](performance/stock-touch-interactions.json).

## Repeat mobile profiling

```bash
cd frontend
npm ci
npx playwright install chromium
npm run build
npm run profile:mobile -- --output artifacts/mobile --paths /,/login --runs 3
```

The profiler uses 390×844 touch emulation, CPU 4× throttling, 1.6 Mbps download,
150 ms latency and cold browser contexts. It checks normal and reduced motion,
records navigation LCP/CLS/FCP/TTFB, encoded JavaScript bytes, horizontal overflow,
HTTP/network failures, long tasks and scripted Event Timing samples. Interactions
are limited to a platform anchor, typing into login without submitting, or changing
a stock chart timeframe. It never submits an order or account mutation.

After deployment, pass the real frontend origin. Remote runs reach the real APIs
and record redirects/failures instead of substituting local public-page fixtures:

```bash
npm run profile:mobile -- --url https://YOUR_FRONTEND_HOST --paths /,/login --runs 3 --output artifacts/deployed-mobile
```

For authenticated **read-only** stock diagnostics, optionally supply a locally
exported Playwright storage state using `--storage-state artifacts/private-state.json`
and `--paths /stocks/RELIANCE`. Use a dedicated demo account. Keep that state out
of git; authentication may expire, and the report records the final route so a
login redirect cannot be mistaken for a measured stock screen.

The local browser suite covers chart controls, quantity and confirmation on a
390-pixel touch screen under CPU throttling, plus order/account regression flows
using fixed API/WS fixtures. Its clock-controlled request count is a polling
comparison, not a throughput or execution-latency benchmark. Scripted event
samples are not a field INP score or a real-device acceptance result. Browser CI
uploads these measurements and screenshots as `mobile-browser-measurements`.

## Standalone frontend runtime

Next.js `output: "standalone"` traces production dependencies. The runner uses
`node server.js`, copies `.next/standalone`, `.next/static` and `public`, and runs
as UID 1001. All three Docker stages use Node 22, matching frontend CI. A frontend
`.dockerignore` excludes local dependencies, builds, environment files and test
artifacts from the build context.

```bash
npm run build
npm run test:standalone
```

The smoke script stages the runtime in a fresh temporary directory and starts it
without the application source or full build-time dependencies. It verifies the
homepage, login, dynamic stock route, referenced JS/CSS/fonts, legacy redirects
and a real 404. Docker CI independently builds the Alpine image, confirms the
non-root UID, runs the same HTTP checks and logs the actual image byte size.
Docker is unavailable in the local work environment; image validation runs in CI.

For a self-hosted frontend, provide public service URLs at **build time**:

```bash
docker build -t stock-simulator-frontend:local \
  --build-arg NEXT_PUBLIC_API_URL=https://api.example.com/api/v1 \
  --build-arg NEXT_PUBLIC_WS_URL=wss://api.example.com/ws/market frontend
docker run --rm -p 3000:3000 stock-simulator-frontend:local
node frontend/scripts/smoke-standalone.mjs --url http://127.0.0.1:3000
```

Replace those example API/WS hosts before building. `NEXT_PUBLIC_*` values are
embedded in browser bundles. The existing Vercel deployment uses its normal
Next.js build rather than this Dockerfile; container size reduction applies to
self-hosted/Docker deployments. No deployment or merge is performed by this PR.

## Validation

Local checks: 85 unit tests, 40 production browser tests, lint, strict TypeScript,
production build and isolated standalone HTTP/assets/redirect smoke. Added tests
cover stream-only health, per-symbol subscription gaps, stale timestamps, silent
stalls, disconnect/reconnect, closed-session cadence, immediate mutation refresh
and mobile touch controls. CI also retains Go integration/race checks against
PostgreSQL/Redis and both Python workers, and adds the Docker runtime smoke job.

References: [Next.js standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output),
[TanStack polling](https://tanstack.com/query/latest/docs/framework/react/guides/polling),
[disabled-query invalidation behavior](https://tanstack.com/query/latest/docs/framework/react/guides/disabling-queries),
[INP lab and field diagnosis](https://web.dev/articles/optimize-inp).
