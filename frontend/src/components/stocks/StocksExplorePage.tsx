"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Navbar from "@/components/layout/Navbar";
import { useMarketStore } from "@/stores/market-store";
import { fetchBatchQuotes, getCachedQuote } from "@/lib/quoteService";
import {
  TrendingUp,
  TrendingDown,
  Layers,
  PieChart,
  ArrowRight,
  Sparkles,
  Zap,
  Activity,
  BarChart3,
  Wallet as WalletIcon,
  Search,
  ChevronRight,
  Filter,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  Flame,
  ShieldCheck,
  Building2,
  Cpu,
  Car,
  Pill,
  Factory,
  ZapOff,
} from "lucide-react";
import { formatPaise, formatPercent } from "@/lib/format";
import { MASTER_STOCKS_CATALOG, WatchlistItem } from "@/components/dashboard/DashboardPage";
import type { Wallet, Portfolio, ApiResponse } from "@/types";

// ---------------------------------------------------------------------------
// TYPES & DATASETS FOR STOCKS EXPLORE
// ---------------------------------------------------------------------------
interface PopularStock {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  change: number;
  changePercent: number;
  marketCap: string;
  tag: string;
  color: string;
}

const POPULAR_STOCKS: PopularStock[] = [
  {
    symbol: "RELIANCE",
    name: "Reliance Industries Ltd",
    sector: "Energy & Conglomerate",
    price: 2980.4,
    change: 24.8,
    changePercent: 0.84,
    marketCap: "₹20.1 Lakh Cr",
    tag: "Large Cap",
    color: "from-blue-600 to-indigo-700",
  },
  {
    symbol: "HDFCBANK",
    name: "HDFC Bank Ltd",
    sector: "Banking & Financials",
    price: 1642.5,
    change: 16.1,
    changePercent: 0.99,
    marketCap: "₹12.5 Lakh Cr",
    tag: "Large Cap",
    color: "from-sky-600 to-blue-800",
  },
  {
    symbol: "TCS",
    name: "Tata Consultancy Services",
    sector: "IT & Technology",
    price: 4210.0,
    change: -35.0,
    changePercent: -0.82,
    marketCap: "₹15.2 Lakh Cr",
    tag: "Large Cap",
    color: "from-cyan-600 to-teal-700",
  },
  {
    symbol: "INFY",
    name: "Infosys Ltd",
    sector: "IT & Software Services",
    price: 1785.2,
    change: -12.4,
    changePercent: -0.69,
    marketCap: "₹7.4 Lakh Cr",
    tag: "Large Cap",
    color: "from-indigo-600 to-purple-800",
  },
  {
    symbol: "TATAMOTORS",
    name: "Tata Motors Ltd",
    sector: "Automotive & EV",
    price: 968.2,
    change: 18.3,
    changePercent: 1.93,
    marketCap: "₹3.5 Lakh Cr",
    tag: "Large Cap",
    color: "from-emerald-600 to-teal-800",
  },
  {
    symbol: "BHARTIARTL",
    name: "Bharti Airtel Ltd",
    sector: "Telecom & Cloud",
    price: 1564.0,
    change: 7.0,
    changePercent: 0.45,
    marketCap: "₹8.8 Lakh Cr",
    tag: "Large Cap",
    color: "from-rose-600 to-red-800",
  },
];

interface MostTradedStock {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: string;
  turnoverCr: number;
}

const MOST_TRADED_STOCKS: MostTradedStock[] = [
  { symbol: "ZOMATO", name: "Zomato Ltd (Eternal)", price: 272.5, change: 7.4, changePercent: 2.8, volume: "6.8 Cr", turnoverCr: 1850 },
  { symbol: "SUZLON", name: "Suzlon Energy Ltd", price: 74.5, change: 3.0, changePercent: 4.2, volume: "14.2 Cr", turnoverCr: 1058 },
  { symbol: "TRENT", name: "Trent Ltd (Westside & Zudio)", price: 7140.0, change: 328.0, changePercent: 4.82, volume: "38.5 Lakh", turnoverCr: 2748 },
  { symbol: "ADANIENT", name: "Adani Enterprises Ltd", price: 3140.0, change: 64.5, changePercent: 2.1, volume: "42.1 Lakh", turnoverCr: 1320 },
  { symbol: "YESBANK", name: "YES Bank Ltd", price: 24.15, change: 0.72, changePercent: 3.1, volume: "18.5 Cr", turnoverCr: 446 },
  { symbol: "BEL", name: "Bharat Electronics Ltd", price: 312.4, change: 11.3, changePercent: 3.75, volume: "2.4 Cr", turnoverCr: 750 },
];

