import test from "node:test";
import assert from "node:assert/strict";
import { normalizeInstrument } from "./instruments";

test("instruments: normalizeInstrument creates canonical Instrument with all 13 authoritative fields", () => {
  const raw = {
    id: 101,
    symbol: "nifty24sepfut",
    display_symbol: "NIFTY SEP FUT",
    exchange: "nfo",
    token: "NFO_NIFTY_FUT",
    instrument_type: "futidx",
    underlying: "nifty",
    expiry: "2026-09-24",
    strike: "0",
    option_type: "",
    lot_size: "25",
    tick_size: "0.05",
    active: true,
  };

  const canonical = normalizeInstrument(raw);

  assert.equal(canonical.id, 101);
  assert.equal(canonical.symbol, "NIFTY24SEPFUT");
  assert.equal(canonical.display_symbol, "NIFTY SEP FUT");
  assert.equal(canonical.exchange, "NFO");
  assert.equal(canonical.token, "NFO_NIFTY_FUT");
  assert.equal(canonical.instrument_type, "FUTIDX");
  assert.equal(canonical.underlying, "NIFTY");
  assert.equal(canonical.expiry, "2026-09-24");
  assert.equal(canonical.strike, 0);
  assert.equal(canonical.option_type, "");
  assert.equal(canonical.lot_size, 25);
  assert.equal(canonical.tick_size, 0.05);
  assert.equal(canonical.active, true);
});

test("instruments: normalizeInstrument handles option contracts and derives segments", () => {
  const rawOpt = {
    symbol: "NIFTY 25000 CE",
    display_symbol: "NIFTY 25000 CE",
    exchange: "NFO",
    instrument_type: "OPTIDX",
    underlying: "NIFTY",
    expiry: "2026-09-24",
    strike: 25000,
    option_type: "CE",
    lot_size: 25,
    tick_size: 0.05,
    active: true,
  };

  const canonical = normalizeInstrument(rawOpt);

  assert.equal(canonical.symbol, "NIFTY 25000 CE");
  assert.equal(canonical.instrument_type, "OPTIDX");
  assert.equal(canonical.strike, 25000);
  assert.equal(canonical.option_type, "CE");
  assert.equal(canonical.segment, "OPTIONS");
  assert.equal(canonical.lot_size, 25);
});

test("instruments: normalizeInstrument handles equity defaults", () => {
  const rawEquity = {
    symbol: "RELIANCE",
    name: "Reliance Industries Ltd",
  };

  const canonical = normalizeInstrument(rawEquity);

  assert.equal(canonical.symbol, "RELIANCE");
  assert.equal(canonical.exchange, "NSE");
  assert.equal(canonical.instrument_type, "EQUITY");
  assert.equal(canonical.lot_size, 1);
  assert.equal(canonical.tick_size, 0.05);
  assert.equal(canonical.active, true);
  assert.equal(canonical.segment, "EQUITY");
});
