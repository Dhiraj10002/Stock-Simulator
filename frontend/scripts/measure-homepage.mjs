// Lab navigation measurements only. This does not measure field INP or execution latency.
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
const frontend = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(process.argv[2] || join(frontend, "artifacts/performance"));
const origin = "http://127.0.0.1:3100";
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  mkdirSync(output, { recursive: true });
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3100"], { cwd: frontend, stdio: "ignore" });
  let browser;
  const stop = () => server.kill();
  process.on("exit", stop);
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(origin)).ok) { ready = true; break; } } catch { /* Wait for production server. */ }
      await pause(100);
    }
    if (!ready) throw new Error("Production server did not start; run npm run build first.");
    browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ["--no-sandbox", "--disable-gpu", "--no-zygote"] } : {});
    const runs = [];
    for (let i = 0; i < 3; i++) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, reducedMotion: "reduce" });
      try {
        const page = await context.newPage(), requests = [];
        page.on("request", request => requests.push(request.url()));
        // Hold API responses constant between builds; navigation is the measurement subject.
        await page.route("**/api/v1/**", route => route.fulfill({ headers: { "access-control-allow-origin": origin }, json: { success: true, data: [] } }));
        await page.addInitScript(() => {
          window.__lab = { lcp: 0, cls: 0 };
          new PerformanceObserver(list => { for (const entry of list.getEntries()) window.__lab.lcp = entry.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
          new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__lab.cls += entry.value; }).observe({ type: "layout-shift", buffered: true });
        });
        const cdp = await context.newCDPSession(page);
        await cdp.send("Network.enable");
        await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 93750 });
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
        await page.goto(origin);
        await page.waitForTimeout(3500);
        const run = await page.evaluate(() => {
          const resources = performance.getEntriesByType("resource").filter(entry => /\.js(?:\?|$)/.test(entry.name));
          return { ...window.__lab, jsBytes: resources.reduce((sum, entry) => sum + entry.encodedBodySize, 0), jsRequests: resources.length, fcp: performance.getEntriesByType("paint").find(entry => entry.name === "first-contentful-paint")?.startTime, h1: document.querySelector("h1")?.textContent, overflow: document.documentElement.scrollWidth > innerWidth };
        });
        runs.push({ ...run, privateRequests: requests.filter(url => /\/api\/v1\/(watchlist|wallet|portfolio)/.test(url)).length });
        if (i === 0) {
          // Load the below-fold preview for the review screenshot after collecting navigation metrics.
          const preview = page.getByRole("img", { name: /Stock Simulator stock details screen/ });
          if (await preview.count()) {
            await preview.scrollIntoViewIfNeeded();
            await preview.evaluate(image => image.decode());
            await page.evaluate(() => window.scrollTo(0, 0));
          }
          await page.screenshot({ path: join(output, "homepage-mobile.png"), fullPage: true });
        }
      } finally { await context.close(); }
    }
    const result = { conditions: "Local production build, mobile 390x844, CPU 4x, 1.6 Mbps download, 150 ms latency, cold browser contexts, 3 runs. Lab LCP/CLS, not field INP.", browser: browser.version(), node: process.version, runs };
    writeFileSync(join(output, "homepage.json"), JSON.stringify(result, null, 2) + "\n");
    console.log(JSON.stringify(result, null, 2));
  } finally {
    if (browser) await browser.close();
    server.kill();
    process.removeListener("exit", stop);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
