"use client";

import { useState, useEffect } from "react";
import { Search, TrendingUp, TrendingDown } from "lucide-react";
import { formatPaise, formatPercent } from "@/lib/format";
import { getOrSeedQuote } from "@/lib/mockData";
import type { Quote } from "@/types";

type WatchlistSidebarProps = {
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  quotes: Record<string, Quote>;
  apiUrl?: string;
};

interface WatchlistItem {
  symbol: string;
  name: string;
  exchange: string;
  isAlias?: string;
}

const DEFAULT_SYMBOLS: WatchlistItem[] = [
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
  apiUrl = "http://localhost:8080/api/v1",
}: WatchlistSidebarProps) {
  const [search, setSearch] = useState("");
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>(DEFAULT_SYMBOLS);
  const [searchResults, setSearchResults] = useState<WatchlistItem[]>([]);
  const [searching, setSearching] = useState(false);

  // Live Exchange Search via Backend
  useEffect(() => {
    const trimmed = search.trim();
    if (!trimmed) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`${apiUrl}/stocks?q=${encodeURIComponent(trimmed)}`);
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          const items: WatchlistItem[] = json.data.slice(0, 15).map((d: { symbol: string; name: string; exchange_segment: string }) => {
            const isZomato = d.symbol.toUpperCase().includes("ETERNAL") && trimmed.toLowerCase().includes("zomato");
            return {
              symbol: d.symbol.replace("-EQ", ""),
              name: isZomato ? "Eternal Ltd (formerly Zomato)" : d.name,
              exchange: d.exchange_segment || "NSE",
              isAlias: isZomato ? "ZOMATO" : undefined,
            };
          });
          setSearchResults(items);
        }
      } catch (err) {
        console.error("Failed to search instruments:", err);
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [search, apiUrl]);

  const handleSelectOrAdd = (item: WatchlistItem) => {
    if (!watchlist.some((w) => w.symbol === item.symbol)) {
      setWatchlist((prev) => [item, ...prev]);
    }
    onSelectSymbol(item.symbol);
    setSearch("");
  };

  const filteredLocal = watchlist.filter(
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
            placeholder="Search all NSE/BSE stocks (e.g. Zomato, Tata)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-900/80 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all"
          />
          {searching && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-cyan-400 animate-pulse">
              Searching...
            </span>
          )}
        </div>
      </div>

      {/* Watchlist & Search Items */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40">
        {/* If user is actively searching and there are global exchange search results */}
        {search.trim().length > 0 && searchResults.length > 0 && (
          <div className="bg-slate-900/90 border-b border-slate-800">
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-semibold text-cyan-400 bg-cyan-950/40">
              Exchange Instruments ({searchResults.length})
            </div>
            {searchResults.map((item, idx) => {
              const itemQuote = quotes[item.symbol] ?? getOrSeedQuote(item.symbol);
              return (
                <button
                  key={`search-${item.exchange}-${item.symbol}-${idx}`}
                  onClick={() => handleSelectOrAdd(item)}
                  className="w-full p-2.5 px-3 text-left flex items-center justify-between hover:bg-slate-800/80 transition-colors group"
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-xs text-cyan-300 group-hover:text-cyan-200">
                        {item.symbol}
                      </span>
                      <span className="text-[9px] px-1 py-0.2 rounded bg-slate-800 text-slate-400">
                        {item.exchange}
                      </span>
                      {item.isAlias && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-amber-950 text-amber-300 font-mono">
                          {item.isAlias}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 truncate max-w-[150px]">
                      {item.name}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono font-bold text-slate-200">
                      {formatPaise(itemQuote.price_paise)}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-900/60 text-cyan-300 font-semibold group-hover:bg-cyan-600 group-hover:text-white transition-colors">
                      + Add
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Existing Watchlist Counters */}
        {filteredLocal.map((item, idx) => {
          const quote = quotes[item.symbol] ?? getOrSeedQuote(item.symbol);
          const isSelected = selectedSymbol === item.symbol;
          const pricePaise = quote.price_paise ?? 0;
          const change = quote.change_percent ?? 0;
          const isUp = change >= 0;

          return (
            <button
              key={`watchlist-${item.exchange}-${item.symbol}-${idx}`}
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
                <div className="text-xs font-bold text-slate-100 font-mono">
                  {formatPaise(pricePaise)}
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
