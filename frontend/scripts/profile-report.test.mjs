import assert from "node:assert/strict";
import test from "node:test";
import { accountObservation, reportPath, summarizeTimings } from "./profile-report.mjs";

test("anonymous or zero-duration observations cannot masquerade as polling savings", () => {
  assert.equal(accountObservation([], 60, false).count, null);
  assert.equal(accountObservation([], 60, false).status, "not_measured");
  assert.equal(accountObservation([], 0, true).status, "not_measured");
});
test("account rates exclude public quotes and stream renewals but retain failed account requests", () => {
  const result = accountObservation([
    { path: "/api/backend/wallet", status: 200 },
    { path: "/api/backend/portfolio", status: 401 },
    { path: "/api/backend/account/events", status: 200 },
    { path: "/api/v1/market/quotes/batch", status: 200 },
  ], 30, true);
  assert.equal(result.count, 2);
  assert.equal(result.requestsPerMinute, 4);
  assert.equal(result.byPath["/api/backend/portfolio"], 1);
});
test("report paths omit query strings, origin credentials and private identifiers", () => {
  assert.equal(reportPath("https://user:secret@example.com/api/backend/orders/01234567-89ab-cdef-0123-456789abcdef?token=secret"), "/api/backend/orders/:id");
});
test("timing summaries retain missing evidence instead of reporting zero latency", () => {
  assert.deepEqual(summarizeTimings([NaN, Infinity]), { samples: 0, p50Ms: null, p95Ms: null });
  assert.deepEqual(summarizeTimings([400, 200, 300]), { samples: 3, p50Ms: 300, p95Ms: 400 });
});
