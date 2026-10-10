import test from "node:test";
import assert from "node:assert/strict";
import { historyPollingInterval } from "./historyPolling";
test("history slows only with data and a healthy stream; errors/missing data recover", () => {
  const base = { healthyStream: true, closed: false, missing: false, error: false };
  assert.equal(historyPollingInterval(base), 120000);
  assert.equal(historyPollingInterval({ ...base, healthyStream: false }), 30000);
  assert.equal(historyPollingInterval({ ...base, closed: true }), 300000);
  assert.equal(historyPollingInterval({ ...base, closed: true, missing: true }), 30000);
  assert.equal(historyPollingInterval({ ...base, error: true }), 30000);
});
