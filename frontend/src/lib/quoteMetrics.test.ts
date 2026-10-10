import test from "node:test";
import assert from "node:assert/strict";
import { observeQuote, quoteCommitted } from "./quoteMetrics";
import type { Quote } from "../types";
test("local quote diagnostics distinguish snapshots, unavailable data and sampled live renders; buffer stays bounded", t => {
  const frames: FrameRequestCallback[] = [];
  const prior = Object.fromEntries(["window", "sessionStorage", "location", "requestAnimationFrame"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const target: { __stocksimQuoteMetrics?: () => Record<string, unknown>[] } = {};
  Object.assign(globalThis, { window: target, sessionStorage: { getItem: () => "1" }, location: { pathname: "/stocks/TCS" }, requestAnimationFrame: (cb: FrameRequestCallback) => { frames.push(cb); return frames.length; } });
  t.after(() => { for (const [key, descriptor] of Object.entries(prior)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } });
  quoteCommitted({ symbol: "ZERO", price_paise: 0 } as Quote);
  assert.equal(target.__stocksimQuoteMetrics, undefined);
  const now = Date.now(), start = performance.now();
  const quote: Quote = { symbol: "TCS", price_paise: 100, source: "angelone_live", updated_at: new Date(now).toISOString(), market_event_id: "sample", worker_received_at_ms: now - 30, worker_publish_queued_at_ms: now - 20 };
  observeQuote(quote, { received: start, receivedEpoch: now, snapshot: false, serverReceived: now - 10, serverSent: now - 5 });
  quoteCommitted(quote);
  for (const cb of frames.splice(0)) cb(performance.now());
  const metrics = target.__stocksimQuoteMetrics!();
  assert.equal(metrics.filter(m => m.kind === "first-live").length, 1);
  const render = metrics.find(m => m.kind === "render")!;
  assert.equal(render.workerToReceiveMs, 30); assert.equal(render.redisToGoMs, 10); assert.equal(render.serverQueueMs, 5);
  assert.ok(Number(render.receiveToFrameMs) >= Number(render.receiveToCommitMs));
  const snapshot = { ...quote };
  observeQuote(snapshot, { received: performance.now(), receivedEpoch: now, snapshot: true });
  quoteCommitted(snapshot);
  assert.equal(target.__stocksimQuoteMetrics!().at(-1)!.workerToReceiveMs, undefined);
  for (let i=0;i<300;i++) {
    const next = { ...snapshot };
    observeQuote(next, { received: performance.now(), receivedEpoch: now, snapshot: true });
    quoteCommitted(next);
  }
  assert.equal(target.__stocksimQuoteMetrics!().length, 256);
});
