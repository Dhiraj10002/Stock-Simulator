# V1 UI and performance polish

This branch builds on `main` at `be21004b6e027e832292aed2f0c524efb72d7f60`, including the correctness fixes merged in PR #18. It keeps the existing Stocks / F&O discovery layout and adds targeted improvements for a beginner paper trader.

## Routes and screen hierarchy

| Screen | Result |
| --- | --- |
| `/` | Server-rendered public homepage with a clear virtual-money explanation, delivery / intraday / F&O cards, three steps, an actual application screenshot marked illustrative, and working About / Privacy / Terms links. |
| `/dashboard` | Separate signed-in practice account, virtual cash and available funds, valuation status, P&L, market status and Start trading action. Login and signup lead here. |
| Stocks and F&O | Shared card and panel styling; consistent spacing, readable numbers and explicit data availability. Glass overrides are limited to the `/3d` showcase. |
| Stock detail | Chart and order panel together on desktop; a keyboard-accessible order sheet and reachable action on mobile. Closing the sheet preserves inputs and submission locks. |
| F&O ticket | Expiry, canonical lot size and total quantity in the header; required funds, risk, review and submit in a fixed footer. Optional margin explanation stays collapsed. |
| Portfolio | Beginner product labels, valuation status and explicit Exit position actions. Missing or degraded dashboard valuation values remain unavailable. |

## Rendering and market updates

- Public pages have no market socket or private watchlist, wallet or portfolio request. Search and shortcut dialogs live in the trading layout and load when opened; watchlist requests require authentication.
- The homepage has no particle canvas or mouse-driven React updates. Reduced-motion preferences apply to animations. The existing `/3d` showcase remains separate.
- Stock charts and F&O dialogs load on the relevant screen or when needed. The below-fold homepage screenshot uses Next Image with explicit dimensions, responsive sizing and lazy loading.
- Existing Next font assets serve the UI and chart. The global remote CSS import for additional fonts was removed.
- A stable market connection survives trading-route navigation. Target changes send subscription deltas, unsubscribing before subscribing at the client cap; reconnects replay current targets. The selected instrument and active screen take priority over a large watchlist.
- Overlapping REST quote requests share pending symbols. One batch response produces one quote-store update. An older response cannot replace a newer stream tick, including the value returned to callers.
- Display quote caching lasts 10 seconds; instrument display metadata refreshes after 60 seconds, including an empty refreshed master. These caches do not supply executable prices. Backend session, funds, preview and execution validation remains authoritative.

## Homepage measurement

| Metric (median of 3 runs) | Previous main | This branch |
| --- | ---: | ---: |
| LCP | 3.124 s | 1.296 s |
| FCP | 1.300 s | 1.296 s |
| CLS | 0 | 0 |
| Encoded JavaScript bytes | 349,506 | 173,098 |
| JavaScript requests | 23 | 11 |
| Private API requests | 1 | 0 |

These are local laboratory navigation measurements, not deployed-site or physical-phone results. Each build ran three anonymous cold browser contexts at 390 × 844, device scale 1, reduced motion, 4× CPU throttling, 200,000 bytes/s download (~1.6 Mbps), 93,750 bytes/s upload and 150 ms latency. A production Next server was warmed by a startup probe; API responses were fixed empty fixtures. Browser: Chromium 153.0.8010.0; Node: v24.19.0. LCP and CLS were collected before scrolling; the screenshot preview was subsequently loaded for the review image.

Raw observations are in [homepage-lab-results.json](performance/homepage-lab-results.json). The final script is [measure-homepage.mjs](../frontend/scripts/measure-homepage.mjs); the baseline used the same navigation measurement procedure against the main commit above.

```sh
cd frontend
npm ci
npx playwright install chromium
npm run build
npm run measure:home
```

The report and mobile screenshot default to `frontend/artifacts/performance/` (ignored by Git). An output directory can be supplied after `--`. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` optionally selects an installed Chromium binary. The script starts a local production server on port 3100, which must be free.

## Validation and remaining acceptance checks

Local validation: lint, TypeScript and production build pass; 86 frontend unit tests and all 34 browser tests pass. Browser coverage includes a JavaScript-disabled homepage, no public market/private requests, preview image loading, login/dashboard/logout, quote and auth recovery, mobile sheet state/focus, F&O funds/metadata in the viewport, duplicate-order locks, one socket across trading navigation and reconnect subscription replay. Screenshot fixtures contain sample data; they are not market-session evidence.

Deployed targets remain LCP ≤ 2.5 s, INP ≤ 200 ms and CLS ≤ 0.1. Field INP and mobile production-host performance have not been measured. API/worker/backend throughput is also outside this navigation benchmark. Run an open-market session to check delivery, intraday, futures and options entry/exit, wallet and P&L with the configured provider before release. Ask three beginners to find a stock, place a paper order and exit a position without guidance; use that feedback to prioritize a later redesign.

## Review images

All screenshots use illustrative fixtures, including the stock detail screenshot served on the homepage.

- [Previous homepage implementation](https://github.com/Dhiraj10002/Stock-Simulator/blob/be21004b6e027e832292aed2f0c524efb72d7f60/frontend/src/components/landing/LandingPage.tsx)
- [New public homepage](screenshots/homepage-mobile.png)
- [Mobile stock order sheet](screenshots/stock-order-mobile.png)
- [Mobile F&O ticket](screenshots/fno-order-mobile.png)
- [Desktop stock detail and order panel](../frontend/public/platform-preview.png)
