import test from "node:test";
import assert from "node:assert/strict";
import { fetchQuote, fetchBatchQuotes, getCachedQuote } from "./quoteService";
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

test("single symbol display retains a sourced last-session quote", async (t) => {
  const fixture = {symbol: "CLOSED_SESSION_TEST", price_paise: 12345, source: "angelone_live", updated_at: new Date(Date.now() - 86400000).toISOString(), is_quote_stale: true};
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
    assert.ok(String(url).endsWith("/market/quotes/CLOSED_SESSION_TEST?purpose=display"));
    return Response.json({success: true, data: fixture});
  });
  assert.deepEqual(await fetchQuote(fixture.symbol), fixture);
  assert.equal(useMarketStore.getState().quotes[fixture.symbol].is_quote_stale, true);
});

test("overlapping batch and single requests share pending symbols and publish once per response", async (t) => {
  const symbols = ["DEDUPE_A", "DEDUPE_B"];
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  let calls = 0, notifications = 0;
  t.mock.method(globalThis, "fetch", async (_url: unknown, options: RequestInit) => {
    calls++;
    assert.deepEqual(JSON.parse(String(options.body)).symbols, symbols);
    await wait;
    return Response.json({ success: true, data: Object.fromEntries(symbols.map(symbol => [symbol, { symbol, price_paise: 12300, updated_at: new Date().toISOString(), source: "angelone_live" }])) });
  });
  const unsubscribe = useMarketStore.subscribe(() => { notifications++; });
  try {
    const first = fetchBatchQuotes(symbols);
    const second = fetchBatchQuotes([" dedupe_b ", "DEDUPE_A"]);
    const single = fetchQuote("dedupe_a");
    assert.equal(calls, 1);
    release();
    const [a, b, c] = await Promise.all([first, second, single]);
    assert.deepEqual(a, b);
    assert.equal(c?.price_paise, 12300);
    assert.equal(notifications, 1);
  } finally { unsubscribe(); }
});

test("a late REST response cannot replace a newer stream tick", async (t) => {
  const symbol = "REST_STREAM_RACE";
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const oldTime = new Date(Date.now() - 2000).toISOString();
  t.mock.method(globalThis, "fetch", async () => {
    await wait;
    return Response.json({ success: true, data: { [symbol]: { symbol, price_paise: 10000, updated_at: oldTime, source: "angelone_live" } } });
  });
  const request = fetchBatchQuotes([symbol]);
  useMarketStore.getState().updateQuote({ symbol, price_paise: 11000, updated_at: new Date().toISOString(), source: "angelone_live" });
  release();
  const result = await request;
  assert.equal(result[symbol].price_paise, 11000);
  assert.equal(useMarketStore.getState().quotes[symbol].price_paise, 11000);
  assert.equal(getCachedQuote(symbol)?.price_paise, 11000);
});
