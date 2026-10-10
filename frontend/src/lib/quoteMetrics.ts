import type { Quote } from "@/types";
export type QuoteTiming = { received: number; receivedEpoch: number; snapshot: boolean; serverReceived?: number; serverSent?: number };
export type QuoteMetric = { kind: "first-display" | "first-live" | "render"; symbol: string; eventId?: string; atMs: number; receiveToCommitMs?: number; receiveToFrameMs?: number; workerToReceiveMs?: number; workerPrePublishMs?: number; redisToGoMs?: number; serverQueueMs?: number; snapshot?: boolean };
const samples: QuoteMetric[] = [];
const observed = new WeakMap<Quote, QuoteTiming>();
const measured = new WeakSet<Quote>();
const first = new Set<string>();
let enabled: boolean | undefined;
// Explicit opt-in before reload: sessionStorage.setItem('stocksim:quote-metrics','1').
// A bounded, local-only diagnostic buffer; no cookies/account details or outbound analytics.
export function quoteMetricsEnabled() {
  if (typeof window === "undefined") return false;
  if (enabled !== undefined) return enabled;
  try { enabled = sessionStorage.getItem("stocksim:quote-metrics") === "1"; } catch { enabled = false; }
  return enabled;
}
function record(metric: QuoteMetric) {
  samples.push(metric); if (samples.length > 256) samples.shift();
  if (typeof window !== "undefined") Object.assign(window, { __stocksimQuoteMetrics: () => samples.map(item => ({ ...item })) });
}
export function observeQuote(quote: Quote, timing: QuoteTiming) {
  if (quoteMetricsEnabled()) observed.set(quote, timing);
}
export function quoteCommitted(quote?: Quote) {
  if (!quoteMetricsEnabled() || !quote || quote.price_paise <= 0) return;
  const atMs = performance.now(), path = location.pathname;
  if (first.size > 1024) first.clear();
  const base = { symbol: quote.symbol, eventId: quote.market_event_id, atMs };
  const key = `${path}:${quote.symbol}`;
  if (!first.has(key)) { first.add(key); record({ ...base, kind: "first-display" }); }
  const timing = observed.get(quote);
  const fresh = quote.source === "angelone_live" && !quote.is_quote_stale && Date.now() - Date.parse(quote.updated_at) < 15_000;
  if (fresh && !first.has(`${key}:live`)) { first.add(`${key}:live`); record({ ...base, kind: "first-live", snapshot: timing?.snapshot }); }
  if (!timing || measured.has(quote)) return;
  measured.add(quote);
  const elapsed = (end?: number, start?: number) => end && start && end >= start ? end - start : undefined;
  const metric: QuoteMetric = {
    ...base, kind: "render", snapshot: timing.snapshot,
    receiveToCommitMs: atMs - timing.received,
    // Cross-host intervals require synchronized clocks. Snapshots are deliberately excluded.
    workerToReceiveMs: !timing.snapshot ? elapsed(timing.receivedEpoch, quote.worker_received_at_ms) : undefined,
    workerPrePublishMs: !timing.snapshot ? elapsed(quote.worker_publish_queued_at_ms, quote.worker_received_at_ms) : undefined,
    redisToGoMs: !timing.snapshot ? elapsed(timing.serverReceived, quote.worker_publish_queued_at_ms) : undefined,
    serverQueueMs: !timing.snapshot ? elapsed(timing.serverSent, timing.serverReceived) : undefined,
  };
  record(metric);
  requestAnimationFrame(() => { metric.receiveToFrameMs = performance.now() - timing.received; });
}
