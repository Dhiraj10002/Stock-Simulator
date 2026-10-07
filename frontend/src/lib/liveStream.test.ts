import test from "node:test";
import assert from "node:assert/strict";
import { coalesceQuote, reconnectDelay, type ObservedQuote } from "./liveStream";
import { useMarketStore } from "../stores/market-store";
import type { Quote } from "../types";
test("reconnect attempts spread and stop growing at 30s", () => {
  assert.equal(reconnectDelay(0, () => 0), 500);
  assert.equal(reconnectDelay(3, () => 1), 8000);
  assert.equal(reconnectDelay(30, () => 1), 30000);
});
test("100 ticks coalesce to newest symbols and one store notification", () => {
  const pending = new Map<string, ObservedQuote>(); const now = Date.now();
  for (let i = 0; i < 100; i++) coalesceQuote(pending, { symbol: i % 2 ? "TCS" : "RELIANCE", price_paise: 10000 + i, updated_at: new Date(now + i).toISOString(), source: "angelone_live", is_quote_stale: false } as Quote, now + i);
  coalesceQuote(pending, { ...pending.get("TCS")!.quote, price_paise: 1, updated_at: new Date(now - 1000).toISOString() }, now);
  assert.equal(pending.size, 2); assert.equal(pending.get("TCS")!.quote.price_paise, 10099);
  let notifications = 0; const unsubscribe = useMarketStore.subscribe(() => notifications++);
  useMarketStore.getState().updateStreamQuotes([...pending.values()]); unsubscribe();
  assert.equal(notifications, 1); assert.equal(useMarketStore.getState().quotes.TCS.price_paise, 10099);
});
