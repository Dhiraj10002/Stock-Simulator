"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTradingStore } from "@/stores/trading-store";
import { TrendingUp, TrendingDown, ArrowUpRight } from "lucide-react";
import { formatNumber, formatPercent } from "@/lib/format";

export interface IndexData {
  symbol: string;
  name: string;
  exchange: "NSE" | "BSE";
  value: number;
  change: number;
  changePercent: number;
  sparkline: number[];
}

interface MarketIndicesCardProps {
  index: IndexData;
}

export default function MarketIndicesCard({ index }: MarketIndicesCardProps) {
  const router = useRouter();
  const setSelectedSymbol = useTradingStore((s) => s.setSelectedSymbol);

  const isPositive = index.change >= 0;

  const handleClick = () => {
    setSelectedSymbol(index.symbol);
    router.push(`/stocks/${encodeURIComponent(index.symbol)}`);
  };

  // Sparkline SVG path calculation
  const minVal = Math.min(...index.sparkline);
  const maxVal = Math.max(...index.sparkline);
  const range = maxVal - minVal || 1;
  const width = 80;
  const height = 28;

  const points = index.sparkline
    .map((val, idx) => {
      const x = (idx / (index.sparkline.length - 1)) * width;
      const y = height - ((val - minVal) / range) * (height - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div
      onClick={handleClick}
      className={`relative p-3.5 rounded-xl border transition-all cursor-pointer group flex flex-col justify-between select-none ${
        isPositive
          ? "bg-slate-900/60 hover:bg-emerald-950/20 border-slate-800 hover:border-emerald-500/40"
          : "bg-slate-900/60 hover:bg-rose-950/20 border-slate-800 hover:border-rose-500/40"
      }`}
    >
      {/* Top row: Name, Exchange, and Jump Arrow */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-xs text-slate-100 group-hover:text-cyan-400 transition-colors">
            {index.name}
          </span>
          <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700/60">
            {index.exchange}
          </span>
        </div>

        <ArrowUpRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all opacity-0 group-hover:opacity-100" />
      </div>

      {/* Middle row: Value and Sparkline */}
      <div className="flex items-end justify-between mt-2.5">
        <div>
          <div className="text-base font-extrabold font-tabular text-slate-100">
            {formatNumber(index.value, 2)}
          </div>

          <div
            className={`flex items-center gap-1 text-[11px] font-bold font-tabular mt-0.5 ${
              isPositive ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {isPositive ? (
              <TrendingUp className="w-3 h-3 shrink-0" />
            ) : (
              <TrendingDown className="w-3 h-3 shrink-0" />
            )}
            <span>
              {isPositive ? "+" : ""}
              {formatNumber(index.change, 2)}
            </span>
            <span>({formatPercent(index.changePercent)})</span>
          </div>
        </div>

        {/* Sparkline Visual */}
        <div className="w-[80px] h-[28px] shrink-0">
          <svg width={width} height={height} className="overflow-visible">
            <polyline
              fill="none"
              stroke={isPositive ? "#34d399" : "#f43f5e"}
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={points}
            />
          </svg>
        </div>
      </div>
    </div>
  );
}
