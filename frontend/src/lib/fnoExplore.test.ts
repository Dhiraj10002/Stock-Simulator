import test from "node:test";
import assert from "node:assert/strict";
import {
  derivativePnl,
  displayQuote,
  isDerivativePosition,
  futuresExpiry,
  parseFuturesCatalog,
  filterFutures,
  futuresTradeBlock,
  sortedFutures,
} from "./fnoExplore";
import type { Instrument, Position, Quote } from "../types";
const stock = (symbol: string) =>
  ({
    symbol,
    name: symbol,
    token: symbol,
    underlying: symbol,
    active: true,
    is_tradable: true,
  }) as Instrument;
const quote = (symbol: string, percent = 1) =>
  ({
    symbol,
    price_paise: 10000,
    source: "angelone_live",
    updated_at: new Date().toISOString(),
    day_change_available: true,
    change_paise: percent * 100,
    change_percent: percent,
  }) as Quote;

test("invalid or outdated catalog payloads become a recoverable error", () => {
  assert.throws(() => parseFuturesCatalog({ symbol: "futures" }));
  assert.throws(() => parseFuturesCatalog([null]));
  assert.throws(() => parseFuturesCatalog([{ symbol: "NIFTY" }]));
  assert.deepEqual(parseFuturesCatalog([]), []);
});
test("expiry resolves to the IST close and rejects impossible dates", () => {
  const close = Date.parse("2026-10-27T10:00:00Z");
  for (const text of [
    "27OCT2026",
    "27Oct2026",
    "27-OCT-2026",
    "2026-10-27",
    "27-10-2026",
  ])
    assert.equal(futuresExpiry(text), close);
  for (const text of ["31FEB2026", "2026-13-01", "bad", ""])
    assert.ok(Number.isNaN(futuresExpiry(text)));
});
test("near-month is per exchange and underlying, with dynamic category/search/expiry filters", () => {
  const future = (
    symbol: string,
    underlying: string,
    expiry: string,
    exchange = "NFO",
  ) =>
    ({
      ...stock(symbol),
      underlying,
      expiry,
      exchange,
      instrument_type: "FUTIDX",
      lot_size: 65,
    }) as Instrument;
  const rows = sortedFutures(
    [
      future("A", "NIFTY", "27OCT2026"),
      future("B", "NIFTY", "24NOV2026"),
      future("C", "BANKNIFTY", "24NOV2026"),
      future("D", "NIFTY", "24NOV2026", "BFO"),
      future("011NSETESTFUT", "NSETEST", "27OCT2026"),
      future("OLD", "NIFTY", "01JAN2026"),
      future("BAD", "NIFTY", "bad"),
    ],
    Date.parse("2026-10-04T00:00:00Z"),
  );
  const filters = {
    kind: "all" as const,
    search: "",
    exchange: "",
    underlying: "",
    expiry: "near",
  };
  assert.deepEqual(
    filterFutures(rows, filters).map((i) => i.symbol),
    ["A", "D", "C"],
  );
  assert.deepEqual(
    filterFutures(rows, {
      ...filters,
      exchange: "NFO",
      underlying: "NIFTY",
      expiry: "",
    }).map((i) => i.symbol),
    ["A", "B"],
  );
  assert.deepEqual(
    filterFutures(rows, {
      ...filters,
      expiry: String(futuresExpiry("24NOV2026")),
      underlying: "BANKNIFTY",
    }).map((i) => i.symbol),
    ["C"],
  );
});
test("paper execution requires identity, canonical lots, unexpired contract, confirmed open feed and fresh real quote", () => {
  const now = Date.now();
  const instrument = {
    ...stock("NIFTY"),
    expiry: "27OCT2099",
    lot_size: 65,
  } as Instrument;
  const status = {
    status: "OPEN",
    is_open: true,
    feed_provider: "angel_one",
    feed_state: "LIVE",
    is_synthetic: false,
  };
  assert.equal(
    futuresTradeBlock(instrument, quote("NIFTY"), "token", status, now),
    undefined,
  );
  for (const blocked of [
    futuresTradeBlock(instrument, quote("NIFTY"), "", status, now),
    futuresTradeBlock(
      { ...instrument, lot_size: 0 },
      quote("NIFTY"),
      "token",
      status,
      now,
    ),
    futuresTradeBlock(instrument, quote("NIFTY"), "token", undefined, now),
    futuresTradeBlock(
      instrument,
      quote("NIFTY"),
      "token",
      { ...status, status: "CLOSED" },
      now,
    ),
    futuresTradeBlock(
      instrument,
      { ...quote("NIFTY"), source: "synthetic_gbm" },
      "token",
      status,
      now,
    ),
    futuresTradeBlock(
      instrument,
      { ...quote("NIFTY"), updated_at: new Date(now - 120001).toISOString() },
      "token",
      status,
      now,
    ),
    futuresTradeBlock(
      instrument,
      { ...quote("NIFTY"), price_paise: NaN },
      "token",
      status,
      now,
    ),
  ])
    assert.ok(blocked);
});
test("newer stream wins, failed refresh is explicitly stale and invalid prices never display", () => {
  const rest = quote("A");
  const old = {
    ...rest,
    updated_at: new Date(Date.now() - 60000).toISOString(),
    price_paise: 9000,
  };
  assert.equal(displayQuote(rest, old)?.price_paise, 10000);
  assert.equal(displayQuote(old, rest)?.price_paise, 10000);
  assert.equal(displayQuote(rest, undefined, true)?.is_quote_stale, true);
  assert.equal(displayQuote({ ...rest, price_paise: Number.NaN }), undefined);
  assert.equal(displayQuote({ ...rest, updated_at: "invalid" }), undefined);
});
test("futures sort by expiry even for native Angel date strings and retain canonical lots", () => {
  const sorted = sortedFutures(
    [
      {
        ...stock("NOV"),
        instrument_type: "FUTSTK",
        expiry: "23NOV2026",
        lot_size: 225,
        exchange: "NFO",
      },
      {
        ...stock("OCT"),
        instrument_type: "FUTSTK",
        expiry: "27OCT2026",
        lot_size: 225,
        exchange: "NFO",
      },
      { ...stock("OPTION"), instrument_type: "OPTSTK", expiry: "2026-10-01" },
      { ...stock("RETIRED"), active: false, instrument_type: "FUTSTK" },
    ],
    Date.parse("2026-10-04T00:00:00Z"),
  );
  assert.deepEqual(
    sorted.map((s) => s.symbol),
    ["OCT", "NOV"],
  );
  assert.equal(sorted[0].lot_size, 225);
});
test("derivative summary excludes cash intraday and never reports partial PnL as complete", () => {
  const position = {
    product: "INTRADAY",
    instrument_type: "FUTSTK",
    quantity: -10,
    is_quote_available: true,
    quote_status: "FRESH",
    unrealized_pnl_paise: 250,
  } as Position;
  assert.equal(
    isDerivativePosition({ ...position, instrument_type: "EQUITY" }),
    false,
  );
  assert.equal(derivativePnl([position]), 250);
  assert.equal(
    derivativePnl([{ ...position, is_quote_available: false }]),
    undefined,
  );
  assert.equal(
    derivativePnl([{ ...position, is_quote_stale: true }]),
    undefined,
  );
  assert.equal(derivativePnl([]), 0);
});
