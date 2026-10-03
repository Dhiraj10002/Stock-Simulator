import test from "node:test";
import assert from "node:assert/strict";
import { dayMovement, valuationStatus, canTradeOption, feedLabel, breadthPercentages } from "./marketDisplay";
import type { Quote, Portfolio, OptionContract } from "../types";

test("unknown daily movement differs from valid zero", () => {
  const q = { change_paise: 0, change_percent: 0, day_change_available: false } as Quote;
  assert.equal(dayMovement(q), undefined);
  assert.deepEqual(dayMovement({...q, day_change_available: true}), {change: 0, percent: 0});
});
test("partial portfolio values do not upgrade degraded status", () => {
  const p = {valuation_status: "DEGRADED", current_value_paise: 20000, positions: [{is_quote_available: true}]} as Portfolio;
  assert.equal(valuationStatus(p), "DEGRADED");
  assert.equal(valuationStatus({...p, valuation_status: "STALE"}), "STALE");
  assert.equal(valuationStatus(null), "DEGRADED");
});
test("cached option price is visible but stale/unavailable contracts cannot trade", () => {
  const c = {ltp_paise: 10000, is_available: true, is_quote_stale: false} as OptionContract;
  assert.equal(canTradeOption(c), true);
  assert.equal(canTradeOption({...c, is_quote_stale: true}), false);
  assert.equal(canTradeOption({...c, is_available: false}), false);
});

test("connected transport cannot claim live prices without a fresh exchange tick", () => {
  const now = Date.now();
  const state = {status: "OPEN", feed_provider: "angel_one", feed_state: "LIVE", is_synthetic: false};
  assert.equal(feedLabel(state, now), "Angel One · awaiting quotes");
  assert.equal(feedLabel({...state, last_tick: new Date(now - 300000).toISOString()}, now), "Angel One · delayed quotes");
  assert.equal(feedLabel({...state, status: "CLOSED"}, now), "Angel One · session closed");
  assert.equal(feedLabel({...state, last_tick: new Date(now).toISOString()}, now), "Angel One · live quotes");
  assert.equal(feedLabel(undefined), "Feed status unavailable");
  assert.equal(feedLabel({...state, feed_state: "UNAVAILABLE"}), "Feed unavailable");
});

test("missing breadth has no invented split and unchanged stocks remain neutral", () => {
  assert.equal(breadthPercentages({advances: 0, declines: 0, total: 0}), undefined);
  assert.deepEqual(breadthPercentages({advances: 2, declines: 1, total: 4}), {advances: 50, declines: 25});
  assert.deepEqual(breadthPercentages({advances: 0, declines: 0, total: 3}), {advances: 0, declines: 0});
});
