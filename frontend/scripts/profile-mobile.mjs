// Read-only browser lab profiling. Scripted Event Timing samples are not field INP.
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { accountObservation, reportPath, summarizeTimings } from "./profile-report.mjs";

const defaultFrontend = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const frontend = resolve(option("--app-dir", defaultFrontend));
const desktop = option("--device", "mobile") === "desktop";
const accountWindow = Number(option("--account-window", "0"));
if (!Number.isFinite(accountWindow) || accountWindow < 0 || accountWindow > 120) throw new Error("--account-window must be 0–120 seconds");
const remote = option("--url");
const origin = new URL(remote || "http://127.0.0.1:3100").origin;
const output = resolve(option("--output", join(frontend, "artifacts/mobile")));
const paths = option("--paths", "/,/login").split(",");
const repeats = Number(option("--runs", "3"));
const storageState = option("--storage-state");
const requireAccount = args.includes("--require-account");
if (requireAccount && (!storageState || !accountWindow)) throw new Error("--require-account needs --storage-state and --account-window");
const modes = option("--motion", "no-preference,reduce").split(",");
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
if (!Number.isInteger(repeats) || repeats < 1 || repeats > 10) throw new Error("--runs must be 1–10");
if (paths.some(path => !path.startsWith("/") || path.startsWith("//") || /[?#]/.test(path))) throw new Error("Use same-origin paths without query strings");
if (modes.some(mode => !["reduce", "no-preference"].includes(mode))) throw new Error("Invalid --motion preference");

async function main() {
  mkdirSync(output, { recursive: true });
  let server, browser;
  const stop = () => server?.kill();
  process.on("exit", stop);
  try {
    if (!remote) {
      server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3100"], { cwd: frontend, stdio: "ignore" });
      let ready = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        try { if ((await fetch(origin)).ok) { ready = true; break; } } catch { /* Wait for production build. */ }
        await pause(100);
      }
      if (!ready) throw new Error("Run npm run build before local profiling");
    }
    browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ["--no-sandbox", "--disable-gpu", "--no-zygote"] } : {});
    const runs = [];
    for (const path of paths) for (const reducedMotion of modes) for (let repeat = 0; repeat < repeats; repeat++) {
      const context = await browser.newContext({ viewport: desktop ? { width: 1440, height: 900 } : { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: !desktop, hasTouch: !desktop, reducedMotion, ...(storageState ? { storageState } : {}) });
      try {
        const page = await context.newPage(), requests = [], failures = [], preflights = [], apiTimings = [], accountStreams = [];
        const requestData = new WeakMap();
        const sockets = { connections: 0, receivedFrames: 0, closed: 0 };
        let pageErrors = 0;
        page.on("pageerror", () => pageErrors++);
        page.on("request", req => {
          const entry = { path: reportPath(req.url()), method: req.method(), status: null };
          requests.push(entry);
          requestData.set(req, { entry, start: performance.now() });
        });
        page.on("requestfailed", req => failures.push({ path: reportPath(req.url()), kind: "network" }));
        page.on("response", response => {
          const path = reportPath(response.url());
          const record = requestData.get(response.request());
          if (record) record.entry.status = response.status();
          if (path === "/api/backend/account/events") accountStreams.push({ status: response.status(), contentType: response.headers()["content-type"] || "", firstResponseMs: record ? performance.now() - record.start : null });
          if (response.status() >= 400) failures.push({ path, status: response.status() });
        });
        page.on("requestfinished", req => {
          const record = requestData.get(req);
          if (record && /^\/api\/(v1|backend)\//.test(record.entry.path) && record.entry.path !== "/api/backend/account/events") apiTimings.push({ ...record.entry, durationMs: performance.now() - record.start });
        });
        page.on("websocket", socket => {
          sockets.connections++;
          socket.on("framereceived", () => sockets.receivedFrames++);
          socket.on("close", () => sockets.closed++);
        });
        // Only local public-page comparisons use fixed fixtures. Remote measurements
        // reach the actual deployed services; no account writes or order submissions.
        if (!remote && !storageState) await page.route("**/api/v1/**", route => route.fulfill({ json: { success: true, data: [] } }));
        await page.addInitScript(() => {
          window.__mobileLab = { lcpMs: null, cls: 0, longTasks: [], events: [] };
          new PerformanceObserver(list => { for (const entry of list.getEntries()) window.__mobileLab.lcpMs = entry.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
          new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__mobileLab.cls += entry.value; }).observe({ type: "layout-shift", buffered: true });
          new PerformanceObserver(list => { for (const entry of list.getEntries()) window.__mobileLab.longTasks.push(entry.duration); }).observe({ type: "longtask", buffered: true });
          const collect = list => { for (const entry of list.getEntries()) if (entry.interactionId) window.__mobileLab.events.push({ name: entry.name, durationMs: entry.duration, inputDelayMs: entry.processingStart - entry.startTime }); };
          new PerformanceObserver(collect).observe({ type: "event", buffered: true, durationThreshold: 16 });
          new PerformanceObserver(collect).observe({ type: "first-input", buffered: true });
        });
        const cdp = await context.newCDPSession(page);
        await cdp.send("Network.enable");
        await cdp.send("Performance.enable");
        cdp.on("Network.requestWillBeSent", event => {
          if (event.request.method === "OPTIONS") preflights.push({ path: reportPath(event.request.url) });
        });
        await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 93750 });
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: desktop ? 1 : 4 });
        const response = await page.goto(origin + path, { waitUntil: "load", timeout: 60000 });
        await page.waitForTimeout(3500);
        let authenticated = false;
        if (storageState) {
          const session = await context.request.get(origin + "/api/backend/auth/me", { maxRedirects: 0, timeout: 15000 });
          authenticated = session.status() === 200 && (await session.json().catch(() => null))?.success === true;
          await session.dispose();
        }
        if (requireAccount && !authenticated) throw new Error("Account profile blocked: sign in and export a fresh private storage state; no polling result was accepted");
        const navigation = await page.evaluate(() => {
          const js = performance.getEntriesByType("resource").filter(entry => /\.js(?:\?|$)/.test(entry.name));
          return { lcpMs: window.__mobileLab.lcpMs, cls: window.__mobileLab.cls, fcpMs: performance.getEntriesByType("paint").find(entry => entry.name === "first-contentful-paint")?.startTime ?? null, ttfbMs: performance.getEntriesByType("navigation")[0]?.responseStart ?? null, jsBytes: js.reduce((sum, entry) => sum + entry.encodedBodySize, 0), jsRequests: js.length, overflow: document.documentElement.scrollWidth > innerWidth };
        });
        const interactions = [];
        const activate = locator => desktop ? locator.click() : locator.tap();
        if (new URL(page.url()).pathname === "/") {
          const preview = page.locator('a[href="#platform"]:visible').first();
          if (await preview.isVisible()) { await activate(preview); interactions.push("Platform preview anchor"); }
        } else if (new URL(page.url()).pathname === "/login") {
          const email = page.locator('input[type="email"]');
          if (await email.isVisible()) { await activate(email); await email.pressSequentially("profile@example.com", { delay: 40 }); interactions.push("Focus and type email; no submit"); }
        } else if (/^\/stocks\/[^/]+$/.test(new URL(page.url()).pathname)) {
          const timeframe = page.getByRole("button", { name: "1D", exact: true });
          if (await timeframe.isVisible()) { await activate(timeframe); interactions.push("Chart timeframe; no order submission"); }
        }
        await page.waitForTimeout(1500);
        const accountStart = requests.length;
        const observationStarted = Date.now();
        const beforeMetrics = await cdp.send("Performance.getMetrics");
        if (accountWindow) await page.waitForTimeout(accountWindow * 1000);
        const afterMetrics = await cdp.send("Performance.getMetrics");
        const metrics = new Map(afterMetrics.metrics.map(item => [item.name, item.value]));
        const prior = new Map(beforeMetrics.metrics.map(item => [item.name, item.value]));
        const account = accountObservation(requests.slice(accountStart), accountWindow ? (Date.now() - observationStarted) / 1000 : 0, authenticated);
        const cpu = { scriptSeconds: (metrics.get("ScriptDuration") || 0) - (prior.get("ScriptDuration") || 0), taskSeconds: (metrics.get("TaskDuration") || 0) - (prior.get("TaskDuration") || 0), heapBytes: metrics.get("JSHeapUsedSize") };
        const interactionLab = await page.evaluate(() => ({ ...window.__mobileLab, overflow: document.documentElement.scrollWidth > innerWidth }));
        const apiSummary = Object.fromEntries([...new Set(apiTimings.map(item => item.path))].sort().map(path => [path, summarizeTimings(apiTimings.filter(item => item.path === path && item.status >= 200 && item.status < 300).map(item => item.durationMs))]));
        const run = { path, finalPath: new URL(page.url()).pathname, reducedMotion, repeat: repeat + 1, status: response?.status(), navigation, interactions, interactionLab, accountObservation: account, accountStreams, apiTimings, apiSummary, sockets, cpu, preflights, requests, failures, pageErrors };
        runs.push(run);
        if (repeat === 0) await page.screenshot({ path: join(output, `${path.replace(/[^a-z0-9]/gi, "_") || "home"}-${reducedMotion}.png`) });
        console.log(JSON.stringify({ path, reducedMotion, repeat: repeat + 1, ...navigation, pageErrors, failures: failures.length }));
      } finally { await context.close(); }
    }
    const result = { mode: remote ? "deployed browser lab; real APIs" : "local production browser lab; public API fixtures", origin, conditions: `${desktop ? "1440x900 desktop, CPU 1x" : "390x844 touch, CPU 4x"}, 1.6 Mbps download, 150 ms latency; cold contexts. Event Timing samples are scripted, not field INP. Redirects recorded. No writes submitted.`, device: desktop ? "desktop" : "mobile", accountWindow, browser: browser.version(), node: process.version, runs };
    writeFileSync(join(output, "mobile.json"), JSON.stringify(result, null, 2) + "\n");
  } finally { await browser?.close(); stop(); process.removeListener("exit", stop); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
