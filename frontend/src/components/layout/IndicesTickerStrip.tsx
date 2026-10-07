"use client";
import { useDisplayPolling } from "@/hooks/useDisplayPolling";
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

function LiveProvenance({ quote }: { quote?: Quote }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <FnoProvenance quote={quote} now={now} sessionLive={false} compact />;
}

export default function IndicesTickerStrip() {
  const stream = useMultiSymbolQuotes(symbols);
  useTargetedSubscription(symbols);
  const displayInterval = useDisplayPolling(symbols);
  const query = useQuery({
    queryKey: ["indices-strip"],
    queryFn: ({ signal }) =>
      publicFetch<Record<string, Quote>>(
        `/market/quotes/batch?symbols=${encodeURIComponent(symbols.join(","))}`,
        AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      ),
    refetchInterval: displayInterval,
    retry: false,
  });

  return (
    <section
      aria-label="Market index strip"
      className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xs px-4 sm:px-6 py-2"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-6 overflow-x-auto text-xs scrollbar-none">
        {MAJOR_INDICES_STRIP.map((index) => {
          const candidate = displayQuote(
            query.data?.[index.symbolKey],
            stream[index.symbolKey],
            query.isError,
          );
          const quote = candidate?.source === "angelone_live" ? candidate : undefined;

          const priceStr = quote && quote.price_paise > 0
            ? formatPaise(quote.price_paise)
            : "—";

          return (
            <div
              key={index.symbolKey}
              className="shrink-0 flex items-center gap-2"
            >
              <span className="font-bold text-slate-800 dark:text-slate-200">
                {index.name}
              </span>
              <div>
                <span className="font-bold font-tabular text-slate-900 dark:text-slate-100">
                  {priceStr}
                </span>
                <LiveProvenance quote={quote} />
              </div>
              <FnoMovement quote={quote} />
            </div>
          );
        })}
      </div>
    </section>
  );
}
