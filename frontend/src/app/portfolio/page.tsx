"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Navbar from "@/components/layout/Navbar";
import PositionsTable from "@/components/terminal/PositionsTable";
import PortfolioHoldingsTable from "@/components/portfolio/PortfolioHoldingsTable";
import PortfolioAllocationView from "@/components/portfolio/PortfolioAllocationView";
import PortfolioPnlAnalytics from "@/components/portfolio/PortfolioPnlAnalytics";
import WalletTransactionsTable from "@/components/portfolio/WalletTransactionsTable";
import AddFundsModal from "@/components/portfolio/AddFundsModal";
import PortfolioAiInsightsModal from "@/components/portfolio/PortfolioAiInsightsModal";
import ResetSimulationModal from "@/components/modals/ResetSimulationModal";
import {
  DEMO_HOLDINGS,
  DEMO_POSITIONS,
  type HoldingItem,
} from "@/components/portfolio/PortfolioTypes";
import {
  PieChart,
  Briefcase,
  Layers,
  BarChart3,
  Calendar,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Wallet as WalletIcon,
  RefreshCw,
  RotateCcw,
  Plus,
  Flame,
  Zap,
  Download,
  ShieldCheck,
  ArrowRight,
  SlidersHorizontal,
  Receipt,
} from "lucide-react";
import { formatPaise, formatPercent } from "@/lib/format";
import { useMarketStore } from "@/stores/market-store";
import type { Portfolio, Wallet, ApiResponse, Position } from "@/types";

const STOCK_INFO_MAP: Record<
  string,
  { name: string; sector: HoldingItem["sector"] }
> = {
  RELIANCE: { name: "Reliance Industries Ltd", sector: "Energy" },
  SUZLON: { name: "Suzlon Energy Ltd", sector: "Energy" },
  TCS: { name: "Tata Consultancy Services", sector: "IT" },
  INFY: { name: "Infosys Ltd", sector: "IT" },
  WIPRO: { name: "Wipro Ltd", sector: "IT" },
  HCLTECH: { name: "HCL Technologies", sector: "IT" },
  TECHM: { name: "Tech Mahindra", sector: "IT" },
  HDFCBANK: { name: "HDFC Bank Ltd", sector: "Banking" },
  ICICIBANK: { name: "ICICI Bank Ltd", sector: "Banking" },
  SBIN: { name: "State Bank of India", sector: "Banking" },
  KOTAKBANK: { name: "Kotak Mahindra Bank", sector: "Banking" },
  AXISBANK: { name: "Axis Bank Ltd", sector: "Banking" },
  BAJFINANCE: { name: "Bajaj Finance Ltd", sector: "Banking" },
  TATAMOTORS: { name: "Tata Motors Ltd", sector: "Auto" },
  MARUTI: { name: "Maruti Suzuki Ltd", sector: "Auto" },
  "M&M": { name: "Mahindra & Mahindra", sector: "Auto" },
  ITC: { name: "ITC Ltd", sector: "FMCG" },
  HINDUNILVR: { name: "Hindustan Unilever", sector: "FMCG" },
  SUNPHARMA: { name: "Sun Pharmaceutical", sector: "Pharma" },
  DRREDDY: { name: "Dr. Reddy's Labs", sector: "Pharma" },
  CIPLA: { name: "Cipla Ltd", sector: "Pharma" },
  TATASTEEL: { name: "Tata Steel Ltd", sector: "Metals" },
  JSWSTEEL: { name: "JSW Steel Ltd", sector: "Metals" },
  HINDALCO: { name: "Hindalco Industries", sector: "Metals" },
  ADANIENT: { name: "Adani Enterprises", sector: "Energy" },
  ADANIPORTS: { name: "Adani Ports", sector: "Other" },
  NTPC: { name: "NTPC Ltd", sector: "Energy" },
  POWERGRID: { name: "Power Grid Corp", sector: "Energy" },
  ONGC: { name: "Oil & Natural Gas Corp", sector: "Energy" },
  COALINDIA: { name: "Coal India", sector: "Metals" },
  BHARTIARTL: { name: "Bharti Airtel", sector: "Other" },
  LT: { name: "Larsen & Toubro", sector: "Other" },
};