interface IntradayStock {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  dayLow: number;
  dayHigh: number;
  volatility: string;
}

const TOP_INTRADAY_STOCKS: IntradayStock[] = [
  { symbol: "ATGL", name: "Adani Total Gas Ltd", price: 660.7, change: 73.7, changePercent: 12.56, dayLow: 588.0, dayHigh: 672.0, volatility: "High Beta (3.8%)" },
  { symbol: "POONAWALLA", name: "Poonawalla Fincorp Ltd", price: 479.4, change: 46.6, changePercent: 10.77, dayLow: 434.0, dayHigh: 488.5, volatility: "High Beta (4.1%)" },
  { symbol: "TATACHEM", name: "Tata Chemicals Ltd", price: 693.25, change: -86.1, changePercent: -11.04, dayLow: 685.0, dayHigh: 775.0, volatility: "Reversal Setup" },
  { symbol: "TATAPOWER", name: "Tata Power Co Ltd", price: 442.1, change: 13.7, changePercent: 3.2, dayLow: 429.0, dayHigh: 446.5, volatility: "Breakout (2.4%)" },
];

interface SectorTrending {
  id: string;
  name: string;
  icon: typeof Cpu;
  gainersCount: number;
  losersCount: number;
  changePercent: number;
  topStock: string;
}

const SECTORS_TRENDING: SectorTrending[] = [
  { id: "s1", name: "Automotive & Electric Mobility", icon: Car, gainersCount: 22, losersCount: 6, changePercent: 2.45, topStock: "TATAMOTORS (+1.93%)" },
  { id: "s2", name: "Banking & Financial Services", icon: Building2, gainersCount: 31, losersCount: 9, changePercent: 1.84, topStock: "ICICIBANK (+1.12%)" },
  { id: "s3", name: "Energy, Oil & Natural Gas", icon: Zap, gainersCount: 18, losersCount: 8, changePercent: 1.35, topStock: "ATGL (+12.56%)" },
  { id: "s4", name: "Consumer Discretionary & Retail", icon: Flame, gainersCount: 19, losersCount: 15, changePercent: 0.91, topStock: "TRENT (+4.82%)" },
  { id: "s5", name: "Pharmaceuticals & Healthcare", icon: Pill, gainersCount: 16, losersCount: 14, changePercent: 0.45, topStock: "SUNPHARMA (+0.90%)" },
  { id: "s6", name: "Metals & Mining", icon: Factory, gainersCount: 14, losersCount: 12, changePercent: -0.32, topStock: "TATASTEEL (+1.45%)" },
  { id: "s7", name: "Information Technology (IT)", icon: Cpu, gainersCount: 8, losersCount: 24, changePercent: -1.27, topStock: "TCS (-0.82%)" },
];

const MAJOR_INDICES_STRIP = [
  { name: "NIFTY 50", value: "25,320.00", change: "+88.20", percent: "+0.35%", isGain: true },
  { name: "SENSEX", value: "82,450.00", change: "+148.50", percent: "+0.18%", isGain: true },
  { name: "BANK NIFTY", value: "52,140.00", change: "+290.00", percent: "+0.56%", isGain: true },
  { name: "MIDCP NIFTY", value: "14,500.75", change: "+78.90", percent: "+0.55%", isGain: true },
  { name: "FIN NIFTY", value: "25,510.00", change: "+48.40", percent: "+0.19%", isGain: true },
];

