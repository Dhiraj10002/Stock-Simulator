// Read-only browser lab profiling. Scripted Event Timing samples are not field INP.
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const frontend = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const remote = option("--url");
const origin = new URL(remote || "http://127.0.0.1:3100").origin;
const output = resolve(option("--output", join(frontend, "artifacts/mobile")));
const paths = option("--paths", "/,/login").split(",");
const repeats = Number(option("--runs", "3"));
const storageState = option("--storage-state");
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
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion, ...(storageState ? { storageState } : {}) });
      try {
        const page = await context.newPage(), requests = [], failures = [];
        let pageErrors = 0;
        page.on("pageerror", () => pageErrors++);
        page.on("request", req => requests.push({ path: new URL(req.url()).pathname, method: req.method() }));
        page.on("requestfailed", req => failures.push({ path: new URL(req.url()).pathname, kind: "network" }));
        page.on("response", response => { if (response.status() >= 400) failures.push({ path: new URL(response.url()).pathname, status: response.status() }); });
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
        await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 93750 });
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
        const response = await page.goto(origin + path, { waitUntil: "load", timeout: 60000 });
        await page.waitForTimeout(3500);
        const navigation = await page.evaluate(() => {
          const js = performance.getEntriesByType("resource").filter(entry => /\.js(?:\?|$)/.test(entry.name));
          return { lcpMs: window.__mobileLab.lcpMs, cls: window.__mobileLab.cls, fcpMs: performance.getEntriesByType("paint").find(entry => entry.name === "first-contentful-paint")?.startTime ?? null, ttfbMs: performance.getEntriesByType("navigation")[0]?.responseStart ?? null, jsBytes: js.reduce((sum, entry) => sum + entry.encodedBodySize, 0), jsRequests: js.length, overflow: document.documentElement.scrollWidth > innerWidth };
        });
        const interactions = [];
        if (new URL(page.url()).pathname === "/") {
          const preview = page.locator('a[href="#platform"]:visible').first();
          if (await preview.isVisible()) { await preview.tap(); interactions.push("Platform preview anchor"); }
        } else if (new URL(page.url()).pathname === "/login") {
          const email = page.locator('input[type="email"]');
          if (await email.isVisible()) { await email.tap(); await email.pressSequentially("profile@example.com", { delay: 40 }); interactions.push("Focus and type email; no submit"); }
        } else if (/^\/stocks\/[^/]+$/.test(new URL(page.url()).pathname)) {
          const timeframe = page.getByRole("button", { name: "1D", exact: true });
          if (await timeframe.isVisible()) { await timeframe.tap(); interactions.push("Chart timeframe; no order submission"); }
        }
        await page.waitForTimeout(1500);
        const interactionLab = await page.evaluate(() => ({ ...window.__mobileLab, overflow: document.documentElement.scrollWidth > innerWidth }));
        const run = { path, finalPath: new URL(page.url()).pathname, reducedMotion, repeat: repeat + 1, status: response?.status(), navigation, interactions, interactionLab, requests, failures, pageErrors };
        runs.push(run);
        if (repeat === 0) await page.screenshot({ path: join(output, `${path.replace(/[^a-z0-9]/gi, "_") || "home"}-${reducedMotion}.png`) });
        console.log(JSON.stringify({ path, reducedMotion, repeat: repeat + 1, ...navigation, pageErrors, failures: failures.length }));
      } finally { await context.close(); }
    }
    const result = { mode: remote ? "deployed browser lab; real APIs" : "local production browser lab; public API fixtures", origin, conditions: "390x844 touch, CPU 4x, 1.6 Mbps download, 150 ms latency; cold contexts. Event Timing samples are scripted, not field INP. Redirects recorded. No writes submitted.", browser: browser.version(), node: process.version, runs };
    writeFileSync(join(output, "mobile.json"), JSON.stringify(result, null, 2) + "\n");
  } finally { await browser?.close(); stop(); process.removeListener("exit", stop); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
