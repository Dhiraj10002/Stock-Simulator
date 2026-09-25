"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTradingStore } from "@/stores/trading-store";
import { useMultiSymbolQuotes } from "@/stores/market-store";
import { getQuoteSync, fetchBatchQuotes } from "@/lib/quoteService";
import { formatPaise, formatPercent } from "@/lib/format";
import { apiFetch, getAuthToken, ApiError } from "@/lib/api";
import { getApiUrl } from "@/lib/config";
import { MASTER_STOCKS_CATALOG } from "@/components/dashboard/DashboardPage";
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
  Cloud,
} from "lucide-react";
import type { Quote, WatchlistDbItem } from "@/types";

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
    { symbol: "RELIANCE", name: "Reliance Industries Ltd", exchange: "NSE" },
    { symbol: "TCS", name: "Tata Consultancy Services Ltd", exchange: "NSE" },
    { symbol: "INFY", name: "Infosys Ltd", exchange: "NSE" },
    { symbol: "HDFCBANK", name: "HDFC Bank Ltd", exchange: "NSE" },
    { symbol: "ICICIBANK", name: "ICICI Bank Ltd", exchange: "NSE" },
    { symbol: "SBIN", name: "State Bank of India", exchange: "NSE" },
    { symbol: "BHARTIARTL", name: "Bharti Airtel Ltd", exchange: "NSE" },
    { symbol: "ITC", name: "ITC Ltd", exchange: "NSE" },
    { symbol: "LT", name: "Larsen & Toubro Ltd", exchange: "NSE" },
  ],
  wl2: [
    { symbol: "TATAMOTORS", name: "Tata Motors Ltd", exchange: "NSE" },
    { symbol: "BAJFINANCE", name: "Bajaj Finance Ltd", exchange: "NSE" },
    { symbol: "ADANIENT", name: "Adani Enterprises Ltd", exchange: "NSE" },
    { symbol: "APARINDS", name: "Apar Industries Ltd", exchange: "NSE" },
    { symbol: "ZOMATO", name: "Zomato Ltd (Eternal)", exchange: "NSE" },
    { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank Ltd", exchange: "NSE" },
    { symbol: "AXISBANK", name: "Axis Bank Ltd", exchange: "NSE" },
  ],
  fno: [
    { symbol: "NIFTY", name: "Nifty 50 Benchmark Index", exchange: "NSE" },
    { symbol: "BANKNIFTY", name: "Bank Nifty Sectoral Index", exchange: "NSE" },
    { symbol: "FINNIFTY", name: "Nifty Financial Services", exchange: "NSE" },
    { symbol: "TCS24SEPFUT", name: "TCS 29 Sep Future", exchange: "NFO" },
  ],
};

const POPULAR_SEARCH_PREVIEWS: WatchlistItem[] = [
  { symbol: "RELIANCE", name: "Reliance Industries Ltd", exchange: "NSE" },
  { symbol: "TCS", name: "Tata Consultancy Services Ltd", exchange: "NSE" },
  { symbol: "HDFCBANK", name: "HDFC Bank Ltd", exchange: "NSE" },
  { symbol: "INFY", name: "Infosys Ltd", exchange: "NSE" },
  { symbol: "TATAMOTORS", name: "Tata Motors Ltd", exchange: "NSE" },
  { symbol: "ITC", name: "ITC Ltd", exchange: "NSE" },
  { symbol: "ZOMATO", name: "Zomato Ltd", exchange: "NSE" },
  { symbol: "SUNPHARMA", name: "Sun Pharmaceutical Industries", exchange: "NSE" },
  { symbol: "TRENT", name: "Trent Ltd (Tata Retail)", exchange: "NSE" },
  { symbol: "NIFTY24SEPFUT", name: "NIFTY 29 Sep 2026 Fut", exchange: "NFO" },
];

const STORAGE_CUSTOM_KEY = "stock-simulator-watchlist-custom-v2";
const STORAGE_TAB_NAMES_KEY = "stock-simulator-watchlist-tab-names";
const STORAGE_ACTIVE_TAB_KEY = "stock-simulator-active-wl-tab-v2";

export interface WatchlistManagerDeskProps {
  token?: string;
}

