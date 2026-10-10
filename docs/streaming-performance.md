# Streaming efficiency and verification

This release shares a single Redis quote subscription across browser connections in each Go handler/process, decodes each incoming event once and routes by exact subscribed symbol. Feed-status events broadcast to all connected clients. Per-client queues remain bounded at 256 events, with slow-client cancellation. The last disconnect releases the subscription; generation checks prevent a retiring reader from delivering to a newly connected cohort. Existing origin checks, subscription/message limits and quote provenance/freshness validation remain in place.

Display quote batches now use one feed-state read, pipelined primary/alias hashes and a grouped broker-demand update (chunks capped at 100). Cold instrument existence checks retain eight-worker concurrency. Missing live quotes request asynchronous broker subscriptions, never synthetic execution prices. Single-order executable reads and settlement validation continue through their authoritative paths. Initial WebSocket snapshots use the display batch, followed by strict stream validation, and carry `snapshot: true`.

The trading provider owns one 15-second NSE status interval; detail screens consume the same query. F&O owns a separate NFO interval, preserving segment bounds. Background status polling pauses; focus and socket reconnection reconcile status. Stock chart history reconciles every two minutes when its real stream is healthy, every five minutes with existing closed-session history, and every 30 seconds for missing/error/disconnected states. Reconnection and timeframe changes still refetch. This policy does not slow execution previews, wallet or portfolio accounting.

Stocks' individual cards subscribe to their symbols and receive immediate frame-coalesced updates. Only catalog rankings and sector summaries buffer updates for 500 ms, pausing while hidden. Detail/order quotes retain their immediate selectors. The existing appearance is preserved.

## Measurements collected

Machine-readable observations: [performance/streaming-lab-2026-10-10.json](performance/streaming-lab-2026-10-10.json).

- Disposable local Redis, 100 quotes, three one-second samples: legacy eight-worker reader 2.76–3.36 ms/batch; pipeline 0.53–0.57 ms/batch. Median approximately 5.7× faster, allocations 5,311 → 3,459. This excludes database metadata and Oracle/Upstash network latency.
- Local stock-detail production build, 390×844 viewport, CPU 4×, software rendering, fixture candles/quotes and burst updates: Two captures (22 and 21 rendered ticks) under parallel test load: receive-to-post-commit p50 15.2–18.2 ms, p95 31.6–59.1 ms, p99 32.8–106 ms; next-frame p95 54.1–135.8 ms. First displayed/fresh fixture quote appeared at 1.93–1.95 s after navigation. The variation requires controlled device repeats before drawing a frontend speed comparison. No real Angel One end-to-end latency was measured.
- One-run local homepage/login trace, 150 ms network emulation and CPU 4×: homepage LCP 1.19 s, login 2.78 s; both CLS 0. These traced lab runs are noisy and are not field p75 results or before/after comparisons.
- Chart trace maxima: FunctionCall 118 ms, Layout 42–54 ms, RasterTask 23 ms. Homepage/login raster maxima 35/50 ms. These identify categories to inspect, not proof that a particular blur or chart routine is the cause; nested durations overlap. Software rendering cannot establish phone GPU cost. Login loading and chart scripting remain useful profiling targets.
- Live public GETs confirmed robots and the seven-URL sitemap. Deployed Chromium profiling was blocked by this environment's network proxy/TLS trust; no deployed performance result is inferred from it.

## Opt-in quote diagnostics after deployment

1. In Oracle worker configuration, temporarily set `MARKET_TRACE_SAMPLE_RATE=0.01` (range 0–1; default 0 disables). Recreate the worker with the production compose file. The deployment example and compose service pass this variable through. No new secret is required.
2. In browser DevTools on the target site, run `sessionStorage.setItem('stocksim:quote-metrics', '1')`, then reload a trading route during an open market session.
3. Inspect/export `window.__stocksimQuoteMetrics?.()`. The buffer caps at 256 entries, is local-only, and includes no account tokens. Repeated rendering of the same quote object is deduplicated. The profiler emits p50/p95/p99 with sample counts; missing measurements remain null.
4. Distinguish first display (may be last-session data), first fresh real-source quote, cached WebSocket snapshots and streamed ticks. First markers are timestamps since document navigation; SPA routes share that navigation origin. These markers do not assert order eligibility or confirmed physical pixel presentation.
5. Browser receive → post-commit effect and next-animation-frame timings use the monotonic browser clock. The next-frame callback is a paint proxy, not guaranteed compositor presentation. Worker/API/browser epoch differences require synchronized clocks; negative differences are omitted and clock skew can still bias positive values. `worker_publish_queued_at_ms` is before acquiring the writer lock/pipeline execution, not confirmed Redis receipt. The Redis-to-Go interval includes queueing, network and decoding. Snapshot transport timings are excluded from streaming percentiles.
6. Disable the worker flag and remove the sessionStorage flag/reload after measurement. Sampling adds optional transport timestamps, without additional Redis round trips. Un-sampled writes clear old sampled hash fields. Exchange `updated_at` remains unchanged and authoritative for execution freshness.

## Capture an actual Android trace

Use a physical Android phone with Chrome, enable USB debugging and approve your own desktop. Follow [Chrome's remote-debugging guide](https://developer.chrome.com/docs/devtools/remote-debugging). Open exactly one Stock Simulator tab on the phone. Forward its debugging port:

```sh
adb forward tcp:9222 localabstract:chrome_devtools_remote
cd frontend
npm run profile:device -- --cdp-url http://127.0.0.1:9222 --url https://www.stock-simulator.in --seconds 30
```

The script attaches to that explicitly supplied loopback endpoint and captures the existing page. It applies no viewport/CPU/network emulation, navigation, login or trading writes. During capture, scroll the homepage, type in search or change chart timeframes manually. Capture each route separately; do not submit orders. Keep screencasting off while measuring, and keep raw traces/private session files out of git. Outputs go to ignored `artifacts/real-mobile/`. Open `render-trace.json` in Chrome Performance, inspect long-task call stacks, paint/raster layers and chart interactions, and compare identical scenarios before changing blur surfaces. Record phone model, thermal/battery state, browser version and network.

For repeatable lab captures:

```sh
npm run build
npm run profile:mobile -- --paths /,/login --runs 3 --motion no-preference,reduce --trace
# Normal network environment: deployed routes, no writes
npm run profile:mobile -- --url https://www.stock-simulator.in --paths /stocks,/stocks/RELIANCE,/options --runs 3 --trace
```

Raw trace capture is optional because tracing itself adds overhead. Physical-phone and real market-session measurements remain pending; this PR provides the tooling, not fabricated results.

## Rollout and search discovery

Deploy the Go backend and worker first, then the frontend. Optional timing fields and snapshot flags are backward compatible; diagnostics default off. Verify readiness, two-browser symbol isolation, last-client cleanup, reconnect replay, cold quote recovery, empty-history retry and open-market paper order/exit accounting. Compare API versions and NSE/NFO status calendars. Rollback uses the previous images/commit; no database migration is introduced.

Follow [seo-launch.md](seo-launch.md): verify the `stock-simulator.in` Domain property using Google's exact DNS TXT token, then submit `https://www.stock-simulator.in/sitemap.xml` in Search Console. Google account/DNS access was not available here, so ownership verification and submission have not been performed. Sitemap reachability does not guarantee indexing or ranking. [Google's ownership verification instructions](https://support.google.com/webmasters/answer/9008080).
