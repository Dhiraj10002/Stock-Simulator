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
