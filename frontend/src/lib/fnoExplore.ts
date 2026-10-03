import type { Instrument, Position, Quote } from "@/types";
import { dayMovement } from "./marketDisplay";
import { quoteLabel } from "./marketData";

export const underlyingSymbol = (instrument: Instrument) =>
  instrument.symbol.replace(/-EQ$/, "");
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

export function rankStocks(
  stocks: Instrument[],
  quotes: Record<string, Quote | undefined>,
  direction: "all" | "gainers" | "losers",
  search = "",
) {
  const query = search.trim().toUpperCase();
  return stocks
    .filter((stock) =>
      `${stock.symbol} ${stock.name || ""}`.toUpperCase().includes(query),
    )
    .filter((stock) => {
      if (direction === "all") return true;
      const movement =
        displayQuote(quotes[stock.symbol]) && dayMovement(quotes[stock.symbol]);
      return (
        !!movement &&
        (direction === "gainers" ? movement.percent > 0 : movement.percent < 0)
      );
    })
    .sort((a, b) =>
      direction === "all"
        ? a.symbol.localeCompare(b.symbol)
        : direction === "gainers"
          ? dayMovement(quotes[b.symbol])!.percent -
            dayMovement(quotes[a.symbol])!.percent
          : dayMovement(quotes[a.symbol])!.percent -
            dayMovement(quotes[b.symbol])!.percent,
    );
}

export function sortedFutures(instruments: Instrument[]) {
  return instruments
    .filter(
      (instrument) =>
        instrument.active &&
        /^(FUTIDX|FUTSTK)$/.test(instrument.instrument_type),
    )
    .sort(
      (a, b) =>
        Date.parse(a.expiry.replace(/^(\d{2})([A-Z]{3})(\d{4})$/, "$1 $2 $3")) -
          Date.parse(
            b.expiry.replace(/^(\d{2})([A-Z]{3})(\d{4})$/, "$1 $2 $3"),
          ) ||
        a.exchange.localeCompare(b.exchange) ||
        a.symbol.localeCompare(b.symbol),
    );
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
