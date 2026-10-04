import type { Candle, Instrument, Quote } from "@/types";
import { displayQuote } from "./fnoExplore";
import { dayMovement } from "./marketDisplay";

export const equityUnderlying = (instrument: Instrument) =>
  instrument.symbol.replace(/-EQ$/, "");

export function eligibleEquities(data: unknown): Instrument[] {
  if (
    !Array.isArray(data) ||
    data.some(
      (i) =>
        !i ||
        typeof i !== "object" ||
        ["symbol", "token", "exchange", "instrument_type"].some(
          (field) => typeof i[field] !== "string",
        ) ||
        typeof i.active !== "boolean" ||
        typeof i.is_tradable !== "boolean",
    )
  )
    throw new Error("Eligible equity catalog response invalid.");
  return data.filter(
    (i) =>
      i.active &&
      i.is_tradable &&
      i.exchange === "NSE" &&
      i.instrument_type === "EQUITY" &&
      !/(NSETEST|BSETEST)/i.test(
        `${i.symbol} ${i.underlying || ""} ${i.name || ""}`,
      ),
  );
}

// Rank only authentic available prices with explicit provider day movement.
// Cached last-session prices are allowed for display, with their timestamp retained.
export function rankedEquities(
  stocks: Instrument[],
  quotes: Record<string, Quote | undefined>,
  direction: "gainers" | "losers",
  search = "",
) {
  const text = search.trim().toUpperCase();
  return stocks
    .filter((stock) =>
      `${stock.symbol} ${stock.name || ""}`.toUpperCase().includes(text),
    )
    .filter((stock) => {
      const quote = displayQuote(quotes[stock.symbol]);
      const movement = quote?.source === "angelone_live" && dayMovement(quote);
      return (
        !!movement &&
        (direction === "gainers"
          ? movement.percent > 0 && movement.change > 0
          : movement.percent < 0 && movement.change < 0)
      );
    })
    .sort(
      (a, b) =>
        (direction === "gainers" ? -1 : 1) *
          (dayMovement(quotes[a.symbol])!.percent -
            dayMovement(quotes[b.symbol])!.percent) ||
        a.symbol.localeCompare(b.symbol),
    );
}

export function featuredEquities(
  stocks: Instrument[],
  quotes: Record<string, Quote | undefined>,
) {
  const preferred = ["RELIANCE", "HDFCBANK", "TCS"];
  const rank = (stock: Instrument) => {
    const quote = displayQuote(quotes[stock.symbol]);
    const available = quote?.source === "angelone_live" ? 0 : 10;
    const index = preferred.indexOf(equityUnderlying(stock));
    return available + (index < 0 ? preferred.length : index);
  };
  return [...stocks]
    .sort((a, b) => rank(a) - rank(b) || a.symbol.localeCompare(b.symbol))
    .slice(0, 3);
}

type NativeCandle = Candle & { source?: string; feed_mode?: string };
export function nativePreviewCandles(
  data: NativeCandle[],
  now = Date.now(),
): Candle[] {
  const bars = new Map<number, Candle>();
  for (const bar of data) {
    if (!bar || typeof bar !== "object") continue;
    const timestamp =
      bar.timestamp > 1e11 ? Math.floor(bar.timestamp / 1000) : bar.timestamp;
    if (
      bar.source !== "angelone_live" ||
      bar.feed_mode !== "LIVE" ||
      ![
        timestamp,
        bar.open_paise,
        bar.high_paise,
        bar.low_paise,
        bar.close_paise,
      ].every(Number.isFinite) ||
      timestamp <= 0 ||
      timestamp > now / 1000 + 5 ||
      bar.low_paise <= 0 ||
      bar.high_paise < Math.max(bar.open_paise, bar.close_paise) ||
      bar.low_paise > Math.min(bar.open_paise, bar.close_paise)
    )
      continue;
    bars.set(timestamp, { ...bar, timestamp });
  }
  return [...bars.values()].sort((a, b) => a.timestamp - b.timestamp).slice(-5);
}
