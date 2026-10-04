"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useMultiSymbolQuotes,
  useTargetedSubscription,
} from "@/stores/market-store";
import { publicFetch } from "@/lib/api";
import { displayQuote } from "@/lib/fnoExplore";
import { formatPaise } from "@/lib/format";
import {
  FnoMovement,
  FnoProvenance,
} from "@/components/trading/FnoQuoteDetails";
import type { Quote } from "@/types";

export const MAJOR_INDICES_STRIP = [
  { name: "NIFTY 50", symbolKey: "NIFTY" },
  { name: "SENSEX", symbolKey: "SENSEX" },
  { name: "BANK NIFTY", symbolKey: "BANKNIFTY" },
  { name: "MIDCP NIFTY", symbolKey: "MIDCPNIFTY" },
  { name: "FIN NIFTY", symbolKey: "FINNIFTY" },
];
const symbols = MAJOR_INDICES_STRIP.map((i) => i.symbolKey);
export default function IndicesTickerStrip() {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const stream = useMultiSymbolQuotes(symbols);
  useTargetedSubscription(symbols);
  const query = useQuery({
    queryKey: ["indices-strip"],
    queryFn: ({ signal }) =>
      publicFetch<Record<string, Quote>>(
        `/market/quotes/batch?symbols=${encodeURIComponent(symbols.join(","))}`,
        AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      ),
    refetchInterval: 10000,
    retry: false,
  });
  // The strip has no session-state query: label supplied data as last available.
  return (
    <section
      aria-label="Market index strip"
      className="border-b border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 px-4 sm:px-6 py-2"
    >
      <div className="max-w-7xl mx-auto flex items-center gap-6 overflow-x-auto text-xs">
        {MAJOR_INDICES_STRIP.map((index) => {
          const candidate = displayQuote(
            query.data?.[index.symbolKey],
            stream[index.symbolKey],
            query.isError,
          );
          const quote =
            candidate?.source === "angelone_live" ? candidate : undefined;
          return (
            <div
              key={index.symbolKey}
              className="shrink-0 flex items-center gap-2"
            >
              <span className="font-bold">{index.name}</span>
              <div>
                <span className="font-semibold tabular-nums">
                  {quote ? formatPaise(quote.price_paise) : "Unavailable"}
                </span>
                <FnoProvenance
                  quote={quote}
                  now={now}
                  sessionLive={false}
                  compact
                />
              </div>
              <FnoMovement quote={quote} compact />
            </div>
          );
        })}
      </div>
    </section>
  );
}
