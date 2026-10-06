# Code cleanup and performance priorities

Baseline: main `35b544e0ee9356843037beca1e9be917922bd676` (6 October 2026).

## Scope and evidence

The existing cinematic homepage, its sections, styling, login/signup modal and
`/3d` route remain. Delivery, intraday, futures/options, stock details, order
tickets, portfolio exits, watchlists, news, analytics and mentor routes remain.
Cleanup does not alter backend execution, quote freshness or financial rules.

The audit resolved static imports, re-exports and dynamic imports with the
installed TypeScript compiler, including the `@/` alias. App Router files are
runtime entry points; unit tests are checked separately. Repository-wide
references, CSS URLs and public asset names were also inspected. After cleanup,
all 98 TypeScript/TSX source modules outside tests are reachable from application entry points;
there are no orphan modules or test-only implementation modules.

Removed:

- Seven unreferenced components: the old mesh background, market news widget,
  market index card, market movers table, feed banner, confirmation modal and
  option-chain desk. Current routes use the landing canvas, dashboard/News Desk,
  market status widgets, stock ticket and F&O exploration components instead.
- The unused order schema and `cn` utility, a two-line homepage wrapper, and the
  retired terminal keyboard resolver with its seven obsolete tests. These twelve
  files contained 2,610 lines. Working search and shortcut-guide handlers remain.
- Five unused Next.js starter SVGs. The public asset directory is retained for
  the Docker copy step.
- Terminal-only Zustand product, timeframe, indicator, drawer and watchlist
  fields/actions. The chart retains its own working indicator settings; shared
  selected-symbol state still drives subscriptions and search.
- Six unused direct dependencies: `@hookform/resolvers`, `react-hook-form`,
  `class-variance-authority`, `clsx`, `tailwind-merge` and `zod`. Some remain
  transitive tooling dependencies. Query devtools are development dependencies.
  Retained package versions were not upgraded.
- The IPO tab, which had no feed or implementation and displayed only an
  unavailable-data placeholder. News and the verified holiday calendar remain.

The old Go schema-bootstrap helper is now test-only; upgrade regression tests
and startup comparisons retain it. `go mod tidy` correctly marks `x/sync`, used
by the on-demand instrument finder, as direct. Required schema upgrade and index
creation code remains in production.

## Runtime changes

`QueryProvider` now wraps the trading layout instead of every public page.
Homepage, information and auth pages no longer initialize the trading query
client. The cache remains shared across trading routes, including the market
provider, account widgets, modals and all query consumers. This follows the
[Next.js guidance on provider scope](https://nextjs.org/docs/app/getting-started/server-and-client-components#context-providers).

The dashboard requests the holiday calendar when its tab is opened. News and
ingestion-status polling are disabled while that panel shows the calendar.
Existing query caching and background-tab behavior remain in effect.

Old `/trade` and `/terminal` links now redirect to `/stocks`; `/trade` previously
redirected to the deleted terminal route. No terminal screen is reintroduced.

TypeScript now enforces `noUnusedLocals` and `noUnusedParameters` in the existing
type-check and build gates. These catch unused local symbols, not every exported
module or dependency; repeat the import-graph audit before future feature removal.

## Homepage comparison

Measured with the existing `npm run measure:home` script against production
builds, in three cold browser contexts per build: mobile 390×844, reduced motion,
4× CPU throttling, 1.6 Mbps download and 150 ms latency. Node 24.19.0 and Chromium
153.0.8010.12; local Linux environment. The script collects initial navigation
and deferred canvas requests after its settling period; it does not open auth.

| Navigation measurement | Main baseline | Cleanup |
| --- | ---: | ---: |
| Encoded JavaScript, median | 171,174 bytes (167.2 KiB) | 162,271 bytes (158.5 KiB) |
| JavaScript requests, median | 12 | 11 |
| LCP, median of three samples | 2,584 ms | 2,832 ms |
| CLS, all samples | 0 | 0 |
| Private account requests, all samples | 0 | 0 |
| Mobile horizontal overflow | None | None |

Median JavaScript downloaded fell by 5.2%. Cleanup samples reported
10–11 JavaScript requests and 161,117–162,271 bytes within the measurement
window; the table reports their medians. The three-sample LCP median increased,
so this run does **not** demonstrate a load-time improvement. Baseline LCP ranged
from 2,224–3,316 ms and cleanup from 2,336–3,776 ms. Repeated matched measurements
and deployed field data are needed to assess load time and interaction smoothness.

Raw results: [main baseline](performance/cleanup-homepage-before.json) and
[cleanup](performance/cleanup-homepage-after.json).

These are local lab observations, not Fedora/production-host measurements, a
field INP result, or proof of open-market order latency. Deleting modules that
were already unreachable mainly improves maintenance and dependency hygiene;
the smaller public-page JavaScript is attributable to route-scoped providers.

Reproduce for each checkout and retain separate output directories:

```bash
cd frontend
npm ci
npm run build
npm run measure:home -- /tmp/stock-simulator-homepage-measurements
```

## Validation

Frontend lint, strict type checking and all 79 retained unit tests pass. Seven
tests were removed with the unused terminal resolver. Production browser checks
cover homepage rendering without JavaScript, deferred auth, public-page network
isolation, stock/F&O orders, portfolio exits, refreshed auth, data availability,
calendar loading and legacy redirects.

Go formatting, vet and local tests pass. Local PostgreSQL/Redis-dependent tests
skip without disposable services; the PR's existing CI runs integration tests,
accounting race checks and startup benchmarks against its disposable services.

## Next optimizations to measure

1. **Measure the deployed mobile experience.** Collect LCP, INP and CLS from real
   navigation and interactions, and profile stock selection, ticket opening and
   portfolio scrolling. Target the 75th percentile: LCP ≤2.5 seconds, INP ≤200 ms
   and CLS ≤0.1. Three local samples do not establish those field results.
   [Core Web Vitals guidance](https://web.dev/articles/vitals)
2. **Ship a smaller Docker runtime.** The current frontend image copies the
   entire build-time `node_modules` tree. Use Next.js standalone output with the
   traced server dependencies, public assets and `.next/static`; verify the
   container startup and route smoke tests. This targets image size, deployment
   and startup costs; it is not a browser-download claim.
   [Next.js output tracing](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)
3. **Profile polling alongside WebSocket traffic.** Dashboard and Stocks still
   have five-second REST refreshes. Measure endpoint counts and render work, then
   slow redundant display polling when the market socket is healthy or the
   market is closed. Restore bounded fallback refreshes on disconnect and
   refetch after order/account mutations. Preserve backend executable-price
   freshness and authoritative wallet/order validation.
4. **Recheck the actual database round trip.** Run the existing `profile-db`
   command on Fedora and the production host. If warm `SELECT 1` and ping are
   still slow, investigate API/database region and transport before adding more
   indexes. Use query plans and pool-wait deltas for database-work evidence.
   [Database profiling guide](backend-startup-performance.md)

Do not remove a working product route based only on missing navigation links.
Avoid adding another animation, query or caching framework until measurements
identify a problem that the current stack cannot solve.
