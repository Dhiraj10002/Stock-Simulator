"use client";
import { useSessionDisplayPolling } from "@/hooks/useDisplayPolling";
import { useAccountWallet } from "@/hooks/useAccountWallet";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMarketStore, useMultiSymbolQuotes } from "@/stores/market-store";
import { fetchBatchQuotes, getCachedQuote } from "@/lib/quoteService";
import { breadthPercentages, feedLabel, dayMovement } from "@/lib/marketDisplay";
import MarketDesk from "@/components/dashboard/MarketDesk";
import Navbar from "@/components/layout/Navbar";
import {
  TrendingUp,
  PieChart,
  BarChart2,
  ArrowRight,
  Zap,
  Activity,
  RotateCcw,
  Building,
  Anchor,
  Car,
  Building2,
  Flame,
  Pill,
  Factory,
  Cpu,
  Search,
  ShoppingBag,
} from "lucide-react";
import { formatPaise } from "@/lib/format";
import { getAuthToken, apiFetch } from "@/lib/api";
import type { Portfolio, Candle } from "@/types";
import IndicesBar from "@/components/dashboard/IndicesBar";
import MarketStatusBanner from "@/components/dashboard/MarketStatusBanner";
import MarketMoversCard from "@/components/dashboard/MarketMoversCard";
import PortfolioSummarySnapshot from "@/components/dashboard/PortfolioSummarySnapshot";
import AddFundsModal from "@/components/portfolio/AddFundsModal";
import { useToast } from "@/components/ui/ToastProvider";

// ---------------------------------------------------------------------------
// TYPES & CATALOG EXPORTS (Kept for compatibility with stock details & routes)
// ---------------------------------------------------------------------------
export interface WatchlistItem {
  symbol: string;
  exchange?: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  isPositive: boolean;
  isQuoteAvailable?: boolean;
  isDayChangeAvailable?: boolean;
}

export const MASTER_STOCKS_CATALOG: WatchlistItem[] = [
  { symbol: "POONAWALLA", exchange: "NSE", name: "Poonawalla Fincorp Ltd", price: 0, change: 0, changePercent: 0, isPositive: true },
  { symbol: "ATGL", exchange: "NSE", name: "Adani Total Gas Ltd", price: 0, change: 0, changePercent: 0, isPositive: true },
  { symbol: "EMCURE", exchange: "NSE", name: "Emcure Pharmaceuticals", price: 0, change: 0, changePercent: 0, isPositive: true },
  { symbol: "WELCORP", exchange: "NSE", name: "Welspun Corp Ltd", price: 0, change: 0, changePercent: 0, isPositive: true },
  { symbol: "BBTC", exchange: "NSE", name: "Bombay Burmah Trading", price: 0, change: 0, changePercent: 0, isPositive: true },
  { symbol: "JYOTICNC", exchange: "NSE", name: "Jyoti CNC Automation", price: 0, change: 0, changePercent: 0, isPositive: true },
  { symbol: "SPLPETRO", exchange: "NSE", name: "Supreme Petrochem Ltd", price: 0, change: 0, changePercent: 0, isPositive: true },
  { symbol: "SUPREMEIND", exchange: "NSE", name: "Supreme Industries Ltd", price: 0, change: 0, changePercent: 0, isPositive: true },
  { symbol: "TRENT", exchange: "NSE", name: "Trent Ltd (Westside & Zudio)", price: 0, change: 0, changePercent: 0, isPositive: true },
  { symbol: "SUZLON", exchange: "NSE", name: "Suzlon Energy Ltd", price: 0, change: 0, changePercent: 0, isPositive: true },
  { symbol: "RELIANCE", exchange: "NSE", name: "Reliance Industries Ltd", price: 0, change: 0, changePercent: 0, isPositive: true },
  { symbol: "HDFCBANK", exchange: "NSE", name: "HDFC Bank Ltd", price: 0, change: 0, changePercent: 0, isPositive: true },
  { symbol: "ICICIBANK", exchange: "NSE", name: "ICICI Bank Ltd", price: 0, change: 0, changePercent: 0, isPositive: true },
  { symbol: "TATACHEM", exchange: "NSE", name: "Tata Chemicals Ltd", price: 0, change: 0, changePercent: 0, isPositive: false },
  { symbol: "GODIGIT", exchange: "NSE", name: "Go Digit General Insurance", price: 0, change: 0, changePercent: 0, isPositive: false },
  { symbol: "TATATECH", exchange: "NSE", name: "Tata Technologies Ltd", price: 0, change: 0, changePercent: 0, isPositive: false },
  { symbol: "NIACL", exchange: "NSE", name: "New India Assurance", price: 0, change: 0, changePercent: 0, isPositive: false },
  { symbol: "KPITTECH", exchange: "NSE", name: "KPIT Technologies Ltd", price: 0, change: 0, changePercent: 0, isPositive: false },
  { symbol: "SUNTV", exchange: "NSE", name: "Sun TV Network Ltd", price: 0, change: 0, changePercent: 0, isPositive: false },
  { symbol: "TCS", exchange: "NSE", name: "Tata Consultancy Services", price: 0, change: 0, changePercent: 0, isPositive: false },
  { symbol: "GILLETTE", exchange: "NSE", name: "Gillette India Ltd", price: 0, change: 0, changePercent: 0, isPositive: false },
  { symbol: "INFY", exchange: "NSE", name: "Infosys Ltd", price: 0, change: 0, changePercent: 0, isPositive: false },
  { symbol: "BHARTIARTL", exchange: "NSE", name: "Bharti Airtel Ltd", price: 0, change: 0, changePercent: 0, isPositive: true },
  { symbol: "SBIN", exchange: "NSE", name: "State Bank of India", price: 0, change: 0, changePercent: 0, isPositive: false },
  { symbol: "PRAJIND", exchange: "NSE", name: "Praj Industries Ltd", price: 0, change: 0, changePercent: 0, isPositive: true },
  { symbol: "BAJFINANCE", exchange: "NSE", name: "Bajaj Finance Ltd", price: 0, change: 0, changePercent: 0, isPositive: false },
  { symbol: "AXISBANK", exchange: "NSE", name: "Axis Bank Ltd", price: 0, change: 0, changePercent: 0, isPositive: false },
  { symbol: "KOTAKBANK", exchange: "NSE", name: "Kotak Mahindra Bank", price: 0, change: 0, changePercent: 0, isPositive: false },
  { symbol: "APARINDS", exchange: "NSE", name: "Apar Industries Ltd", price: 0, change: 0, changePercent: 0, isPositive: false },
];

