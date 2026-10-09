import type { Instrument, Position, Quote } from "@/types";
import { quoteLabel } from "./marketData";

export const isDerivativePosition = (position: Position) =>
  position.product === "FNO" ||
  /^(FUT|OPT)/.test(position.instrument_type || "");

export function displayQuote(
  rest?: Quote,
  stream?: Quote,
  failed = false,
): Quote | undefined {
  const quote =
    stream &&
    (!rest || Date.parse(stream.updated_at) > Date.parse(rest.updated_at))
      ? stream
      : rest;
  if (
    !quote ||
    !Number.isFinite(quote.price_paise) ||
    quoteLabel(quote) === "UNAVAILABLE"
  )
    return undefined;
  return failed ? { ...quote, is_quote_stale: true } : quote;
}

// Exchange expiry is 15:30 IST, independent of the browser's timezone.
export function futuresExpiry(expiry: string): number {
  const text = expiry.trim().toUpperCase();
  const months = [
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC",
  ];
  let year: number, month: number, day: number;
  const native = /^(\d{2})-?([A-Z]{3})-?(\d{4})$/.exec(text);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const numeric = /^(\d{2})-(\d{2})-(\d{4})$/.exec(text);
  if (native)
    [day, month, year] = [
      +native[1],
      months.indexOf(native[2]) + 1,
      +native[3],
    ];
  else if (iso) [year, month, day] = [+iso[1], +iso[2], +iso[3]];
  else if (numeric)
    [day, month, year] = [+numeric[1], +numeric[2], +numeric[3]];
  else return NaN;
  const timestamp = Date.UTC(year, month - 1, day, 10, 0);
  const date = new Date(timestamp);
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? timestamp
    : NaN;
}

export const futuresUnderlying = (instrument: Instrument) =>
  instrument.underlying || instrument.name || instrument.symbol;
export const expiryLabel = (expiry: string) =>
  Number.isFinite(futuresExpiry(expiry))
    ? new Date(futuresExpiry(expiry)).toLocaleDateString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "Expiry unavailable";

export function parseFuturesCatalog(data: unknown): Instrument[] {
  if (
    !Array.isArray(data) ||
    data.some(
      (i) =>
        !i ||
        typeof i !== "object" ||
        [
          "symbol",
          "token",
          "expiry",
          "exchange",
          "underlying",
          "instrument_type",
        ].some((field) => typeof i[field] !== "string") ||
        typeof i.active !== "boolean" ||
        typeof i.is_tradable !== "boolean" ||
        typeof i.lot_size !== "number",
    )
  ) {
    throw new Error(
      "Canonical futures catalog response invalid. Restart the updated backend.",
    );
  }
  return data;
}

export function sortedFutures(instruments: Instrument[], now = Date.now()) {
  return instruments
    .filter(
      (instrument) =>
        instrument.active &&
        instrument.is_tradable === true &&
        /^(FUTIDX|FUTSTK)$/.test(instrument.instrument_type) &&
        !/(NSETEST|BSETEST)/i.test(
          `${instrument.symbol} ${instrument.underlying} ${instrument.name || ""}`,
        ) &&
        futuresExpiry(instrument.expiry) > now,
    )
    .sort(
      (a, b) =>
        futuresExpiry(a.expiry) - futuresExpiry(b.expiry) ||
        a.exchange.localeCompare(b.exchange) ||
        a.symbol.localeCompare(b.symbol),
    );
}

export type FuturesFilters = {
  kind: "all" | "FUTIDX" | "FUTSTK";
  search: string;
  exchange: string;
  underlying: string;
  expiry: string;
};
export function filterFutures(
  instruments: Instrument[],
  filters: FuturesFilters,
) {
  const query = filters.search.trim().toUpperCase();
  const matching = instruments.filter(
    (i) =>
      (filters.kind === "all" || i.instrument_type === filters.kind) &&
      (!filters.exchange || i.exchange === filters.exchange) &&
      (!filters.underlying || futuresUnderlying(i) === filters.underlying) &&
      `${i.symbol} ${i.display_symbol} ${futuresUnderlying(i)}`
        .toUpperCase()
        .includes(query),
  );
  const earliest = new Map<string, number>();
  for (const i of matching) {
    const key = `${i.exchange}:${futuresUnderlying(i)}`;
    earliest.set(
      key,
      Math.min(earliest.get(key) ?? Infinity, futuresExpiry(i.expiry)),
    );
  }
  return matching.filter(
    (i) =>
      !filters.expiry ||
      (filters.expiry === "near"
        ? futuresExpiry(i.expiry) ===
          earliest.get(`${i.exchange}:${futuresUnderlying(i)}`)
        : String(futuresExpiry(i.expiry)) === filters.expiry),
  );
}

export type FuturesMarketStatus = {
  status: string;
  is_open: boolean;
  segment?: string;
  market_open?: string;
  market_close?: string;
  mis_cutoff?: string;
  feed_provider: string;
  feed_state: string;
  is_synthetic: boolean;
};
export function futuresTradeBlock(
  instrument: Instrument,
  quote: Quote | undefined,
  token: string,
  status?: FuturesMarketStatus,
  now = Date.now(),
) {
  if (!token) return "Sign in to paper trade.";
  if (
    !instrument.active ||
    instrument.is_tradable !== true ||
    !Number.isSafeInteger(instrument.lot_size) ||
    instrument.lot_size <= 0 ||
    !instrument.token
  )
    return "Canonical contract details unavailable.";
  if (!(futuresExpiry(instrument.expiry) > now)) return "Contract has expired.";
  if (!status) return "Exchange status unavailable. Trading paused.";
  if (status.status !== "OPEN" || !status.is_open)
    return "Exchange session closed. Trading paused.";
  if (
    status.feed_provider !== "angel_one" ||
    status.feed_state !== "LIVE" ||
    status.is_synthetic
  )
    return "Live Angel One feed required. Trading paused.";
  if (quoteLabel(quote, now) !== "LIVE" || !Number.isFinite(quote?.price_paise))
    return "Fresh Angel One quote required.";
  return undefined;
}

export function derivativePnl(positions: Position[]) {
  const derivatives = positions
    .filter(isDerivativePosition)
    .filter((position) => position.quantity !== 0);
  if (
    derivatives.some(
      (position) =>
        position.is_quote_available !== true ||
        position.is_quote_stale === true ||
        position.quote_status !== "FRESH" ||
        !Number.isFinite(position.unrealized_pnl_paise),
    )
  )
    return undefined;
  return derivatives.reduce(
    (sum, position) => sum + position.unrealized_pnl_paise,
    0,
  );
}