// Helper to render mini SVG sparklines for table rows
function MiniSparkline({ isGain, points }: { isGain: boolean; points: number[] }) {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const w = 100;
  const h = 28;
  const pad = 2;

  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * (w - pad * 2) + pad;
    const y = h - pad - ((p - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const path = `M ${coords.join(" L ")}`;

  return (
    <svg width={w} height={h} className="overflow-visible">
      <path
        d={path}
        fill="none"
        stroke={isGain ? "#10b981" : "#f43f5e"}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function StocksExplorePage() {
  const router = useRouter();

  // Mover tabs & scope
  const [moverTab, setMoverTab] = useState<"gainers" | "losers" | "volume">("gainers");
  const [indexScope, setIndexScope] = useState<"NIFTY 100" | "NIFTY 500">("NIFTY 100");

  const [token] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return (
        localStorage.getItem("auth_token") ||
        localStorage.getItem("stock-simulator-access-token") ||
        ""
      );
    }
    return "";
  });

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1";

  // 1. Fetch Wallet for Available Margin
  const { data: wallet } = useQuery<Wallet>({
    queryKey: ["wallet", token],
    queryFn: async () => {
      if (!token) {
        return {
          uuid: "",
          cash_balance_paise: 100000000,
          available_balance_paise: 100000000,
          blocked_paise: 0,
        };
      }
      try {
        const res = await fetch(`${apiUrl}/wallet`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          return {
            uuid: "",
            cash_balance_paise: 100000000,
            available_balance_paise: 100000000,
            blocked_paise: 0,
          };
        }
        const json: ApiResponse<Wallet> = await res.json();
        return (
          json.data || {
            uuid: "",
            cash_balance_paise: 100000000,
            available_balance_paise: 100000000,
            blocked_paise: 0,
          }
        );
      } catch {
        return {
          uuid: "",
          cash_balance_paise: 100000000,
          available_balance_paise: 100000000,
          blocked_paise: 0,
        };
      }
    },
    enabled: !!token,
    refetchInterval: token ? 5000 : false,
  });

  // 2. Fetch Portfolio for Unrealized P&L
  const { data: portfolio } = useQuery<Portfolio>({
    queryKey: ["portfolio", token],
    queryFn: async () => {
      if (!token) {
        return {
          invested_value_paise: 0,
          current_value_paise: 0,
          unrealized_pnl_paise: 0,
          positions: [],
        };
      }
      try {
        const res = await fetch(`${apiUrl}/portfolio`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          return {
            invested_value_paise: 0,
            current_value_paise: 0,
            unrealized_pnl_paise: 0,
            positions: [],
          };
        }
        const json: ApiResponse<Portfolio> = await res.json();
        return (
          json.data || {
            invested_value_paise: 0,
            current_value_paise: 0,
            unrealized_pnl_paise: 0,
            positions: [],
          }
        );
      } catch {
        return {
          invested_value_paise: 0,
          current_value_paise: 0,
          unrealized_pnl_paise: 0,
          positions: [],
        };
      }
    },
    enabled: !!token,
    refetchInterval: token ? 5000 : false,
  });

  const quotes = useMarketStore((s) => s.quotes);

  // Prefetch live quotes for all explore catalog items
  useEffect(() => {
    const symbols = MASTER_STOCKS_CATALOG.map((item) => item.symbol);
    fetchBatchQuotes(symbols).catch(() => {});
  }, []);

  // Merge catalog with live Angel One quotes
  const liveCatalog = useMemo(() => {
    return MASTER_STOCKS_CATALOG.map((item) => {
      const live = quotes[item.symbol] || (item.symbol === "ZOMATO" ? quotes["ETERNAL"] : undefined) || getCachedQuote(item.symbol);
      if (!live) return item;
      const price = live.price_paise / 100;
      const changePercent = live.change_percent ?? item.changePercent;
      const change = (price * changePercent) / 100;
      return {
        ...item,
        price,
        change,
        changePercent,
      };
    });
  }, [quotes]);

  // Generate mover list based on tab
  const moverList = useMemo(() => {
    if (moverTab === "gainers") {
      return [...liveCatalog]
        .filter((s) => s.changePercent > 0)
        .sort((a, b) => b.changePercent - a.changePercent)
        .slice(0, 6)
        .map((s, idx) => ({
          ...s,
          volume: `${(35 + idx * 8.4).toFixed(1)} Lakh`,
          sparkline: [
            s.price - s.change,
            s.price - s.change * 0.7,
            s.price - s.change * 0.4,
            s.price - s.change * 0.8,
            s.price - s.change * 0.2,
            s.price + s.change * 0.1,
            s.price,
          ],
        }));
    } else if (moverTab === "losers") {
      return [...liveCatalog]
        .filter((s) => s.changePercent < 0)
        .sort((a, b) => a.changePercent - b.changePercent)
        .slice(0, 6)
        .map((s, idx) => ({
          ...s,
          volume: `${(42 + idx * 6.2).toFixed(1)} Lakh`,
          sparkline: [
            s.price - s.change,
            s.price - s.change * 0.3,
            s.price - s.change * 0.6,
            s.price - s.change * 0.2,
            s.price - s.change * 0.8,
            s.price,
          ],
        }));
    } else {
      // Volume shockers
      return [...liveCatalog]
        .filter((s) => ["ZOMATO", "SUZLON", "TRENT", "BEL", "POONAWALLA", "ATGL"].includes(s.symbol))
        .map((s, idx) => ({
          ...s,
          volume: `${(70 + idx * 22.5).toFixed(1)} Lakh`,
          sparkline: [
            s.price * 0.96,
            s.price * 0.98,
            s.price * 0.97,
            s.price * 1.02,
            s.price * 1.01,
            s.price,
          ],
        }));
    }
  }, [moverTab, liveCatalog]);

  const availableBalance = wallet?.available_balance_paise ?? 100000000;
  const unrealizedPnl = portfolio?.unrealized_pnl_paise ?? 0;
  const isProfit = unrealizedPnl >= 0;
  const positionsCount = portfolio?.positions?.length ?? 0;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-150">
      {/* 1. TOP 2-TIER UNIFIED NAVBAR */}
      <Navbar
        availableBalancePaise={availableBalance}
        unrealizedPnlPaise={unrealizedPnl}
      />

      {/* 2. HORIZONTAL INDICES STRIP (Marked by user in Green) */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 backdrop-blur-sm px-4 sm:px-6 py-2 transition-colors">
        <div className="max-w-7xl mx-auto flex items-center gap-6 sm:gap-8 overflow-x-auto no-scrollbar text-xs">
          {MAJOR_INDICES_STRIP.map((idx) => {
            const sym = idx.name.replace(/\s+/g, "").replace("50", "").replace("BANK", "BANKNIFTY").replace("MIDCP", "MIDCPNIFTY").replace("FIN", "FINNIFTY");
            const lookupKey = sym === "NIFTY" ? "NIFTY" : sym === "BANKNIFTY" ? "BANKNIFTY" : sym === "SENSEX" ? "SENSEX" : sym === "MIDCPNIFTY" ? "MIDCPNIFTY" : sym === "FINNIFTY" ? "FINNIFTY" : sym;
            const live = quotes[lookupKey];
            const livePrice = live ? (live.price_paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : idx.value;
            const livePct = live?.change_percent !== undefined ? live.change_percent : parseFloat(idx.percent);
            const isGain = livePct >= 0;
            const liveChange = live ? `${isGain ? "+" : ""}${((live.price_paise * (livePct / 100)) / 100).toFixed(2)}` : idx.change;

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
                  <span>({isGain ? "+" : ""}{livePct.toFixed(2)}%)</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. MAIN WORKSPACE */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* ================================================================= */}
          {/* LEFT 8-COLS: Primary Stocks Discovery Desk                         */}
          {/* ================================================================= */}
          <div className="lg:col-span-8 space-y-8">
            {/* SECTION A: Popular Stocks (Marked by user: "add this -> Popular stocks") */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                    Popular stocks
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Highest institutional weightage and investor interest
                  </p>
                </div>
                <Link
                  href="/watchlist"
                  className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1"
                >
                  <span>See more</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {/* 3-Col Card Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {POPULAR_STOCKS.map((stock) => {
                  const live = quotes[stock.symbol];
                  const currentPrice = live ? live.price_paise / 100 : stock.price;
                  const currentPct = live?.change_percent !== undefined ? live.change_percent : stock.changePercent;
                  const isGain = currentPct >= 0;

                  return (
                    <Link
                      key={stock.symbol}
                      href={`/stocks/${stock.symbol}`}
                      className="p-4 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 hover:border-cyan-500/50 hover:shadow-md transition-all group flex flex-col justify-between"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-9 h-9 rounded-lg bg-gradient-to-tr ${stock.color} text-white flex items-center justify-center font-black text-xs shadow-xs group-hover:scale-105 transition-transform`}
                          >
                            {stock.symbol.slice(0, 2)}
                          </div>
                          <div>
                            <div className="font-bold text-xs text-slate-900 dark:text-slate-100 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">
                              {stock.symbol}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate max-w-[130px]">
                              {stock.name}
                            </div>
                          </div>
                        </div>

                        <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {stock.tag}
                        </span>
                      </div>

                      <div className="mt-3.5 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-end justify-between">
                        <div>
                          <div className="text-xs font-bold font-tabular text-slate-900 dark:text-slate-100">
                            ₹{currentPrice.toFixed(2)}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Cap: {stock.marketCap}
                          </div>
                        </div>

                        <div
                          className={`text-xs font-bold font-tabular flex items-center gap-0.5 ${
                            isGain
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-rose-600 dark:text-rose-400"
                          }`}
                        >
                          {isGain ? "▲" : "▼"} {Math.abs(currentPct).toFixed(2)}%
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>

            {/* SECTION B: Most Traded Stocks (Marked by user: "add this -> Most traded stocks") */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                    Most traded stocks
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Highest market liquidity and trading volume today
                  </p>
                </div>
                <Link
                  href="/stocks"
                  className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1"
                >
                  <span>See more</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {/* 4-Col Card Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {MOST_TRADED_STOCKS.map((stock) => {
                  const live = quotes[stock.symbol] || (stock.symbol === "ZOMATO" ? quotes["ETERNAL"] : undefined);
                  const currentPrice = live ? live.price_paise / 100 : stock.price;
                  const currentPct = live?.change_percent !== undefined ? live.change_percent : stock.changePercent;
                  const isGain = currentPct >= 0;
                  const currentChange = live ? ((currentPrice * currentPct) / 100) : stock.change;

                  return (
                    <Link
                      key={stock.symbol}
                      href={`/stocks/${stock.symbol}`}
                      className="p-3.5 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 hover:border-cyan-500/50 hover:shadow-xs transition-all group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 flex items-center justify-center font-black text-xs border border-slate-200 dark:border-slate-700/60 group-hover:border-cyan-500/40">
                        {stock.symbol.slice(0, 2)}
                      </div>

                      <div className="font-bold text-xs text-slate-900 dark:text-slate-100 mt-2 truncate">
                        {stock.name}
                      </div>

                      <div className="text-xs font-bold font-tabular text-slate-900 dark:text-slate-100 mt-1">
                        ₹{currentPrice.toFixed(2)}
                      </div>

                      <div
                        className={`text-[11px] font-bold font-tabular mt-0.5 ${
                          isGain
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-rose-600 dark:text-rose-400"
                        }`}
                      >
                        {isGain ? "+" : ""}
                        {currentChange.toFixed(2)} ({currentPct.toFixed(2)}%)
                      </div>

                      <div className="text-[10px] text-slate-400 font-mono mt-1">
                        Vol: {stock.volume}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>

            {/* SECTION C: Top Movers Today (Marked by user: "add this -> Top movers today") */}
            <section className="space-y-3 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-5 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                    Top movers today
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Real-time index price leaders with live 1D intraday sparklines
                  </p>
                </div>

                {/* Filter Tabs: Gainers / Losers / Volume Shockers */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs font-semibold">
                    <button
                      onClick={() => setMoverTab("gainers")}
                      className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                        moverTab === "gainers"
                          ? "bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-400 shadow-xs font-bold"
                          : "text-slate-500 hover:text-slate-800 dark:hover:text-white"
                      }`}
                    >
                      Gainers
                    </button>
                    <button
                      onClick={() => setMoverTab("losers")}
                      className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                        moverTab === "losers"
                          ? "bg-white dark:bg-slate-700 text-rose-700 dark:text-rose-400 shadow-xs font-bold"
                          : "text-slate-500 hover:text-slate-800 dark:hover:text-white"
                      }`}
                    >
                      Losers
                    </button>
                    <button
                      onClick={() => setMoverTab("volume")}
                      className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                        moverTab === "volume"
                          ? "bg-white dark:bg-slate-700 text-cyan-700 dark:text-cyan-300 shadow-xs font-bold"
                          : "text-slate-500 hover:text-slate-800 dark:hover:text-white"
                      }`}
                    >
                      Volume shockers
                    </button>
                  </div>

                  {/* Index Scope dropdown */}
                  <select
                    value={indexScope}
                    onChange={(e) => setIndexScope(e.target.value as "NIFTY 100" | "NIFTY 500")}
                    aria-label="Filter stocks by index scope"
                    className="text-xs font-semibold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
                  >
                    <option value="NIFTY 100">NIFTY 100</option>
                    <option value="NIFTY 500">NIFTY 500</option>
                  </select>
                </div>
              </div>

              {/* Movers Table with 1D Sparklines */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800/80 pb-2">
                      <th className="py-2 font-semibold">Company</th>
                      <th className="py-2 font-semibold text-center hidden sm:table-cell">
                        Market price (1D)
                      </th>
                      <th className="py-2 font-semibold text-right">LTP & 1D Change</th>
                      <th className="py-2 font-semibold text-right hidden md:table-cell">Volume</th>
                      <th className="py-2 font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {moverList.map((stock) => {
                      const isGain = stock.changePercent >= 0;
                      return (
                        <tr
                          key={stock.symbol}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group"
                        >
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center font-bold text-[11px] border border-slate-200 dark:border-slate-700/60">
                                {stock.symbol.slice(0, 2)}
                              </div>
                              <div>
                                <Link
                                  href={`/stocks/${stock.symbol}`}
                                  className="font-bold text-slate-900 dark:text-slate-100 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors"
                                >
                                  {stock.symbol}
                                </Link>
                                <div className="text-[10px] text-slate-400 truncate max-w-[140px] sm:max-w-[180px]">
                                  {stock.name}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* 1D Mini Sparkline Curve */}
                          <td className="py-3 px-2 text-center hidden sm:table-cell">
                            <div className="flex justify-center">
                              <MiniSparkline isGain={isGain} points={stock.sparkline} />
                            </div>
                          </td>

                          {/* Price & Change */}
                          <td className="py-3 pl-2 pr-4 text-right">
                            <div className="font-bold font-tabular text-slate-900 dark:text-slate-100">
                              ₹{stock.price.toFixed(2)}
                            </div>
                            <div
                              className={`text-[11px] font-bold font-tabular ${
                                isGain
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-rose-600 dark:text-rose-400"
                              }`}
                            >
                              {isGain ? "+" : ""}
                              {stock.change.toFixed(2)} ({stock.changePercent.toFixed(2)}%)
                            </div>
                          </td>

                          {/* Volume */}
                          <td className="py-3 px-2 text-right hidden md:table-cell font-mono text-slate-500 dark:text-slate-400">
                            {stock.volume}
                          </td>

                          {/* 1-Click Trade CTA */}
                          <td className="py-3 pl-2 text-right">
                            <Link
                              href={`/stocks/${stock.symbol}`}
                              className="px-3 py-1 rounded-lg bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-950/60 dark:hover:bg-cyan-900/60 text-cyan-700 dark:text-cyan-300 font-bold text-xs border border-cyan-200 dark:border-cyan-800/60 transition-colors"
                            >
                              Trade
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="pt-2 text-center border-t border-slate-100 dark:border-slate-800">
                <Link
                  href="/stocks"
                  className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:underline"
                >
                  Explore complete 500+ NSE Stock Screener →
                </Link>
              </div>
            </section>

            {/* SECTION D: Top Intraday Stocks (Marked by user: "add this -> Top intraday stocks") */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                    Top intraday stocks
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    High beta momentum swings with active intraday liquidity
                  </p>
                </div>
                <Link
                  href="/stocks"
                  className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1"
                >
                  <span>Intraday Screener</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {/* 4-Col Card Grid with High-Low bars */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {TOP_INTRADAY_STOCKS.map((stock) => {
                  const isGain = stock.changePercent >= 0;
                  const rangePercent =
                    ((stock.price - stock.dayLow) / (stock.dayHigh - stock.dayLow || 1)) * 100;

                  return (
                    <Link
                      key={stock.symbol}
                      href={`/stocks/${stock.symbol}`}
                      className="p-3.5 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 hover:border-cyan-500/50 hover:shadow-xs transition-all group flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-slate-900 dark:text-slate-100 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">
                            {stock.symbol}
                          </span>
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-400">
                            MIS 5x
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 truncate mt-0.5">
                          {stock.name}
                        </div>
                      </div>

                      <div className="my-2.5">
                        <div className="text-xs font-bold font-tabular text-slate-900 dark:text-slate-100">
                          ₹{stock.price.toFixed(2)}
                        </div>
                        <div
                          className={`text-[11px] font-bold font-tabular ${
                            isGain
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-rose-600 dark:text-rose-400"
                          }`}
                        >
                          {isGain ? "+" : ""}
                          {stock.change.toFixed(2)} ({stock.changePercent.toFixed(2)}%)
                        </div>
                      </div>

                      {/* Day Low-High Bar */}
                      <div className="space-y-1 pt-1.5 border-t border-slate-100 dark:border-slate-800/80">
                        <div className="h-1 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              isGain ? "bg-emerald-500" : "bg-rose-500"
                            }`}
                            style={{ width: `${Math.min(Math.max(rangePercent, 10), 90)}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[9px] text-slate-400 font-mono">
                          <span>L: ₹{stock.dayLow}</span>
                          <span>H: ₹{stock.dayHigh}</span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>

            {/* SECTION E: Sectors Trending Today (Marked by user: "add this -> Sectors trending today") */}
            <section className="space-y-3 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-5 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                    Sectors trending today
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Sectoral breadth and advancing vs declining ratio
                  </p>
                </div>
                <Link
                  href="/stocks"
                  className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:underline"
                >
                  See all sectors →
                </Link>
              </div>

              {/* Sectors Table with Advance / Decline Dual-Color Split Bar */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800/80 pb-2">
                      <th className="py-2 font-semibold">Sector</th>
                      <th className="py-2 font-semibold text-center">Gainers / Losers Ratio</th>
                      <th className="py-2 font-semibold text-right">1D Price Change</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {SECTORS_TRENDING.map((sec) => {
                      const Icon = sec.icon;
                      const isGain = sec.changePercent >= 0;
                      const total = sec.gainersCount + sec.losersCount;
                      const gainerPercent = (sec.gainersCount / total) * 100;

                      return (
                        <tr
                          key={sec.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 flex items-center justify-center">
                                <Icon className="w-3.5 h-3.5" />
                              </div>
                              <div>
                                <span className="font-bold text-slate-900 dark:text-slate-100">
                                  {sec.name}
                                </span>
                                <div className="text-[10px] text-slate-400">
                                  Top Leader: {sec.topStock}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Advance/Decline Split Bar (matching Groww reference) */}
                          <td className="py-3 px-4">
                            <div className="max-w-[260px] mx-auto space-y-1">
                              <div className="flex items-center justify-between text-[11px] font-mono font-bold">
                                <span className="text-emerald-600 dark:text-emerald-400">
                                  {sec.gainersCount}
                                </span>
                                <span className="text-rose-600 dark:text-rose-400">
                                  {sec.losersCount}
                                </span>
                              </div>
                              <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 flex overflow-hidden">
                                <div
                                  className="h-full bg-emerald-500 rounded-l-full transition-all"
                                  style={{ width: `${gainerPercent}%` }}
                                />
                                <div
                                  className="h-full bg-rose-500 rounded-r-full transition-all"
                                  style={{ width: `${100 - gainerPercent}%` }}
                                />
                              </div>
                            </div>
                          </td>

                          {/* 1D Sector Return */}
                          <td className="py-3 pl-4 text-right">
                            <span
                              className={`text-xs font-bold font-tabular px-2 py-0.5 rounded ${
                                isGain
                                  ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40"
                                  : "bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/40"
                              }`}
                            >
                              {isGain ? "+" : ""}
                              {sec.changePercent.toFixed(2)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          {/* ================================================================= */}
          {/* RIGHT 4-COLS: Your Investments / Portfolio Quick Desk               */}
          {/* ================================================================= */}
          <div className="lg:col-span-4 space-y-5 sticky top-24">
            {/* Quick Investments Card (Marked by user in Groww reference: "Your investments") */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <PieChart className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                  Your investments
                </h3>
                <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                  ● Paper Account
                </span>
              </div>

              {positionsCount === 0 ? (
                /* Empty state matching the reference */
                <div className="py-4 text-center space-y-3">
                  <div className="w-12 h-12 mx-auto rounded-full bg-cyan-50 dark:bg-cyan-950/60 flex items-center justify-center text-cyan-600 dark:text-cyan-400">
                    <WalletIcon className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      You haven&apos;t invested yet
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-1 max-w-[220px] mx-auto">
                      Trade stocks and build your portfolio with your ₹10,00,000 simulated balance.
                    </p>
                  </div>
                </div>
              ) : (
                /* Active holdings overview */
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 dark:text-slate-400">Active Positions:</span>
                    <span className="font-bold text-slate-900 dark:text-slate-100">
                      {positionsCount} Open
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 dark:text-slate-400">Unrealized Returns:</span>
                    <span
                      className={`font-bold font-tabular ${
                        isProfit ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {formatPaise(unrealizedPnl)}
                    </span>
                  </div>
                </div>
              )}

              {/* Capital & Margin breakdown */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Available Margin</span>
                  <span className="font-black text-slate-900 dark:text-slate-100 font-tabular">
                    {formatPaise(availableBalance)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Buying Power</span>
                  <span className="font-semibold text-cyan-600 dark:text-cyan-400 font-tabular">
                    5x MIS Leveraged
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-1">
                <Link
                  href="/stocks/RELIANCE"
                  className="w-full py-2.5 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-cyan-500/20 transition-all hover:scale-[1.02]"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Start Paper Trading</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>

                <Link
                  href="/portfolio"
                  className="w-full py-2 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors text-center"
                >
                  <span>View Full Portfolio</span>
                </Link>
              </div>
            </div>

            {/* Quick Market Sentiment & Volatility Card */}
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                  Market Volatility & Session
                </span>
                <span className="text-[10px] font-mono text-slate-400">NSE / BSE</span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60">
                  <div className="text-[10px] text-slate-400">INDIA VIX</div>
                  <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 font-tabular mt-0.5">
                    12.40 (-3.5%)
                  </div>
                  <div className="text-[9px] text-slate-400">Low Volatility</div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60">
                  <div className="text-[10px] text-slate-400">F&O Sentiment</div>
                  <div className="text-sm font-bold text-cyan-600 dark:text-cyan-400 font-tabular mt-0.5">
                    PCR: 1.15
                  </div>
                  <div className="text-[9px] text-slate-400">Bullish Bias</div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
                <Link
                  href="/options"
                  className="text-cyan-600 dark:text-cyan-400 hover:underline font-semibold flex items-center gap-1"
                >
                  <span>Open F&O Option Chain</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
                <Link
                  href="/orders"
                  className="hover:text-slate-800 dark:hover:text-slate-200 font-medium"
                >
                  Order Book →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