import type { LucideIcon } from "lucide-react";

// ---------------------------------------------------------------------------
// TRENDING SECTORS (Kite Marketwatch Panel & Groww Sectoral Breadth)
// ---------------------------------------------------------------------------
export interface SectorTrending {
  id: string;
  name: string;
  shortName: string;
  icon: LucideIcon;
  gainersCount: number;
  losersCount: number;
  changePercent: number;
  topStock: string;
  topStockChange: number;
}

export const DASHBOARD_TRENDING_SECTORS: SectorTrending[] = [
  {
    id: "auto",
    name: "Automotive & Electric Mobility",
    shortName: "Auto & EV",
    icon: Car,
    gainersCount: 0,
    losersCount: 0,
    changePercent: 0,
    topStock: "—",
    topStockChange: 0,
  },
  {
    id: "banking",
    name: "Banking & Financial Services",
    shortName: "Banking & Fin",
    icon: Building2,
    gainersCount: 0,
    losersCount: 0,
    changePercent: 0,
    topStock: "—",
    topStockChange: 0,
  },
  {
    id: "energy",
    name: "Energy, Oil & Natural Gas",
    shortName: "Energy & Oil",
    icon: Zap,
    gainersCount: 0,
    losersCount: 0,
    changePercent: 0,
    topStock: "—",
    topStockChange: 0,
  },
  {
    id: "consumer",
    name: "Consumer Discretionary & Retail",
    shortName: "Retail & Consumer",
    icon: Flame,
    gainersCount: 0,
    losersCount: 0,
    changePercent: 0,
    topStock: "—",
    topStockChange: 0,
  },
  {
    id: "pharma",
    name: "Pharmaceuticals & Healthcare",
    shortName: "Pharma & Health",
    icon: Pill,
    gainersCount: 0,
    losersCount: 0,
    changePercent: 0,
    topStock: "—",
    topStockChange: 0,
  },
  {
    id: "metals",
    name: "Metals & Mining",
    shortName: "Metals & Mining",
    icon: Factory,
    gainersCount: 0,
    losersCount: 0,
    changePercent: 0,
    topStock: "—",
    topStockChange: 0,
  },
  {
    id: "it",
    name: "Information Technology (IT)",
    shortName: "IT & Tech",
    icon: Cpu,
    gainersCount: 0,
    losersCount: 0,
    changePercent: 0,
    topStock: "—",
    topStockChange: 0,
  },
  {
    id: "realty",
    name: "Real Estate & Infrastructure",
    shortName: "Realty & Infra",
    icon: Building,
    gainersCount: 0,
    losersCount: 0,
    changePercent: 0,
    topStock: "—",
    topStockChange: 0,
  },
  {
    id: "fmcg",
    name: "FMCG & Consumer Staples",
    shortName: "FMCG Staples",
    icon: ShoppingBag,
    gainersCount: 0,
    losersCount: 0,
    changePercent: 0,
    topStock: "—",
    topStockChange: 0,
  },
];

export const SECTOR_CONSTITUENTS: Record<string, string[]> = {
  auto: ["TATAMOTORS", "TATAPOWER", "TATATECH"],
  banking: ["HDFCBANK", "ICICIBANK", "SBIN", "YESBANK", "POONAWALLA", "GODIGIT"],
  energy: ["RELIANCE", "ATGL", "TATAPOWER", "SUZLON"],
  consumer: ["TRENT"],
  pharma: ["SUNPHARMA", "EMCURE"],
  metals: ["TATASTEEL", "WELCORP", "BBTC", "SPLPETRO"],
  it: ["TCS", "INFY", "KPITTECH"],
  realty: ["DLF", "SUPREMEIND", "JYOTICNC"],
  fmcg: ["ITC", "GILLETTE", "NIACL"],
};

