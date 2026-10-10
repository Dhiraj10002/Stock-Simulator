// Capture the user's explicitly connected Android Chrome page. No emulation,
// throttling, auth entry, navigation or trading writes. Interact manually on phone.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { quoteTimingSummary } from "./profile-report.mjs";
import { startRenderTrace, stopRenderTrace } from "./render-trace.mjs";
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const endpoint = option("--cdp-url"), site = new URL(option("--url", "https://www.stock-simulator.in")).origin;
const seconds = Number(option("--seconds", "30"));
if (!endpoint || !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(endpoint)) throw new Error("Use --cdp-url http://127.0.0.1:9222 with a forwarded Android Chrome debugging port");
if (!Number.isFinite(seconds) || seconds < 5 || seconds > 60) throw new Error("--seconds must be 5–60");
const output = resolve(option("--output", "artifacts/real-mobile"));
const browser = await chromium.connectOverCDP(endpoint);
try {
  const pages = browser.contexts().flatMap(c => c.pages()).filter(p => { try { return new URL(p.url()).origin === site; } catch { return false; } });
  if (pages.length !== 1) throw new Error("Open exactly one target-site tab on the phone before capturing");
  const page = pages[0], cdp = await page.context().newCDPSession(page);
  mkdirSync(output, { recursive: true });
  await startRenderTrace(cdp);
  console.log(`Capturing ${seconds}s on connected device. Scroll, type in search and change chart timeframe manually; do not submit orders.`);
  await new Promise(resolve => setTimeout(resolve, seconds * 1000));
  const trace = await stopRenderTrace(cdp);
  writeFileSync(join(output, "render-trace.json"), trace.raw);
  const info = await page.evaluate(() => ({ userAgent: navigator.userAgent, width: innerWidth, height: innerHeight, quoteMetrics: window.__stocksimQuoteMetrics?.() || [] }));
  writeFileSync(join(output, "summary.json"), JSON.stringify({ mode: "connected device; no CPU/network emulation", seconds, quoteTimingSummary: quoteTimingSummary(info.quoteMetrics), path: new URL(page.url()).pathname, info, render: trace.summary, note: "Nested trace durations overlap; totals are not additive. GPU costs require inspection in Chrome Performance." }, null, 2));
  console.log(JSON.stringify(trace.summary));
  await cdp.detach();
} finally { await browser.close(); }
