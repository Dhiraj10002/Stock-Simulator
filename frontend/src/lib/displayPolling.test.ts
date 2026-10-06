import test from "node:test";
import assert from "node:assert/strict";
import { displayPollingInterval, sessionDisplayInterval, STREAM_FRESH_MS, STATUS_FRESH_MS, type DisplayPollingState } from "./displayPolling";
import { useMarketStore } from "@/stores/market-store";
import type { Quote } from "@/types";

const now = Date.now();
function state(): DisplayPollingState {
  return { connectionState: "connected", marketStatus: "OPEN", marketStatusReceivedAt: now, feedStatus: { feedProvider: "angel_one", feedState: "LIVE", isSynthetic: false }, subscribedSymbols: ["RELIANCE-EQ"], streamObservations: { RELIANCE: { receivedAt: now, quotedAt: now } } };
}
test("only fresh subscribed live stream observations suspend display polling", () => {
  assert.equal(displayPollingInterval(state(), ["reliance", "RELIANCE-EQ"], 10000, now), false);
  assert.equal(displayPollingInterval(state(), [], 10000, now), 10000);
  assert.equal(displayPollingInterval(state(), ["RELIANCE", "TCS"], 10000, now), 10000);
  assert.equal(displayPollingInterval({ ...state(), subscribedSymbols: [] }, ["RELIANCE"], 10000, now), 10000);
  assert.equal(displayPollingInterval({ ...state(), streamObservations: {} }, ["RELIANCE"], 10000, now), 10000);
});
test("silent stalls, stale exchange timestamps, invalid/future times and stale status restore fallback", () => {
  for (const observation of [
    { receivedAt: now - STREAM_FRESH_MS, quotedAt: now },
    { receivedAt: now, quotedAt: now - STREAM_FRESH_MS },
    { receivedAt: now, quotedAt: now + 5001 },
    { receivedAt: NaN, quotedAt: now },
  ]) assert.equal(displayPollingInterval({ ...state(), streamObservations: { RELIANCE: observation } }, ["RELIANCE"], 10000, now), 10000);
  for (const stamp of [null, now - STATUS_FRESH_MS, NaN]) assert.equal(displayPollingInterval({ ...state(), marketStatusReceivedAt: stamp }, ["RELIANCE"], 10000, now), 10000);
});
test("disconnected, synthetic, degraded and pre-open feeds continue REST polling", () => {
  assert.equal(displayPollingInterval({ ...state(), connectionState: "disconnected" }, ["RELIANCE"], 10000, now), 10000);
  assert.equal(displayPollingInterval({ ...state(), marketStatus: "PRE_OPEN" }, ["RELIANCE"], 10000, now), 10000);
  for (const feedStatus of [{ ...state().feedStatus, isSynthetic: true }, { ...state().feedStatus, feedState: "UNAVAILABLE" as const }, { ...state().feedStatus, feedProvider: "synthetic" as const }]) assert.equal(displayPollingInterval({ ...state(), feedStatus }, ["RELIANCE"], 10000, now), 10000);
});
test("confirmed closed sessions slow display and aggregates; unknown/stale status keeps normal cadence", () => {
  const closed = { ...state(), marketStatus: "CLOSED" as const };
  assert.equal(displayPollingInterval(closed, ["RELIANCE"], 10000, now), 60000);
  assert.equal(sessionDisplayInterval(closed, 5000, now), 60000);
  assert.equal(sessionDisplayInterval(state(), 5000, now), 5000);
  assert.equal(sessionDisplayInterval({ ...state(), marketStatus: "POST_MARKET" }, 5000, now), 5000);
  assert.equal(displayPollingInterval({ ...state(), marketStatus: "POST_MARKET" }, ["RELIANCE"], 10000, now), 10000);
  assert.equal(sessionDisplayInterval({ ...closed, marketStatusReceivedAt: null }, 5000, now), 5000);
  assert.equal(displayPollingInterval({ ...closed, marketStatusReceivedAt: now - STATUS_FRESH_MS }, ["RELIANCE"], 10000, now), 10000);
});
test("REST merges never prove stream health; disconnect and unsubscription discard observations", () => {
  const store = useMarketStore.getState();
  store.setConnectionState("disconnected");
  store.setSubscribedSymbols(["RELIANCE-EQ"]);
  const quote: Quote = { symbol: "RELIANCE-EQ", price_paise: 10000, updated_at: new Date().toISOString(), source: "angelone_live" };
  store.mergeQuotes({ [quote.symbol]: quote });
  assert.deepEqual(useMarketStore.getState().streamObservations, {});
  store.updateStreamQuote({ ...quote });
  assert.ok(useMarketStore.getState().streamObservations.RELIANCE);
  store.setSubscribedSymbols([]);
  assert.deepEqual(useMarketStore.getState().streamObservations, {});
  store.setSubscribedSymbols(["RELIANCE-EQ"]);
  store.updateStreamQuote({ ...quote });
  store.setConnectionState("disconnected");
  assert.deepEqual(useMarketStore.getState().streamObservations, {});
});
test("stale, malformed, synthetic and out-of-order socket quotes cannot suppress REST", () => {
  const store = useMarketStore.getState();
  const quote: Quote = { symbol: "TCS-EQ", price_paise: 10000, updated_at: new Date().toISOString(), source: "angelone_live" };
  for (const bad of [{ ...quote, price_paise: 0 }, { ...quote, is_quote_stale: true }, { ...quote, source: "synthetic_gbm" }, { ...quote, updated_at: "invalid" }, { ...quote, updated_at: new Date(Date.now() - 20000).toISOString() }, { ...quote, updated_at: new Date(Date.now() + 10000).toISOString() }]) {
    store.setQuotes({});
    store.updateStreamQuote(bad);
    assert.equal(useMarketStore.getState().streamObservations.TCS, undefined);
  }
  store.setQuotes({ [quote.symbol]: quote });
  store.updateStreamQuote({ ...quote, updated_at: new Date(Date.now() - 10000).toISOString() });
  assert.equal(useMarketStore.getState().streamObservations.TCS, undefined);
});
