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

interface BaseInstrument {
  symbol: string;
  name: string;
  fallbackPriceRupees: number;
  category: "NIFTY 50" | "High Growth & Trending" | "PSU & Defence" | "Indices & F&O";
}

const BASE_INSTRUMENTS: BaseInstrument[] = [
  // NIFTY 50 Bluechips
  { symbol: "RELIANCE", name: "Reliance Industries", fallbackPriceRupees: 2985.5, category: "NIFTY 50" },
  { symbol: "TCS", name: "Tata Consultancy Services", fallbackPriceRupees: 4210.0, category: "NIFTY 50" },
  { symbol: "INFY", name: "Infosys Ltd", fallbackPriceRupees: 1785.2, category: "NIFTY 50" },
  { symbol: "HDFCBANK", name: "HDFC Bank Ltd", fallbackPriceRupees: 1642.5, category: "NIFTY 50" },
  { symbol: "ICICIBANK", name: "ICICI Bank Ltd", fallbackPriceRupees: 1215.3, category: "NIFTY 50" },
  { symbol: "SBIN", name: "State Bank of India", fallbackPriceRupees: 785.0, category: "NIFTY 50" },
  { symbol: "ITC", name: "ITC Ltd", fallbackPriceRupees: 492.5, category: "NIFTY 50" },
  { symbol: "BHARTIARTL", name: "Bharti Airtel Ltd", fallbackPriceRupees: 1564.0, category: "NIFTY 50" },
  { symbol: "LT", name: "Larsen & Toubro Ltd", fallbackPriceRupees: 3620.0, category: "NIFTY 50" },
  { symbol: "HINDUNILVR", name: "Hindustan Unilever", fallbackPriceRupees: 2840.0, category: "NIFTY 50" },
  { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank", fallbackPriceRupees: 1790.0, category: "NIFTY 50" },
  { symbol: "AXISBANK", name: "Axis Bank Ltd", fallbackPriceRupees: 1180.0, category: "NIFTY 50" },
  { symbol: "MARUTI", name: "Maruti Suzuki India", fallbackPriceRupees: 12450.0, category: "NIFTY 50" },
  { symbol: "SUNPHARMA", name: "Sun Pharma Industries", fallbackPriceRupees: 1840.0, category: "NIFTY 50" },
  { symbol: "TITAN", name: "Titan Company Ltd", fallbackPriceRupees: 3450.0, category: "NIFTY 50" },
  { symbol: "WIPRO", name: "Wipro Ltd", fallbackPriceRupees: 528.0, category: "NIFTY 50" },

  // High Growth & Trending
  { symbol: "ZOMATO", name: "Zomato Ltd (Eternal)", fallbackPriceRupees: 282.4, category: "High Growth & Trending" },
  { symbol: "TATAMOTORS", name: "Tata Motors Ltd", fallbackPriceRupees: 985.2, category: "High Growth & Trending" },
  { symbol: "TATASTEEL", name: "Tata Steel Ltd", fallbackPriceRupees: 152.8, category: "High Growth & Trending" },
  { symbol: "TRENT", name: "Trent Ltd (Westside & Zudio)", fallbackPriceRupees: 7140.0, category: "High Growth & Trending" },
  { symbol: "BAJFINANCE", name: "Bajaj Finance Ltd", fallbackPriceRupees: 7120.0, category: "High Growth & Trending" },
  { symbol: "ADANIENT", name: "Adani Enterprises", fallbackPriceRupees: 2980.0, category: "High Growth & Trending" },
  { symbol: "SUZLON", name: "Suzlon Energy Ltd", fallbackPriceRupees: 74.5, category: "High Growth & Trending" },

  // PSU & Defence
  { symbol: "BEL", name: "Bharat Electronics Ltd", fallbackPriceRupees: 292.0, category: "PSU & Defence" },
  { symbol: "HAL", name: "Hindustan Aeronautics", fallbackPriceRupees: 4450.0, category: "PSU & Defence" },
  { symbol: "POWERGRID", name: "Power Grid Corp", fallbackPriceRupees: 325.0, category: "PSU & Defence" },
  { symbol: "NTPC", name: "NTPC Ltd", fallbackPriceRupees: 395.0, category: "PSU & Defence" },
  { symbol: "COALINDIA", name: "Coal India Ltd", fallbackPriceRupees: 485.0, category: "PSU & Defence" },
  { symbol: "ONGC", name: "Oil & Natural Gas Corp", fallbackPriceRupees: 295.0, category: "PSU & Defence" },

  // Indices & Derivatives
  { symbol: "NIFTY", name: "Nifty 50 Index", fallbackPriceRupees: 25378.0, category: "Indices & F&O" },
  { symbol: "BANKNIFTY", name: "Bank Nifty Index", fallbackPriceRupees: 52450.0, category: "Indices & F&O" },
];

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
    queryKey: ["mentor-stocks-search", debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery) return [];
      try {
        const res = await apiFetch<StockSearchResult[]>(
          `/stocks?q=${encodeURIComponent(debouncedQuery)}`
        );
        return res || [];
      } catch {
        return [];
      }
    },
    enabled: debouncedQuery.length > 0,
    staleTime: 30_000,
  });

  // Real-time quotes for quick picks and active symbols
  const subscribedSymbols = useMemo(() => {
    const s = new Set<string>();
    BASE_INSTRUMENTS.forEach((i) => s.add(i.symbol));
    dbResults.forEach((r) => s.add(r.symbol));
    s.add(symbol);
    return Array.from(s);
  }, [dbResults, symbol]);

  const liveQuotes = useMultiSymbolQuotes(subscribedSymbols);

  useEffect(() => {
    fetchBatchQuotes(subscribedSymbols).catch(() => {});
  }, [subscribedSymbols]);

  // Resolved price helper (live quote price or fallback)
  const getSymbolPrice = useCallback(
    (sym: string, defaultPrice = 0): number => {
      const q = liveQuotes[sym];
      if (q?.price_paise && q.price_paise > 0) {
        return Number((q.price_paise / 100).toFixed(2));
      }
      const matched = BASE_INSTRUMENTS.find((i) => i.symbol === sym);
      return matched?.fallbackPriceRupees ?? defaultPrice;
    },
    [liveQuotes]
  );

  // Filtered base instruments if search is active but DB returned no rows or user is typing offline
  const filteredBaseInstruments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return BASE_INSTRUMENTS;
    return BASE_INSTRUMENTS.filter(
      (inst) => inst.symbol.toLowerCase().includes(q) || inst.name.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  // Simulation Results
  const [simulating, setSimulating] = useState(false);
  const [result, setResult] = useState<PreTradeCheckResponse | null>(null);
  const [simError, setSimError] = useState<string | null>(null);

  // Apply a Stock Selection
  const handleSelectStock = (stockSymbol: string, stockPrice?: number) => {
    const clean = stockSymbol.toUpperCase();
    setSymbol(clean);
    setIsSearchOpen(false);
    setSearchQuery("");

    const price = stockPrice ?? getSymbolPrice(clean, priceRupees);
    if (price > 0) {
      setPriceRupees(price);
      setTargetRupees(Number((price * 1.025).toFixed(1)));
      setStopLossRupees(Number((price * 0.985).toFixed(1)));
    }
  };

  // Apply Preset Setup
  const handleApplyPreset = (preset: "conservative" | "aggressive" | "fno") => {
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
      const sym = "NIFTY";
      const price = getSymbolPrice(sym, 25378.0);
      setSymbol(sym);
      setSide("BUY");
      setProduct("FNO");
      setQuantity(50);
      setPriceRupees(price);
      setTargetRupees(Number((price * 1.01).toFixed(1)));
      setStopLossRupees(Number((price * 0.995).toFixed(1)));
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
                44,500+ NSE/NFO Instruments
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Simulate hypothetical order tickets, margin commitments, and risk-reward symmetry for any stock or index before executing.
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
            onClick={() => handleApplyPreset("fno")}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-orange-50 via-amber-50 to-orange-50 dark:from-orange-950/40 dark:via-amber-950/30 dark:to-orange-950/40 hover:from-orange-100 hover:to-amber-100 text-orange-950 dark:text-orange-200 text-xs font-bold border border-orange-300/90 dark:border-orange-700/60 shadow-sm shadow-orange-500/10 transition-all shrink-0 hover:scale-[1.02] active:scale-95 cursor-pointer"
          >
            F&O Index Setup
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
              {["RELIANCE", "TCS", "ITC", "ZOMATO", "HDFCBANK", "TATAMOTORS", "NIFTY"].map((s) => {
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
                  placeholder="Search 44,500+ NSE & NFO stocks, indices, futures..."
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
                    style={{ backgroundColor: "var(--surface, #ffffff)", opacity: 1 }}
                    className="absolute z-50 left-0 right-0 top-full mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl ring-1 ring-slate-900/10 dark:ring-white/10 max-h-72 overflow-y-auto p-1.5 divide-y divide-slate-100 dark:divide-slate-800 backdrop-blur-none"
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
                        const livePrice = getSymbolPrice(
                          inst.symbol,
                          inst.price_paise ? inst.price_paise / 100 : 0
                        );
                        return (
                          <button
                            key={inst.token || inst.symbol}
                            type="button"
                            onClick={() =>
                              handleSelectStock(inst.display_name || inst.symbol, livePrice > 0 ? livePrice : undefined)
                            }
                            className={`w-full text-left px-3 py-2 rounded-xl flex items-center justify-between text-xs transition-colors cursor-pointer ${
                              symbol === (inst.display_name || inst.symbol)
                                ? "bg-slate-100 dark:bg-slate-800 font-bold"
                                : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
                            }`}
                          >
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-slate-900 dark:text-slate-100">
                                  {inst.display_name || inst.symbol}
                                </span>
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold border border-slate-200 dark:border-slate-700">
                                  {inst.exchange_segment || "NSE"} {inst.instrument_type || ""}
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
                                <span className="text-[10px] text-slate-400 font-mono">Realtime</span>
                              )}
                            </div>
                          </button>
                        );
                      })}

                    {/* Curated Instruments when not searching or empty query */}
                    {(!debouncedQuery || dbResults.length === 0) &&
                      filteredBaseInstruments.map((inst) => {
                        const livePrice = getSymbolPrice(inst.symbol, inst.fallbackPriceRupees);
                        return (
                          <button
                            key={inst.symbol}
                            type="button"
                            onClick={() => handleSelectStock(inst.symbol, livePrice)}
                            className={`w-full text-left px-3 py-2 rounded-xl flex items-center justify-between text-xs transition-colors cursor-pointer ${
                              symbol === inst.symbol
                                ? "bg-slate-100 dark:bg-slate-800 font-bold"
                                : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
                            }`}
                          >
                            <div>
                              <span className="font-bold text-slate-900 dark:text-slate-100 block">
                                {inst.symbol}
                              </span>
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate max-w-[200px]">
                                {inst.name}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="font-mono font-bold text-slate-800 dark:text-slate-200 block">
                                ₹{livePrice.toFixed(2)}
                              </span>
                              <span className="text-[9px] text-slate-400 block">
                                {inst.category}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                  </div>
                )}
              </div>

              {/* Grouped Select Dropdown with Real-Time Live Prices */}
              <div className="pt-1">
                <select
                  value={symbol}
                  onChange={(e) => {
                    const sel = e.target.value;
                    const price = getSymbolPrice(sel);
                    handleSelectStock(sel, price > 0 ? price : undefined);
                  }}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-100 font-bold focus:outline-none focus:border-cyan-500 shadow-sm text-xs cursor-pointer"
                >
                  <optgroup label="🌟 NIFTY 50 Bluechips">
                    {BASE_INSTRUMENTS.filter((i) => i.category === "NIFTY 50").map((inst) => {
                      const p = getSymbolPrice(inst.symbol, inst.fallbackPriceRupees);
                      return (
                        <option key={inst.symbol} value={inst.symbol}>
                          {inst.symbol} — {inst.name} (₹{p.toFixed(1)})
                        </option>
                      );
                    })}
                  </optgroup>
                  <optgroup label="🚀 High Growth & Trending">
                    {BASE_INSTRUMENTS.filter((i) => i.category === "High Growth & Trending").map((inst) => {
                      const p = getSymbolPrice(inst.symbol, inst.fallbackPriceRupees);
                      return (
                        <option key={inst.symbol} value={inst.symbol}>
                          {inst.symbol} — {inst.name} (₹{p.toFixed(1)})
                        </option>
                      );
                    })}
                  </optgroup>
                  <optgroup label="🛡️ PSU & Defence">
                    {BASE_INSTRUMENTS.filter((i) => i.category === "PSU & Defence").map((inst) => {
                      const p = getSymbolPrice(inst.symbol, inst.fallbackPriceRupees);
                      return (
                        <option key={inst.symbol} value={inst.symbol}>
                          {inst.symbol} — {inst.name} (₹{p.toFixed(1)})
                        </option>
                      );
                    })}
                  </optgroup>
                  <optgroup label="📊 Major Indices & F&O">
                    {BASE_INSTRUMENTS.filter((i) => i.category === "Indices & F&O").map((inst) => {
                      const p = getSymbolPrice(inst.symbol, inst.fallbackPriceRupees);
                      return (
                        <option key={inst.symbol} value={inst.symbol}>
                          {inst.symbol} — {inst.name} (₹{p.toFixed(1)})
                        </option>
                      );
                    })}
                  </optgroup>
                  {!BASE_INSTRUMENTS.some((i) => i.symbol === symbol) && (
                    <option value={symbol}>
                      {symbol} (Active Counter — ₹{priceRupees.toFixed(1)})
                    </option>
                  )}
                </select>
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
