import type { Quote } from "@/types";
export function reconnectDelay(attempt: number, random = Math.random): number {
  const cap = Math.min(30000, 1000 * 2 ** Math.min(Math.max(attempt, 0), 5));
  return Math.round(cap * (0.5 + random() * 0.5));
}
export type ObservedQuote = { quote: Quote; receivedAt: number };
// Coalesce only display ticks. Server execution continues using authoritative prices.
export function coalesceQuote(queue: Map<string, ObservedQuote>, quote: Quote, receivedAt = Date.now()) {
  const symbol = quote.symbol?.trim().toUpperCase(), timestamp = Date.parse(quote.updated_at);
  if (!symbol || !Number.isSafeInteger(quote.price_paise) || quote.price_paise <= 0 || !Number.isFinite(timestamp) || timestamp > receivedAt + 5000) return;
  const previous = queue.get(symbol);
  if (!previous || timestamp >= Date.parse(previous.quote.updated_at)) queue.set(symbol, { quote, receivedAt });
}
