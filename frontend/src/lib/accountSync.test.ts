import test from "node:test";
import assert from "node:assert/strict";
import { accountEventDecoder, accountPollingInterval, isAccountMutation, isAccountQuery } from "./accountSync";
test("account hints decode split UTF-8 chunks and bounded CRLF frames", () => {
  const events: unknown[] = [];
  const decode = accountEventDecoder(event => events.push(event));
  decode('data: {"kind":"ready","revision":"0"}\r');
  decode('\n\r\ndata: {"kind":"change",');
  decode('"revision":"00000000-0000-0000-0000-000000000001"}\n\n');
  assert.equal(events.length, 2);
  assert.throws(() => decode('data: {"kind":"ready","revision":"secret-token"}\n\n'));
  assert.throws(() => accountEventDecoder(() => {})("x".repeat(16_385)));
});
test("only the current account's queries reconcile and preview is read-only", () => {
  assert.equal(isAccountQuery(["wallet", "authoritative", "a"], "a"), true);
  assert.equal(isAccountQuery(["portfolio", "b"], "a"), false);
  assert.equal(isAccountQuery(["market-quotes", "a"], "a"), false);
  assert.equal(isAccountQuery(["wallet"], "a"), false);
  assert.equal(isAccountMutation("/orders/preview", "POST"), false);
  assert.equal(isAccountMutation("/orders", "POST"), true);
  assert.equal(isAccountMutation("/portfolio/positions/id/exit", "POST"), true);
  assert.equal(isAccountMutation("/wallet", "GET"), false);
  assert.equal(isAccountMutation("/watchlist", "POST"), false);
});
test("polling backs off only for a healthy private stream; positions preserve valuation cadence", () => {
  assert.equal(accountPollingInterval("", true), false);
  assert.equal(accountPollingInterval("account", false), 5000);
  assert.equal(accountPollingInterval("account", true), 30000);
  assert.equal(accountPollingInterval("account", true, true), 5000);
});
