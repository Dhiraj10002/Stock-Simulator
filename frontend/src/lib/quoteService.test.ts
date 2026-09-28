import test from "node:test";
import assert from "node:assert/strict";
import { fetchBatchQuotes, getCachedQuote } from "./quoteService";
import { useMarketStore } from "@/stores/market-store";

test("missing batch quotes do not produce per-symbol requests and can recover later", async (t) => {
  let calls = 0;
  const fixture = {
    symbol: "TCS29SEP991940CE", price_paise: 740, change_paise: 0,
    change_percent: 0, volume: 0, source: "angelone_live", updated_at: new Date().toISOString(),
  };
  const mock = t.mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
    assert.ok(String(url).endsWith("/market/quotes/batch"));
    calls++;
    return Response.json({ success: true, data: calls === 1 ? {} : { [fixture.symbol]: fixture } });
  });
  assert.deepEqual(await fetchBatchQuotes([fixture.symbol, "MISSING", fixture.symbol]), {});
  assert.equal(calls, 1);
  const recovered = await fetchBatchQuotes([fixture.symbol]);
  assert.equal(recovered[fixture.symbol].price_paise, 740);
  assert.equal(calls, 2);
  assert.equal(getCachedQuote(fixture.symbol)?.price_paise, 740);
  mock.mock.restore();
});

test("stale store quotes do not prevent a fresh batch request", () => {
  useMarketStore.getState().updateQuote({
    symbol: "STALE_TEST", price_paise: 100, change_paise: 0, change_percent: 0,
    source: "angelone_live", updated_at: new Date(Date.now() - 60000).toISOString(),
  });
  assert.equal(getCachedQuote("STALE_TEST"), undefined);
});
