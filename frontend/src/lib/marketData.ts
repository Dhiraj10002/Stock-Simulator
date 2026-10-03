import type { Candle, Quote } from "@/types";

export function quoteLabel(quote?: Quote | null, now = Date.now()) {
  if (!quote || quote.price_paise <= 0) return "UNAVAILABLE";
  const timestamp = Date.parse(quote.updated_at);
  if (!Number.isFinite(timestamp) || timestamp > now + 5000) return "UNAVAILABLE";
  if (quote.source !== "angelone_live" && !["synthetic_gbm", "fno_engine", "seed"].includes(quote.source || "")) return "UNAVAILABLE";
  if (quote.is_quote_stale || now - timestamp > 120_000) return "LAST AVAILABLE";
  return quote.source === "angelone_live" ? "LIVE" : "SIMULATED";
}
export function historyRequest(timeframe: string) {
  return { interval: timeframe === "1H" ? "ONE_HOUR" : timeframe === "1D" ? "ONE_DAY" : "ONE_MINUTE", limit: 500 };
}
export function aggregateCandles(candles: Candle[], timeframe: string): Candle[] {
  const minutes = timeframe === "5m" ? 5 : timeframe === "15m" ? 15 : 1;
  if (minutes === 1) return candles;
  const groups = new Map<number, Candle>();
  for (const candle of [...candles].sort((a, b) => a.timestamp - b.timestamp)) {
    // 09:15 IST is the exchange session anchor; never join bars across sessions.
    const timestamp = candle.timestamp > 1e11 ? Math.floor(candle.timestamp / 1000) : candle.timestamp;
    const istDay = Math.floor((timestamp + 19800) / 86400);
    const open = istDay * 86400 - 19800 + 9 * 3600 + 15 * 60;
    const key = open + Math.floor((timestamp - open) / (minutes * 60)) * minutes * 60;
    const old = groups.get(key);
    groups.set(key, old ? { ...old, high_paise: Math.max(old.high_paise, candle.high_paise), low_paise: Math.min(old.low_paise, candle.low_paise), close_paise: candle.close_paise, volume: old.volume + candle.volume } : { ...candle, timestamp: key });
  }
  return [...groups.values()];
}
