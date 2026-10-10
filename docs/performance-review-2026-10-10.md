# Performance review — 10 October 2026

Reviewed source at main commit 392e2e51a6cdf81d3e203280f44f9e6414805e7d, the public website at https://www.stock-simulator.in, and [CI run 38031577890](https://github.com/Dhiraj10002/Stock-Simulator/actions/runs/38031577890).

This PR adds branding and technical SEO, and directs future deployed CI profiling to the custom domain. Streaming and database recommendations below are follow-up work, not performance improvements claimed as implemented by this PR.

## Evidence and limits

All seven jobs for the reviewed main commit passed, including Go formatting, race tests, frontend build, browser tests, gateway checks and a disposable database restore. The earlier formatting failure is resolved.

The [performance job](https://github.com/Dhiraj10002/Stock-Simulator/actions/runs/38031577890/job/114153449936) measured the old dev Vercel hostname, not the custom domain. Two cold runs per route, mobile 390×844 / CPU 4× and desktop 1440×900 / CPU 1×, both at 1.6 Mbps and 150 ms network latency:

| Route | Mobile LCP | Mobile CLS | Desktop LCP | Desktop CLS |
| --- | --- | --- | --- | --- |
| Home | 1.376–1.628 s | 0 | 1.384–1.392 s | 0 |
| Login | 0.948–1.144 s | 0 | 0.900–0.928 s | 0 |
| Stocks | 1.356–1.480 s | 0.0019–0.0025 | 0.992 s | 0.0034 |
| Futures/options | 1.068–1.176 s | 0.0006 | 0.972 s | 0.0027 |

Previous high desktop Stocks CLS is not reproduced. These are short browser lab samples, not field p75, real-phone measurements or field INP. They do not prove fresh executable prices. The review took place on a Saturday with the exchange closed; no production login, account write or trading order was submitted.

The custom-domain homepage returned 200 with a Vercel cache HIT. Its robots and sitemap endpoints returned 404 before this change. An earlier public screen inspection showed aligned navbar/index-strip prices with last-available labels. The live NFO status response included segment/open/close/cutoff fields with a 15:40 close. That resolves the earlier missing-fields symptom; exact backend/frontend revision parity still needs release identifiers.

Mobile Stocks/F&O sampled approximately 324/330 KB of JavaScript across 23/24 requests; desktop sampled 441 KB across 33. These totals can include prefetch traffic and are not necessarily the initial route bundle.

## Prioritized follow-up work

| Priority | Confirmed opportunity | Proposed work and pass condition |
| --- | --- | --- |
| 1 | LCP does not measure first usable quote or order-ticket readiness. Speed Insights is opt-in. | Profile the custom domain, verify metrics are enabled, record first valid displayed quote, ticket readiness, reconnect recovery, long tasks and React commits. Record p50/p95/p99 tick flow from worker receive through Redis publish, Go send and browser render. Cross-host latency needs synchronized clocks; animation-frame callbacks are not physical paint timestamps. |
| 2 | Each browser connection opens its own Redis quote subscription and parses events before symbol filtering (backend/internal/market/websocket/handler.go). | Evaluate one subscription per Go process, decode once and fan out by symbol. Preserve bounded queues, slow-client disconnects, reconnect behavior and subscription isolation. Load-test concurrent clients and measure CPU, Redis connections, queue age and latency before/after. |
| 3 | BatchQuotes runs individual CachedQuote reads through eight workers (backend/internal/market/service/redis.go). | Evaluate pipelining, one feed-state lookup, grouped demand updates and batch initial snapshots. Compare Redis round trips and p95 initial quote latency. Keep execution freshness and authoritative validation unchanged. |
| 4 | Public quote batches use JSON POST; metadata fetches have retries without a timeout (frontend/src/lib/quoteService.ts, instruments.ts). | Evaluate bounded URL-encoded GET batches supported by the API to avoid preflight; enforce symbol-count and URL-length limits. Add total metadata request budgets and caller-isolated cancellation to shared requests. Missing data must remain unavailable. Body-less public GET header cleanup is already implemented. |
| 5 | Stocks parent subscribes to the broad explore quote set; detail status/history and provider status have separate polling. | Profile row/card selectors and isolate computed aggregates from unrelated ticks. Share segment-aware status queries; reconcile history on reconnect/focus and according to session state. Retain stall fallback and valuation cadence. Reduce requests only after correctness checks. |
| 6 | Large blurred backgrounds and glass layers may affect GPU/scroll smoothness. | Capture real mobile traces during scroll, typing, charts and live ticks; optimize measured hotspots while preserving design. Canvas already defers, limits frame rate, respects visibility and reduced motion; do not repeat those changes. |
| 7 | Profiler swallows content-readiness failures and ignores all aborted requests; failed runs may end before writing reports (scripts/profile-mobile.mjs). | Fail on missing route content, classify expected navigation/prefetch cancellation explicitly, include critical scripts/fonts, and persist failure evidence before throwing. Record deployment revisions with every profile. |

Measure warm Oracle–Neon SELECT 1 round trips separately from query execution plans; verify regions and pool behavior before choosing database optimizations. Browser API latency includes throttling, backend work and transit and must not be presented as database latency.

Before calling the site production-ready, verify open-session delivery/MIS/futures/options entry and exit on a dedicated paper account, idempotent retries, funds/P&L reconciliation, two-tab refresh/logout, feed/proxy alerts and a disposable backup restore. CI fixtures and readiness alone do not prove every production flow.

## Recommendation

Keep the visual design. Start with custom-domain and first-quote evidence, then bounded network/polling improvements, followed by measured streaming and Redis load optimizations. Current lab loading/layout stability is promising; data readiness, recovery and concurrency efficiency are the more valuable next targets.

## Validation of this PR

- Production build and TypeScript passed; 102 unit tests and lint passed.
- 24 existing homepage, Stocks data-state and F&O browser checks passed locally. Screenshots were inspected in light, dark and mobile layouts. The local browser used Chromium 134 headless shell; development Google Font requests fell back in this environment. These checks are not fresh production speed measurements.
- Standalone production smoke passed, including seven public canonicals/social URLs, nine noindex routes, sitemap membership, robots and nonempty brand/favicon/manifest assets.
- The logo mark is approximately 1.2 KB of SVG. No new package, broker connection or trading behavior was added.
