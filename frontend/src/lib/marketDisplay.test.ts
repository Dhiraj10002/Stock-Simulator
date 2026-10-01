import test from "node:test";
import assert from "node:assert/strict";
import { dayMovement, valuationStatus, canTradeOption } from "./marketDisplay";
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
