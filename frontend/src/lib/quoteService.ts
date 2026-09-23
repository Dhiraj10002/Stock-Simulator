import { Quote } from "@/types";
import { API_URL } from "@/lib/api";
import { getOrSeedQuote } from "@/lib/mockData";
import { useMarketStore } from "@/stores/market-store";

interface CacheEntry {
  quote: Quote;
  expiresAt: number;
}

const CACHE_TTL_MS = 10_000; // 10 seconds cache TTL
const quoteCache = new Map<string, CacheEntry>();

/**
 * Returns a cached quote if still valid.
 */
export function getCachedQuote(symbol: string): Quote | undefined {
  const sym = symbol?.trim().toUpperCase();
  if (!sym) return undefined;

  // Check in-memory quoteCache
  const entry = quoteCache.get(sym);
  if (entry && Date.now() < entry.expiresAt) {
    return entry.quote;
  }

  // Check market store
  const storeQuotes = useMarketStore.getState().quotes;
  if (storeQuotes[sym]) {
    return storeQuotes[sym];
  }

  return undefined;
}

/**
 * Synchronous quote getter that tries marketStore -> cache -> getOrSeedQuote fallback.
 */
export function getQuoteSync(symbol: string): Quote {
  const sym = symbol?.trim().toUpperCase();
  if (!sym) {
    return {
      symbol: "UNKNOWN",
      price_paise: 0,
      updated_at: new Date().toISOString(),
    };
  }

  const storeQuote = useMarketStore.getState().quotes[sym];
  if (storeQuote && storeQuote.price_paise > 0) {
    return storeQuote;
  }

  const cached = getCachedQuote(sym);
  if (cached && cached.price_paise > 0) {
    return cached;
  }

  return getOrSeedQuote(sym);
}

/**
 * Fetches the real-time quote for a single symbol from the backend API.
 * Updates market store and caches the result.
 */
export async function fetchQuote(symbol: string): Promise<Quote> {
  const sym = symbol?.trim().toUpperCase();
  if (!sym) {
    throw new Error("Invalid symbol");
  }

  const cached = getCachedQuote(sym);
  if (cached) {
    return cached;
  }

  try {
    const res = await fetch(`${API_URL}/market/quotes/${encodeURIComponent(sym)}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch quote for ${sym}: ${res.status}`);
    }

    const body = await res.json();
    if (body?.success && body?.data) {
      const q: Quote = body.data;
      quoteCache.set(sym, {
        quote: q,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });

      // Update global market store
      useMarketStore.getState().updateQuote(q);
      return q;
    }
  } catch (err) {
    console.warn(`[quoteService] Failed to fetch live quote for ${sym}, falling back:`, err);
  }

  // Fallback to seeded quote if API call failed
  const fallback = getOrSeedQuote(sym);
  quoteCache.set(sym, {
    quote: fallback,
    expiresAt: Date.now() + 5_000, // shorter TTL for fallback
  });
  return fallback;
}

/**
 * Fetches quotes for an array of symbols in parallel batches.
 * Updates market store and local cache.
 */
export async function fetchBatchQuotes(
  symbols: string[]
): Promise<Record<string, Quote>> {
  const uniqueSymbols = Array.from(
    new Set(symbols.map((s) => s?.trim().toUpperCase()).filter(Boolean))
  );

  const results: Record<string, Quote> = {};
  const toFetch: string[] = [];

  for (const sym of uniqueSymbols) {
    const cached = getCachedQuote(sym);
    if (cached) {
      results[sym] = cached;
    } else {
      toFetch.push(sym);
    }
  }

  if (toFetch.length === 0) {
    return results;
  }

  // Fetch in chunks of 8 to avoid overwhelming the HTTP connection pool
  const CHUNK_SIZE = 8;
  for (let i = 0; i < toFetch.length; i += CHUNK_SIZE) {
    const chunk = toFetch.slice(i, i + CHUNK_SIZE);
    const promises = chunk.map(async (sym) => {
      try {
        const q = await fetchQuote(sym);
        return { sym, quote: q };
      } catch {
        return { sym, quote: getOrSeedQuote(sym) };
      }
    });

    const settled = await Promise.allSettled(promises);
    for (const res of settled) {
      if (res.status === "fulfilled") {
        results[res.value.sym] = res.value.quote;
      }
    }
  }

  return results;
}
