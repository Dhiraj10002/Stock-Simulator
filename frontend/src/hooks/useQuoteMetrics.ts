"use client";
import { useEffect } from "react";
import type { Quote } from "@/types";
import { quoteCommitted } from "@/lib/quoteMetrics";
export function useQuoteMetrics(quote?: Quote) {
  useEffect(() => { quoteCommitted(quote); }, [quote]);
}
