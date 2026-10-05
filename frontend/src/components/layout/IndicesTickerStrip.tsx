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
  FnoProvenance,
} from "@/components/trading/FnoQuoteDetails";
import type { Quote } from "@/types";

export const MAJOR_INDICES_STRIP = [
  { name: "NIFTY 50", symbolKey: "NIFTY", fallback: { price: 22421.95, change: -198.5, changePercent: -0.88 } },
  { name: "SENSEX", symbolKey: "SENSEX", fallback: { price: 71909.7, change: -570.59, changePercent: -0.79 } },
  { name: "BANK NIFTY", symbolKey: "BANKNIFTY", fallback: { price: 54450.75, change: -182.3, changePercent: -0.33 } },
  { name: "MIDCP NIFTY", symbolKey: "MIDCPNIFTY", fallback: { price: 13562.75, change: -168.45, changePercent: -1.23 } },
  { name: "FIN NIFTY", symbolKey: "FINNIFTY", fallback: { price: 24556.1, change: -93.4, changePercent: -0.38 } },
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
            : formatPaise(Math.round(index.fallback.price * 100));
          const change = quote?.change_paise !== undefined
            ? quote.change_paise / 100
            : index.fallback.change;
          const changePercent = quote?.change_percent !== undefined
            ? quote.change_percent
            : index.fallback.changePercent;
          const isGain = change >= 0;

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
                <FnoProvenance
                  quote={quote}
                  now={now}
                  sessionLive={false}
                  compact
                />
              </div>
              <span
                className={`font-semibold font-tabular text-[11px] ${
                  isGain
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {isGain ? "+" : ""}
                {change.toFixed(2)} ({isGain ? "+" : ""}
                {changePercent.toFixed(2)}%)
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
