"use client";
import { useSessionDisplayPolling } from "@/hooks/useDisplayPolling";
import { useAccountWallet } from "@/hooks/useAccountWallet";
import { useAccountPortfolio } from "@/hooks/useAccountPortfolio";
import { useAuthToken } from "@/hooks/useAuthToken";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import Navbar from "@/components/layout/Navbar";
import { useMultiSymbolQuotes } from "@/stores/market-store";
import { fetchBatchQuotes, getCachedQuote } from "@/lib/quoteService";
import { dayMovement, valuationStatus } from "@/lib/marketDisplay";
import { apiFetch } from "@/lib/api";
import {
  TrendingUp,
  PieChart,
  ArrowRight,
  Sparkles,
  Zap,
  Activity,
  BarChart3,
  Wallet as WalletIcon,
  ChevronRight,
  ArrowUpRight,
  Flame,
  ShieldCheck,
  Building2,
  Cpu,
  Car,
  Pill,
  Factory,
} from "lucide-react";
import { formatPaise } from "@/lib/format";
import { MASTER_STOCKS_CATALOG, SECTOR_CONSTITUENTS } from "@/components/dashboard/DashboardPage";

// ---------------------------------------------------------------------------
// TYPES & DATASETS FOR STOCKS EXPLORE
// ---------------------------------------------------------------------------
interface PopularStock {
  symbol: string;
  name: string;
  sector: string;
  tag: string;
  color: string;
}

const POPULAR_STOCKS: PopularStock[] = [
  {
    symbol: "RELIANCE",
    name: "Reliance Industries Ltd",
    sector: "Energy & Conglomerate",
    tag: "Large Cap",
    color: "from-blue-600 to-indigo-700",
  },
  {
    symbol: "HDFCBANK",
    name: "HDFC Bank Ltd",
    sector: "Banking & Financials",
    tag: "Large Cap",
    color: "from-sky-600 to-blue-800",
  },
  {
    symbol: "TCS",
    name: "Tata Consultancy Services",
    sector: "IT & Technology",
    tag: "Large Cap",
    color: "from-cyan-600 to-teal-700",
  },
  {
    symbol: "INFY",
    name: "Infosys Ltd",
    sector: "IT & Software Services",
    tag: "Large Cap",
    color: "from-indigo-600 to-purple-800",
  },
  {
    symbol: "TATAMOTORS",
    name: "Tata Motors Ltd",
    sector: "Automotive & EV",
    tag: "Large Cap",
    color: "from-emerald-600 to-teal-800",
  },
  {
    symbol: "BHARTIARTL",
    name: "Bharti Airtel Ltd",
    sector: "Telecom & Cloud",
    tag: "Large Cap",
    color: "from-rose-600 to-red-800",
  },
];

interface MostTradedStock {
  symbol: string;
  name: string;
}

const MOST_TRADED_STOCKS: MostTradedStock[] = [
  { symbol: "ZOMATO", name: "Zomato Ltd (Eternal)" },
  { symbol: "SUZLON", name: "Suzlon Energy Ltd" },
  { symbol: "TRENT", name: "Trent Ltd (Westside & Zudio)" },
  { symbol: "ADANIENT", name: "Adani Enterprises Ltd" },
  { symbol: "YESBANK", name: "YES Bank Ltd" },
  { symbol: "BEL", name: "Bharat Electronics Ltd" },
];

interface IntradayStock {
  symbol: string;
  name: string;
}

const TOP_INTRADAY_STOCKS: IntradayStock[] = [
  { symbol: "ATGL", name: "Adani Total Gas Ltd" },
  { symbol: "POONAWALLA", name: "Poonawalla Fincorp Ltd" },
  { symbol: "TATACHEM", name: "Tata Chemicals Ltd" },
  { symbol: "TATAPOWER", name: "Tata Power Co Ltd" },
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
  { id: "auto", name: "Automotive & Electric Mobility", icon: Car, gainersCount: 0, losersCount: 0, changePercent: 0, topStock: "—" },
  { id: "banking", name: "Banking & Financial Services", icon: Building2, gainersCount: 0, losersCount: 0, changePercent: 0, topStock: "—" },
  { id: "energy", name: "Energy, Oil & Natural Gas", icon: Zap, gainersCount: 0, losersCount: 0, changePercent: 0, topStock: "—" },
  { id: "consumer", name: "Consumer Discretionary & Retail", icon: Flame, gainersCount: 0, losersCount: 0, changePercent: 0, topStock: "—" },
  { id: "pharma", name: "Pharmaceuticals & Healthcare", icon: Pill, gainersCount: 0, losersCount: 0, changePercent: 0, topStock: "—" },
  { id: "metals", name: "Metals & Mining", icon: Factory, gainersCount: 0, losersCount: 0, changePercent: 0, topStock: "—" },
  { id: "it", name: "Information Technology (IT)", icon: Cpu, gainersCount: 0, losersCount: 0, changePercent: 0, topStock: "—" },
];

