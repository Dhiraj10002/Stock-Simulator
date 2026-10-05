import type { Quote } from "@/types";
import { API_URL } from "@/lib/api";
import { useMarketStore } from "@/stores/market-store";

// Display-only cache. It is never used by order preview or execution validation.
const CACHE_TTL_MS = 10_000;
const quoteCache = new Map<string, { quote: Quote; expiresAt: number }>();
const pendingQuotes = new Map<string, Promise<Quote | null>>();
const cleanSymbol = (symbol: string) => symbol?.trim().toUpperCase();

export function getCachedQuote(symbol: string): Quote | undefined {
  const sym = cleanSymbol(symbol);
  if (!sym) return;
  const entry = quoteCache.get(sym);
  const cached = entry && Date.now() < entry.expiresAt ? entry.quote : undefined;
  const stored = useMarketStore.getState().quotes[sym];
  // A newer WebSocket tick wins over a REST cache entry.
  if (stored && Date.now() - Date.parse(stored.updated_at) < CACHE_TTL_MS && (!cached || Date.parse(stored.updated_at) >= Date.parse(cached.updated_at))) return stored;
  return cached;
}

export function getQuoteSync(symbol: string): Quote | undefined {
  const sym = cleanSymbol(symbol);
  const stored = useMarketStore.getState().quotes[sym];
  return stored?.price_paise > 0 ? stored : getCachedQuote(sym);
}

function publish(quotes: Record<string, Quote>) {
  if (!Object.keys(quotes).length) return;
  for (const [symbol, quote] of Object.entries(quotes)) quoteCache.set(symbol, { quote, expiresAt: Date.now() + CACHE_TTL_MS });
  useMarketStore.getState().mergeQuotes(quotes);
}

export async function fetchQuote(symbol: string): Promise<Quote | null> {
  const sym = cleanSymbol(symbol);
  if (!sym) return null;
  const cached = getCachedQuote(sym);
  if (cached) return cached;
  const pending = pendingQuotes.get(sym);
  if (pending) return pending;
  const request = (async () => {
    try {
      const response = await fetch(`${API_URL}/market/quotes/${encodeURIComponent(sym)}?purpose=display`, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) return null;
      const body = await response.json();
      const quote: Quote | undefined = body.success ? body.data : undefined;
      if (!quote || !Number.isSafeInteger(quote.price_paise) || quote.price_paise <= 0) return null;
      publish({ [sym]: quote });
      return getQuoteSync(sym) || quote;
    } catch { return null; }
  })();
  pendingQuotes.set(sym, request);
  try { return await request; } finally { if (pendingQuotes.get(sym) === request) pendingQuotes.delete(sym); }
}

export async function fetchBatchQuotes(symbols: string[]): Promise<Record<string, Quote>> {
  const unique = [...new Set(symbols.map(cleanSymbol).filter(Boolean))];
  const results: Record<string, Quote> = {}, missing: string[] = [];
  for (const symbol of unique) {
    const cached = getCachedQuote(symbol);
    if (cached) results[symbol] = cached;
    else if (!pendingQuotes.has(symbol)) missing.push(symbol);
  }
  for (let i = 0; i < missing.length; i += 100) {
    const chunk = missing.slice(i, i + 100);
    const batch = (async () => {
      const quotes: Record<string, Quote> = {};
      try {
        const response = await fetch(`${API_URL}/market/quotes/batch`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbols: chunk }), signal: AbortSignal.timeout(8000) });
        if (!response.ok) return quotes;
        const body = await response.json();
        if (!body.success || !body.data) return quotes;
        for (const symbol of chunk) {
          const quote: Quote | undefined = body.data[symbol];
          if (quote && Number.isSafeInteger(quote.price_paise) && quote.price_paise > 0) quotes[symbol] = quote;
        }
        publish(quotes); // One store update for the entire response.
      } catch { /* Missing quotes stay unavailable and can be retried later. */ }
      return quotes;
    })();
    for (const symbol of chunk) {
      const pending = batch.then(quotes => quotes[symbol] ? getQuoteSync(symbol) || quotes[symbol] : null);
      pendingQuotes.set(symbol, pending);
      void pending.finally(() => { if (pendingQuotes.get(symbol) === pending) pendingQuotes.delete(symbol); });
    }
  }
  await Promise.all(unique.filter(symbol => !results[symbol]).map(async symbol => {
    const pending = pendingQuotes.get(symbol);
    if (pending) { const quote = await pending; if (quote) results[symbol] = quote; }
  }));
  return results;
}
