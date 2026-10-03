import type { OptionContract, Portfolio, Quote } from "@/types";

export function dayMovement(quote?: Quote) {
  return quote?.day_change_available === true && typeof quote.change_paise === "number" && typeof quote.change_percent === "number" && Number.isFinite(quote.change_paise) && Number.isFinite(quote.change_percent)
    ? { change: quote.change_paise / 100, percent: quote.change_percent }
    : undefined;
}

export function valuationStatus(portfolio?: Portfolio | null) {
  // Partial values cannot override an authoritative degraded valuation.
  return portfolio?.valuation_status ?? "DEGRADED";
}

export function canTradeOption(contract: OptionContract) {
  return contract.is_available === true && contract.ltp_paise > 0 && contract.is_quote_stale !== true;
}

export interface FeedDisplayState {
  status?: string;
  feed_provider?: string;
  feed_state?: string;
  is_synthetic?: boolean;
  last_tick?: string | null;
}

export function feedLabel(state?: FeedDisplayState, now = Date.now()) {
  if (!state) return "Feed status unavailable";
  if (["UNAVAILABLE", "DISCONNECTED", "STOPPED"].includes(state.feed_state || "")) return "Feed unavailable";
  if (["CONNECTING", "RETRYING"].includes(state.feed_state || "")) return "Feed connecting";
  if (state.feed_provider === "synthetic" || state.is_synthetic === true) return "Simulated data";
  if (state.feed_provider !== "angel_one") return "Feed status unavailable";
  if (state.status && state.status !== "OPEN") return "Angel One · session closed";
  const tick = Date.parse(state.last_tick || "");
  if (!Number.isFinite(tick) || tick > now + 5000) return "Angel One · awaiting quotes";
  return now - tick > 120_000 ? "Angel One · delayed quotes" : "Angel One · live quotes";
}

export function breadthPercentages(breadth?: { advances: number; declines: number; total: number }) {
  if (!breadth || breadth.total <= 0) return undefined;
  return {
    advances: Math.round(breadth.advances * 100 / breadth.total),
    declines: Math.round(breadth.declines * 100 / breadth.total),
  };
}
