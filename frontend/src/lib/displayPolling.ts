import { resolveCanonicalSymbol } from "./alias";
import type { ConnectionState, FeedStatus, MarketStatus } from "@/stores/market-store";

export const STREAM_FRESH_MS = 15_000;
export const STATUS_FRESH_MS = 45_000;
export const CLOSED_DISPLAY_POLL_MS = 60_000;

export type StreamObservation = { receivedAt: number; quotedAt: number };
export interface DisplayPollingState {
  connectionState: ConnectionState;
  marketStatus: MarketStatus;
  marketStatusReceivedAt: number | null;
  feedStatus: FeedStatus;
  subscribedSymbols: string[];
  streamObservations: Record<string, StreamObservation>;
}

function fresh(timestamp: number | null, now: number, maxAge: number) {
  return timestamp !== null && Number.isFinite(timestamp) && timestamp <= now + 5000 && now - timestamp < maxAge;
}

// This policy applies to display requests only. Execution, previews, balances,
// positions and aggregate rankings keep their authoritative REST refreshes.
export function displayPollingInterval(state: DisplayPollingState, symbols: string[], fallbackMs: number, now = Date.now()): number | false {
  if (!fresh(state.marketStatusReceivedAt, now, STATUS_FRESH_MS)) return fallbackMs;
  // The status endpoint describes equities. POST_MARKET alone does not prove
  // that derivatives are closed, so retain their normal fallback cadence.
  if (["CLOSED", "HOLIDAY"].includes(state.marketStatus)) return CLOSED_DISPLAY_POLL_MS;
  if (state.marketStatus !== "OPEN" || state.connectionState !== "connected" || state.feedStatus.feedProvider !== "angel_one" || state.feedStatus.feedState !== "LIVE" || state.feedStatus.isSynthetic) return fallbackMs;
  const targets = [...new Set(symbols.map(resolveCanonicalSymbol).filter(Boolean))];
  const subscribed = new Set(state.subscribedSymbols.map(resolveCanonicalSymbol));
  return targets.length > 0 && targets.every(symbol => {
    const observation = state.streamObservations[symbol];
    return subscribed.has(symbol) && observation && fresh(observation.receivedAt, now, STREAM_FRESH_MS) && fresh(observation.quotedAt, now, STREAM_FRESH_MS);
  }) ? false : fallbackMs;
}

// Movers, breadth and entire contract universes are not replaced by a small
// stream subscription. Only their closed-session display cadence is reduced.
export function sessionDisplayInterval(state: Pick<DisplayPollingState, "marketStatus" | "marketStatusReceivedAt">, fallbackMs: number, now = Date.now()) {
  return fresh(state.marketStatusReceivedAt, now, STATUS_FRESH_MS) && ["CLOSED", "HOLIDAY"].includes(state.marketStatus) ? CLOSED_DISPLAY_POLL_MS : fallbackMs;
}
