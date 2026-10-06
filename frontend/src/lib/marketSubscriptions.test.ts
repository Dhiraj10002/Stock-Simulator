import test from "node:test";
import assert from "node:assert/strict";
import { subscriptionTargets } from "./marketSubscriptions";
import { DEFAULT_BENCHMARK_SYMBOLS, MAX_CLIENT_SUBSCRIPTIONS } from "@/stores/market-store";

test("current instrument and visible screen keep subscriptions when a large watchlist fills the cap", () => {
  const targets = subscriptionTargets(Array.from({length: 100}, (_, i) => `WATCH_${i}`), [" tcs-eq ", "TCS-EQ"], "reliance-eq");
  assert.equal(targets.length, MAX_CLIENT_SUBSCRIPTIONS);
  assert.equal(new Set(targets).size, targets.length);
  for (const symbol of [...DEFAULT_BENCHMARK_SYMBOLS, "TCS-EQ", "RELIANCE-EQ"]) assert.ok(targets.includes(symbol));
});