// ---------------------------------------------------------------------------
interface DashboardPageProps {
  onSignOut?: () => void;
}

export default function DashboardPage({ onSignOut }: DashboardPageProps) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [userName] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("user_name") || "Trader";
    }
    return "Trader";
  });
  const [resetting, setResetting] = useState(false);
  const [isAddFundsOpen, setIsAddFundsOpen] = useState(false);

  // Kite widget active tab

  // Market overview chart index selection
  type OverviewIndex = "NIFTY 50" | "SENSEX" | "BANK NIFTY";
  const [selectedIndex, setSelectedIndex] = useState<OverviewIndex>("NIFTY 50");
  const [hoveredChartPoint, setHoveredChartPoint] = useState<{ price: number; time: string } | null>(null);

  // Sector samples Panel state (Kite left sidebar)
  const [sectorSearch, setSectorSearch] = useState<string>("");
  const [sectorFilter, setSectorFilter] = useState<"all" | "gainers" | "losers">("all");

  const [token, setToken] = useState(getAuthToken);
  const [resetError, setResetError] = useState<string | null>(null);
  useEffect(() => {
    const update = () => setToken(getAuthToken());
    window.addEventListener("auth-changed", update);
    return () => window.removeEventListener("auth-changed", update);
  }, []);

  // 1. Fetch Wallet
  const { data: wallet, refetch: refetchWallet } = useAccountWallet();

  // 2. Fetch Portfolio
  const { data: portfolio, isError: portfolioError } = useQuery<Portfolio>({
    queryKey: ["portfolio", token], queryFn: () => apiFetch<Portfolio>("/portfolio"),
    enabled: !!token, refetchInterval: token ? 5000 : false,
  });

  // Reset simulation handler
  const handleResetSimulation = async () => {
    if (!confirm("Are you sure you want to reset your portfolio and restore ₹10,00,000 cash?")) {
      return;
    }
    setResetting(true);
    setResetError(null);
    try {
      await apiFetch("/simulation/reset", {method: "POST"});
      await refetchWallet();
      await Promise.all(["portfolio", "orders", "trades"].map(key => queryClient.invalidateQueries({queryKey: [key]})));
      addToast(
        "Simulation Reset",
        "Your portfolio and ₹10,00,000 cash balance have been restored.",
        "success",
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Reset failed.";
      setResetError(msg);
      addToast("Reset Failed", msg, "error");
    } finally {
      setResetting(false);
    }
  };

  const dashboardCatalog = useMemo(() => {
    const known = new Set(MASTER_STOCKS_CATALOG.map(s => s.symbol));
    const extra = [...new Set(Object.values(SECTOR_CONSTITUENTS).flat())].filter(symbol => !known.has(symbol));
    return [...MASTER_STOCKS_CATALOG, ...extra.map(symbol => ({symbol, name: symbol, price: 0, change: 0, changePercent: 0, isPositive: true}))];
  }, []);
  const marketStatus = useMarketStore((s) => s.marketStatus);
  const feedStatus = useMarketStore((s) => s.feedStatus);
  const dashboardFeedLabel = feedLabel({status: marketStatus, feed_provider: feedStatus.feedProvider, feed_state: feedStatus.feedState, is_synthetic: feedStatus.isSynthetic, last_tick: feedStatus.lastTick});
  const hasLiveFeed = dashboardFeedLabel === "Angel One · live quotes";
  const quotes = useMultiSymbolQuotes([...dashboardCatalog.map((s) => s.symbol), "NIFTY", "SENSEX", "BANKNIFTY"]);

  // Prefetch live real-time quotes for all catalog stocks on mount
  useEffect(() => {
    const catalogSymbols = dashboardCatalog.map((s) => s.symbol);
    fetchBatchQuotes(catalogSymbols).catch(() => {});
  }, [dashboardCatalog]);

  // Live Catalog merged with authentic Angel One ticks
  const liveCatalog: WatchlistItem[] = useMemo(() => {
    return dashboardCatalog.map((item) => {
      const q = quotes[item.symbol] || (item.symbol === "ZOMATO" ? quotes["ETERNAL"] : undefined) || getCachedQuote(item.symbol);
      if (!q || !q.price_paise) {
        return { ...item, isQuoteAvailable: false };
      }

      const price = q.price_paise / 100;
      const movement = dayMovement(q);
      const change = movement?.change ?? 0;
      const changePercent = movement?.percent ?? 0;
      const isPositive = changePercent >= 0;

      return {
        ...item,
        price,
        change,
        changePercent: +changePercent.toFixed(2),
        isPositive,
        isQuoteAvailable: true,
        isDayChangeAvailable: !!movement,
      };
    });
  }, [quotes, dashboardCatalog]);



  const aggregateInterval = useSessionDisplayPolling(5000);
  const { data: marketBreadth } = useQuery<{
    advances: number;
    declines: number;
    unchanged: number;
    total: number;
    advance_decline_ratio: number;
    advance_percent: number;
  }>({
    queryKey: ["market-breadth-dashboard"],
    queryFn: async () => {
      try {
        const res = await apiFetch<{
          advances: number;
          declines: number;
          unchanged: number;
          total: number;
          advance_decline_ratio: number;
          advance_percent: number;
        }>("/market/breadth");
        return res || { advances: 0, declines: 0, unchanged: 0, total: 0, advance_decline_ratio: 0, advance_percent: 0 };
      } catch {
        return { advances: 0, declines: 0, unchanged: 0, total: 0, advance_decline_ratio: 0, advance_percent: 0 };
      }
    },
    refetchInterval: aggregateInterval,
  });



  // Dynamic Sector samples calculated from live stock prices
  const dynamicSectors = useMemo(() => {
    return DASHBOARD_TRENDING_SECTORS.map((sec) => {
      const symbols = SECTOR_CONSTITUENTS[sec.id] || [];
      const constituents = liveCatalog.filter((s) => symbols.includes(s.symbol) && s.isQuoteAvailable && s.isDayChangeAvailable && s.price > 0);
      if (constituents.length === 0) {
        return {
          ...sec,
          gainersCount: 0,
          losersCount: 0,
          observedCount: 0,
          isAvailable: false,
          changePercent: 0,
          topStock: "—",
          topStockChange: 0,
        };
      }

      const gainers = constituents.filter((s) => s.changePercent > 0).length;
      const losers = constituents.filter((s) => s.changePercent < 0).length;
      const avgChange = constituents.reduce((acc, s) => acc + s.changePercent, 0) / constituents.length;
      const sorted = [...constituents].sort((a, b) => b.changePercent - a.changePercent);
      const top = sorted[0];

      return {
        ...sec,
        observedCount: constituents.length,
        gainersCount: gainers,
        isAvailable: true,
        losersCount: losers,
        changePercent: +avgChange.toFixed(2),
        topStock: top.symbol,
        topStockChange: +top.changePercent.toFixed(2),
      };
    });
  }, [liveCatalog]);

  // Filtered Sector samples for Left Sidebar
  const filteredSectors = useMemo(() => {
    return dynamicSectors.filter((s) => {
      const q = sectorSearch.toLowerCase().trim();
      const matchesSearch =
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.shortName.toLowerCase().includes(q) ||
        s.topStock.toLowerCase().includes(q);
      if (!matchesSearch) return false;
      if (sectorFilter === "gainers") return s.changePercent > 0;
      if (sectorFilter === "losers") return s.changePercent < 0;
      return true;
    });
  }, [dynamicSectors, sectorSearch, sectorFilter]);

  const totalSectorGainers = marketBreadth?.advances ?? 0;
  const totalSectorLosers = marketBreadth?.declines ?? 0;
  const breadth = breadthPercentages(marketBreadth);
  const overallAdvancePercent = breadth?.advances ?? 0;
  const overallDeclinePercent = breadth?.declines ?? 0;

  const indexKey =
    selectedIndex === "NIFTY 50"
      ? "NIFTY"
      : selectedIndex === "SENSEX"
      ? "SENSEX"
      : "BANKNIFTY";

  const { data: indexCandles, isError: historyError, isPending: historyPending, isFetching: historyFetching, error: historyFailure, refetch: refetchHistory } = useQuery<Candle[]>({
    queryKey: ["index-candles", indexKey],
    queryFn: ({signal}) => apiFetch<Candle[]>(`/market/quotes/${indexKey}/history?limit=500&interval=ONE_MINUTE`, {signal: AbortSignal.any([signal, AbortSignal.timeout(15000)])}),
    staleTime: 5_000,
    refetchInterval: (query) => query.state.data?.length ? 60_000 : 5_000,
    retry: false,
  });

  // Market Overview Chart Coordinates & Values Generator (1D Intraday)
  const chartData = useMemo(() => {
    const liveIdxQuote = quotes[indexKey];
    const livePrice = liveIdxQuote?.price_paise ? liveIdxQuote.price_paise / 100 : 0;
    const liveChange =
      liveIdxQuote?.change_paise !== undefined ? liveIdxQuote.change_paise / 100 : 0;
    const liveChangePercent = liveIdxQuote?.change_percent ?? 0;

    const allCandles = indexCandles || [];
    const latestTimestamp = allCandles.at(-1)?.timestamp ?? 0;
    const istDate = (timestamp: number) => new Date(timestamp * 1000).toLocaleDateString("en-CA", {timeZone: "Asia/Kolkata"});
    const candles = allCandles.filter((c) => istDate(c.timestamp) === istDate(latestTimestamp));
    if (candles.length === 0) {
      return {
        pts: [],
        min: 0,
        max: 0,
        coords: [],
        linePath: "",
        areaPath: "",
        currentPrice: livePrice,
        firstPrice: livePrice,
        change: liveChange,
        changePercent: liveChangePercent,
      };
    }

    const pts = candles.map((c) => {
      const d = new Date(c.timestamp * 1000);
      const time = d.toLocaleString("en-IN", {timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit"});
      return { price: c.close_paise / 100, time };
    });

    const prices = pts.map((p) => p.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;

    const width = 760;
    const height = 180;
    const padding = 12;

    const coords = pts.length === 1
      ? [
          { x: padding, y: height / 2, pt: pts[0] },
          { x: width - padding, y: height / 2, pt: pts[0] },
        ]
      : pts.map((pt, idx) => {
          const x = (idx / (pts.length - 1 || 1)) * (width - padding * 2) + padding;
          const y = max === min ? height / 2 : height - padding - ((pt.price - min) / range) * (height - padding * 2);
          return { x, y, pt };
        });

    const linePath = coords.length > 0 ? `M ${coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" L ")}` : "";
    const areaPath =
      coords.length > 0
        ? `M ${coords[0].x.toFixed(1)},${height} L ${coords
            .map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`)
            .join(" L ")} L ${coords[coords.length - 1].x.toFixed(1)},${height} Z`
        : "";

    const finalCurrentPrice = livePrice || (pts.length > 0 ? pts[pts.length - 1].price : 0);
    const finalChange = liveChange ?? (pts.length > 1 ? +(pts[pts.length - 1].price - pts[0].price).toFixed(2) : 0);
    const finalChangePercent =
      liveChangePercent ??
      (pts.length > 1 && pts[0].price > 0
        ? +(((pts[pts.length - 1].price - pts[0].price) / pts[0].price) * 100).toFixed(2)
        : 0);

    return {
      pts,
      min,
      max,
      coords,
      linePath,
      areaPath,
      currentPrice: finalCurrentPrice,
      firstPrice: +(finalCurrentPrice - finalChange).toFixed(2),
      change: finalChange,
      changePercent: finalChangePercent,
    };
  }, [indexKey, indexCandles, quotes]);

  const availableBalance = wallet?.available_balance_paise;
  const unrealizedPnl = portfolio?.unrealized_pnl_paise ?? 0;
  const openPositions = portfolio?.positions ?? [];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-150">
      <Navbar
        availableBalancePaise={availableBalance}
        unrealizedPnlPaise={unrealizedPnl}
        onResetSimulation={handleResetSimulation}
        onSignOut={onSignOut}
        resetting={resetting}
      />


      <main className="flex-1 max-w-[1720px] w-full mx-auto p-3 sm:p-5 lg:p-6 space-y-5">
        {/* Real-time Benchmark Indices Ticker & Authoritative Market Status */}
        <IndicesBar
          selectedIndex={indexKey}
          onSelectIndex={(sym) =>
            setSelectedIndex(
              sym === "NIFTY"
                ? "NIFTY 50"
                : sym === "SENSEX"
                ? "SENSEX"
                : "BANK NIFTY"
            )
          }
        />
        <MarketStatusBanner />

        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* ========================================================================= */}
          {/* LEFT SIDEBAR: TRENDING SECTORS DESK (Kite Marketwatch Panel Style)        */}
          {/* ========================================================================= */}
          <aside className="w-full lg:w-[420px] xl:w-[450px] shrink-0 lg:sticky lg:top-24 space-y-4">
            <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col">
              {/* Header matching Image 1: Sectors trending today */}
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/80 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <BarChart2 className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                      <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        Sectors trending today
                      </h2>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Sampled stock day changes; prices may be delayed
                    </p>
                  </div>
                  <Link
                    href="/stocks"
                    className="text-[11px] font-bold text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1 shrink-0"
                  >
                    <span>See all sectors</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>

                {/* Market Breadth Summary Ratio Bar */}
                <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/60 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-mono font-bold">
                    <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      {breadth ? `${totalSectorGainers} Advancing (${overallAdvancePercent}%)` : "Breadth unavailable"}
                    </span>
                    <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1">
                      {breadth ? `${totalSectorLosers} Declining (${overallDeclinePercent}%)` : "Awaiting sourced quotes"}
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 flex overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-300"
                      style={{ width: `${overallAdvancePercent}%` }}
                    />
                    <div
                      className="h-full bg-rose-500 transition-all duration-300"
                      style={{ width: `${overallDeclinePercent}%` }}
                    />
                  </div>
                </div>

                {/* Search & Filter (Kite marketwatch style) */}
                <div className="space-y-2 pt-0.5">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={sectorSearch}
                      onChange={(e) => setSectorSearch(e.target.value)}
                      placeholder="Search sector or leader (e.g. Auto, TCS)..."
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    />
                  </div>

                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-[11px] font-semibold">
                    {(["all", "gainers", "losers"] as const).map((filterKey) => (
                      <button
                        key={filterKey}
                        onClick={() => setSectorFilter(filterKey)}
                        className={`flex-1 py-1 rounded-md transition-all text-center cursor-pointer capitalize ${
                          sectorFilter === filterKey
                            ? "bg-white dark:bg-slate-700 text-cyan-700 dark:text-cyan-300 shadow-xs font-bold"
                            : "text-slate-500 hover:text-slate-800 dark:hover:text-white"
                        }`}
                      >
                        {filterKey === "all"
                          ? `All (${DASHBOARD_TRENDING_SECTORS.length})`
                          : filterKey === "gainers"
                          ? "Bullish"
                          : "Bearish"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Table of Sectors */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase font-bold tracking-wider text-slate-400 bg-slate-50/40 dark:bg-slate-900/40">
                      <th className="py-2 px-3">Sector</th>
                      <th className="py-2 px-2 text-center">Gainers / Losers</th>
                      <th className="py-2 pr-3 text-right">1D Change</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {filteredSectors.map((sec) => {
                      const Icon = sec.icon;
                      const isGain = sec.changePercent >= 0;
                      const totalInSec = sec.observedCount;
                      const gainerPct =
                        totalInSec > 0 ? (sec.gainersCount / totalInSec) * 100 : 0;
                      const loserPct = totalInSec > 0 ? (sec.losersCount / totalInSec) * 100 : 0;

                      return (
                        <tr
                          key={sec.id}
                          className="hover:bg-slate-50/90 dark:hover:bg-slate-800/40 transition-colors group"
                        >
                          {/* Sector Name & Top Leader */}
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 shrink-0 rounded-lg bg-slate-100 dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 flex items-center justify-center border border-slate-200/60 dark:border-slate-700/60">
                                <Icon className="w-3.5 h-3.5" />
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">
                                  {sec.name}
                                </div>
                                <div className="text-[10px] text-slate-400 truncate">
                                  Top Leader:{" "}
                                  {sec.isAvailable ? <Link
                                    href={`/stocks/${sec.topStock}`}
                                    className="text-slate-600 dark:text-slate-300 font-semibold hover:text-cyan-600 dark:hover:text-cyan-400 hover:underline"
                                  >
                                    {sec.topStock} ({sec.topStockChange >= 0 ? "+" : ""}
                                    {sec.topStockChange}%)
                                  </Link> : "Unavailable"}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Gainers / Losers Ratio & Split Bar */}
                          <td className="py-2.5 px-2">
                            <div className="w-20 sm:w-24 mx-auto space-y-1">
                              <div className="flex items-center justify-between text-[10px] font-mono font-bold">
                                <span className="text-emerald-600 dark:text-emerald-400">
                                  {sec.isAvailable ? sec.gainersCount : "—"}
                                </span>
                                <span className="text-rose-600 dark:text-rose-400">
                                  {sec.isAvailable ? sec.losersCount : "—"}
                                </span>
                              </div>
                              <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 flex overflow-hidden">
                                <div
                                  className="h-full bg-emerald-500 rounded-l-full transition-all"
                                  style={{ width: `${gainerPct}%` }}
                                />
                                <div
                                  className="h-full bg-rose-500 rounded-r-full transition-all"
                                  style={{ width: `${loserPct}%` }}
                                />
                              </div>
                            </div>
                          </td>

                          {/* 1D Price Change Badge */}
                          <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                            <span
                              className={`inline-block text-[11px] font-bold font-tabular px-1.5 py-0.5 rounded ${
                                !sec.isAvailable ? "bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700" : isGain
                                  ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40"
                                  : "bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/40"
                              }`}
                            >
                              {sec.isAvailable && isGain ? "+" : ""}
                              {sec.isAvailable ? `${sec.changePercent.toFixed(2)}%` : "Unavailable"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}

                    {filteredSectors.length === 0 && (
                      <tr>
                        <td colSpan={3} className="py-6 text-center text-xs text-slate-400">
                          No matching sectors found for &quot;{sectorSearch}&quot;
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Footer */}
              <div className="p-2.5 border-t border-slate-200 dark:border-slate-800 text-center bg-slate-50/50 dark:bg-slate-900/50">
                <Link
                  href="/stocks"
                  className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:underline flex items-center justify-center gap-1"
                >
                  <span>Explore all stocks in sector screener</span>
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </aside>

          {/* ========================================================================= */}
          {/* RIGHT MAIN DESK: DASHBOARD CORE                                           */}
          {/* ========================================================================= */}
          <div className="flex-1 min-w-0 space-y-6">
            {/* Welcome Header Banner with Quick Reset & Start Investing */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-cyan-100 text-cyan-800 dark:bg-cyan-950/80 dark:text-cyan-400 border border-cyan-300 dark:border-cyan-800">
                YOUR PRACTICE ACCOUNT
              </span>
              <span className={`px-2 py-0.5 rounded text-[11px] font-bold border flex items-center gap-1 ${hasLiveFeed ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800" : "bg-slate-100 text-slate-500 dark:bg-slate-800 border-slate-300 dark:border-slate-700"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${hasLiveFeed ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
                {dashboardFeedLabel}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                NSE equities / NFO derivatives
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight mt-1 flex items-center gap-2">
              <span className="text-slate-900 dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-b dark:from-white dark:via-slate-100 dark:to-slate-400">
                Welcome back,
              </span>{" "}
              <span className="bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-400 bg-clip-text text-transparent drop-shadow-[0_0_25px_rgba(6,182,212,0.35)]">
                {userName}
              </span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Practise with virtual money. Review your funds, choose an instrument, and follow your paper orders.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleResetSimulation}
              disabled={resetting}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/[0.04] dark:hover:bg-white/[0.08] border border-slate-200 dark:border-white/[0.08] text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer shadow-xs"
              title="Reset virtual account balance to ₹10 Lakhs"
            >
              <RotateCcw className={`w-3.5 h-3.5 text-amber-500 ${resetting ? "animate-spin" : ""}`} />
              <span>Reset Funds</span>
            </button>

            <Link
              href="/stocks"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white font-bold text-xs shadow-md shadow-cyan-600/20 transition-all hover:scale-105 active:scale-95"
            >
              <Zap className="w-3.5 h-3.5 fill-current text-white" />
              <span>Start trading</span>
              <ArrowRight className="w-3.5 h-3.5 text-white" />
            </Link>
          </div>
        </div>

        {portfolioError && <p role="alert" className="text-amber-600 text-sm">Portfolio could not be refreshed. Retained values may be outdated.</p>}
        {resetError && <p role="alert" className="text-rose-600 text-sm">{resetError}</p>}
        {/* Authoritative portfolio summary */}
        <PortfolioSummarySnapshot
          wallet={wallet}
          portfolio={portfolioError && portfolio ? {...portfolio, valuation_status: portfolio.valuation_status === "DEGRADED" ? "DEGRADED" : "STALE"} : portfolio}
          onReset={handleResetSimulation}
          onAddFunds={() => setIsAddFundsOpen(true)}
          isResetting={resetting}
        />

        {/* ========================================================================= */}
        {/* Market Movers + News / Calendar Desk */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 lg:grid-cols-12 items-start gap-6">
          {/* LEFT: Dynamic Market Movers Card (Gainers, Losers, Most Active, Trending) (7 Cols) */}
          <div className="lg:col-span-7">
            <MarketMoversCard limit={8} />
          </div>

          <MarketDesk />
        </div>

        {/* ========================================================================= */}
        {/* KITE-STYLE BOTTOM SECTION: Market Overview Chart + Portfolio Anchor        */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Market Overview Chart Widget (8 Cols) - Circled on Kite Image 2 */}
          <div className="lg:col-span-8 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs p-5 space-y-4">
            {/* Header: Title + Index Switcher + Timeframe */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex flex-wrap items-center gap-3 min-w-0">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                  <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Market overview
                  </h2>
                </div>

                {/* Index Selector Dropdown / Pills */}
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs font-semibold">
                  {(["NIFTY 50", "SENSEX", "BANK NIFTY"] as OverviewIndex[]).map((idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedIndex(idx)}
                      className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                        selectedIndex === idx
                          ? "bg-white dark:bg-slate-700 text-cyan-700 dark:text-cyan-300 shadow-xs"
                          : "text-slate-500 hover:text-slate-800 dark:hover:text-white"
                      }`}
                    >
                      {idx}
                    </button>
                  ))}
                </div>
              </div>

              {/* 1D Timeframe Badge */}
              <div className="flex items-center text-[11px] font-semibold">
                <span className="px-2.5 py-0.5 rounded-md bg-cyan-100 dark:bg-cyan-950/80 text-cyan-800 dark:text-cyan-300 font-bold">
                  1D
                </span>
              </div>
            </div>

            {/* Price & Change Strip */}
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-2xl font-black font-tabular text-slate-900 dark:text-slate-100">
                  {hoveredChartPoint
                    ? hoveredChartPoint.price.toLocaleString("en-IN", { minimumFractionDigits: 2 })
                    : chartData.currentPrice > 0 ? chartData.currentPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "Unavailable"}
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <span
                    className={
                      !dayMovement(quotes[indexKey]) ? "text-slate-500" : chartData.change >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                    }
                  >
                    {dayMovement(quotes[indexKey]) ? `${chartData.change >= 0 ? "+" : ""}${chartData.change.toFixed(2)} (${chartData.changePercent}%)` : "Day change unavailable"}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {hoveredChartPoint ? `at ${hoveredChartPoint.time}` : quotes[indexKey]?.updated_at ? `Quote: ${new Date(quotes[indexKey].updated_at).toLocaleString("en-IN", {timeZone: "Asia/Kolkata"})} IST` : "Quote time unavailable"}
                  </span>
                </div>
              </div>

              <div className="text-right text-[11px] text-slate-500 font-mono hidden sm:block">
                <div>Close high: {chartData.pts.length ? chartData.max.toFixed(2) : "—"}</div>
                <div>Close low: {chartData.pts.length ? chartData.min.toFixed(2) : "—"}</div>
              </div>
            </div>

            {historyError && <p role="alert" className="text-xs text-amber-700 dark:text-amber-300">History could not be refreshed: {historyFailure?.message}. Retained bars may be incomplete.</p>}
            {indexCandles?.length ? <p className="text-xs text-slate-500">Last plotted bar: {new Date(indexCandles[indexCandles.length - 1].timestamp * 1000).toLocaleString("en-IN", {timeZone: "Asia/Kolkata"})} IST. Retained history may be delayed.</p> : null}
            {/* SVG Interactive Trend Chart */}
            <div className="relative w-full h-[200px] select-none pt-2">
              {chartData.coords.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 bg-slate-900/10 dark:bg-slate-950/20 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                  <TrendingUp className="w-7 h-7 text-slate-400 dark:text-slate-600 mb-1.5 opacity-60" />
                  <p role="status" className="text-xs font-semibold text-slate-600 dark:text-slate-300">{historyError ? "Index Chart Unavailable" : historyPending ? "Loading index history…" : "Waiting for Angel One history"}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center px-4 mt-1">{historyError ? "Check the market worker and retry. A live quote does not include historical candles." : `Requesting authentic ${selectedIndex} candles. The chart updates when the broker backfill arrives.`}</p>
                  <button disabled={historyFetching} onClick={() => void refetchHistory()} className="mt-3 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-cyan-700 dark:text-cyan-300 disabled:opacity-50">{historyFetching ? "Requesting…" : "Retry history"}</button>
                </div>
              ) : (
                <svg
                  viewBox="0 0 760 180"
                  className="w-full h-full overflow-visible"
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient id="overviewGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal guide lines */}
                  <line x1="0" y1="30" x2="760" y2="30" stroke="currentColor" className="text-slate-100 dark:text-slate-800/60" strokeDasharray="3 3" />
                  <line x1="0" y1="90" x2="760" y2="90" stroke="currentColor" className="text-slate-100 dark:text-slate-800/60" strokeDasharray="3 3" />
                  <line x1="0" y1="150" x2="760" y2="150" stroke="currentColor" className="text-slate-100 dark:text-slate-800/60" strokeDasharray="3 3" />

                  {/* Shaded Area */}
                  <path d={chartData.areaPath} fill="url(#overviewGradient)" />

                  {/* Main Line Curve */}
                  <path
                    d={chartData.linePath}
                    fill="none"
                    stroke="#06b6d4"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Interactive cursor points */}
                  {chartData.coords.map((c, i) => (
                    <circle
                      key={i}
                      cx={c.x}
                      cy={c.y}
                      r="4"
                      className="opacity-0 hover:opacity-100 fill-cyan-500 transition-opacity cursor-pointer"
                      onMouseEnter={() => setHoveredChartPoint({ price: c.pt.price, time: c.pt.time })}
                      onMouseLeave={() => setHoveredChartPoint(null)}
                    />
                  ))}
                </svg>
              )}
            </div>
          </div>

          {/* RIGHT: Portfolio Positions / Kite Signature Anchor Widget (4 Cols) */}
          <div className="lg:col-span-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <PieChart className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                  Positions & Holdings
                </span>
                <Link
                  href="/portfolio"
                  className="text-[11px] font-semibold text-cyan-600 dark:text-cyan-400 hover:underline"
                >
                  View all →
                </Link>
              </div>

              {openPositions.length === 0 ? (
                /* Kite's Signature Empty Anchor State */
                <div className="py-8 text-center space-y-3">
                  <div className="w-14 h-14 mx-auto rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500">
                    <Anchor className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      You don&apos;t have any positions yet
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Explore stocks or option contracts to place simulated orders with your ₹10L margin.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 py-2">
                  {openPositions.slice(0, 3).map((pos, idx) => (
                    <div key={idx} className="py-2 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-slate-900 dark:text-slate-100">{pos.symbol}</span>
                        <div className="text-[10px] text-slate-400">
                          {pos.product} • Qty: {pos.quantity}
                        </div>
                      </div>
                      <div className="text-right">
                        <div
                          className={`font-bold font-tabular ${
                            (pos.unrealized_pnl_paise ?? 0) >= 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-rose-600 dark:text-rose-400"
                          }`}
                        >
                          {formatPaise(pos.unrealized_pnl_paise ?? 0)}
                        </div>
                        <div className="text-[10px] text-slate-400 font-tabular">
                          LTP: {formatPaise(pos.current_price_paise ?? 0)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <Link
                href="/stocks/RELIANCE"
                className="w-full py-2.5 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-cyan-500/20 transition-all hover:scale-[1.02]"
              >
                <span>Start Investing / Paper Trading</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <Link
                href="/orders"
                className="w-full py-2 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors text-center"
              >
                <span>View Order Execution Book</span>
              </Link>
            </div>
            </div>
          </div>
        </div>
        </div>
      </main>

      <AddFundsModal
        isOpen={isAddFundsOpen}
        onClose={() => {
          setIsAddFundsOpen(false);
          void refetchWallet();
        }}
        currentBalancePaise={availableBalance}
      />
    </div>
  );
}
