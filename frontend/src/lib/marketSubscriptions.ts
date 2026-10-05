import { DEFAULT_BENCHMARK_SYMBOLS, MAX_CLIENT_SUBSCRIPTIONS } from "@/stores/market-store";

export function subscriptionTargets(watchlist: string[], activeView: string[], selected?: string) {
  // The current screen/order takes priority when a large watchlist fills the limit.
  return [...new Set([...DEFAULT_BENCHMARK_SYMBOLS, ...(selected ? [selected] : []), ...activeView, ...watchlist].map(s => s.trim().toUpperCase()).filter(Boolean))].slice(0, MAX_CLIENT_SUBSCRIPTIONS);
}
