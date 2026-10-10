"use client";
import type { ReactNode } from "react";
import type { Quote } from "@/types";
import { useSymbolQuote, useTargetedSubscription } from "@/stores/market-store";
import { useQuoteMetrics } from "@/hooks/useQuoteMetrics";
// The parent retains static card markup; only this symbol's tick runs its render.
export function LiveQuoteCard({ symbol, children }: { symbol: string; children: (quote?: Quote) => ReactNode }) {
  useTargetedSubscription(symbol);
  const quote = useSymbolQuote(symbol);
  useQuoteMetrics(quote);
  return children(quote);
}
