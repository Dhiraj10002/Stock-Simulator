import test from "node:test";
import assert from "node:assert/strict";
import { aggregateCandles, historyRequest, quoteLabel } from "./marketData";

test("missing stream is not proof of synthetic history", () => {
  assert.equal(quoteLabel(undefined), "UNAVAILABLE");
  const quote = { symbol: "TEST", price_paise: 100, source: "angelone_live", updated_at: new Date(0).toISOString() };
  assert.equal(quoteLabel(quote, 130000), "LAST AVAILABLE");
  assert.equal(quoteLabel({ ...quote, source: "synthetic_gbm" }, 1000), "SIMULATED");
  assert.equal(quoteLabel({ ...quote, source: "synthetic_gbm" }, 130000), "LAST AVAILABLE");
  assert.equal(quoteLabel({ ...quote, updated_at: "invalid" }), "UNAVAILABLE");
});
test("hour and day controls request native intervals", () => {
  assert.equal(historyRequest("1H").interval, "ONE_HOUR");
  assert.equal(historyRequest("1D").interval, "ONE_DAY");
});
test("five-minute aggregation respects session anchor and preserves OHLC and volume", () => {
  const open = Date.parse("2026-09-16T09:15:00+05:30") / 1000;
  const bars = [0, 1, 5].map((offset, i) => ({ timestamp: open + offset * 60, open_paise: 100 + i, high_paise: 110 + i, low_paise: 90 + i, close_paise: 105 + i, volume: 10 }));
  const result = aggregateCandles(bars, "5m");
  assert.equal(result.length, 2);
  assert.equal(result[0].timestamp, open);
  assert.equal(result[0].high_paise, 111);
  assert.equal(result[0].close_paise, 106);
  assert.equal(result[0].volume, 20);
});
