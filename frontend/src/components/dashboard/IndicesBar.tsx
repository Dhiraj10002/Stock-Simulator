"use client";

import React from "react";
import { useMultiSymbolQuotes } from "@/stores/market-store";
import { ArrowUpRight, ArrowDownRight, Activity } from "lucide-react";
import { formatNumber, formatPercent } from "@/lib/format";

export interface IndexConfig {
  symbol: string;
  name: string;
  exchange: "NSE" | "BSE";
  shortName: string;
}

export const INDICES_LIST: IndexConfig[] = [
  { symbol: "NIFTY", name: "NIFTY 50", exchange: "NSE", shortName: "Nifty" },
  { symbol: "BANKNIFTY", name: "NIFTY BANK", exchange: "NSE", shortName: "Bank Nifty" },
  { symbol: "SENSEX", name: "BSE SENSEX", exchange: "BSE", shortName: "Sensex" },
];

interface IndicesBarProps {
  selectedIndex?: string;
  onSelectIndex?: (symbol: string) => void;
  className?: string;
}

export default function IndicesBar({
  selectedIndex = "NIFTY",
  onSelectIndex,
  className = "",
}: IndicesBarProps) {
  const symbols = INDICES_LIST.map((idx) => idx.symbol);
  const quotes = useMultiSymbolQuotes(symbols);

  return (
    <div
      className={`w-full overflow-x-auto no-scrollbar py-1 ${className}`}
      role="region"
      aria-label="Indian Benchmark Indices Ticker"
    >
      <div className="flex items-center gap-3 min-w-max">
        {INDICES_LIST.map((idx) => {
          const q = quotes[idx.symbol];
          const hasQuote = q && q.price_paise > 0;
          const price = hasQuote ? q.price_paise / 100 : 0;
          const changePaise = q?.change_paise ?? 0;
          const change = changePaise / 100;
          const changePercent = q?.change_percent ?? 0;
          const isPositive = changePercent >= 0;
          const isSelected = selectedIndex === idx.symbol;

          const high = q?.high_paise ? q.high_paise / 100 : undefined;
          const low = q?.low_paise ? q.low_paise / 100 : undefined;

          return (
            <div
              key={idx.symbol}
              onClick={() => onSelectIndex?.(idx.symbol)}
              className={`flex items-center gap-3.5 px-4 py-2.5 rounded-xl border transition-all cursor-pointer ${
                isSelected
                  ? "bg-white dark:bg-slate-900 border-cyan-500/60 dark:border-cyan-500/50 shadow-sm ring-1 ring-cyan-500/30"
                  : "bg-white/80 dark:bg-slate-900/60 hover:bg-white dark:hover:bg-slate-900/90 border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 shadow-2xs"
              }`}
            >
              {/* Index Name & Exchange Badge */}
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-black tracking-tight text-slate-900 dark:text-slate-100">
                    {idx.name}
                  </span>
                  <span className="text-[9px] px-1 py-0.2 rounded font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                    {idx.exchange}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
                  {high && low ? (
                    <span>
                      H: {formatNumber(high, 1)} • L: {formatNumber(low, 1)}
                    </span>
                  ) : (
                    <span>Benchmark Index</span>
                  )}
                </div>
              </div>

              {/* Live Price & Direction */}
              <div className="text-right pl-2">
                {hasQuote ? (
                  <>
                    <div className="text-sm font-black font-tabular tracking-tight text-slate-900 dark:text-slate-50">
                      {formatNumber(price, 2)}
                    </div>
                    <div
                      className={`text-[11px] font-bold font-tabular flex items-center justify-end gap-0.5 ${
                        isPositive
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {isPositive ? (
                        <ArrowUpRight className="w-3 h-3 stroke-[2.5]" />
                      ) : (
                        <ArrowDownRight className="w-3 h-3 stroke-[2.5]" />
                      )}
                      <span>
                        {change > 0 ? "+" : ""}
                        {formatNumber(change, 2)}
                      </span>
                      <span>({formatPercent(changePercent)})</span>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
                    <Activity className="w-3 h-3 animate-pulse text-cyan-500" />
                    <span>Connecting...</span>
                  </div>
                )}
              </div>

              {/* Active Selection Glow Dot */}
              {isSelected && (
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
