# Original UI, faster rendering and market updates

The branch keeps the user's original dark, gradient and spatial 3D homepage. The hero, glass navigation, ticker, holographic wallet/chart, showcase, steps, feature cards, trader-story cards, CTA and footer retain their visual arrangement. Stocks, F&O cards and order tickets also retain their original layout, colors and surfaces. The prior replacement homepage and mobile sheet redesign have been removed.

This builds on main at `be21004b6e027e832292aed2f0c524efb72d7f60`, including PR #18's correctness fixes.

## What changed under the UI

- `/` serves the original static content immediately, without waiting for JavaScript or a local-storage authentication check. The large landing markup is a Server Component passed into a small interactive wrapper.
- The original login/register modal loads only when opened. Links work without JavaScript; signed-in visitors can continue to `/dashboard`. Login/signup lead to the separate authenticated dashboard.
- Mouse movement and scroll no longer rerender the landing page, its cards or text. A single animation-frame update changes CSS variables for the same parallax, tilt and glare effects. Navbar section highlighting updates independently.
- Decorative particle work starts after idle, retains 400 desktop particles and uses 100 on mobile. The login modal uses fewer particles on mobile and 30 fps. Hidden tabs stop canvas scheduling; reduced-motion preferences render a still field. Off-screen CSS animations pause. A static star field appears before the deferred canvas is ready.
- The original global glass surfaces, background mesh and mobile navigation remain. Mobile links disable unnecessary route prefetching. Existing self-hosted Next fonts remain; the unused remote Google Fonts CSS import is removed.
- Search/shortcut dialogs load when needed; private watchlist requests require authentication and visible search. Stock charts and F&O tickets load on demand. The public homepage starts no private account requests or market socket.
- One market socket survives trading navigation. Subscription deltas unsubscribe before subscribing at the cap; reconnects replay current targets. Selected and visible instruments take priority over a large watchlist.
- Concurrent display quote requests share pending symbols and publish one store update per response. Older REST responses cannot overwrite newer stream ticks. Display quote caching lasts 10 seconds; instrument display metadata refreshes after 60 seconds and accepts an empty refreshed master.
- Backend session, executable-price, funds and execution validation remain authoritative. Quote availability, authentication recovery and duplicate-order submission locks remain intact.

Copy corrections keep illustrative prices/trader stories labeled as samples, remove unmeasured `24ms` / `Sub-50ms` claims, use the NSE equity / NFO derivative scope, and connect footer links to working pages. These do not change the visual design.

## Fresh comparison of the same homepage design

| Metric (median of three runs) | Original main | Optimized original UI |
| --- | ---: | ---: |
| LCP | 3.032 s | 1.692 s |
| FCP | 1.248 s | 1.692 s |
| CLS | 0 | 0 |
| Encoded JavaScript bytes | 349,516 | 171,174 |
| JavaScript requests | 23 | 12 |
| Private API requests | 1 | 0 |

The baseline's first paint is its authentication loading screen; the optimized page's first paint already contains the homepage. Useful main content appears earlier, and JavaScript downloads decrease by approximately 51%. These results replace the previous benchmark of the replacement UI.

Both production builds were freshly measured sequentially with the same Chromium headless-shell 153.0.8010.0 and Node v24.19.0. Each had three cold anonymous browser contexts at 390 × 844, device scale 1, reduced motion, 4× CPU, 200,000 bytes/s download (~1.6 Mbps), 93,750 bytes/s upload and 150 ms latency. The server was warmed by a startup probe; API responses were fixed empty fixtures. Measurements precede screenshot scrolling. These are local lab observations, not deployed-site, physical-phone or field INP measurements.

Raw samples: [homepage-lab-results.json](performance/homepage-lab-results.json). Repeat with:

```sh
cd frontend
npm ci
npx playwright install chromium
npm run build
npm run measure:home
```

The script writes to `frontend/artifacts/performance/` (ignored by Git). Supply a directory after `--` to change it. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` optionally selects an installed Chromium executable. Port 3100 must be free.

## Validation

Lint, TypeScript, production build and 86 unit tests pass. All 35 browser cases pass across the full suite and targeted reruns. Checks cover the original homepage without JavaScript, working footer links, lazy login/register, still particles with reduced motion, no public private requests/socket, authentication recovery, original mobile tickets, pending/uncertain order locks, one socket across navigation and reconnect replay. Normal-motion desktop parallax and tilt/glare were separately verified while capturing the desktop screenshot.

Field INP, production-host mobile measurements, open-market delivery/intraday/futures/options entry and exit with wallet/P&L, and the three-beginner usability check remain release acceptance tasks. Targets remain LCP ≤ 2.5 s, INP ≤ 200 ms and CLS ≤ 0.1. Backend/worker throughput is outside this homepage navigation benchmark.

## Review images

Trading screenshots contain sample fixtures, not live-session evidence.

- [Original-style homepage, desktop](screenshots/homepage-desktop.png)
- [Original-style homepage, mobile](screenshots/homepage-mobile.png)
- [Original stock desk, light](screenshots/stock-light.png) and [dark](screenshots/stock-dark.png)
- [Original mobile stock ticket](screenshots/stock-order-mobile.png)
- [Original mobile F&O ticket](screenshots/fno-order-mobile.png)
