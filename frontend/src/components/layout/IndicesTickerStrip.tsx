"use client";

import { useEffect, useMemo } from "react";
import { useMultiSymbolQuotes } from "@/stores/market-store";
import { fetchBatchQuotes } from "@/lib/quoteService";

export const MAJOR_INDICES_STRIP = [
  { name: "NIFTY 50", symbolKey: "NIFTY" },
  { name: "SENSEX", symbolKey: "SENSEX" },
  { name: "BANK NIFTY", symbolKey: "BANKNIFTY" },
  { name: "MIDCP NIFTY", symbolKey: "MIDCPNIFTY" },
  { name: "FIN NIFTY", symbolKey: "FINNIFTY" },
];

const DEFAULT_INDICES: Record<
  string,
  { price: number; change: number; changePercent: number }
> = {
  NIFTY: { price: 22421.95, change: -198.5, changePercent: -0.88 },
  SENSEX: { price: 71909.7, change: -570.59, changePercent: -0.79 },
  BANKNIFTY: { price: 54450.75, change: -182.3, changePercent: -0.33 },
  MIDCPNIFTY: { price: 13562.75, change: -168.45, changePercent: -1.23 },
  FINNIFTY: { price: 24556.1, change: -93.4, changePercent: -0.38 },
};

export default function IndicesTickerStrip() {
  const symbols = useMemo(() => MAJOR_INDICES_STRIP.map((i) => i.symbolKey), []);
  const quotes = useMultiSymbolQuotes(symbols);

  useEffect(() => {
    fetchBatchQuotes(symbols).catch(() => {});
    const interval = setInterval(() => {
      fetchBatchQuotes(symbols).catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, [symbols]);

  return (
    <div className="border-b border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 backdrop-blur-sm px-4 sm:px-6 py-2 transition-colors">
      <div className="max-w-7xl mx-auto flex items-center gap-6 sm:gap-8 overflow-x-auto no-scrollbar text-xs">
        {MAJOR_INDICES_STRIP.map((idx) => {
          const live = quotes[idx.symbolKey];
          const fallback = DEFAULT_INDICES[idx.symbolKey];
          const hasQuote = live && live.price_paise > 0;

          const livePrice = hasQuote
            ? (live.price_paise / 100).toLocaleString("en-IN", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })
            : fallback
              ? fallback.price.toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              : "—";

          const livePct = hasQuote
            ? (live?.change_percent !== undefined ? live.change_percent : 0)
            : fallback
              ? fallback.changePercent
              : 0;

          const isGain = livePct >= 0;

          const liveChange = hasQuote
            ? `${isGain ? "+" : ""}${
                live.change_paise !== undefined
                  ? (live.change_paise / 100).toFixed(2)
                  : (((live.price_paise * (livePct / 100)) / 100)).toFixed(2)
              }`
            : fallback
              ? `${isGain ? "+" : ""}${fallback.change.toFixed(2)}`
              : "—";

          return (
            <div key={idx.name} className="flex items-center gap-2 shrink-0">
              <span className="font-bold text-slate-700 dark:text-slate-300">
                {idx.name}
              </span>
              <span className="font-semibold text-slate-900 dark:text-slate-100 font-tabular">
                {livePrice}
              </span>
              <span
                className={`flex items-center gap-0.5 text-[11px] font-bold ${
                  isGain
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                <span>{liveChange}</span>
                <span>
                  ({isGain ? "+" : ""}
                  {livePct.toFixed(2)}%)
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
