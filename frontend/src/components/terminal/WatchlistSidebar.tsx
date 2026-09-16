"use client";

import { useState } from "react";
import { Search, TrendingUp, TrendingDown } from "lucide-react";
import { formatPaise, formatPercent } from "@/lib/format";
import type { Quote } from "@/types";

type WatchlistSidebarProps = {
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  quotes: Record<string, Quote>;
};

const DEFAULT_SYMBOLS = [
  { symbol: "RELIANCE", name: "Reliance Industries", exchange: "NSE" },
  { symbol: "TCS", name: "Tata Consultancy Services", exchange: "NSE" },
  { symbol: "INFY", name: "Infosys Ltd", exchange: "NSE" },
  { symbol: "HDFCBANK", name: "HDFC Bank Ltd", exchange: "NSE" },
  { symbol: "NIFTY", name: "Nifty 50 Index", exchange: "NSE" },
  { symbol: "BANKNIFTY", name: "Bank Nifty Index", exchange: "NSE" },
];

export default function WatchlistSidebar({
  selectedSymbol,
  onSelectSymbol,
  quotes,
}: WatchlistSidebarProps) {
  const [search, setSearch] = useState("");

  const filtered = DEFAULT_SYMBOLS.filter(
    (item) =>
      item.symbol.toLowerCase().includes(search.toLowerCase()) ||
      item.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <aside className="w-full lg:w-72 flex flex-col border-r border-slate-800/80 bg-slate-950/50 backdrop-blur-sm shrink-0">
      {/* Search Filter Header */}
      <div className="p-3 border-b border-slate-800/80">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search instruments..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-900/80 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all"
          />
        </div>
      </div>

      {/* Watchlist Items */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40">
        {filtered.map((item) => {
          const quote = quotes[item.symbol];
          const isSelected = selectedSymbol === item.symbol;
          const pricePaise = quote?.price_paise ?? 0;
          const change = quote?.change_percent ?? 0;
          const isUp = change >= 0;

          return (
            <button
              key={item.symbol}
              onClick={() => onSelectSymbol(item.symbol)}
              className={`w-full p-3 text-left flex items-center justify-between transition-all group ${
                isSelected
                  ? "bg-cyan-950/30 border-l-2 border-cyan-400 pl-[10px]"
                  : "hover:bg-slate-900/60"
              }`}
            >
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-xs text-slate-200 group-hover:text-white">
                    {item.symbol}
                  </span>
                  <span className="text-[9px] px-1 py-0.5 rounded bg-slate-800/80 text-slate-400 font-medium">
                    {item.exchange}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 truncate max-w-[130px]">
                  {item.name}
                </p>
              </div>

              <div className="text-right">
                <div className="text-xs font-bold text-slate-100">
                  {pricePaise > 0 ? formatPaise(pricePaise) : "₹---"}
                </div>
                <div
                  className={`text-[10px] font-semibold flex items-center justify-end gap-0.5 ${
                    isUp ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {isUp ? (
                    <TrendingUp className="w-2.5 h-2.5" />
                  ) : (
                    <TrendingDown className="w-2.5 h-2.5" />
                  )}
                  {formatPercent(change)}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
