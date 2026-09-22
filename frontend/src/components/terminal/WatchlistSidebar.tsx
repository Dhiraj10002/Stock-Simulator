"use client";

import { useState, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch, getAuthToken } from "@/lib/api";
import {
  Search,
  TrendingUp,
  TrendingDown,
  Trash2,
  Plus,
  Briefcase,
  Layers,
  Flame,
  LineChart,
} from "lucide-react";
import { formatPaise, formatPercent } from "@/lib/format";
import { getOrSeedQuote } from "@/lib/mockData";
import type { Quote, Position } from "@/types";

export interface WatchlistItem {
  symbol: string;
  name: string;
  exchange: string;
  isAlias?: string;
}

type WatchlistTabId = "wl1" | "wl2" | "fno" | "holdings";

interface WatchlistTabConfig {
  id: WatchlistTabId;
  label: string;
  icon?: typeof Layers;
  isDynamic?: boolean;
}

const WATCHLIST_TABS: WatchlistTabConfig[] = [
  { id: "wl1", label: "WL 1", icon: Layers },
  { id: "wl2", label: "WL 2", icon: Flame },
  { id: "fno", label: "F&O Index", icon: LineChart },
  { id: "holdings", label: "Holdings", icon: Briefcase, isDynamic: true },
];

const DEFAULT_WATCHLIST_DATA: Record<"wl1" | "wl2" | "fno", WatchlistItem[]> = {
  wl1: [
    { symbol: "RELIANCE", name: "Reliance Industries", exchange: "NSE" },
    { symbol: "TCS", name: "Tata Consultancy Services", exchange: "NSE" },
    { symbol: "INFY", name: "Infosys Ltd", exchange: "NSE" },
    { symbol: "HDFCBANK", name: "HDFC Bank Ltd", exchange: "NSE" },
    { symbol: "ICICIBANK", name: "ICICI Bank Ltd", exchange: "NSE" },
    { symbol: "SBIN", name: "State Bank of India", exchange: "NSE" },
    { symbol: "BHARTIARTL", name: "Bharti Airtel", exchange: "NSE" },
    { symbol: "ITC", name: "ITC Ltd", exchange: "NSE" },
    { symbol: "LT", name: "Larsen & Toubro", exchange: "NSE" },
  ],
  wl2: [
    { symbol: "TATAMOTORS", name: "Tata Motors Ltd", exchange: "NSE" },
    { symbol: "BAJFINANCE", name: "Bajaj Finance Ltd", exchange: "NSE" },
    { symbol: "ADANIENT", name: "Adani Enterprises", exchange: "NSE" },
    { symbol: "APARINDS", name: "Apar Industries Ltd", exchange: "NSE" },
    { symbol: "ETERNAL", name: "Eternal Ltd (Zomato)", exchange: "NSE" },
    { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank", exchange: "NSE" },
    { symbol: "AXISBANK", name: "Axis Bank Ltd", exchange: "NSE" },
  ],
  fno: [
    { symbol: "NIFTY", name: "Nifty 50 Spot Index", exchange: "NSE" },
    { symbol: "BANKNIFTY", name: "Bank Nifty Spot Index", exchange: "NSE" },
    { symbol: "FINNIFTY", name: "Nifty Financial Services", exchange: "NSE" },
    { symbol: "TCS23NOV262000CE", name: "TCS Nov 2000 CE (F&O)", exchange: "NFO" },
  ],
};

type WatchlistSidebarProps = {
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  quotes: Record<string, Quote>;
  apiUrl?: string;
  onQuickOrder?: (symbol: string, side: "BUY" | "SELL") => void;
  positions?: Position[];
  onActiveSymbolsChange?: (symbols: string[]) => void;
};

export default function WatchlistSidebar({
  selectedSymbol,
  onSelectSymbol,
  quotes,
  apiUrl = "http://localhost:8080/api/v1",
  onQuickOrder,
  positions = [],
  onActiveSymbolsChange,
}: WatchlistSidebarProps) {
  const [activeTab, setActiveTab] = useState<WatchlistTabId>(() => {
    if (typeof window !== "undefined") {
      try {
        const savedTab = localStorage.getItem("stock-simulator-active-wl-tab-v2");
        if (savedTab && ["wl1", "wl2", "fno", "holdings"].includes(savedTab)) {
          return savedTab as WatchlistTabId;
        }
      } catch {
        // ignore
      }
    }
    return "wl1";
  });
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<WatchlistItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [hoveredSymbol, setHoveredSymbol] = useState<string | null>(null);

  // Tabbed custom watchlists with localStorage persistence
  const [customTabs, setCustomTabs] = useState<Record<"wl1" | "wl2" | "fno", WatchlistItem[]>>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("stock-simulator-watchlist-custom-v2");
        if (saved) {
          const parsed = JSON.parse(saved);
          const cleaned: Record<string, WatchlistItem[]> = {};
          const merged = { ...DEFAULT_WATCHLIST_DATA, ...parsed };
          for (const [key, list] of Object.entries(merged)) {
            if (Array.isArray(list)) {
              cleaned[key] = list
                .map((it: any) => {
                  if (!it) return null;
                  if (typeof it === "string") {
                    const s = it.trim().toUpperCase();
                    return s ? { symbol: s, name: `${s} Ltd`, exchange: "NSE" } : null;
                  }
                  const sym = (it.symbol || it.ticker || "").toString().trim().toUpperCase();
                  if (!sym) return null;
                  return {
                    symbol: sym,
                    name: (it.name || `${sym} Ltd`).toString(),
                    exchange: (it.exchange || "NSE").toString(),
                    isAlias: it.isAlias,
                  };
                })
                .filter((it): it is WatchlistItem => it !== null && !!it.symbol);
            } else {
              cleaned[key] = (DEFAULT_WATCHLIST_DATA as any)[key] || [];
            }
          }
          return cleaned as Record<"wl1" | "wl2" | "fno", WatchlistItem[]>;
        }
      } catch {
        // fallback
      }
    }
    return DEFAULT_WATCHLIST_DATA;
  });

  const handleTabChange = (tabId: WatchlistTabId) => {
    setActiveTab(tabId);
    try {
      localStorage.setItem("stock-simulator-active-wl-tab-v2", tabId);
    } catch {
      // ignore
    }
  };

  // Derive dynamic Holdings tab list
  const holdingsItems: WatchlistItem[] = useMemo(() => {
    const uniqueSymbols = Array.from(new Set(positions.map((p) => p.symbol)));
    return uniqueSymbols.map((sym) => {
      const matchingPos = positions.find((p) => p.symbol === sym);
      const isFno = sym.includes("CE") || sym.includes("PE") || sym.includes("FUT") || sym.includes("OPT") || matchingPos?.product === "FNO";
      const prodName = matchingPos?.product === "INTRADAY" ? "MIS" : isFno ? "F&O" : "CNC";
      return {
        symbol: sym,
        name: matchingPos ? `${prodName} (${matchingPos.quantity > 0 ? "+" : ""}${matchingPos.quantity})` : "Holding",
        exchange: isFno ? "NFO" : "NSE",
      };
    });
  }, [positions]);

  // Active items for the selected tab
  const activeItems = useMemo(() => {
    const list = activeTab === "holdings" ? holdingsItems : (customTabs[activeTab] ?? []);
    if (!Array.isArray(list)) return [];
    return list
      .map((it: any) => {
        if (!it) return null;
        if (typeof it === "string") {
          const s = it.trim().toUpperCase();
          return s ? { symbol: s, name: `${s} Ltd`, exchange: "NSE" } : null;
        }
        const sym = (it.symbol || it.ticker || "").toString().trim().toUpperCase();
        if (!sym) return null;
        return {
          symbol: sym,
          name: (it.name || `${sym} Ltd`).toString(),
          exchange: (it.exchange || "NSE").toString(),
          isAlias: it.isAlias,
        };
      })
      .filter((it): it is WatchlistItem => it !== null && !!it.symbol);
  }, [activeTab, customTabs, holdingsItems]);

  // Propagate active symbols list for keyboard navigation
  useEffect(() => {
    if (onActiveSymbolsChange) {
      onActiveSymbolsChange(activeItems.map((item) => item.symbol));
    }
  }, [activeItems, onActiveSymbolsChange]);

  // Persist custom tabs changes
  const saveCustomTabs = (newTabs: Record<"wl1" | "wl2" | "fno", WatchlistItem[]>) => {
    setCustomTabs(newTabs);
    try {
      localStorage.setItem("stock-simulator-watchlist-custom-v2", JSON.stringify(newTabs));
    } catch {
      // ignore
    }
  };

  // Live Exchange Search via Backend
  useEffect(() => {
    const timer = setTimeout(async () => {
      const trimmed = search.trim();
      if (!trimmed) {
        setSearchResults([]);
        setSearching(false);
        return;
      }

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

  const queryClient = useQueryClient();

  const handleSelectOrAdd = async (item: WatchlistItem) => {
    if (activeTab !== "holdings") {
      const currentList = customTabs[activeTab] ?? [];
      if (!currentList.some((w) => w.symbol === item.symbol)) {
        saveCustomTabs({
          ...customTabs,
          [activeTab]: [item, ...currentList],
        });
      }
    }
    onSelectSymbol(item.symbol);
    setSearch("");

    const token = typeof window !== "undefined" ? getAuthToken() : "";
    if (token) {
      try {
        await apiFetch("/watchlist", {
          method: "POST",
          body: JSON.stringify({ symbol: item.symbol }),
        });
        queryClient.invalidateQueries({ queryKey: ["watchlist"] });
      } catch (err) {
        console.error("Failed to sync watchlist addition to backend:", err);
      }
    }
  };

  const handleRemoveFromWatchlist = async (e: React.MouseEvent, symbol: string) => {
    e.stopPropagation();
    if (activeTab === "holdings") return;
    const currentList = customTabs[activeTab] ?? [];
    saveCustomTabs({
      ...customTabs,
      [activeTab]: currentList.filter((item) => item.symbol !== symbol),
    });

    const token = typeof window !== "undefined" ? getAuthToken() : "";
    if (token) {
      try {
        await apiFetch(`/watchlist/${encodeURIComponent(symbol)}`, {
          method: "DELETE",
        });
        queryClient.invalidateQueries({ queryKey: ["watchlist"] });
      } catch (err) {
        console.error("Failed to sync watchlist removal to backend:", err);
      }
    }
  };

  const filteredLocal = activeItems.filter(
    (item) =>
      item.symbol.toLowerCase().includes(search.toLowerCase()) ||
      item.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <aside className="w-full lg:w-80 flex flex-col border-r border-slate-800/80 bg-slate-950/70 backdrop-blur-md shrink-0 select-none">
      {/* Search Filter Header */}
      <div className="p-2.5 border-b border-slate-800/80 bg-slate-900/40">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search all NSE/BSE stocks (e.g. Zomato, Tata)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-16 py-1.5 bg-slate-900/90 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/20 transition-all font-sans"
          />
          {searching ? (
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-cyan-400 animate-pulse">
              Searching...
            </span>
          ) : (
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 font-mono">
              {filteredLocal.length}
            </span>
          )}
        </div>
      </div>

      {/* Kite-Style Watchlist Tabs Strip */}
      <div className="flex items-center px-1.5 pt-1.5 border-b border-slate-800/80 bg-slate-950/90 gap-1 overflow-x-auto">
        {WATCHLIST_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const count = tab.id === "holdings" ? holdingsItems.length : (customTabs[tab.id as "wl1" | "wl2" | "fno"]?.length ?? 0);
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded-t-md transition-all whitespace-nowrap border-t border-x ${
                isActive
                  ? "bg-slate-900 border-slate-700 text-cyan-300 shadow-[0_-2px_8px_rgba(6,182,212,0.15)]"
                  : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[9px] px-1 py-0.2 rounded font-mono ${
                  isActive ? "bg-cyan-950 text-cyan-300 border border-cyan-800/50" : "bg-slate-800/60 text-slate-500"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Watchlist & Search Items List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40">
        {/* If user is actively searching and there are global exchange search results */}
        {search.trim().length > 0 && searchResults.length > 0 && (
          <div className="bg-slate-900/95 border-b border-slate-800">
            <div className="px-3 py-1 text-[10px] uppercase tracking-wider font-semibold text-cyan-400 bg-cyan-950/60 flex items-center justify-between">
              <span>Exchange Instruments ({searchResults.length})</span>
              <span className="text-[9px] text-cyan-300/70 lowercase font-normal">click to add to {activeTab.toUpperCase()}</span>
            </div>
            {searchResults.map((item, idx) => {
              const itemQuote = quotes[item.symbol] ?? getOrSeedQuote(item.symbol);
              return (
                <button
                  key={`search-${item.exchange}-${item.symbol}-${idx}`}
                  onClick={() => handleSelectOrAdd(item)}
                  className="w-full p-2.5 px-3 text-left flex items-center justify-between hover:bg-slate-800/90 transition-colors group"
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
                    <p className="text-[10px] text-slate-400 truncate max-w-[160px]">
                      {item.name}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono font-bold text-slate-200 font-tabular">
                      {formatPaise(itemQuote.price_paise)}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-900/60 text-cyan-300 font-semibold group-hover:bg-cyan-600 group-hover:text-white transition-colors flex items-center gap-0.5">
                      <Plus className="w-2.5 h-2.5" /> Add
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Empty State */}
        {filteredLocal.length === 0 && (
          <div className="p-8 text-center text-slate-500 flex flex-col items-center justify-center">
            {activeTab === "holdings" ? (
              <>
                <Briefcase className="w-8 h-8 text-slate-700 mb-2" />
                <p className="text-xs font-semibold text-slate-400">No Holdings Yet</p>
                <p className="text-[10px] text-slate-500 mt-1 max-w-[180px]">
                  Stocks and contracts you purchase will automatically display in this desk.
                </p>
              </>
            ) : (
              <>
                <Layers className="w-8 h-8 text-slate-700 mb-2" />
                <p className="text-xs font-semibold text-slate-400">Watchlist is Empty</p>
                <p className="text-[10px] text-slate-500 mt-1 max-w-[180px]">
                  Use the search bar above to look up stocks and click to pin them here.
                </p>
              </>
            )}
          </div>
        )}

        {/* Existing Watchlist Counters with Institutional Hover Actions */}
        {filteredLocal.map((item, idx) => {
          const quote = quotes[item.symbol] ?? getOrSeedQuote(item.symbol);
          const isSelected = selectedSymbol === item.symbol;
          const pricePaise = quote.price_paise ?? 0;
          const change = quote.change_percent ?? 0;
          const isUp = change >= 0;

          return (
            <div
              key={`watchlist-${item.exchange}-${item.symbol}-${idx}`}
              onMouseEnter={() => setHoveredSymbol(item.symbol)}
              onMouseLeave={() => setHoveredSymbol(null)}
              onClick={() => onSelectSymbol(item.symbol)}
              className={`relative w-full p-2.5 px-3 text-left flex items-center justify-between cursor-pointer transition-all group ${
                isSelected
                  ? "bg-cyan-950/30 border-l-2 border-cyan-400 pl-[10px]"
                  : "hover:bg-slate-900/70"
              }`}
            >
              {/* Left Details */}
              <div className="min-w-0 pr-2">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-xs text-slate-200 group-hover:text-white truncate">
                    {item.symbol}
                  </span>
                  <span className="text-[8px] px-1 py-0.2 rounded bg-slate-800/80 text-slate-400 font-medium font-mono">
                    {item.exchange}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 truncate max-w-[130px] font-sans">
                  {item.name}
                </p>
              </div>

              {/* Right Quotes (Default State) */}
              <div className="text-right shrink-0">
                <div className="text-xs font-bold text-slate-100 font-mono font-tabular">
                  {formatPaise(pricePaise)}
                </div>
                <div
                  className={`text-[10px] font-semibold flex items-center justify-end gap-0.5 font-mono ${
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

              {/* Kite-Style Floating Hover Action Bar */}
              <div
                className={`absolute inset-y-0 right-2 flex items-center gap-1 bg-gradient-to-l from-slate-900 via-slate-900/95 to-transparent pl-4 pr-1 transition-opacity duration-150 ${
                  hoveredSymbol === item.symbol
                    ? "opacity-100 pointer-events-auto"
                    : "opacity-0 pointer-events-none"
                }`}
              >
                {/* Buy Quick Button */}
                <button
                  type="button"
                  title={`Quick BUY ${item.symbol} (HotKey: B)`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectSymbol(item.symbol);
                    if (onQuickOrder) onQuickOrder(item.symbol, "BUY");
                  }}
                  className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-[10px] font-extrabold rounded shadow-sm transition-all flex items-center justify-center glow-emerald"
                >
                  B
                </button>

                {/* Sell Quick Button */}
                <button
                  type="button"
                  title={`Quick SELL ${item.symbol} (HotKey: S)`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectSymbol(item.symbol);
                    if (onQuickOrder) onQuickOrder(item.symbol, "SELL");
                  }}
                  className="px-2 py-1 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white text-[10px] font-extrabold rounded shadow-sm transition-all flex items-center justify-center glow-rose"
                >
                  S
                </button>

                {/* Delete / Pin Remove Button (for custom tabs) */}
                {activeTab !== "holdings" && (
                  <button
                    type="button"
                    title="Remove from Watchlist"
                    onClick={(e) => handleRemoveFromWatchlist(e, item.symbol)}
                    className="p-1 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
