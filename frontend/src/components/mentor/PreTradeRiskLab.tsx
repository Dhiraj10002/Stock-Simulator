"use client";

import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTradingStore } from "@/stores/trading-store";
import { useMultiSymbolQuotes } from "@/stores/market-store";
import { useAccountWallet } from "@/hooks/useAccountWallet";
import { useAuthToken } from "@/hooks/useAuthToken";
import { fetchBatchQuotes } from "@/lib/quoteService";
import { sessionFetch, apiFetch } from "@/lib/api";
import { evaluatePreTradeRisk } from "@/lib/mentor";
import { getApiUrl } from "@/lib/config";
import type { OrderPreview } from "@/hooks/useOrderPreview";
import type { PreTradeCheckResponse, ApiResponse, StockSearchResult } from "@/types";
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Zap,
  SlidersHorizontal,
  ArrowRight,
  TrendingUp,
  Play,
  RotateCcw,
  Sparkles,
  Search,
  X,
  Loader2,
} from "lucide-react";

const POPULAR_NSE_SYMBOLS = [
  "RELIANCE",
  "TCS",
  "INFY",
  "ITC",
  "ZOMATO",
  "HDFCBANK",
  "TATAMOTORS",
  "SBIN",
] as const;

export default function PreTradeRiskLab({
  apiUrl = getApiUrl(),
  token: propToken,
}: {
  apiUrl?: string;
  token?: string;
}) {
  const router = useRouter();
  const setSelectedSymbol = useTradingStore((s) => s.setSelectedSymbol);

  // Auth & Wallet state
  const authToken = useAuthToken();
  const token = propToken || authToken;
  const { data: wallet } = useAccountWallet();

  // Form State
  const [symbol, setSymbol] = useState("RELIANCE");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [product, setProduct] = useState<"DELIVERY" | "INTRADAY" | "FNO">("INTRADAY");
  const [orderType, setOrderType] = useState<"MARKET" | "LIMIT" | "SL" | "SL-M">("LIMIT");
  const [quantity, setQuantity] = useState(50);
  const [priceRupees, setPriceRupees] = useState(2985.5);
  const [targetRupees, setTargetRupees] = useState(3065.0);
  const [stopLossRupees, setStopLossRupees] = useState(2945.0);

  const searchContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Live PostgreSQL search debounce
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data: dbResults = [], isFetching: isSearching } = useQuery<StockSearchResult[]>({
    queryKey: ["mentor-stocks-search-nse", debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery) return [];
      try {
        const res = await apiFetch<StockSearchResult[]>(
          `/stocks?q=${encodeURIComponent(debouncedQuery)}&segment=NSE`
        );
        return (res || []).filter(
          (s) =>
            (s.exchange_segment === "NSE" || !s.exchange_segment) &&
            s.instrument_type !== "FUTIDX" &&
            s.instrument_type !== "OPTIDX" &&
            s.instrument_type !== "FUTSTK" &&
            s.instrument_type !== "OPTSTK"
        );
      } catch {
        return [];
      }
    },
    enabled: debouncedQuery.length > 0,
    staleTime: 30_000,
  });

  // Real-time quotes for quick picks and active symbols
  const subscribedSymbols = useMemo(() => {
    const s = new Set<string>(POPULAR_NSE_SYMBOLS);
    dbResults.forEach((r) => s.add(r.symbol));
    if (symbol) s.add(symbol);
    return Array.from(s);
  }, [dbResults, symbol]);

  const liveQuotes = useMultiSymbolQuotes(subscribedSymbols);

  useEffect(() => {
    fetchBatchQuotes(subscribedSymbols).catch(() => {});
  }, [subscribedSymbols]);

  // Resolved price helper from live quotes
  const getSymbolPrice = useCallback(
    (sym: string, defaultPrice = 0): number => {
      const q = liveQuotes[sym];
      if (q?.price_paise && q.price_paise > 0) {
        return Number((q.price_paise / 100).toFixed(2));
      }
      return defaultPrice;
    },
    [liveQuotes]
  );

  // Simulation Results
  const [simulating, setSimulating] = useState(false);
  const [result, setResult] = useState<PreTradeCheckResponse | null>(null);
  const [simError, setSimError] = useState<string | null>(null);

  // Apply a Stock Selection
  const handleSelectStock = (stockSymbol: string, stockPrice?: number) => {
    const clean = stockSymbol.replace(/-EQ$/, "").toUpperCase();
    setSymbol(clean);
    setIsSearchOpen(false);
    setSearchQuery("");

    const price = stockPrice ?? getSymbolPrice(clean, priceRupees);
    if (price > 0) {
      setPriceRupees(price);
      if (product === "INTRADAY") {
        setTargetRupees(Number((price * 1.02).toFixed(1)));
        setStopLossRupees(Number((price * 0.99).toFixed(1)));
      } else {
        setTargetRupees(Number((price * 1.035).toFixed(1)));
        setStopLossRupees(Number((price * 0.985).toFixed(1)));
      }
    }
    setResult(null);
    setSimError(null);
  };

  // Apply Preset Setup
  const handleApplyPreset = (preset: "conservative" | "aggressive" | "momentum") => {
    if (preset === "conservative") {
      const sym = "RELIANCE";
      const price = getSymbolPrice(sym, 2985.5);
      setSymbol(sym);
      setSide("BUY");
      setProduct("DELIVERY");
      setQuantity(25);
      setPriceRupees(price);
      setTargetRupees(Number((price * 1.035).toFixed(1)));
      setStopLossRupees(Number((price * 0.985).toFixed(1)));
    } else if (preset === "aggressive") {
      const sym = "TATAMOTORS";
      const price = getSymbolPrice(sym, 985.2);
      setSymbol(sym);
      setSide("BUY");
      setProduct("INTRADAY");
      setQuantity(150);
      setPriceRupees(price);
      setTargetRupees(Number((price * 1.02).toFixed(1)));
      setStopLossRupees(Number((price * 0.988).toFixed(1)));
    } else {
      const sym = "INFY";
      const price = getSymbolPrice(sym, 1785.2);
      setSymbol(sym);
      setSide("BUY");
      setProduct("INTRADAY");
      setQuantity(100);
      setPriceRupees(price);
      setTargetRupees(Number((price * 1.025).toFixed(1)));
      setStopLossRupees(Number((price * 0.988).toFixed(1)));
    }
    setResult(null);
    setSimError(null);
  };

  // Run Simulation
  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSimulating(true);
    setSimError(null);
    setResult(null);

    const payload = {
      symbol,
      side,
      product,
      type: orderType,
      quantity,
      price_paise: Math.round(priceRupees * 100),
      target_paise: targetRupees > 0 ? Math.round(targetRupees * 100) : undefined,
      stop_loss_paise: stopLossRupees > 0 ? Math.round(stopLossRupees * 100) : undefined,
    };

    // 1. Authoritative Backend AI Audit when authenticated
    if (token) {
      try {
        const res = await sessionFetch(`${apiUrl}/ai/pretrade-check`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });

        const json: ApiResponse<PreTradeCheckResponse> = await res.json();
        if (res.ok && json.success && json.data) {
          let marginData = {
            required_margin_paise: json.data.required_margin_paise,
            available_balance_paise: json.data.available_balance_paise,
            margin_impact_pct: json.data.margin_impact_pct,
          };

          // Gracefully attempt preview enrichment for exact order book funds calculation
          try {
            const preview = await apiFetch<OrderPreview>("/orders/preview", {
              method: "POST",
              body: JSON.stringify({
                symbol,
                side,
                product,
                type: orderType,
                quantity,
                price_paise: orderType === "MARKET" ? 0 : Math.round(priceRupees * 100),
                trigger_price_paise: ["SL", "SL-M"].includes(orderType)
                  ? Math.round(stopLossRupees * 100)
                  : undefined,
              }),
            });
            if (preview) {
              marginData = {
                required_margin_paise: preview.required_funds_paise,
                available_balance_paise: preview.available_balance_paise,
                margin_impact_pct:
                  preview.available_balance_paise > 0
                    ? (preview.required_funds_paise / preview.available_balance_paise) * 100
                    : 0,
              };
            }
          } catch {
            // Non-fatal: json.data already provides calculated margin values
          }

          setResult({ ...json.data, ...marginData });
          setSimulating(false);
          return;
        } else if (!res.ok && json.message) {
          // Display the authoritative backend validation message (e.g. tick size, circuit breach)
          setSimError(json.message);
          setSimulating(false);
          return;
        }
      } catch (error) {
        console.warn("Backend pre-trade check unavailable, falling back to local simulation:", error);
      }
    }

    // 2. High-Fidelity Client-Side Simulation Fallback
    // Guarantees the Simulation Lab works smoothly even offline, during token refresh, or unauthenticated.
    const availableCapital = wallet?.available_balance_paise
      ? wallet.available_balance_paise / 100
      : 1000000;

    const localEval = evaluatePreTradeRisk({
      side,
      product,
      price: priceRupees,
      stopLoss: stopLossRupees > 0 ? stopLossRupees : undefined,
      target: targetRupees > 0 ? targetRupees : undefined,
      quantity,
      availableCapital,
      symbol,
    });

    setResult({
      risk_level: localEval.riskLevel,
      risk_score: localEval.score,
      required_margin_paise: Math.round(localEval.requiredMarginRupees * 100),
      available_balance_paise: wallet?.available_balance_paise ?? 100000000,
      margin_impact_pct: localEval.marginImpactPct,
      concentration_impact_pct: 0,
      risk_reward_ratio: localEval.riskRewardRatio,
      warnings: localEval.warnings,
      advice: localEval.advice,
    });
    setSimulating(false);
  };

  const handleLaunchInStocks = () => {
    setSelectedSymbol(symbol);
    router.push(`/stocks/${encodeURIComponent(symbol)}`);
  };

  return (
    <div className="space-y-6 text-xs max-w-5xl mx-auto">
      {/* Top Banner & Presets Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 bg-gradient-to-r from-slate-50 via-white to-indigo-50/40 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm transition-all">
        <div className="flex items-center gap-3.5">
          <div className="p-2.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/80 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 shadow-sm shrink-0">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-black text-sm sm:text-base text-slate-900 dark:text-slate-100 tracking-tight">
                Pre-Trade Risk & Margin Simulation Lab
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800">
                NSE Equities (Real-Time Quotes)
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Simulate hypothetical order tickets, margin commitments, and risk-reward symmetry for any NSE stock before executing.
            </p>
          </div>
        </div>

        {/* Preset Setup Buttons */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none shrink-0">
          <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider shrink-0">
            Presets:
          </span>
          <button
            type="button"
            onClick={() => handleApplyPreset("conservative")}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-orange-50 via-amber-50 to-orange-50 dark:from-orange-950/40 dark:via-amber-950/30 dark:to-orange-950/40 hover:from-orange-100 hover:to-amber-100 text-orange-950 dark:text-orange-200 text-xs font-bold border border-orange-300/90 dark:border-orange-700/60 shadow-sm shadow-orange-500/10 transition-all shrink-0 hover:scale-[1.02] active:scale-95 cursor-pointer"
          >
            Swing CNC (1:2.5)
          </button>
          <button
            type="button"
            onClick={() => handleApplyPreset("aggressive")}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-orange-50 via-amber-50 to-orange-50 dark:from-orange-950/40 dark:via-amber-950/30 dark:to-orange-950/40 hover:from-orange-100 hover:to-amber-100 text-orange-950 dark:text-orange-200 text-xs font-bold border border-orange-300/90 dark:border-orange-700/60 shadow-sm shadow-orange-500/10 transition-all shrink-0 hover:scale-[1.02] active:scale-95 cursor-pointer"
          >
            MIS Scalp (1:1.5)
          </button>
          <button
            type="button"
            onClick={() => handleApplyPreset("momentum")}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-orange-50 via-amber-50 to-orange-50 dark:from-orange-950/40 dark:via-amber-950/30 dark:to-orange-950/40 hover:from-orange-100 hover:to-amber-100 text-orange-950 dark:text-orange-200 text-xs font-bold border border-orange-300/90 dark:border-orange-700/60 shadow-sm shadow-orange-500/10 transition-all shrink-0 hover:scale-[1.02] active:scale-95 cursor-pointer"
          >
            Intraday Momentum (1:2)
          </button>
        </div>
      </div>

      {/* Grid: Left Form Setup + Right Simulation Results */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left (5 cols): Parameter Inputs */}
        <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
              Hypothetical Ticket
            </span>
            <button
              type="button"
              onClick={() => handleApplyPreset("conservative")}
              className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 flex items-center gap-1 font-semibold transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          </div>

          {/* Quick Stock Chips with Live Market Prices */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Quick Pick Counters:
              </span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Rates
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {POPULAR_NSE_SYMBOLS.map((s) => {
                const live = getSymbolPrice(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleSelectStock(s, live)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer flex items-center gap-1 ${
                      symbol === s
                        ? "bg-cyan-500 text-slate-950 border-cyan-400 shadow-sm scale-105"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-cyan-400"
                    }`}
                  >
                    <span>{s}</span>
                    {live > 0 && (
                      <span className="opacity-75 font-mono text-[9px]">
                        ₹{live.toFixed(0)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <form onSubmit={handleSimulate} className="space-y-4 text-xs">
            {/* Search & Custom Stock Input */}
            <div ref={searchContainerRef} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                  Instrument Symbol or Search
                </label>
                <span className="text-[10px] text-cyan-600 dark:text-cyan-400 font-mono font-bold">
                  Active: {symbol} (₹{priceRupees.toFixed(2)})
                </span>
              </div>

              {/* Input with 100% Solid & Opaque Dropdown Anchor */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3.5 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search any NSE stock (e.g., RELIANCE, TCS, INFY, TATAMOTORS)..."
                  value={searchQuery}
                  onFocus={() => setIsSearchOpen(true)}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setIsSearchOpen(true);
                  }}
                  className="w-full pl-9 pr-8 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 font-medium placeholder-slate-400 focus:outline-none focus:border-cyan-500 shadow-sm text-xs"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                    }}
                    className="absolute right-2.5 top-2.5 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* 100% Solid & Opaque Search Results Dropdown */}
                {isSearchOpen && (
                  <div
                    className="solid-opaque-dropdown absolute z-50 left-0 right-0 top-full mt-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-h-72 overflow-y-auto p-1.5 divide-y divide-slate-100 dark:divide-slate-800"
                  >
                    {/* Custom Ticker Button if typed */}
                    {searchQuery.trim() && (
                      <button
                        type="button"
                        onClick={() => handleSelectStock(searchQuery.trim())}
                        className="w-full text-left p-2 rounded-xl bg-cyan-50 dark:bg-cyan-950/60 text-cyan-800 dark:text-cyan-300 hover:bg-cyan-100 dark:hover:bg-cyan-900/80 font-bold flex items-center justify-between transition-colors mb-1 cursor-pointer"
                      >
                        <span className="flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-cyan-600" />
                          Simulate Custom Ticker: <strong>{searchQuery.trim().toUpperCase()}</strong>
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-200 dark:bg-cyan-800 text-cyan-900 dark:text-cyan-100 font-mono">
                          Custom
                        </span>
                      </button>
                    )}

                    {/* Searching status */}
                    {isSearching && (
                      <div className="p-3 text-center text-slate-400 flex items-center justify-center gap-2 text-xs">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-500" />
                        <span>Searching PostgreSQL master catalog…</span>
                      </div>
                    )}

                    {/* Live PostgreSQL Results */}
                    {dbResults.length > 0 &&
                      dbResults.slice(0, 15).map((inst) => {
                        const cleanSym = inst.display_name || inst.symbol.replace(/-EQ$/, "");
                        const livePrice = getSymbolPrice(
                          cleanSym,
                          inst.price_paise ? inst.price_paise / 100 : 0
                        );
                        return (
                          <button
                            key={inst.token || inst.symbol}
                            type="button"
                            onClick={() =>
                              handleSelectStock(cleanSym, livePrice > 0 ? livePrice : undefined)
                            }
                            className={`w-full text-left px-3 py-2 rounded-xl flex items-center justify-between text-xs transition-colors cursor-pointer ${
                              symbol === cleanSym
                                ? "bg-cyan-50 dark:bg-cyan-950/40 text-cyan-900 dark:text-cyan-200 font-bold"
                                : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
                            }`}
                          >
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-slate-900 dark:text-slate-100">
                                  {cleanSym}
                                </span>
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold border border-slate-200 dark:border-slate-700">
                                  {inst.exchange_segment || "NSE"}
                                </span>
                              </div>
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate max-w-[220px]">
                                {inst.name}
                              </span>
                            </div>
                            <div className="text-right">
                              {livePrice > 0 ? (
                                <span className="font-mono font-bold text-slate-800 dark:text-slate-200 block">
                                  ₹{livePrice.toFixed(2)}
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-400 font-mono">Live Rate</span>
                              )}
                            </div>
                          </button>
                        );
                      })}

                    {/* Empty Query / Default Quick Suggestions from Live Market */}
                    {!debouncedQuery && (
                      <div className="p-2 space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block px-1 pb-1">
                          Popular NSE Counters
                        </span>
                        {POPULAR_NSE_SYMBOLS.map((s) => {
                          const livePrice = getSymbolPrice(s);
                          return (
                            <button
                              key={s}
                              type="button"
                              onClick={() => handleSelectStock(s, livePrice > 0 ? livePrice : undefined)}
                              className={`w-full text-left px-3 py-1.5 rounded-xl flex items-center justify-between text-xs transition-colors cursor-pointer ${
                                symbol === s
                                  ? "bg-cyan-50 dark:bg-cyan-950/40 text-cyan-900 dark:text-cyan-200 font-bold"
                                  : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
                              }`}
                            >
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-slate-900 dark:text-slate-100">
                                  {s}
                                </span>
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold border border-slate-200 dark:border-slate-700">
                                  NSE
                                </span>
                              </div>
                              <span className="font-mono font-bold text-slate-800 dark:text-slate-200 text-xs">
                                {livePrice > 0 ? `₹${livePrice.toFixed(2)}` : "Live Rate"}
                              </span>
                            </button>
                          );
                        })}
                        <div className="pt-2 px-1 text-[10px] text-slate-400 text-center border-t border-slate-100 dark:border-slate-800">
                          Type to search 44,500+ NSE stocks in real-time
                        </div>
                      </div>
                    )}

                    {debouncedQuery && !isSearching && dbResults.length === 0 && (
                      <div className="p-4 text-center space-y-1">
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          No matching NSE stocks for &quot;{debouncedQuery}&quot;
                        </p>
                        <p className="text-[10px] text-slate-400">
                          You can still simulate using custom ticker above.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Active Selected Counter Card (Replaces Hardcoded Select Dropdown) */}
              <div className="pt-1">
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-cyan-500/10 dark:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 flex items-center justify-center font-black text-xs">
                      {symbol.slice(0, 2)}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-xs sm:text-sm text-slate-900 dark:text-slate-100">
                          {symbol}
                        </span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-cyan-100 dark:bg-cyan-950/60 text-cyan-800 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800">
                          NSE Equity
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                        Selected for Pre-Execution Audit
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 block">
                      ₹{priceRupees > 0 ? priceRupees.toFixed(2) : "—"}
                    </span>
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center justify-end gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Live Feed
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Side & Product Selectors */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">Order Side</label>
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setSide("BUY")}
                    className={`py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                      side === "BUY"
                        ? "bg-emerald-500 text-slate-950 shadow-sm"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    BUY
                  </button>
                  <button
                    type="button"
                    onClick={() => setSide("SELL")}
                    className={`py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                      side === "SELL"
                        ? "bg-rose-500 text-white shadow-sm"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    SELL
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">Product</label>
                <select
                  value={product}
                  onChange={(e) => setProduct(e.target.value as "DELIVERY" | "INTRADAY" | "FNO")}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:border-cyan-500 shadow-sm cursor-pointer"
                >
                  <option value="DELIVERY">CNC (Delivery)</option>
                  <option value="INTRADAY">MIS (Intraday 5x)</option>
                  <option value="FNO">F&O (Derivatives)</option>
                </select>
              </div>
            </div>

            {/* Quantity & Order Type */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">Quantity (Units)</label>
                <input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-slate-100 font-mono font-bold focus:outline-none focus:border-cyan-500 shadow-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">Order Type</label>
                <select
                  value={orderType}
                  onChange={(e) =>
                    setOrderType(e.target.value as "MARKET" | "LIMIT" | "SL" | "SL-M")
                  }
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:border-cyan-500 shadow-sm cursor-pointer"
                >
                  <option value="LIMIT">LIMIT</option>
                  <option value="MARKET">MARKET</option>
                  <option value="SL">STOP LOSS (SL)</option>
                  <option value="SL-M">SL-MARKET</option>
                </select>
              </div>
            </div>

            {/* Entry Price */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                Entry Price (₹)
              </label>
              <input
                type="number"
                step={0.05}
                value={priceRupees}
                onChange={(e) => setPriceRupees(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-slate-100 font-mono font-bold focus:outline-none focus:border-cyan-500 shadow-sm"
              />
            </div>

            {/* Bracket Risk Safeguards: Target & Stop-Loss */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  Target Price (₹)
                </label>
                <input
                  type="number"
                  step={0.05}
                  value={targetRupees}
                  onChange={(e) => setTargetRupees(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-emerald-300 dark:border-emerald-800/80 rounded-xl px-3.5 py-2.5 text-emerald-700 dark:text-emerald-300 font-mono font-bold focus:outline-none focus:border-emerald-500 shadow-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                  <ShieldAlert className="w-3 h-3" />
                  Stop-Loss Price (₹)
                </label>
                <input
                  type="number"
                  step={0.05}
                  value={stopLossRupees}
                  onChange={(e) => setStopLossRupees(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-rose-300 dark:border-rose-800/80 rounded-xl px-3.5 py-2.5 text-rose-700 dark:text-rose-300 font-mono font-bold focus:outline-none focus:border-rose-500 shadow-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={simulating}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-bold text-xs shadow-md shadow-cyan-500/20 transition-all hover:scale-[1.02] flex items-center justify-center gap-2 disabled:opacity-50 mt-4 cursor-pointer"
            >
              {simulating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Auditing Risk for {symbol}…</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Run Risk Check on {symbol}</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right (7 cols): Simulation Output & Behavioral Audit */}
        <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex flex-col justify-between space-y-6">
          <div>
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-200 dark:border-slate-800">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-indigo-500" />
                Pre-Execution AI Audit: <strong>{symbol}</strong>
              </span>
              {result && (
                <span
                  className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border uppercase tracking-wider ${
                    result.risk_level === "SAFE"
                      ? "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700"
                      : result.risk_level === "MODERATE"
                      ? "bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700"
                      : "bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-700"
                  }`}
                >
                  {result.risk_level}
                </span>
              )}
            </div>

            {simError && (
              <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2 mt-4 shadow-sm">
                <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                <span>{simError}</span>
              </div>
            )}

            {!result && !simError && (
              <div className="py-20 text-center text-slate-400 space-y-3">
                <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mx-auto shadow-inner">
                  <ShieldCheck className="w-7 h-7 text-cyan-600 dark:text-cyan-400" />
                </div>
                <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                  Awaiting Simulation Parameters
                </h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Select or search any stock on the left and click <strong>Run Risk Check</strong> to audit margin commitment, capital allocation, and payoff symmetry.
                </p>
              </div>
            )}

            {result && (
              <div className="space-y-4 mt-4">
                {/* Score & Ratio Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  {/* Safety Score */}
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5 shadow-sm">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">
                      Discipline Safety Score
                    </span>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl font-black font-tabular text-slate-900 dark:text-slate-100">
                        {result.risk_score ?? 88}
                      </span>
                      <span className="text-xs text-slate-400 font-bold">/ 100</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden mt-2">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          (result.risk_score ?? 88) >= 75
                            ? "bg-emerald-500"
                            : (result.risk_score ?? 88) >= 55
                            ? "bg-amber-500"
                            : "bg-rose-500"
                        }`}
                        style={{ width: `${result.risk_score ?? 88}%` }}
                      />
                    </div>
                  </div>

                  {/* Risk : Reward Ratio */}
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5 shadow-sm">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">
                      Risk : Reward (R:R)
                    </span>
                    <div
                      className={`text-2xl font-black font-tabular ${
                        (result.risk_score ?? 88) <= 45 ||
                        (result.risk_reward_ratio && result.risk_reward_ratio > 8)
                          ? "text-rose-600 dark:text-rose-400"
                          : "text-cyan-600 dark:text-cyan-300"
                      }`}
                    >
                      {result.risk_reward_ratio ? `1 : ${result.risk_reward_ratio.toFixed(2)}` : "—"}
                    </div>
                    <span className="text-[10px] text-slate-400 block">
                      {result.risk_reward_ratio != null && result.risk_reward_ratio >= 1.5
                        ? "Favorable Symmetry"
                        : result.risk_reward_ratio != null && result.risk_reward_ratio > 0
                        ? "Sub-Optimal R:R"
                        : "No Bracket Set"}
                    </span>
                  </div>

                  {/* Margin Commitment */}
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5 shadow-sm">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">
                      Required Margin
                    </span>
                    <div className="text-2xl font-black font-tabular text-slate-900 dark:text-slate-100">
                      ₹{(result.required_margin_paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                    </div>
                    <span className="text-[10px] text-slate-400 block font-mono">
                      {result.margin_impact_pct > 0
                        ? `${result.margin_impact_pct.toFixed(1)}% of trading margin`
                        : "Nominal impact"}
                    </span>
                  </div>
                </div>

                {/* Behavioral Warnings List */}
                {result.warnings && result.warnings.length > 0 && (
                  <div className="space-y-2 p-3.5 rounded-2xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/50">
                    <span className="text-[10px] font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Risk Flags & Behavioral Safeguards:
                    </span>
                    <ul className="space-y-1 text-xs text-amber-900 dark:text-amber-200">
                      {result.warnings.map((w, idx) => (
                        <li key={idx} className="flex items-start gap-1.5">
                          <span className="text-amber-500 font-bold">•</span>
                          <span>{w}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* AI Advice Callout */}
                {result.advice && (
                  <div className="p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/80 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300 font-bold text-xs">
                      <Sparkles className="w-4 h-4 text-indigo-500" />
                      <span>AI Pre-Trade Guidance</span>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                      {result.advice}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action Footer */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">
              Simulation only — no real funds or exchange orders dispatched.
            </span>
            <button
              type="button"
              onClick={handleLaunchInStocks}
              className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <span>Trade {symbol} Live</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