const MAJOR_INDICES_STRIP = [
  { name: "NIFTY 50", symbolKey: "NIFTY" },
  { name: "SENSEX", symbolKey: "SENSEX" },
  { name: "BANK NIFTY", symbolKey: "BANKNIFTY" },
  { name: "MIDCP NIFTY", symbolKey: "MIDCPNIFTY" },
  { name: "FIN NIFTY", symbolKey: "FINNIFTY" },
];

export default function StocksExplorePage() {
  // Mover tabs & scope
  const [moverTab, setMoverTab] = useState<"gainers" | "losers" | "volume">("gainers");
  const [indexScope, setIndexScope] = useState<"NIFTY 100" | "NIFTY 500">("NIFTY 100");


  const token = useAuthToken();

  // 1. Fetch Wallet for Available Margin
  const { data: wallet } = useAccountWallet();

  // 2. Fetch Portfolio for Unrealized P&L
  const {
    data: portfolio,
    isError: isPortfolioError,
    refetch: refetchPortfolio,
    isFetching: isPortfolioFetching,
  } = useAccountPortfolio();

  const exploreSymbols = useMemo(() => {
    const s = new Set<string>();
    MASTER_STOCKS_CATALOG.forEach((item) => s.add(item.symbol));
    POPULAR_STOCKS.forEach((item) => s.add(item.symbol));
    MOST_TRADED_STOCKS.forEach((item) => s.add(item.symbol));
    TOP_INTRADAY_STOCKS.forEach((item) => s.add(item.symbol));
    MAJOR_INDICES_STRIP.forEach((item) => s.add(item.symbolKey));
    return Array.from(s);
  }, []);

  const quotes = useMultiSymbolQuotes(exploreSymbols);

  // Prefetch live quotes for all explore catalog items
  useEffect(() => {
    fetchBatchQuotes(exploreSymbols).catch(() => {});
  }, [exploreSymbols]);

  // Merge catalog with live Angel One quotes
  const liveCatalog = useMemo(() => {
    return MASTER_STOCKS_CATALOG.map((item) => {
      const live = quotes[item.symbol] || (item.symbol === "ZOMATO" ? quotes["ETERNAL"] : undefined) || getCachedQuote(item.symbol);
      if (!live || !live.price_paise) {
        return {
          ...item,
          dayLow: undefined as number | undefined,
          dayHigh: undefined as number | undefined,
          volume: undefined as number | undefined,
          isQuoteAvailable: false,
          hasMovement: false,
        };
      }
      const price = live.price_paise / 100;
      const movement = dayMovement(live);
      const change = movement?.change ?? 0;
      const changePercent = movement?.percent ?? 0;
      const dayLow = live.low_paise && live.low_paise > 0 ? live.low_paise / 100 : undefined;
      const dayHigh = live.high_paise && live.high_paise > 0 ? live.high_paise / 100 : undefined;
      const volume = live.volume_available === true && typeof live.volume === "number" && live.volume > 0 ? live.volume : undefined;
      return {
        ...item,
        price,
        change,
        changePercent,
        dayLow,
        dayHigh,
        volume,
        isQuoteAvailable: true,
        hasMovement: movement !== undefined,
      };
    });
  }, [quotes]);

  const aggregateInterval = useSessionDisplayPolling(5000);
  const { data: marketMovers } = useQuery<{
    gainers: { symbol: string; name?: string; price_paise: number; change_paise: number; change_percent: number; volume: number }[];
    losers: { symbol: string; name?: string; price_paise: number; change_paise: number; change_percent: number; volume: number }[];
    most_traded: { symbol: string; name?: string; price_paise: number; change_paise: number; change_percent: number; volume: number }[];
    trending: { symbol: string; name?: string; price_paise: number; change_paise: number; change_percent: number; volume: number }[];
  }>({
    queryKey: ["market-movers-explore"],
    queryFn: async () => {
      try {
        const res = await apiFetch<{
          gainers: { symbol: string; name?: string; price_paise: number; change_paise: number; change_percent: number; volume: number }[];
          losers: { symbol: string; name?: string; price_paise: number; change_paise: number; change_percent: number; volume: number }[];
          most_traded: { symbol: string; name?: string; price_paise: number; change_paise: number; change_percent: number; volume: number }[];
          trending: { symbol: string; name?: string; price_paise: number; change_paise: number; change_percent: number; volume: number }[];
        }>("/market/movers?limit=6");
        return res || { gainers: [], losers: [], most_traded: [], trending: [] };
      } catch {
        return { gainers: [], losers: [], most_traded: [], trending: [] };
      }
    },
    refetchInterval: aggregateInterval,
  });

  // Generate mover list based on tab
  const moverList = useMemo(() => {
    let sourceList: { symbol: string; name?: string; price_paise: number; change_paise: number; change_percent: number; volume: number; high_paise?: number; low_paise?: number }[] = [];
    if (moverTab === "gainers") {
      sourceList = marketMovers?.gainers || [];
    } else if (moverTab === "losers") {
      sourceList = marketMovers?.losers || [];
    } else {
      sourceList = marketMovers?.most_traded || marketMovers?.trending || [];
    }

    if (sourceList.length > 0) {
      return sourceList.slice(0, 6).map((item) => {
        const price = item.price_paise / 100;
        const change = item.change_paise / 100;
        const vol = item.volume;
        const volumeStr =
          vol >= 10000000
            ? `${(vol / 10000000).toFixed(2)} Cr`
            : vol >= 100000
            ? `${(vol / 100000).toFixed(1)} Lakh`
            : vol > 0
            ? vol.toLocaleString("en-IN")
            : "—";

        const live = quotes[item.symbol];
        const dayLow = (item.low_paise && item.low_paise > 0 ? item.low_paise : live?.low_paise ? live.low_paise : 0) / 100;
        const dayHigh = (item.high_paise && item.high_paise > 0 ? item.high_paise : live?.high_paise ? live.high_paise : 0) / 100;

        return {
          symbol: item.symbol,
          name: item.name || item.symbol,
          price,
          change,
          hasMovement: true,
          changePercent: item.change_percent,
          volume: volumeStr,
          dayLow: dayLow > 0 ? dayLow : undefined,
          dayHigh: dayHigh > 0 ? dayHigh : undefined,
        };
      });
    }

    const validStocks = liveCatalog.filter((s) => s.isQuoteAvailable && s.price > 0);
    const mapStock = (s: (typeof validStocks)[0]) => {
      const vol = s.volume ?? 0;
      const volumeStr =
        vol >= 10000000
          ? `${(vol / 10000000).toFixed(2)} Cr`
          : vol >= 100000
          ? `${(vol / 100000).toFixed(1)} Lakh`
          : vol > 0
          ? vol.toLocaleString("en-IN")
          : "—";
      return {
        ...s,
        volume: volumeStr,
        dayLow: s.dayLow,
        dayHigh: s.dayHigh,
      };
    };

    if (moverTab === "gainers") {
      return validStocks
        .filter((s) => s.hasMovement && s.changePercent > 0)
        .sort((a, b) => b.changePercent - a.changePercent)
        .slice(0, 6)
        .map(mapStock);
    } else if (moverTab === "losers") {
      return validStocks
        .filter((s) => s.hasMovement && s.changePercent < 0)
        .sort((a, b) => a.changePercent - b.changePercent)
        .slice(0, 6)
        .map(mapStock);
    } else {
      return validStocks.slice(0, 6).map(mapStock);
    }
  }, [moverTab, marketMovers, liveCatalog, quotes]);

  // Dynamic Trending Sectors calculated from live constituent prices
  const dynamicExploreSectors = useMemo(() => {
    return SECTORS_TRENDING.map((sec) => {
      const symbols = SECTOR_CONSTITUENTS[sec.id] || [];
      const constituents = liveCatalog.filter((s) => symbols.includes(s.symbol) && s.isQuoteAvailable && s.hasMovement && s.price > 0);
      if (constituents.length === 0) {
        return {
          ...sec,
          gainersCount: 0,
          losersCount: 0,
          neutralCount: 0,
          changePercent: 0,
          topStock: "—",
        };
      }

      const gainers = constituents.filter((s) => s.changePercent > 0).length;
      const losers = constituents.filter((s) => s.hasMovement && s.changePercent < 0).length;
      const avgChange = constituents.reduce((acc, s) => acc + s.changePercent, 0) / constituents.length;
      const sorted = [...constituents].sort((a, b) => b.changePercent - a.changePercent);
      const top = sorted[0];

      return {
        ...sec,
        gainersCount: gainers,
        losersCount: losers,
        neutralCount: constituents.length - gainers - losers,
        changePercent: +avgChange.toFixed(2),
        topStock: `${top.symbol} (${top.changePercent >= 0 ? "+" : ""}${top.changePercent.toFixed(2)}%)`,
      };
    });
  }, [liveCatalog]);

  const availableBalance = wallet?.available_balance_paise;
  const baseValuation = valuationStatus(portfolio);
  const valuation = isPortfolioError && baseValuation === "REALTIME" ? "STALE" : baseValuation;
  const unrealizedPnl = token && valuation !== "DEGRADED" ? portfolio?.unrealized_pnl_paise : undefined;
  const isProfit = unrealizedPnl !== undefined && unrealizedPnl >= 0;
  const positionsCount = portfolio?.positions?.length ?? 0;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-150">
      {/* 1. TOP 2-TIER UNIFIED NAVBAR */}
      <Navbar
        availableBalancePaise={availableBalance}
        unrealizedPnlPaise={unrealizedPnl}
        unrealizedPnlStale={valuation === "STALE"}
      />

      {/* 2. HORIZONTAL INDICES STRIP (Marked by user in Green) */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 backdrop-blur-sm px-4 sm:px-6 py-2 transition-colors">
        <div className="max-w-7xl mx-auto flex items-center gap-6 sm:gap-8 overflow-x-auto no-scrollbar text-xs">
          {MAJOR_INDICES_STRIP.map((idx) => {
            const live = quotes[idx.symbolKey];
            const hasQuote = live && live.price_paise > 0;
            const livePrice = hasQuote
              ? (live.price_paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              : "—";
            const movement = dayMovement(live);
            const livePct = movement?.percent ?? 0;
            const isGain = livePct >= 0;
            const liveChange = movement ? `${isGain ? "+" : ""}${movement.change.toFixed(2)}` : "—";

            return (
              <div key={idx.name} className="flex items-center gap-2 shrink-0">
                <span className="font-bold text-slate-700 dark:text-slate-300">
                  {idx.name}
                </span>
                <span className="font-semibold text-slate-900 dark:text-slate-100 font-tabular">
                  {livePrice}
                </span>
                {hasQuote && movement ? (
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
                ) : (
                  <span className="text-[11px] font-medium text-amber-500">
                    Awaiting Feed
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. MAIN WORKSPACE */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
        {token && isPortfolioError && (
          <div className="flex items-center justify-between p-3.5 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 text-xs">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>
                {portfolio
                  ? "Portfolio network update failed: valuation may be stale."
                  : "Unable to load portfolio data. Please check your network connection."}
              </span>
            </div>
            <button
              onClick={() => refetchPortfolio()}
              disabled={isPortfolioFetching}
              className="px-3 py-1 rounded bg-amber-200 dark:bg-amber-900/60 hover:bg-amber-300 dark:hover:bg-amber-800 text-amber-900 dark:text-amber-100 font-semibold text-xs transition cursor-pointer disabled:opacity-50"
            >
              {isPortfolioFetching ? "Retrying..." : "Retry"}
            </button>
          </div>
        )}
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
                  const hasQuote = live && live.price_paise > 0;
                  const currentPrice = hasQuote ? live.price_paise / 100 : 0;
                  const movement = dayMovement(live);
                  const currentPct = movement?.percent ?? 0;
                  const isGain = currentPct >= 0;

                  return (
                    <Link
                      key={stock.symbol}
                      href={`/stocks/${stock.symbol}`}
                      className="min-h-[160px] p-3.5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 hover:border-cyan-500/50 hover:shadow-md transition-all group flex flex-col justify-between"
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
                            {hasQuote ? `₹${currentPrice.toFixed(2)}` : "₹—"}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {hasQuote ? "Angel One quote" : "Quote unavailable"}
                          </div>
                        </div>

                        {hasQuote && movement ? (
                          <div
                            className={`text-xs font-bold font-tabular flex items-center gap-0.5 ${
                              isGain
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-rose-600 dark:text-rose-400"
                            }`}
                          >
                            {isGain ? "▲" : "▼"} {Math.abs(currentPct).toFixed(2)}%
                          </div>
                        ) : (
                          <div className="text-[10px] font-medium text-amber-500">
                            Day movement unavailable
                          </div>
                        )}
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
                  const hasQuote = live && live.price_paise > 0;
                  const currentPrice = hasQuote ? live.price_paise / 100 : 0;
                  const movement = dayMovement(live);
                  const currentPct = movement?.percent ?? 0;
                  const isGain = currentPct >= 0;
                  const currentChange = movement?.change ?? 0;

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
                        {hasQuote ? `₹${currentPrice.toFixed(2)}` : "₹—"}
                      </div>

                      {hasQuote && movement ? (
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
                      ) : (
                        <div className="text-[10px] font-medium text-amber-500 mt-0.5">
                          Day movement unavailable
                        </div>
                      )}

                      <div className="text-[10px] text-slate-400 font-mono mt-1">
                        {live?.volume && live.volume > 0 ? `Vol: ${live.volume.toLocaleString("en-IN")}` : "NSE Live Feed"}
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
                    Real-time index price leaders with live LTP and day movement
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
                        Day Range (L · H)
                      </th>
                      <th className="py-2 font-semibold text-right">LTP & 1D Change</th>
                      <th className="py-2 font-semibold text-right hidden md:table-cell">Volume</th>
                      <th className="py-2 font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {moverList.length > 0 ? (
                      moverList.map((stock) => {
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

                            {/* Day Range (L · H) */}
                            <td className="py-3 px-2 text-center hidden sm:table-cell font-mono text-[11px] text-slate-500 dark:text-slate-400">
                              {stock.dayLow && stock.dayHigh ? (
                                <span>
                                  ₹{stock.dayLow.toFixed(1)} · ₹{stock.dayHigh.toFixed(1)}
                                </span>
                              ) : (
                                <span>—</span>
                              )}
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
                                {stock.hasMovement && isGain ? "+" : ""}
                                {stock.hasMovement ? `${stock.change.toFixed(2)} (${stock.changePercent.toFixed(2)}%)` : "Day movement unavailable"}
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
                      })
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-xs text-slate-400">
                          Awaiting live market feed ticks...
                        </td>
                      </tr>
                    )}
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
                  const live = quotes[stock.symbol];
                  const hasQuote = live && live.price_paise > 0;
                  const price = hasQuote ? live.price_paise / 100 : 0;
                  const movement = dayMovement(live);
                  const pct = movement?.percent ?? 0;
                  const isGain = pct >= 0;
                  const change = movement?.change ?? 0;
                  const dayLow = live?.low_paise && live.low_paise > 0 ? live.low_paise / 100 : undefined;
                  const dayHigh = live?.high_paise && live.high_paise > 0 ? live.high_paise / 100 : undefined;
                  const rangePercent = dayLow !== undefined && dayHigh !== undefined && dayHigh > dayLow ? ((price - dayLow) / (dayHigh - dayLow)) * 100 : undefined;

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
                          {hasQuote ? `₹${price.toFixed(2)}` : "₹—"}
                        </div>
                        {hasQuote && movement ? (
                          <div
                            className={`text-[11px] font-bold font-tabular ${
                              isGain
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-rose-600 dark:text-rose-400"
                            }`}
                          >
                            {isGain ? "+" : ""}
                            {change.toFixed(2)} ({pct.toFixed(2)}%)
                          </div>
                        ) : (
                          <div className="text-[10px] font-medium text-amber-500">
                            Day movement unavailable
                          </div>
                        )}
                      </div>

                      {/* Day Low-High Bar */}
                      <div className="space-y-1 pt-1.5 border-t border-slate-100 dark:border-slate-800/80">
                        <div className="h-1 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              isGain ? "bg-emerald-500" : "bg-rose-500"
                            }`}
                            style={{ width: rangePercent === undefined ? "0%" : `${Math.min(Math.max(rangePercent, 0), 100)}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[9px] text-slate-400 font-mono">
                          <span>L: {hasQuote && dayLow !== undefined ? `₹${dayLow.toFixed(2)}` : "—"}</span>
                          <span>H: {hasQuote && dayHigh !== undefined ? `₹${dayHigh.toFixed(2)}` : "—"}</span>
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
                    {dynamicExploreSectors.map((sec) => {
                      const Icon = sec.icon;
                      const isGain = sec.changePercent >= 0;
                      const total = sec.gainersCount + sec.losersCount + sec.neutralCount;
                      const gainerPercent = total > 0 ? (sec.gainersCount / total) * 100 : 50;

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
                            {total === 0 ? (
                              <div className="text-[11px] text-center text-slate-400 dark:text-slate-500 font-mono">
                                Awaiting feed
                              </div>
                            ) : (
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
                                    style={{ width: `${total > 0 ? sec.losersCount / total * 100 : 0}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </td>

                          {/* 1D Sector Return */}
                          <td className="py-3 pl-4 text-right">
                            {total === 0 ? (
                              <span className="text-xs font-mono text-slate-400 dark:text-slate-500">
                                —
                              </span>
                            ) : (
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
                            )}
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

              {isPortfolioError && !portfolio ? (
                /* Error state when initial load fails */
                <div className="py-4 text-center space-y-2">
                  <div className="w-10 h-10 mx-auto rounded-full bg-amber-50 dark:bg-amber-950/60 flex items-center justify-center text-amber-600 dark:text-amber-400">
                    <Activity className="w-5 h-5" />
                  </div>
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Portfolio Unavailable
                  </h4>
                  <p className="text-[11px] text-slate-400 max-w-[200px] mx-auto">
                    Could not connect to portfolio server.
                  </p>
                  <button
                    onClick={() => refetchPortfolio()}
                    disabled={isPortfolioFetching}
                    className="mt-1 px-3 py-1 rounded-md bg-amber-100 dark:bg-amber-900/40 hover:bg-amber-200 dark:hover:bg-amber-800/60 text-amber-800 dark:text-amber-200 font-semibold text-xs transition cursor-pointer"
                  >
                    {isPortfolioFetching ? "Retrying..." : "Retry"}
                  </button>
                </div>
              ) : !portfolio ? (
                <p role="status" className="py-4 text-center text-xs text-slate-500">
                  {token ? "Loading portfolio..." : "Sign in to view your portfolio."}
                </p>
              ) : positionsCount === 0 ? (
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
                      Trade stocks and build your portfolio with virtual money.
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
                        unrealizedPnl === undefined ? "text-slate-500" : isProfit ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {formatPaise(unrealizedPnl)}
                    </span>
                  </div>
                  {valuation !== "REALTIME" && (
                    <div className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <Activity className="w-3 h-3" />
                      <span>{valuation === "STALE" ? "Last available valuation" : "Valuation unavailable"}</span>
                    </div>
                  )}
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
                <span className="text-[10px] font-mono text-slate-400">NSE / NFO</span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60">
                  <div className="text-[10px] text-slate-400">INDIA VIX</div>
                  <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 font-tabular mt-0.5">
                    Unavailable
                  </div>
                  <div className="text-[9px] text-slate-400">Provider data unavailable</div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60">
                  <div className="text-[10px] text-slate-400">F&O Sentiment</div>
                  <div className="text-sm font-bold text-cyan-600 dark:text-cyan-400 font-tabular mt-0.5">
                    Unavailable
                  </div>
                  <div className="text-[9px] text-slate-400">Verified PCR unavailable</div>
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
