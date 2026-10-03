import test from "node:test";
import assert from "node:assert/strict";
import {
  derivativePnl,
  displayQuote,
  isDerivativePosition,
  rankStocks,
  sortedFutures,
} from "./fnoExplore";
import type { Instrument, Position, Quote } from "../types";
const stock = (symbol: string) =>
  ({ symbol, name: symbol, active: true }) as Instrument;
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

test("rankings exclude missing, unknown and unavailable movement rather than inventing gainers", () => {
  const stocks = ["A", "B", "C", "D", "E"].map(stock);
  const quotes = {
    A: quote("A", 2),
    B: quote("B", -3),
    C: { ...quote("C", 8), day_change_available: false },
    D: { ...quote("D", 20), source: "unknown" },
  };
  assert.deepEqual(
    rankStocks(stocks, quotes, "gainers").map((s) => s.symbol),
    ["A"],
  );
  assert.deepEqual(
    rankStocks(stocks, quotes, "losers").map((s) => s.symbol),
    ["B"],
  );
  assert.equal(rankStocks(stocks, quotes, "all").length, 5);
  assert.deepEqual(
    rankStocks(stocks, quotes, "all", "B").map((s) => s.symbol),
    ["B"],
  );
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
  const sorted = sortedFutures([
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
  ]);
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
