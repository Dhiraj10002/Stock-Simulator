import test from "node:test";
import assert from "node:assert/strict";
import { exitRetryKey, completeExitRetry } from "./exitRetry";
import { formatPaise } from "./format";

test("exit retry survives lost responses and changes only after a terminal result", () => {
  const entries = new Map<string, string>();
  const storage = {getItem: (k: string) => entries.get(k) ?? null, setItem: (k: string, v: string) => {entries.set(k, v);}, removeItem: (k: string) => {entries.delete(k);}};
  assert.equal(exitRetryKey(storage, "position-a", () => "first"), "first");
  assert.equal(exitRetryKey(storage, "position-a", () => "lost-response-retry"), "first");
  completeExitRetry(storage, "position-a", "PENDING");
  assert.equal(exitRetryKey(storage, "position-a", () => "reload"), "first");
  assert.equal(exitRetryKey(storage, "position-b", () => "other"), "other");
  completeExitRetry(storage, "position-a", "EXECUTED");
  assert.equal(exitRetryKey(storage, "position-a", () => "new-position-intent"), "new-position-intent");
});

test("unknown account values are distinct from a valid zero balance", () => {
  assert.equal(formatPaise(undefined), "Unavailable");
  assert.equal(formatPaise(null), "Unavailable");
  assert.equal(formatPaise(Number.NaN), "Unavailable");
  assert.equal(formatPaise(0), "₹0.00");
  assert.equal(formatPaise(-150), "-₹1.50");
});