export default function WatchlistManagerDesk({ token: propToken }: WatchlistManagerDeskProps = {}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const setSelectedSymbol = useTradingStore((s) => s.setSelectedSymbol);

  const [token, setToken] = useState<string>(() => {
    if (propToken) return propToken;
    if (typeof window !== "undefined") {
      return getAuthToken() || "";
    }
    return "";
  });

  // Listen for auth state changes (e.g. token expired, login, logout)
  useEffect(() => {
    const handleAuthChange = () => {
      setToken(getAuthToken());
    };
    window.addEventListener("auth-changed", handleAuthChange);
    window.addEventListener("storage", handleAuthChange);
    return () => {
      window.removeEventListener("auth-changed", handleAuthChange);
      window.removeEventListener("storage", handleAuthChange);
    };
  }, []);

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
          const cleaned: Record<string, WatchlistItem[]> = {};
          const merged = { ...DEFAULT_WATCHLIST_DATA, ...parsed };
          for (const [key, list] of Object.entries(merged)) {
            if (Array.isArray(list)) {
              cleaned[key] = list
                .map((it: unknown): WatchlistItem | null => {
                  if (!it) return null;
                  if (typeof it === "string") {
                    const s = it.trim().toUpperCase();
                    return s ? { symbol: s, name: `${s} Ltd`, exchange: "NSE" } : null;
                  }
                  const obj = it as Record<string, unknown>;
                  const sym = (obj.symbol || obj.ticker || "").toString().trim().toUpperCase();
                  if (!sym) return null;
                  return {
                    symbol: sym,
                    name: (obj.name || `${sym} Ltd`).toString(),
                    exchange: (obj.exchange || "NSE").toString(),
                    isAlias: typeof obj.isAlias === "string" ? obj.isAlias : undefined,
                  };
                })
                .filter((it): it is WatchlistItem => it !== null);
            } else {
            cleaned[key] = DEFAULT_WATCHLIST_DATA[key] || [];
            }
          }

          // Automatically migrate any items saved via stock details legacy key
          try {
            const legacy = localStorage.getItem("stock_sim_watchlists_v2");
            if (legacy) {
              const legacyParsed = JSON.parse(legacy);
              const legacyList = legacyParsed[1] || [];
              if (Array.isArray(legacyList) && legacyList.length > 0) {
                const targetList = cleaned["wl1"] || [];
                legacyList.forEach((leg: Record<string, unknown>) => {
                  const sym = (leg?.symbol || "").toString().trim().toUpperCase();
                  if (sym && !targetList.some((t) => t.symbol === sym)) {
                    targetList.unshift({
                      symbol: sym,
                      name: (leg.name as string) || `${sym} Limited`,
                      exchange: (leg.exchange as string) || "NSE",
                    });
                  }
                });
                cleaned["wl1"] = targetList;
                localStorage.setItem(STORAGE_CUSTOM_KEY, JSON.stringify(cleaned));
              }
            }
          } catch {}

          return cleaned;
        }
      } catch {}
    }
    return DEFAULT_WATCHLIST_DATA;
  });

  // Listen for watchlist additions from other components (e.g. StockDetailsPage)
  useEffect(() => {
    const handleWatchlistChange = () => {
      try {
        const saved = localStorage.getItem(STORAGE_CUSTOM_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          setWatchlists((prev) => ({ ...prev, ...parsed }));
        }
      } catch {}
    };
    window.addEventListener("watchlist-changed", handleWatchlistChange);
    return () => {
      window.removeEventListener("watchlist-changed", handleWatchlistChange);
    };
  }, []);

  // TanStack Query for cloud-persisted watchlist from PostgreSQL
  const { data: dbWatchlist } = useQuery<WatchlistDbItem[]>({
    queryKey: ["watchlist", token],
    queryFn: () => apiFetch<WatchlistDbItem[]>("/watchlist"),
    enabled: !!token,
    staleTime: 5000,
  });

  // Synchronize cloud DB items into the primary watchlist tab (wl1) safely without losing local items
  useEffect(() => {
    if (token && Array.isArray(dbWatchlist) && dbWatchlist.length > 0) {
      queueMicrotask(() => {
        setWatchlists((prev) => {
          const currentPrimary = Array.isArray(prev["wl1"]) ? prev["wl1"] : [];
          const mergedMap = new Map<string, WatchlistItem>();

          // 1. Retain all current items in wl1
          currentPrimary.forEach((it) => {
            if (it?.symbol) {
              mergedMap.set(it.symbol.toUpperCase(), it);
            }
          });

          // 2. Add any items from cloud DB
          dbWatchlist.forEach((item: WatchlistDbItem | Record<string, unknown>) => {
            const sym = (item?.symbol || (item as Record<string, unknown>)?.ticker || "").toString().trim().toUpperCase();
            if (!sym) return;
            if (!mergedMap.has(sym)) {
              const fromCatalog = MASTER_STOCKS_CATALOG.find((s) => s.symbol === sym);
              mergedMap.set(sym, {
                symbol: sym,
                name: fromCatalog?.name || `${sym} Ltd`,
                exchange: "NSE",
              });
            }
          });

          const updated = {
            ...prev,
            wl1: Array.from(mergedMap.values()),
          };
          try {
            localStorage.setItem(STORAGE_CUSTOM_KEY, JSON.stringify(updated));
          } catch {}
          return updated;
        });
      });
    }
  }, [token, dbWatchlist]);

  // Search & New List states
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchingLive, setIsSearchingLive] = useState(false);
  const [liveSearchResults, setLiveSearchResults] = useState<WatchlistItem[]>([]);
  const [isCreatingList, setIsCreatingList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Live Exchange Search via Angel One instrument master with debouncing
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      queueMicrotask(() => {
        setLiveSearchResults([]);
        setIsSearchingLive(false);
      });
      return;
    }

    queueMicrotask(() => {
      setIsSearchingLive(true);
    });
    const timer = setTimeout(async () => {
      try {
        const apiUrl = getApiUrl();
        const res = await fetch(`${apiUrl}/stocks?q=${encodeURIComponent(q)}`);
        const json = await res.json();
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          const mapped: WatchlistItem[] = json.data.slice(0, 15).map((d: Record<string, unknown>) => {
            const sym = String(d.symbol || "");
            const name = String(d.name || "");
            const isZomato = sym.toUpperCase().includes("ETERNAL") && q.toLowerCase().includes("zomato");
            return {
              symbol: sym.replace("-EQ", ""),
              name: isZomato ? "Eternal Ltd (formerly Zomato)" : name,
              exchange: (d.exchange_segment as string) || "NSE",
              isAlias: isZomato ? "ZOMATO" : undefined,
            };
          });
          setLiveSearchResults(mapped);
        } else {
          const localFiltered = POPULAR_SEARCH_PREVIEWS.filter(
            (item) =>
              item.symbol.toUpperCase().includes(q.toUpperCase()) ||
              item.name.toUpperCase().includes(q.toUpperCase())
          );
          setLiveSearchResults(localFiltered);
        }
      } catch {
        const localFiltered = POPULAR_SEARCH_PREVIEWS.filter(
          (item) =>
            item.symbol.toUpperCase().includes(q.toUpperCase()) ||
            item.name.toUpperCase().includes(q.toUpperCase())
          );
        setLiveSearchResults(localFiltered);
      } finally {
        setIsSearchingLive(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const searchResults = searchQuery.trim() ? liveSearchResults : [];

  // Active items
  const currentItems = useMemo(() => {
    const rawList = watchlists[activeTabId] ?? [];
    if (!Array.isArray(rawList)) return [];
    return rawList
      .map((item: unknown) => {
        if (!item) return null;
        if (typeof item === "string") {
          const s = item.trim().toUpperCase();
          return s ? { symbol: s, name: `${s} Ltd`, exchange: "NSE" } : null;
        }
        const obj = item as Record<string, unknown>;
        const sym = (obj.symbol || obj.ticker || "").toString().trim().toUpperCase();
        if (!sym) return null;
        return {
          symbol: sym,
          name: (obj.name || `${sym} Ltd`).toString(),
          exchange: (obj.exchange || "NSE").toString(),
          isAlias: typeof obj.isAlias === "string" ? obj.isAlias : undefined,
        };
      })
      .filter((item): item is WatchlistItem => item !== null && typeof item.symbol === "string" && item.symbol.length > 0);
  }, [watchlists, activeTabId]);

  const liveWsQuotes = useMultiSymbolQuotes(currentItems.map((i) => i.symbol));

  // Prefetch real quotes from backend API for current watchlist items
  useEffect(() => {
    if (currentItems.length > 0) {
      const symbols = currentItems.map((i) => i.symbol);
      fetchBatchQuotes(symbols).catch(() => {});
    }
  }, [currentItems]);

  // Derive quotes purely with useMemo, prioritizing authentic live Angel One quotes
  const quotes = useMemo(() => {
    const map: Record<string, Quote> = {};
    currentItems.forEach((item) => {
      const sym = (item?.symbol || "").toString().trim().toUpperCase();
      if (!sym) return;
      const live = liveWsQuotes[sym] || (sym === "ZOMATO" ? liveWsQuotes["ETERNAL"] : undefined);
      if (live && live.price_paise) {
        map[sym] = live;
      } else {
        const sync = getQuoteSync(sym);
        if (sync && sync.price_paise > 0) {
          map[sym] = sync;
        }
      }
    });
    return map;
  }, [currentItems, liveWsQuotes]);

  // Persist Watchlist Data
  const persistWatchlists = (updated: Record<string, WatchlistItem[]>) => {
    setWatchlists(updated);
    try {
      localStorage.setItem(STORAGE_CUSTOM_KEY, JSON.stringify(updated));
    } catch {}
  };

  // Persist Tab Definitions
  const persistTabs = (updatedTabs: WatchlistTab[]) => {
    setTabs(updatedTabs);
    try {
      localStorage.setItem(STORAGE_TAB_NAMES_KEY, JSON.stringify(updatedTabs));
    } catch {}
  };

  // Handle Tab switch
  const handleSelectTab = (tabId: string) => {
    setActiveTabId(tabId);
    try {
      localStorage.setItem(STORAGE_ACTIVE_TAB_KEY, tabId);
    } catch {}
  };

  // Add symbol to active watchlist (syncs with cloud DB if authenticated)
  const handleAddSymbol = async (item: WatchlistItem) => {
    const existing = watchlists[activeTabId] ?? [];
    if (existing.some((i) => i.symbol === item.symbol)) {
      setSearchQuery("");
      return;
    }

    const updated = {
      ...watchlists,
      [activeTabId]: [item, ...existing],
    };
    persistWatchlists(updated);
    setSearchQuery("");

    if (token) {
      try {
        await apiFetch("/watchlist", {
          method: "POST",
          body: JSON.stringify({ symbol: item.symbol }),
        });
        queryClient.invalidateQueries({ queryKey: ["watchlist"] });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          setToken("");
          return;
        }
        console.warn("Watchlist cloud add sync non-fatal error:", err);
      }
    }
  };

  // Remove symbol from active watchlist (syncs deletion with cloud DB if authenticated)
  const handleRemoveSymbol = async (symbol: string) => {
    const existing = watchlists[activeTabId] ?? [];
    const updated = {
      ...watchlists,
      [activeTabId]: existing.filter((i) => i.symbol !== symbol),
    };
    persistWatchlists(updated);

    if (token) {
      try {
        await apiFetch(`/watchlist/${encodeURIComponent(symbol)}`, {
          method: "DELETE",
        });
        queryClient.invalidateQueries({ queryKey: ["watchlist"] });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          setToken("");
          return;
        }
        console.warn("Watchlist cloud delete sync non-fatal error:", err);
      }
    }
  };

  // Create new custom watchlist tab
  const handleCreateNewList = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newListName.trim();
    if (!name) return;

    const newId = `custom-${Date.now()}`;
    const newTab: WatchlistTab = { id: newId, name, isCustom: true };
    const updatedTabs = [...tabs, newTab];

    persistTabs(updatedTabs);
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

  // Navigate to stock overview
  const handleTrade = (sym: string) => {
    setSelectedSymbol(sym);
    router.push(`/stocks/${encodeURIComponent(sym)}`);
  };

  // Market Breadth Calculations for current watchlist
  const breadthMetrics = useMemo(() => {
    let advances = 0;
    let declines = 0;
    let totalChangePercent = 0;

    currentItems.forEach((item) => {
      const sym = (item?.symbol || "").toString().trim().toUpperCase();
      if (!sym) return;
      const q = quotes[sym] ?? getQuoteSync(sym);
      const chg = q?.change_percent ?? 0;
      totalChangePercent += chg;
      if (q && q.price_paise > 0) {
        if (chg > 0) advances++;
        else if (chg < 0) declines++;
      }
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
      {/* ===================================================================== */}
      {/* TOP HEADER STRIP: TABS & SEARCH BAR                                    */}
      {/* ===================================================================== */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-slate-200 dark:border-slate-800">
        {/* Watchlist Tabs List */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 no-scrollbar">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const isEditing = renamingTabId === tab.id;
            const itemCount = watchlists[tab.id]?.length ?? 0;

            if (isEditing) {
              return (
                <div
                  key={tab.id}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border-2 border-cyan-500 shadow-sm"
                >
                  <input
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    autoFocus
                    className="w-28 bg-transparent text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveRename(tab.id);
                      if (e.key === "Escape") setRenamingTabId(null);
                    }}
                  />
                  <button
                    onClick={() => handleSaveRename(tab.id)}
                    className="text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 p-0.5 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setRenamingTabId(null)}
                    className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
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
                className={`group flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer select-none shrink-0 ${
                  isActive
                    ? "bg-cyan-600 dark:bg-cyan-500 text-white dark:text-slate-950 shadow-md shadow-cyan-500/20"
                    : "bg-white dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 shadow-xs"
                }`}
              >
                <span>{tab.name}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                    isActive
                      ? "bg-white/25 text-white dark:bg-slate-950/20 dark:text-slate-950"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
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
                        className="hover:scale-110 transition-transform p-0.5 hover:text-rose-200"
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
                placeholder="List name (e.g. EV, IT)"
                autoFocus
                className="w-36 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-cyan-500 text-xs text-slate-900 dark:text-slate-100 focus:outline-none shadow-xs"
              />
              <button
                type="submit"
                className="p-1.5 rounded-xl bg-cyan-600 text-white font-bold text-xs hover:bg-cyan-500 shadow-xs cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsCreatingList(false)}
                className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 text-xs hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </form>
          ) : (
            <button
              onClick={() => setIsCreatingList(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 text-xs font-semibold transition-colors shrink-0 shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Basket</span>
            </button>
          )}
        </div>

        {/* Live Search & Add Instrument */}
        <div className="flex items-center gap-2.5 w-full md:w-auto">
          {token && (
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-[11px] font-mono font-bold text-emerald-700 dark:text-emerald-400 shrink-0">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <Cloud className="w-3.5 h-3.5" />
              <span>Cloud Synced</span>
            </div>
          )}

          <div className="relative w-full md:w-80">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search all NSE/BSE stocks to add..."
                className="w-full pl-9 pr-8 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 shadow-xs transition-colors"
              />
              {isSearchingLive ? (
                <div className="absolute right-2.5 top-2.5">
                  <span className="w-3.5 h-3.5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin inline-block" />
                </div>
              ) : searchQuery ? (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : null}
            </div>

          {/* Autocomplete Dropdown */}
          {searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl z-50 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
              <div className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase bg-slate-50 dark:bg-slate-950/60 flex items-center justify-between">
                <span>Add to {activeTabObj.name}</span>
                <span>{searchResults.length} found</span>
              </div>
              {searchResults.map((item) => (
                <div
                  key={item.symbol}
                  onClick={() => handleAddSymbol(item)}
                  className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800/80 flex items-center justify-between cursor-pointer transition-colors group"
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-xs text-slate-900 dark:text-slate-100 group-hover:text-cyan-600 dark:group-hover:text-cyan-400">
                        {item.symbol}
                      </span>
                      <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                        {item.exchange}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 line-clamp-1">{item.name}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddSymbol(item);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-50 hover:bg-cyan-600 text-cyan-700 hover:text-white dark:bg-cyan-950/60 dark:hover:bg-cyan-500 dark:text-cyan-300 dark:hover:text-slate-950 text-[11px] font-bold transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>

      {/* ===================================================================== */}
      {/* 4 TOP INTELLIGENCE & MARKET BREADTH CARDS                             */}
      {/* ===================================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Watchlist Size */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2 group hover:border-cyan-500/40 transition-all">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Bookmark className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
              <span>Watchlist Size</span>
            </span>
            <span className="text-[10px] font-mono text-cyan-600 dark:text-cyan-400">Active</span>
          </span>
          <div className="text-2xl font-black font-tabular text-slate-900 dark:text-slate-100">
            {breadthMetrics.total} Instruments
          </div>
          <span className="text-[11px] text-slate-400">Tracked in {activeTabObj.name}</span>
        </div>

        {/* Market Breadth Bar */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2 group hover:border-cyan-500/40 transition-all">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>Market Breadth</span>
            <span className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
              {breadthMetrics.advances} Adv / {breadthMetrics.declines} Dec
            </span>
          </span>
          <div className="flex items-center justify-between text-xs font-bold font-tabular">
            <span className="text-emerald-600 dark:text-emerald-400">{breadthMetrics.advances} Advancing</span>
            <span className="text-rose-600 dark:text-rose-400">{breadthMetrics.declines} Declining</span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex mt-1">
            <div
              className="bg-emerald-500 h-full transition-all duration-500"
              style={{ width: `${breadthMetrics.advPercent}%` }}
            />
            <div
              className="bg-rose-500 h-full transition-all duration-500"
              style={{ width: `${100 - breadthMetrics.advPercent}%` }}
            />
          </div>
        </div>

        {/* Average 1D Change */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2 group hover:border-cyan-500/40 transition-all">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>Avg. 1D Performance</span>
            <span
              className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                breadthMetrics.avgChange >= 0
                  ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400"
                  : "bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400"
              }`}
            >
              Basket
            </span>
          </span>
          <div
            className={`flex items-center gap-1 text-2xl font-black font-tabular ${
              breadthMetrics.avgChange >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400"
            }`}
          >
            {breadthMetrics.avgChange >= 0 ? (
              <TrendingUp className="w-5 h-5 shrink-0" />
            ) : (
              <TrendingDown className="w-5 h-5 shrink-0" />
            )}
            <span>
              {breadthMetrics.avgChange >= 0 ? "+" : ""}
              {formatPercent(breadthMetrics.avgChange)}
            </span>
          </div>
          <span className="text-[11px] text-slate-400">Unweighted basket momentum</span>
        </div>

        {/* Live Market Sync Status */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2 group hover:border-cyan-500/40 transition-all flex flex-col justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Live Market Sync</span>
            </span>
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-1 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Real-Time Market Synced</span>
            </div>
          </div>
          <Link
            href="/stocks"
            className="text-xs font-bold text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 inline-flex items-center gap-1"
          >
            <span>Explore All Stocks</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* MAIN WATCHLIST TABLE CARD                                             */}
      {/* ===================================================================== */}
      <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Layers className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            <h2 className="font-black text-sm text-slate-900 dark:text-slate-100">
              {activeTabObj.name} Desk
            </h2>
            <span className="text-[11px] px-2 py-0.5 rounded-full font-mono font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              {currentItems.length} Securities
            </span>
          </div>

          <div className="text-xs text-slate-400 font-mono hidden sm:block">
            NSE / BSE Live Feeds
          </div>
        </div>

        {currentItems.length === 0 ? (
          <div className="p-16 text-center text-slate-500 space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mx-auto">
              <Search className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                Watchlist is Empty
              </h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Use the search bar above to look up stocks across NSE and BSE, then click Add to pin them to {activeTabObj.name}.
              </p>
            </div>
            {/* Quick Suggestions to Add */}
            <div className="pt-2 flex items-center justify-center gap-2 flex-wrap">
              {POPULAR_SEARCH_PREVIEWS.slice(0, 4).map((rec) => (
                <button
                  key={rec.symbol}
                  onClick={() => handleAddSymbol(rec)}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-cyan-50 dark:bg-slate-800 dark:hover:bg-cyan-950/60 text-xs font-bold text-slate-700 hover:text-cyan-700 dark:text-slate-300 dark:hover:text-cyan-300 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>{rec.symbol}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider bg-slate-50/70 dark:bg-slate-900/40">
                  <th className="py-3.5 px-5">Instrument</th>
                  <th className="py-3.5 px-3 text-right">LTP (₹)</th>
                  <th className="py-3.5 px-3 text-right">Day Change</th>
                  <th className="py-3.5 px-4 hidden md:table-cell">Intraday Range (L - H)</th>
                  <th className="py-3.5 px-3 text-right hidden lg:table-cell">Day High / Low</th>
                  <th className="py-3.5 px-4 text-center">Trade & Orders</th>
                  <th className="py-3.5 px-3 text-center">Manage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40 font-medium">
                {currentItems.map((item, idx) => {
                  const symbol = (item?.symbol || "").toString().trim().toUpperCase();
                  if (!symbol) return null;

                  const quote = quotes[symbol] ?? getQuoteSync(symbol);
                  const ltp = quote?.price_paise ?? 0;
                  const chgPct = quote?.change_percent ?? 0;
                  const isPos = chgPct >= 0;

                  const prevClose = ltp > 0 ? Math.round(ltp / (1 + chgPct / 100)) : 0;
                  const chgPaise = ltp > 0 ? ltp - prevClose : 0;

                  const lowPaise = quote?.low_paise ?? Math.round(ltp * 0.985);
                  const highPaise = quote?.high_paise ?? Math.round(ltp * 1.015);
                  const range = highPaise - lowPaise || 1;
                  const rangePct = ltp > 0 ? Math.min(100, Math.max(0, ((ltp - lowPaise) / range) * 100)) : 0;

                  return (
                    <tr
                      key={`${symbol}-${idx}`}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group"
                    >
                      {/* Instrument */}
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-extrabold text-[11px] flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700/60 group-hover:border-cyan-500/40">
                            {symbol.slice(0, 3)}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span
                                onClick={() => handleTrade(symbol)}
                                className="font-bold text-sm text-slate-900 dark:text-slate-100 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors cursor-pointer"
                              >
                                {symbol}
                              </span>
                              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 uppercase font-bold">
                                {item.exchange || "NSE"}
                              </span>
                            </div>
                            <span className="text-[11px] text-slate-400 line-clamp-1 max-w-[200px]">
                              {item.name || `${symbol} Ltd`}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* LTP */}
                      <td className="py-3.5 px-3 text-right font-black text-slate-900 dark:text-slate-100 font-tabular text-sm">
                        {ltp > 0 ? formatPaise(ltp) : "--"}
                      </td>

                      {/* Day Change */}
                      <td className="py-3.5 px-3 text-right font-tabular">
                        {ltp > 0 ? (
                          <>
                            <div
                              className={`inline-flex items-center justify-end gap-1 font-bold text-xs ${
                                isPos ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                              }`}
                            >
                              {isPos ? (
                                <ArrowUpRight className="w-3.5 h-3.5" />
                              ) : (
                                <ArrowDownRight className="w-3.5 h-3.5" />
                              )}
                              <span>
                                {isPos ? "+" : ""}
                                {formatPercent(chgPct)}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {isPos ? "+" : ""}
                              {formatPaise(chgPaise)}
                            </div>
                          </>
                        ) : (
                          <span className="text-xs text-slate-400">--</span>
                        )}
                      </td>

                      {/* Intraday Range (Visual Slider) */}
                      <td className="py-3.5 px-4 hidden md:table-cell">
                        <div className="space-y-1 w-full max-w-[140px]">
                          <div className="flex justify-between text-[10px] text-slate-400 font-mono font-medium">
                            <span>L: {formatPaise(lowPaise)}</span>
                            <span>H: {formatPaise(highPaise)}</span>
                          </div>
                          <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden relative">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                isPos ? "bg-emerald-500" : "bg-rose-500"
                              }`}
                              style={{ width: `${rangePct}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Day High / Low */}
                      <td className="py-3.5 px-3 text-right font-mono text-[11px] text-slate-500 dark:text-slate-400 hidden lg:table-cell font-tabular">
                        <div>H: {formatPaise(highPaise)}</div>
                        <div className="text-slate-400">L: {formatPaise(lowPaise)}</div>
                      </td>

                      {/* Fast Execution Buttons */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleTrade(symbol)}
                            className="px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer flex items-center gap-1"
                            title="Buy / Trade"
                          >
                            <span>Buy</span>
                          </button>
                          <button
                            onClick={() => handleTrade(symbol)}
                            className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer flex items-center gap-1"
                            title="Sell"
                          >
                            <span>Sell</span>
                          </button>
                          <button
                            onClick={() => handleTrade(symbol)}
                            className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                            title="Open Stock Details"
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                      {/* Delete from Watchlist */}
                      <td className="py-3.5 px-3 text-center">
                        <button
                          onClick={() => handleRemoveSymbol(symbol)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors opacity-60 group-hover:opacity-100 cursor-pointer"
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
