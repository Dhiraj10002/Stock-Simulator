"use client";
import { useMemo, useSyncExternalStore } from "react";
import type { Quote } from "@/types";
import { resolveCanonicalSymbol } from "@/lib/alias";
import { useMarketStore } from "@/stores/market-store";
const empty: Record<string, Quote> = {};
// Aggregate rankings/sector calculations are display summaries. Individual cards,
// detail prices and tickets retain their immediate symbol-specific subscription.
export function useBufferedQuotes(symbols: string[], intervalMs = 500) {
  const key = symbols.join(",");
  const buffer = useMemo(() => createBuffer(key, intervalMs), [key, intervalMs]);
  return useSyncExternalStore(buffer.subscribe, buffer.getSnapshot, () => empty);
}

function createBuffer(key: string, intervalMs: number) {
  const select = () => {
    const quotes = useMarketStore.getState().quotes, result: Record<string, Quote> = {};
    for (const symbol of key.split(",")) {
      const canonical = resolveCanonicalSymbol(symbol), quote = quotes[symbol] || quotes[canonical];
      if (quote) { result[symbol] = quote; result[canonical] = quote; }
    }
    return result;
  };
  let snapshot = select();
  return {
    getSnapshot: () => snapshot,
    subscribe: (notify: () => void) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const flush = () => {
        timer = undefined;
        if (document.hidden) return;
        const next = select();
        if (Object.keys(next).length === Object.keys(snapshot).length && Object.keys(next).every(symbol => next[symbol] === snapshot[symbol])) return;
        snapshot = next; notify();
      };
      const unsubscribe = useMarketStore.subscribe(() => { if (!timer) timer = setTimeout(flush, intervalMs); });
      const visible = () => { if (!document.hidden) { clearTimeout(timer); flush(); } };
      document.addEventListener("visibilitychange", visible);
      flush();
      return () => { unsubscribe(); clearTimeout(timer); document.removeEventListener("visibilitychange", visible); };
    },
  };
}
