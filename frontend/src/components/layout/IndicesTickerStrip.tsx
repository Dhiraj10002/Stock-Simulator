"use client";
import { useEffect, useState } from "react";
import { useMajorIndicesQuotes, MAJOR_INDICES } from "@/hooks/useMajorIndices";
import { formatPaise } from "@/lib/format";
import {
  FnoMovement,
  FnoProvenance,
} from "@/components/trading/FnoQuoteDetails";
import type { Quote } from "@/types";

export const MAJOR_INDICES_STRIP = MAJOR_INDICES;

function LiveProvenance({ quote }: { quote?: Quote }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <FnoProvenance quote={quote} now={now} sessionLive={false} compact />;
}

export default function IndicesTickerStrip() {
  const { getQuote } = useMajorIndicesQuotes();

  return (
    <section
      aria-label="Market index strip"
      className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xs px-4 sm:px-6 py-2 min-h-[41px]"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-6 overflow-x-auto text-xs scrollbar-none">
        {MAJOR_INDICES_STRIP.map((index) => {
          const quote = getQuote(index.symbolKey);

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

