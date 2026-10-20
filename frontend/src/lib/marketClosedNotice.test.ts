import test from "node:test";
import assert from "node:assert/strict";
import { marketClosedNotice } from "./marketClosedNotice";

test("legacy holiday exits become a readable notice without inventing segment hours", () => {
  assert.equal(marketClosedNotice({ status: 400, code: "SQUAREOFF_FAILED", message: "market is closed for Dussehra; regular trading hours are Monday to Friday 09:15 to 15:30 IST" }),
    "Market is closed for Dussehra. Please try again during the next trading session.");
  assert.equal(marketClosedNotice({ status: 400, message: "market is closed on weekends; regular trading hours are Monday to Friday 09:15 to 15:30 IST" }),
    "Market is closed on weekends. Please try again during the next trading session.");
});

test("explicit market closure codes work without matching backend prose", () => {
  assert.equal(marketClosedNotice({ status: 422, code: "MARKET_CLOSED", message: "Trading paused for this exchange session" }),
    "This market segment is currently closed. Please try again during the next trading session.");
});

test("unrelated failures retain diagnostics even when their messages mention a closed market", () => {
  for (const diagnostic of [
    { status: 0, message: "market is closed" },
    { status: 401, code: "MARKET_CLOSED", message: "market is closed" },
    { status: 500, code: "SQUAREOFF_FAILED", message: "market is closed" },
    { status: 503, code: "MARKET_DATA_UNAVAILABLE", message: "market is closed" },
    { status: 400, code: "QUOTE_STALE", message: "market is closed" },
    { status: 400, code: "SQUAREOFF_FAILED", message: "Position is already closed" },
    { status: 400, code: "SQUAREOFF_FAILED", message: "Unable to verify whether market is closed" },
  ]) assert.equal(marketClosedNotice(diagnostic), null);
});
