"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTerminalStore } from "@/stores/terminal-store";
import { getOrSeedQuote } from "@/lib/mockData";
import { formatPaise, formatPercent } from "@/lib/format";
import {
  Search,
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  SlidersHorizontal,
  Bookmark,
  Layers,
  Edit2,
  Check,
  X,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
} from "lucide-react";
import type { Quote } from "@/types";

export interface WatchlistItem {
  symbol: string;
  name: string;
  exchange: string;
  isAlias?: string;
}

interface WatchlistTab {
  id: string;
  name: string;
  isCustom?: boolean;
}

const DEFAULT_TABS: WatchlistTab[] = [
  { id: "wl1", name: "Core Equities" },
  { id: "wl2", name: "Growth & Momentum" },
  { id: "fno", name: "F&O Index & Options" },
];

const DEFAULT_WATCHLIST_DATA: Record<string, WatchlistItem[]> = {
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

const STORAGE_CUSTOM_KEY = "stock-simulator-watchlist-custom-v2";
const STORAGE_TAB_NAMES_KEY = "stock-simulator-watchlist-tab-names";
const STORAGE_ACTIVE_TAB_KEY = "stock-simulator-active-wl-tab-v2";

export default function WatchlistManagerDesk() {
  const router = useRouter();
  const setSelectedSymbol = useTerminalStore((s) => s.setSelectedSymbol);

  // 1. Tab definitions state
  const [tabs, setTabs] = useState<WatchlistTab[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(STORAGE_TAB_NAMES_KEY);
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return DEFAULT_TABS;
  });

  // 2. Active Tab state
  const [activeTabId, setActiveTabId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(STORAGE_ACTIVE_TAB_KEY);
        if (saved) return saved;
      } catch {}
    }
    return "wl1";
  });

  // 3. Watchlists items state
  const [watchlists, setWatchlists] = useState<Record<string, WatchlistItem[]>>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(STORAGE_CUSTOM_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          return { ...DEFAULT_WATCHLIST_DATA, ...parsed };
        }
      } catch {}
    }
    return DEFAULT_WATCHLIST_DATA;
  });

  // Search & New List states
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<WatchlistItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreatingList, setIsCreatingList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1";

  // Active items
  const currentItems = useMemo(() => {
    return watchlists[activeTabId] ?? [];
  }, [watchlists, activeTabId]);

  // Derive quotes purely with useMemo
  const quotes = useMemo(() => {
    const map: Record<string, Quote> = {};
    currentItems.forEach((item) => {
      map[item.symbol] = getOrSeedQuote(item.symbol);
    });
    return map;
  }, [currentItems]);

  // Persist Watchlist Data
  const persistWatchlists = (updated: Record<string, WatchlistItem[]>) => {
    setWatchlists(updated);
    try {
      localStorage.setItem(STORAGE_CUSTOM_KEY, JSON.stringify(updated));
    } catch {}
  };

  // Persist Tabs
  const persistTabs = (updatedTabs: WatchlistTab[]) => {
    setTabs(updatedTabs);
    try {
      localStorage.setItem(STORAGE_TAB_NAMES_KEY, JSON.stringify(updatedTabs));
    } catch {}
  };

  // Tab change handler
  const handleSelectTab = (id: string) => {
    setActiveTabId(id);
    try {
      localStorage.setItem(STORAGE_ACTIVE_TAB_KEY, id);
    } catch {}
  };

  // Search input change handler
  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    if (!val.trim()) {
      setSearchResults([]);
      setIsSearching(false);
    }
  };

  // Search autocomplete
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`${apiUrl}/stocks?q=${encodeURIComponent(trimmed)}`);
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          const items: WatchlistItem[] = json.data.slice(0, 10).map((d: { symbol: string; name: string; exchange_segment: string }) => {
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
      } catch {
        // ignore
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery, apiUrl]);

  // Add symbol to active watchlist
  const handleAddSymbol = (item: WatchlistItem) => {
    const list = watchlists[activeTabId] ?? [];
    if (list.some((i) => i.symbol === item.symbol)) {
      setSearchQuery("");
      setSearchResults([]);
      return;
    }
    const updated = {
      ...watchlists,
      [activeTabId]: [item, ...list],
    };
    persistWatchlists(updated);
    setSearchQuery("");
    setSearchResults([]);
  };

  // Remove symbol from active watchlist
  const handleRemoveSymbol = (symbol: string) => {
    const list = watchlists[activeTabId] ?? [];
    const updated = {
      ...watchlists,
      [activeTabId]: list.filter((i) => i.symbol !== symbol),
    };
    persistWatchlists(updated);
  };

  // Create new watchlist
  const handleCreateNewList = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newListName.trim();
    if (!name) return;

    const newId = `custom_${Date.now()}`;
    const newTab: WatchlistTab = { id: newId, name, isCustom: true };
    const updatedTabs = [...tabs, newTab];
    const updatedWatchlists = { ...watchlists, [newId]: [] };

    persistTabs(updatedTabs);
    persistWatchlists(updatedWatchlists);
    setActiveTabId(newId);
    setNewListName("");
    setIsCreatingList(false);
  };

  // Rename watchlist
  const handleSaveRename = (tabId: string) => {
    const name = renameValue.trim();
    if (!name) {
      setRenamingTabId(null);
      return;
    }
    const updatedTabs = tabs.map((t) => (t.id === tabId ? { ...t, name } : t));
    persistTabs(updatedTabs);
    setRenamingTabId(null);
  };

  // Delete custom watchlist
  const handleDeleteTab = (tabId: string) => {
    if (tabs.length <= 1) return;
    const updatedTabs = tabs.filter((t) => t.id !== tabId);
    const updatedWatchlists = { ...watchlists };
    delete updatedWatchlists[tabId];

    persistTabs(updatedTabs);
    persistWatchlists(updatedWatchlists);
    if (activeTabId === tabId) {
      setActiveTabId(updatedTabs[0].id);
    }
  };

  // Navigate to trade
  const handleTrade = (sym: string) => {
    setSelectedSymbol(sym);
    router.push("/trade");
  };

  // Market Breadth Calculations for current watchlist
  const breadthMetrics = useMemo(() => {
    let advances = 0;
    let declines = 0;
    let totalChangePercent = 0;

    currentItems.forEach((item) => {
      const q = quotes[item.symbol] ?? getOrSeedQuote(item.symbol);
      const chg = q.change_percent ?? 0;
      totalChangePercent += chg;
      if (chg > 0) advances++;
      else if (chg < 0) declines++;
    });

    const total = currentItems.length;
    const avgChange = total > 0 ? totalChangePercent / total : 0;
    const advPercent = total > 0 ? (advances / total) * 100 : 50;

    return {
      total,
      advances,
      declines,
      unchanged: total - advances - declines,
      avgChange,
      advPercent,
    };
  }, [currentItems, quotes]);

  const activeTabObj = tabs.find((t) => t.id === activeTabId) || tabs[0];

  return (
    <div className="space-y-6">
      {/* Top Header Strip: Tabs & Watchlist Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        {/* Watchlist Tabs List */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-none">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const isEditing = renamingTabId === tab.id;
            const itemCount = watchlists[tab.id]?.length ?? 0;

            if (isEditing) {
              return (
                <div
                  key={tab.id}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-900 border border-cyan-500/60"
                >
                  <input
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    autoFocus
                    className="w-28 bg-transparent text-xs font-bold text-white focus:outline-none"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveRename(tab.id);
                      if (e.key === "Escape") setRenamingTabId(null);
                    }}
                  />
                  <button
                    onClick={() => handleSaveRename(tab.id)}
                    className="text-cyan-400 hover:text-cyan-300 p-0.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setRenamingTabId(null)}
                    className="text-slate-400 hover:text-slate-300 p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            }

            return (
              <div
                key={tab.id}
                onClick={() => handleSelectTab(tab.id)}
                className={`group flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer select-none shrink-0 ${
                  isActive
                    ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20"
                    : "bg-slate-900/60 hover:bg-slate-800 text-slate-300 border border-slate-800"
                }`}
              >
                <span>{tab.name}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    isActive
                      ? "bg-slate-950/30 text-slate-950"
                      : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {itemCount}
                </span>

                {/* Edit / Delete on Hover */}
                {isActive && (
                  <div className="flex items-center gap-1 ml-1 opacity-80 group-hover:opacity-100">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenamingTabId(tab.id);
                        setRenameValue(tab.name);
                      }}
                      className="hover:scale-110 transition-transform p-0.5"
                      title="Rename Watchlist"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                    {tab.isCustom && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTab(tab.id);
                        }}
                        className="hover:scale-110 transition-transform p-0.5 hover:text-rose-900"
                        title="Delete Watchlist"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* New List Trigger */}
          {isCreatingList ? (
            <form onSubmit={handleCreateNewList} className="flex items-center gap-1.5 shrink-0">
              <input
                type="text"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                placeholder="List name (e.g. IT, Auto)"
                autoFocus
                className="w-36 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-cyan-500/50 text-xs text-white focus:outline-none"
              />
              <button
                type="submit"
                className="p-1.5 rounded-lg bg-cyan-500 text-slate-950 font-bold text-xs hover:bg-cyan-400"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsCreatingList(false)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 text-xs hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </form>
          ) : (
            <button
              onClick={() => setIsCreatingList(true)}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-900/40 hover:bg-slate-800 border border-slate-800 border-dashed text-slate-400 hover:text-cyan-400 text-xs font-semibold transition-colors shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Basket</span>
            </button>
          )}
        </div>

        {/* Live Search & Add Instrument */}
        <div className="relative w-full md:w-72">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search stocks to add (e.g. RELIANCE)..."
              className="w-full pl-9 pr-8 py-2 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500/60 transition-colors"
            />
            {isSearching ? (
              <div className="absolute right-2.5 top-2.5 w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            ) : searchQuery ? (
              <button
                onClick={() => handleSearchChange("")}
                className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : null}
          </div>

          {/* Autocomplete Dropdown */}
          {searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1.5 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden divide-y divide-slate-800/60 max-h-72 overflow-y-auto">
              <div className="p-2 text-[10px] font-semibold text-slate-400 uppercase bg-slate-950/60 flex items-center justify-between">
                <span>Add to {activeTabObj.name}</span>
                <span>{searchResults.length} found</span>
              </div>
              {searchResults.map((item) => (
                <div
                  key={item.symbol}
                  onClick={() => handleAddSymbol(item)}
                  className="p-2.5 hover:bg-slate-800/80 flex items-center justify-between cursor-pointer transition-colors group"
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-xs text-slate-100 group-hover:text-cyan-400">
                        {item.symbol}
                      </span>
                      <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-slate-800 text-slate-400">
                        {item.exchange}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 line-clamp-1">{item.name}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddSymbol(item);
                    }}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-cyan-500/20 hover:bg-cyan-500 text-cyan-300 hover:text-slate-950 text-[10px] font-bold transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Market Breadth & Intelligence Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Securities */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Bookmark className="w-3.5 h-3.5 text-cyan-400" />
            Watchlist Size
          </span>
          <div className="text-xl font-bold font-tabular text-slate-100">
            {breadthMetrics.total} Instruments
          </div>
          <span className="text-[10px] text-slate-500">Tracked in {activeTabObj.name}</span>
        </div>

        {/* Market Breadth Bar */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Market Breadth (Adv / Dec)
          </span>
          <div className="flex items-center justify-between text-xs font-bold font-tabular">
            <span className="text-emerald-400">{breadthMetrics.advances} Advancing</span>
            <span className="text-rose-400">{breadthMetrics.declines} Declining</span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden flex mt-1.5">
            <div
              className="bg-emerald-400 h-full transition-all duration-500"
              style={{ width: `${breadthMetrics.advPercent}%` }}
            />
            <div
              className="bg-rose-400 h-full transition-all duration-500"
              style={{ width: `${100 - breadthMetrics.advPercent}%` }}
            />
          </div>
        </div>

        {/* Average 1D Change */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Avg. Watchlist 1D Change
          </span>
          <div
            className={`flex items-center gap-1.5 text-xl font-bold font-tabular ${
              breadthMetrics.avgChange >= 0 ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {breadthMetrics.avgChange >= 0 ? (
              <TrendingUp className="w-4 h-4 shrink-0" />
            ) : (
              <TrendingDown className="w-4 h-4 shrink-0" />
            )}
            <span>{formatPercent(breadthMetrics.avgChange)}</span>
          </div>
          <span className="text-[10px] text-slate-500">Unweighted basket performance</span>
        </div>

        {/* Pro Terminal Sync Status */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1 flex flex-col justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Terminal Sync
            </span>
            <div className="text-sm font-bold text-slate-200 mt-0.5">
              Live & Two-Way Synchronized
            </div>
          </div>
          <button
            onClick={() => router.push("/trade")}
            className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-1"
          >
            <span>Launch in Pro Terminal</span>
            <ArrowUpRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Main Watchlist Table */}
      <div className="rounded-xl bg-slate-900/40 border border-slate-800 overflow-hidden shadow-xl">
        <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            <h2 className="font-bold text-sm text-slate-100">
              {activeTabObj.name} Desk
            </h2>
            <span className="text-[11px] px-2 py-0.5 rounded-full font-mono bg-slate-800 text-slate-400 border border-slate-700">
              {currentItems.length}
            </span>
          </div>
        </div>

        {currentItems.length === 0 ? (
          <div className="p-16 text-center text-slate-500 space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-800/60 border border-slate-700 flex items-center justify-center text-slate-400 mx-auto">
              <Search className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-300 text-sm">Watchlist is Empty</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Use the search bar above to look up stocks across NSE and BSE, then click Add to pin them to {activeTabObj.name}.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-900/40">
                  <th className="py-3 px-4">Instrument</th>
                  <th className="py-3 px-3 text-right">LTP (₹)</th>
                  <th className="py-3 px-3 text-right">Day Change</th>
                  <th className="py-3 px-4 hidden md:table-cell">Intraday Range (L - H)</th>
                  <th className="py-3 px-3 text-right hidden lg:table-cell">Day High / Low</th>
                  <th className="py-3 px-4 text-center">Fast Execution</th>
                  <th className="py-3 px-3 text-center">Manage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40 font-medium">
                {currentItems.map((item) => {
                  const quote = quotes[item.symbol] ?? getOrSeedQuote(item.symbol);
                  const ltp = quote.price_paise;
                  const chgPct = quote.change_percent ?? 0;
                  const isPos = chgPct >= 0;

                  const prevClose = Math.round(ltp / (1 + chgPct / 100));
                  const chgPaise = ltp - prevClose;

                  const lowPaise = quote.low_paise ?? Math.round(ltp * 0.985);
                  const highPaise = quote.high_paise ?? Math.round(ltp * 1.015);
                  const range = highPaise - lowPaise || 1;
                  const rangePct = Math.min(100, Math.max(0, ((ltp - lowPaise) / range) * 100));

                  return (
                    <tr
                      key={item.symbol}
                      className="hover:bg-slate-800/40 transition-colors group"
                    >
                      {/* Instrument */}
                      <td className="py-3 px-4">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5">
                            <span
                              onClick={() => handleTrade(item.symbol)}
                              className="font-bold text-slate-100 group-hover:text-cyan-400 transition-colors cursor-pointer"
                            >
                              {item.symbol}
                            </span>
                            <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-slate-800 text-slate-400">
                              {item.exchange}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 truncate max-w-[180px]">
                            {item.name}
                          </span>
                        </div>
                      </td>

                      {/* LTP */}
                      <td className="py-3 px-3 text-right font-extrabold text-slate-100 font-tabular text-sm">
                        {formatPaise(ltp)}
                      </td>

                      {/* Day Change */}
                      <td className="py-3 px-3 text-right font-tabular">
                        <div
                          className={`inline-flex items-center justify-end gap-1 font-bold ${
                            isPos ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {isPos ? (
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowDownRight className="w-3.5 h-3.5" />
                          )}
                          <span>
                            {isPos ? "+" : ""}
                            {formatPaise(chgPaise)}
                          </span>
                          <span>({formatPercent(chgPct)})</span>
                        </div>
                      </td>

                      {/* Intraday Range Bar */}
                      <td className="py-3 px-4 hidden md:table-cell">
                        <div className="flex flex-col gap-1 w-36">
                          <div className="flex justify-between text-[9px] font-mono text-slate-500">
                            <span>{formatPaise(lowPaise)}</span>
                            <span>{formatPaise(highPaise)}</span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden relative">
                            <div
                              className={`h-full rounded-full ${
                                isPos ? "bg-emerald-400" : "bg-rose-400"
                              }`}
                              style={{ width: `${rangePct}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Day High / Low */}
                      <td className="py-3 px-3 text-right font-mono text-[11px] text-slate-400 hidden lg:table-cell">
                        <div>H: {formatPaise(highPaise)}</div>
                        <div className="text-slate-500">L: {formatPaise(lowPaise)}</div>
                      </td>

                      {/* Fast Execution Buttons */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleTrade(item.symbol)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500 text-cyan-400 hover:text-slate-950 text-[11px] font-bold border border-cyan-500/30 hover:border-cyan-500 transition-all"
                            title="Open in Pro Terminal"
                          >
                            <SlidersHorizontal className="w-3 h-3" />
                            <span>Trade</span>
                          </button>
                        </div>
                      </td>

                      {/* Delete from Watchlist */}
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => handleRemoveSymbol(item.symbol)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 transition-colors opacity-60 group-hover:opacity-100"
                          title="Remove from Watchlist"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
