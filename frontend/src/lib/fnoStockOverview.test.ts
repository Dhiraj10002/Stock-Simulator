import test from "node:test";
import assert from "node:assert/strict";
import {
  eligibleEquities,
  featuredEquities,
  nativePreviewCandles,
  rankedEquities,
  topIndexFutures,
} from "./fnoStockOverview";
import type { Candle, Instrument, Quote } from "../types";
const stock = (name: string) =>
  ({
    symbol: `${name}-EQ`,
    name,
    token: name,
    active: true,
    is_tradable: true,
    exchange: "NSE",
    instrument_type: "EQUITY",
  }) as Instrument;
const quote = (name: string, percent = 1) =>
  ({
    symbol: `${name}-EQ`,
    price_paise: 10000,
    source: "angelone_live",
    updated_at: "2026-10-02T10:00:00Z",
    is_quote_stale: true,
    day_change_available: true,
    change_paise: percent * 100,
    change_percent: percent,
  }) as Quote;

test("eligible stock catalog rejects malformed responses and excludes exchange tests and retired cash instruments", () => {
  assert.throws(() => eligibleEquities([null]));
  assert.throws(() => eligibleEquities([{ symbol: "TCS" }]));
  assert.deepEqual(
    eligibleEquities([
      stock("TCS"),
      stock("011NSETEST"),
      { ...stock("ABC"), name: "BSETEST" },
      { ...stock("OLD"), active: false },
      { ...stock("OFF"), is_tradable: false },
      { ...stock("OTHER"), exchange: "BSE" },
    ]).map((i) => i.symbol),
    ["TCS-EQ"],
  );
});
test("gainers and losers rank authentic day movement and keep last-session timestamps without manufacturing missing data", () => {
  const stocks = [
    "TCS",
    "RELIANCE",
    "HDFCBANK",
    "MISSING",
    "UNKNOWN",
    "SYNTHETIC",
    "ZERO",
    "INVALID",
  ].map(stock);
  const quotes = {
    "TCS-EQ": quote("TCS", 2),
    "RELIANCE-EQ": quote("RELIANCE", 4),
    "HDFCBANK-EQ": quote("HDFCBANK", -3),
    "UNKNOWN-EQ": { ...quote("UNKNOWN", 9), day_change_available: false },
    "SYNTHETIC-EQ": { ...quote("SYNTHETIC", 10), source: "synthetic_gbm" },
    "ZERO-EQ": quote("ZERO", 0),
    "INVALID-EQ": { ...quote("INVALID", 1), change_paise: -100 },
  };
  assert.deepEqual(
    rankedEquities(stocks, quotes, "gainers").map((i) => i.symbol),
    ["RELIANCE-EQ", "TCS-EQ"],
  );
  assert.deepEqual(
    rankedEquities(stocks, quotes, "losers").map((i) => i.symbol),
    ["HDFCBANK-EQ"],
  );
  assert.deepEqual(
    rankedEquities(stocks, quotes, "gainers", "tcs").map((i) => i.symbol),
    ["TCS-EQ"],
  );
  assert.equal(quotes["TCS-EQ"].updated_at, "2026-10-02T10:00:00Z");
});
test("featured stocks come only from the actual eligible master and keep the requested three identities even when quotes are missing", () => {
  const stocks = ["ABC", "TCS", "HDFCBANK", "RELIANCE"].map(stock);
  assert.deepEqual(
    featuredEquities(
      stocks,
      Object.fromEntries(
        stocks.map((i) => [i.symbol, quote(i.name || i.symbol)]),
      ),
    ).map((i) => i.name),
    ["RELIANCE", "HDFCBANK", "TCS"],
  );
  assert.deepEqual(
    featuredEquities(stocks, { "ABC-EQ": quote("ABC") }).map((i) => i.name),
    ["RELIANCE", "HDFCBANK", "TCS"],
  );
  assert.deepEqual(
    featuredEquities([stock("ONLY")], {}).map((i) => i.name),
    ["ONLY"],
  );
  assert.deepEqual(featuredEquities([], {}), []);
});
test("candle previews require native provenance, coherent OHLC and genuine past timestamps; deduplicate and normalize milliseconds", () => {
  const now = Date.parse("2026-10-04T10:00:00Z");
  const bar = {
    timestamp: (now - 86400000) / 1000,
    open_paise: 10000,
    high_paise: 11000,
    low_paise: 9000,
    close_paise: 10500,
    volume: 3,
    source: "angelone_live",
    feed_mode: "LIVE",
  } as Candle & { source: string; feed_mode: string };
  const result = nativePreviewCandles(
    [
      bar,
      { ...bar, timestamp: bar.timestamp * 1000, close_paise: 10600 },
      { ...bar, timestamp: (now - 2 * 86400000) / 1000 },
      { ...bar, source: "synthetic_gbm" },
      { ...bar, feed_mode: "SYNTHETIC" },
      { ...bar, high_paise: 1 },
      { ...bar, low_paise: 0 },
      { ...bar, timestamp: now / 1000 + 600 },
      null as unknown as typeof bar,
    ],
    now,
  );
  assert.equal(result.length, 2);
  assert.ok(result[0].timestamp < result[1].timestamp);
  assert.equal(result[1].timestamp, bar.timestamp);
  assert.equal(result[1].close_paise, 10600);
});

test("top traded indices rank genuine positive volume and omit absent, zero and simulated volume", () => {
  const contracts = ["LOW", "HIGH", "ZERO", "MISSING", "SIM"].map((name) => ({
    ...stock(name),
    symbol: name,
    instrument_type: "FUTIDX",
  }));
  const quotes = {
    LOW: { ...quote("LOW"), volume: 25 },
    HIGH: { ...quote("HIGH"), volume: 100 },
    ZERO: { ...quote("ZERO"), volume: 0 },
    SIM: { ...quote("SIM"), volume: 500, source: "synthetic_gbm" },
  };
  assert.deepEqual(
    topIndexFutures(contracts, quotes).map((i) => i.symbol),
    ["HIGH", "LOW"],
  );
});

test("volume rankings do not mix exchange sessions or rank yesterday after a current zero", () => {
  const contracts = ["TODAY", "YESTERDAY"].map((name) => ({
    ...stock(name),
    symbol: name,
    instrument_type: "FUTIDX",
  }));
  const quotes = {
    TODAY: {
      ...quote("TODAY"),
      updated_at: "2026-10-03T09:00:00Z",
      volume: 10,
    },
    YESTERDAY: { ...quote("YESTERDAY"), volume: 9999 },
  };
  assert.deepEqual(
    topIndexFutures(contracts, quotes).map((i) => i.symbol),
    ["TODAY"],
  );
  assert.deepEqual(
    topIndexFutures(contracts, {
      ...quotes,
      TODAY: { ...quotes.TODAY, volume: 0, volume_available: true },
    }),
    [],
  );
});