type PortfolioTab = "HOLDINGS" | "POSITIONS" | "ALLOCATION" | "ANALYTICS" | "LEDGER";

export default function PortfolioPage() {
  const queryClient = useQueryClient();

  // Active Portfolio Tab
  const [activeTab, setActiveTab] = useState<PortfolioTab>("HOLDINGS");

  // Modals state
  const [isAddFundsOpen, setIsAddFundsOpen] = useState(false);
  const [isAiInsightsOpen, setIsAiInsightsOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);

  // Demo Showcase vs Live Ledger toggle state (defaults to Live when authenticated)
  const [useDemoData, setUseDemoData] = useState(() => {
    if (typeof window !== "undefined") {
      const t = localStorage.getItem("auth_token") || localStorage.getItem("stock-simulator-access-token");
      return !t;
    }
    return false;
  });

  const [token] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("auth_token") || "";
    }
    return "";
  });

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1";

  // 1. Fetch Portfolio via TanStack Query
  const {
    data: portfolio,
    isLoading: loadingPortfolio,
    refetch: refetchPortfolio,
  } = useQuery<Portfolio>({
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

  // 2. Fetch Wallet via TanStack Query
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

  const quotes = useMarketStore((state) => state.quotes);

  // Live vs Demo positions and holdings
  const livePositions = portfolio?.positions ?? [];

  const rawLiveHoldings = livePositions.filter(
    (p) => p.product === "DELIVERY" && p.quantity > 0
  );
  const totalLiveHoldingsCurrentPaise = rawLiveHoldings.reduce((sum, p) => {
    const liveQuote = quotes[p.symbol];
    const ltpPaise = liveQuote?.price_paise || p.current_price_paise || p.average_price_paise;
    return sum + ltpPaise * p.quantity;
  }, 0);

  const activeHoldings: HoldingItem[] = useDemoData
    ? DEMO_HOLDINGS
    : rawLiveHoldings.map((p, idx) => {
        const liveQuote = quotes[p.symbol];
        const ltpPaise = liveQuote?.price_paise || p.current_price_paise || p.average_price_paise;
        const prevClosePaise =
          liveQuote && liveQuote.change_paise !== undefined
            ? ltpPaise - liveQuote.change_paise
            : p.average_price_paise;
        const dayChangePaise =
          liveQuote && liveQuote.change_paise !== undefined
            ? Math.round(liveQuote.change_paise * p.quantity)
            : Math.round((ltpPaise - p.average_price_paise) * p.quantity * 0.1);
        const dayChangePercent =
          liveQuote && liveQuote.change_percent !== undefined
            ? liveQuote.change_percent
            : prevClosePaise > 0
            ? ((ltpPaise - prevClosePaise) / prevClosePaise) * 100
            : 0;

        const investedValuePaise =
          p.invested_value_paise || p.average_price_paise * p.quantity;
        const currentValuePaise = ltpPaise * p.quantity;
        const unrealizedPnlPaise = currentValuePaise - investedValuePaise;
        const pnlPercent =
          investedValuePaise > 0
            ? (unrealizedPnlPaise / investedValuePaise) * 100
            : 0;

        const stockInfo = STOCK_INFO_MAP[p.symbol] || {
          name: `${p.symbol} Equity`,
          sector: "Other" as const,
        };

        const weightPercent =
          totalLiveHoldingsCurrentPaise > 0
            ? (currentValuePaise / totalLiveHoldingsCurrentPaise) * 100
            : 100 / Math.max(rawLiveHoldings.length, 1);

        return {
          id: `h-live-${p.uuid || idx}`,
          symbol: p.symbol,
          name: stockInfo.name,
          exchange: "NSE",
          sector: stockInfo.sector,
          quantity: p.quantity,
          avgBuyPricePaise: p.average_price_paise,
          ltpPaise,
          prevClosePaise,
          investedValuePaise,
          currentValuePaise,
          unrealizedPnlPaise,
          pnlPercent,
          dayChangePaise,
          dayChangePercent,
          weightPercent,
        };
      });

  const activePositions: Position[] = useDemoData
    ? DEMO_POSITIONS
    : livePositions.filter((p) => p.product !== "DELIVERY" || p.quantity < 0);

  // Financial calculations
  const holdingsCurrentVal = activeHoldings.reduce((sum, h) => sum + h.currentValuePaise, 0);
  const holdingsInvestedVal = activeHoldings.reduce((sum, h) => sum + h.investedValuePaise, 0);
  const holdingsPnl = holdingsCurrentVal - holdingsInvestedVal;

  const positionsPnl = activePositions.reduce((sum, p) => sum + p.unrealized_pnl_paise, 0);
  const positionsInvestedVal = activePositions.reduce(
    (sum, p) => sum + (p.invested_value_paise || p.average_price_paise * Math.abs(p.quantity)),
    0
  );

  // Tab-sensitive financial calculations (Holdings vs Positions)
  const isPositionsTab = activeTab === "POSITIONS";
  const totalInvestedPaise = isPositionsTab ? positionsInvestedVal : holdingsInvestedVal;
  const totalUnrealizedPnlPaise = isPositionsTab ? positionsPnl : holdingsPnl;
  const totalValuationPaise = isPositionsTab ? (positionsInvestedVal + positionsPnl) : holdingsCurrentVal;
  const totalPnlPercent =
    totalInvestedPaise > 0 ? (totalUnrealizedPnlPaise / totalInvestedPaise) * 100 : 0;
  const isOverallProfit = totalUnrealizedPnlPaise >= 0;

  // Day P&L calculation
  const holdingsDayPnlPaise = activeHoldings.reduce((sum, h) => sum + h.dayChangePaise, 0);
  const positionsDayPnlPaise = activePositions.reduce((sum, p) => {
    const q = quotes[p.symbol];
    if (q && q.change_paise !== undefined) {
      return sum + Math.round(q.change_paise * p.quantity);
    }
    return sum + Math.round((p.unrealized_pnl_paise || 0) * 0.05);
  }, 0);

  const dayPnlPaise = isPositionsTab ? positionsDayPnlPaise : holdingsDayPnlPaise;
  const dayPnlPercent =
    (totalValuationPaise - dayPnlPaise) > 0 ? (dayPnlPaise / (totalValuationPaise - dayPnlPaise)) * 100 : 0;
  const isDayProfit = dayPnlPaise >= 0;

  const availableBalancePaise = wallet?.available_balance_paise ?? 100000000;
  const blockedMarginPaise = isPositionsTab
    ? (wallet?.blocked_paise ?? (useDemoData ? 36800000 : 0))
    : (wallet?.blocked_paise ?? 0);

  // Square off position
  const handleSquareOff = async (pos: Position) => {
    if (!token) return;
    const closeSide = pos.quantity > 0 ? "SELL" : "BUY";
    await fetch(`${apiUrl}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        symbol: pos.symbol,
        side: closeSide,
        type: "MARKET",
        product: pos.product,
        quantity: Math.abs(pos.quantity),
      }),
    });
    void queryClient.invalidateQueries({ queryKey: ["portfolio"] });
    void queryClient.invalidateQueries({ queryKey: ["wallet"] });
  };

  // Square off all MIS positions
  const handleSquareOffAllMIS = async () => {
    if (!token) return;
    await fetch(`${apiUrl}/orders/squareoff-mis`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    void queryClient.invalidateQueries({ queryKey: ["portfolio"] });
    void queryClient.invalidateQueries({ queryKey: ["wallet"] });
  };

  // Export CSV summary
  const handleExportCSV = () => {
    const rows = [
      ["Symbol", "Type", "Quantity", "Avg Price (INR)", "Current Value (INR)", "Unrealized P&L (INR)"],
      ...activeHoldings.map((h) => [
        h.symbol,
        "CNC Holdings",
        h.quantity.toString(),
        (h.avgBuyPricePaise / 100).toFixed(2),
        (h.currentValuePaise / 100).toFixed(2),
        (h.unrealizedPnlPaise / 100).toFixed(2),
      ]),
      ...activePositions.map((p) => [
        p.symbol,
        p.product,
        p.quantity.toString(),
        (p.average_price_paise / 100).toFixed(2),
        (p.current_value_paise / 100).toFixed(2),
        (p.unrealized_pnl_paise / 100).toFixed(2),
      ]),
    ];

    const csvContent = "data:text/csv;charset=utf-8," + rows.map((e) => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `portfolio_report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-150">
      <Navbar
        availableBalancePaise={availableBalancePaise}
        unrealizedPnlPaise={0}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* ===================================================================== */}
        {/* TOP HEADER & INSTITUTIONAL ACTIONS BAR                                */}
        {/* ===================================================================== */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <PieChart className="w-6 h-6 text-cyan-600 dark:text-cyan-400" />
                <span>Institutional Portfolio Desk</span>
              </h1>

              {/* Elegant Luxury Segmented Capsule Switcher */}
              <div className="inline-flex items-center p-1 rounded-full bg-slate-100/90 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 shadow-xs backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => setUseDemoData(true)}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-tight transition-all duration-200 cursor-pointer select-none ${
                    useDemoData
                      ? "bg-white dark:bg-slate-900 text-cyan-700 dark:text-cyan-300 shadow-sm border border-slate-200/80 dark:border-slate-700"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  <Sparkles
                    className={`w-3.5 h-3.5 transition-colors ${
                      useDemoData ? "text-cyan-600 dark:text-cyan-400" : "text-slate-400"
                    }`}
                  />
                  <span>Showcase Demo</span>
                </button>

                <button
                  type="button"
                  onClick={() => setUseDemoData(false)}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-tight transition-all duration-200 cursor-pointer select-none ${
                    !useDemoData
                      ? "bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 shadow-sm border border-slate-200/80 dark:border-slate-700"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  <span className="relative flex h-2 w-2">
                    {!useDemoData && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    )}
                    <span
                      className={`relative inline-flex rounded-full h-2 w-2 ${
                        !useDemoData ? "bg-emerald-500" : "bg-slate-400"
                      }`}
                    ></span>
                  </span>
                  <span>Live Ledger</span>
                </button>
              </div>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2">
              <span>Real-time Mark-to-Market across Delivery Demat (CNC), Intraday (MIS), and F&O derivatives.</span>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                Live Sync
              </span>
            </p>
          </div>

          {/* Action Buttons Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setIsAddFundsOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white font-bold text-xs shadow-md shadow-cyan-600/20 transition-all hover:scale-105 active:scale-95 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-white" />
              <span>Add Margin</span>
            </button>

            <button
              onClick={() => setIsAiInsightsOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800/60 text-indigo-700 dark:text-indigo-300 font-bold text-xs transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
              <span>AI Audit</span>
            </button>

            <button
              onClick={() => setIsResetModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 border border-amber-200 dark:border-amber-800/60 text-amber-700 dark:text-amber-300 font-bold text-xs transition-colors cursor-pointer"
              title="Reset Virtual Paper Account back to ₹10L seed capital"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>Reset Account</span>
            </button>

            <button
              onClick={handleExportCSV}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
              title="Export CSV Statement"
            >
              <Download className="w-4 h-4" />
            </button>

            <button
              onClick={() => void refetchPortfolio()}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
              title="Refresh Portfolio"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ===================================================================== */}
        {/* TOP KPI CARDS (TOTAL VALUATION, INVESTED, OVERALL P&L, MARGIN)         */}
        {/* ===================================================================== */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Total Valuation */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2 relative overflow-hidden group hover:border-cyan-500/40 transition-all">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>Total Valuation</span>
              <span className="text-[10px] font-mono text-cyan-600 dark:text-cyan-400">Live MTM</span>
            </span>
            <div className="text-2xl font-black font-tabular text-slate-900 dark:text-slate-100">
              {formatPaise(totalValuationPaise)}
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-400">Invested:</span>
              <span className="font-bold font-tabular text-slate-700 dark:text-slate-300">
                {formatPaise(totalInvestedPaise)}
              </span>
            </div>
          </div>

          {/* 2. Total Unrealized Return */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2 group hover:border-cyan-500/40 transition-all">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>Overall Returns</span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.2 rounded font-tabular ${
                  isOverallProfit
                    ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40"
                    : "bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/40"
                }`}
              >
                {isOverallProfit ? "+" : ""}
                {totalPnlPercent.toFixed(2)}%
              </span>
            </span>
            <div className="flex items-baseline gap-2">
              <div
                className={`text-2xl font-black font-tabular flex items-center gap-1 ${
                  isOverallProfit
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {isOverallProfit ? (
                  <TrendingUp className="w-5 h-5 shrink-0" />
                ) : (
                  <TrendingDown className="w-5 h-5 shrink-0" />
                )}
                <span>
                  {isOverallProfit ? "+" : ""}
                  {formatPaise(totalUnrealizedPnlPaise)}
                </span>
              </div>
            </div>
            <div className="text-[11px] text-slate-400">
              {isPositionsTab
                ? "Floating MTM across active F&O"
                : "Floating MTM across demat holdings"}
            </div>
          </div>

          {/* 3. Today's Day P&L */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2 group hover:border-cyan-500/40 transition-all">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>1-Day P&L</span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.2 rounded font-tabular ${
                  isDayProfit
                    ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400"
                    : "bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400"
                }`}
              >
                {isDayProfit ? "+" : ""}
                {dayPnlPercent.toFixed(2)}%
              </span>
            </span>
            <div
              className={`text-2xl font-black font-tabular ${
                isDayProfit ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {isDayProfit ? "+" : ""}
              {formatPaise(dayPnlPaise)}
            </div>
            <div className="text-[11px] text-slate-400">
              Today&apos;s mark-to-market swing
            </div>
          </div>

          {/* 4. Available Trading Margin */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2 group hover:border-cyan-500/40 transition-all">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <WalletIcon className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                <span>Available Margin</span>
              </span>
              <button
                onClick={() => setIsAddFundsOpen(true)}
                className="text-[10px] font-bold text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer"
              >
                + Deposit
              </button>
            </span>
            <div className="text-2xl font-black font-tabular text-slate-900 dark:text-slate-100">
              {formatPaise(availableBalancePaise)}
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
              <span>Blocked: {formatPaise(blockedMarginPaise)}</span>
              <span>Span + Exp: 0%</span>
            </div>
          </div>
        </div>

        {/* ===================================================================== */}
        {/* MAIN NAVIGATION TABS (HOLDINGS | POSITIONS | ALLOCATION | ANALYTICS)  */}
        {/* ===================================================================== */}
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 overflow-x-auto no-scrollbar">
          {[
            {
              id: "HOLDINGS",
              label: "Holdings (Demat CNC)",
              icon: Briefcase,
              count: activeHoldings.length,
            },
            {
              id: "POSITIONS",
              label: "Positions (MIS & F&O)",
              icon: Layers,
              count: activePositions.length,
            },
            {
              id: "ALLOCATION",
              label: "Asset Allocation & Sectors",
              icon: PieChart,
            },
            {
              id: "ANALYTICS",
              label: "P&L Journal & Analytics",
              icon: Calendar,
            },
            {
              id: "LEDGER",
              label: "Cash Movements Ledger",
              icon: Receipt,
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as PortfolioTab)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 font-bold text-xs whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? "border-cyan-500 text-cyan-700 dark:text-cyan-400 bg-cyan-50/50 dark:bg-cyan-950/20"
                    : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full ${
                      isActive
                        ? "bg-cyan-600 text-white dark:bg-cyan-500 dark:text-slate-950"
                        : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ===================================================================== */}
        {/* TAB 1: HOLDINGS (EQUITY CNC DEMAT)                                    */}
        {/* ===================================================================== */}
        {activeTab === "HOLDINGS" && (
          <PortfolioHoldingsTable
            holdings={activeHoldings}
            onExitHolding={(h) => {
              // Quick exit simulation
              alert(`Order placement ticket initiated to exit ${h.quantity} shares of ${h.symbol} at market.`);
            }}
          />
        )}

        {/* ===================================================================== */}
        {/* TAB 2: ACTIVE POSITIONS DESK (INTRADAY MIS & F&O DERIVATIVES)         */}
        {/* ===================================================================== */}
        {activeTab === "POSITIONS" && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                  <span>Active Derivatives & Day-Trading Positions</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Real-time Mark-to-market open contracts. MIS auto-squares off at 15:20 IST.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleSquareOffAllMIS}
                  className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 font-bold text-xs transition-colors cursor-pointer"
                >
                  Square Off All MIS
                </button>
                <Link
                  href="/options"
                  className="px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 font-bold text-xs transition-colors"
                >
                  + Trade F&O
                </Link>
              </div>
            </div>

            <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
              <PositionsTable
                positions={activePositions}
                onSquareOff={handleSquareOff}
                onSquareOffAllMIS={handleSquareOffAllMIS}
              />
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* TAB 3: ASSET ALLOCATION & RISK DIVERSIFICATION                        */}
        {/* ===================================================================== */}
        {activeTab === "ALLOCATION" && (
          <PortfolioAllocationView
            holdings={activeHoldings}
            positions={activePositions}
            availableMarginPaise={availableBalancePaise}
            useDemoData={useDemoData}
            token={token || ""}
          />
        )}

        {/* ===================================================================== */}
        {/* TAB 4: P&L JOURNAL & QUANT ANALYTICS                                  */}
        {/* ===================================================================== */}
        {activeTab === "ANALYTICS" && (
          <PortfolioPnlAnalytics
            useDemoData={useDemoData}
            totalValuationPaise={totalValuationPaise}
            totalUnrealizedPnlPaise={totalUnrealizedPnlPaise}
            availableBalancePaise={availableBalancePaise}
            totalInvestedPaise={totalInvestedPaise}
            holdings={activeHoldings}
            positions={activePositions}
            token={token || ""}
          />
        )}

        {/* ===================================================================== */}
        {/* TAB 5: CASH MOVEMENTS LEDGER & AUDIT TRAIL                            */}
        {/* ===================================================================== */}
        {activeTab === "LEDGER" && (
          <WalletTransactionsTable
            useDemoData={useDemoData}
            token={token || ""}
          />
        )}
      </main>

      {/* Virtual Deposit / Add Funds Modal */}
      <AddFundsModal
        isOpen={isAddFundsOpen}
        onClose={() => setIsAddFundsOpen(false)}
        currentBalancePaise={availableBalancePaise}
      />

      {/* AI Portfolio Health Audit Modal */}
      <PortfolioAiInsightsModal
        isOpen={isAiInsightsOpen}
        onClose={() => setIsAiInsightsOpen(false)}
        holdingsCount={activeHoldings.length}
        totalValuationRupees={totalValuationPaise / 100}
        pnlPercent={totalPnlPercent}
      />

      {/* Institutional Simulation Reset Confirmation Modal */}
      <ResetSimulationModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
      />
    </div>
  );
}
