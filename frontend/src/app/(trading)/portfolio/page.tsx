"use client";
import { sessionFetch } from "@/lib/api";
import { exitRetryKey, completeExitRetry } from "@/lib/exitRetry";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useAccountWallet } from "@/hooks/useAccountWallet";
import { useAccountPortfolio } from "@/hooks/useAccountPortfolio";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import Navbar from "@/components/layout/Navbar";
import PositionsTable from "@/components/portfolio/PositionsTable";
import PortfolioHoldingsTable from "@/components/portfolio/PortfolioHoldingsTable";
import PortfolioAllocationView from "@/components/portfolio/PortfolioAllocationView";
import PortfolioPnlAnalytics from "@/components/portfolio/PortfolioPnlAnalytics";
import WalletTransactionsTable from "@/components/portfolio/WalletTransactionsTable";
import AddFundsModal from "@/components/portfolio/AddFundsModal";
import PortfolioAiInsightsModal from "@/components/portfolio/PortfolioAiInsightsModal";
import ResetSimulationModal from "@/components/modals/ResetSimulationModal";
import { type HoldingItem } from "@/components/portfolio/PortfolioTypes";
import {
  PieChart,
  Briefcase,
  Layers,
  Calendar,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Wallet as WalletIcon,
  RefreshCw,
  RotateCcw,
  Plus,
  Download,
  Receipt,
} from "lucide-react";
import { formatPaise } from "@/lib/format";
import { useMultiSymbolQuotes, useTargetedSubscription } from "@/stores/market-store";
import { resolveCanonicalSymbol } from "@/lib/alias";
import { API_URL, extractApiDiagnostic, type ApiDiagnostic } from "@/lib/api";
import ErrorDiagnosticModal from "@/components/ui/ErrorDiagnosticModal";
import { useToast } from "@/components/ui/ToastProvider";
import type { Position } from "@/types";

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
  const { addToast } = useToast();

  // Active Portfolio Tab
  const [activeTab, setActiveTab] = useState<PortfolioTab>("HOLDINGS");

  // Modals state
  const [isAddFundsOpen, setIsAddFundsOpen] = useState(false);
  const [isAiInsightsOpen, setIsAiInsightsOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [diagnosticError, setDiagnosticError] = useState<ApiDiagnostic | null>(null);
  const [diagnosticTitle, setDiagnosticTitle] = useState<string>("Operation Diagnostic");


  const token = useRequireAuth("/portfolio");

  const apiUrl = API_URL;

  // 1. Fetch Portfolio via TanStack Query
  const {
    data: portfolio,
    refetch: refetchPortfolio,
    isError: portfolioError,
  } = useAccountPortfolio();

  // 2. Fetch Wallet via TanStack Query
  const { data: wallet, isError: walletError } = useAccountWallet();

  // Live positions and holdings
  const livePositions = useMemo(
    () => (portfolio?.positions ?? []).map(p => portfolioError ? { ...p, is_quote_available: false } : p),
    [portfolio?.positions, portfolioError]
  );
  const portfolioSymbols = useMemo(
    () => livePositions.map((p) => p.symbol),
    [livePositions]
  );
  useTargetedSubscription(portfolioSymbols);
  const quotes = useMultiSymbolQuotes(portfolioSymbols);

  const rawLiveHoldings = livePositions.filter(
    (p) => p.product === "DELIVERY" && p.quantity > 0
  );
  const totalLiveHoldingsCurrentPaise = rawLiveHoldings.reduce((sum, p) => {
    const canonical = resolveCanonicalSymbol(p.symbol);
    const liveQuote = quotes[p.symbol] || quotes[canonical];
    const hasLiveQuote = !!(liveQuote && liveQuote.price_paise > 0);
    const hasRecordedPrice = !!(p.current_price_paise && p.current_price_paise > 0);
    const isAvail = !portfolioError && (hasLiveQuote || (p.is_quote_available ?? false) || hasRecordedPrice);
    const ltpPaise = hasLiveQuote
      ? liveQuote.price_paise
      : hasRecordedPrice
      ? p.current_price_paise
      : (isAvail ? p.average_price_paise : 0);
    return sum + (isAvail ? ltpPaise * p.quantity : 0);
  }, 0);

  const activeHoldings: HoldingItem[] = rawLiveHoldings.map((p, idx) => {
    const canonical = resolveCanonicalSymbol(p.symbol);
    const liveQuote = quotes[p.symbol] || quotes[canonical];
    const hasLiveQuote = !!(liveQuote && liveQuote.price_paise > 0);
    const hasRecordedPrice = !!(p.current_price_paise && p.current_price_paise > 0);
    const isAvail = !portfolioError && (hasLiveQuote || (p.is_quote_available ?? false) || hasRecordedPrice);
    const ltpPaise = hasLiveQuote
      ? liveQuote.price_paise
      : hasRecordedPrice
      ? p.current_price_paise
      : (isAvail ? p.average_price_paise : 0);
    const prevClosePaise =
      liveQuote?.previous_close_paise ?? 0;

    const quoteChangePaise = liveQuote?.change_paise;
    const hasDayChange = liveQuote?.day_change_available === true && typeof quoteChangePaise === "number";
    const dayChangePaise = hasDayChange ? quoteChangePaise * p.quantity : 0;
    const dayChangePercent = hasDayChange
      ? liveQuote?.change_percent ?? (prevClosePaise > 0 ? (quoteChangePaise / prevClosePaise) * 100 : 0)
      : 0;
    const dayPnlAvailable = isAvail && hasDayChange;

    const investedValuePaise =
      p.invested_value_paise || p.average_price_paise * p.quantity;
    const currentValuePaise = isAvail ? ltpPaise * p.quantity : (p.current_value_paise || 0);
    const unrealizedPnlPaise = isAvail ? currentValuePaise - investedValuePaise : (p.unrealized_pnl_paise || 0);
    const pnlPercent =
      investedValuePaise > 0
        ? (unrealizedPnlPaise / investedValuePaise) * 100
        : 0;

    const stockInfo = STOCK_INFO_MAP[p.symbol] || STOCK_INFO_MAP[canonical] || {
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
      dayPnlAvailable,
      quoteAvailable: isAvail,
      dayChangePaise,
      dayChangePercent,
      weightPercent,
    };
  });

  const activePositions: Position[] = useMemo(() => {
    return livePositions
      .filter((p) => p.product !== "DELIVERY" || p.quantity < 0)
      .map((p) => {
        const canonical = resolveCanonicalSymbol(p.symbol);
        const liveQuote = quotes[p.symbol] || quotes[canonical];
        const hasLiveQuote = !!(liveQuote && liveQuote.price_paise > 0);
        const hasRecordedPrice = !!(p.current_price_paise && p.current_price_paise > 0);
        const isAvail = !portfolioError && (hasLiveQuote || (p.is_quote_available ?? false) || hasRecordedPrice);
        const currentPricePaise = hasLiveQuote
          ? liveQuote.price_paise
          : hasRecordedPrice
          ? p.current_price_paise
          : (isAvail ? p.average_price_paise : 0);

        const qty = p.quantity;
        const avg = p.average_price_paise;
        let currentValuePaise = p.current_value_paise;
        let unrealizedPnlPaise = p.unrealized_pnl_paise;

        if (isAvail && currentPricePaise > 0) {
          currentValuePaise = Math.abs(qty) * currentPricePaise;
          if (qty < 0) {
            unrealizedPnlPaise = (avg - currentPricePaise) * Math.abs(qty);
          } else {
            unrealizedPnlPaise = (currentPricePaise - avg) * qty;
          }
        }

        return {
          ...p,
          current_price_paise: currentPricePaise,
          current_value_paise: currentValuePaise,
          unrealized_pnl_paise: unrealizedPnlPaise,
          is_quote_available: isAvail,
          quote_status: hasLiveQuote ? ("FRESH" as const) : p.quote_status,
        };
      });
  }, [livePositions, quotes, portfolioError]);

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
  const totalValuationPaise = isPositionsTab ? activePositions.reduce((sum, p) => sum + p.current_value_paise, 0) : holdingsCurrentVal;
  const totalPnlPercent =
    totalInvestedPaise > 0 ? (totalUnrealizedPnlPaise / totalInvestedPaise) * 100 : 0;
  const isOverallProfit = totalUnrealizedPnlPaise >= 0;

  const holdingsDayPnlPaise = activeHoldings.reduce(
    (sum, h) => sum + (h.dayPnlAvailable ? h.dayChangePaise : 0),
    0
  );
  const anyHoldingDayPnlAvailable = activeHoldings.length > 0 && activeHoldings.every((h) => h.dayPnlAvailable);
  const dayPnlPaise: number | undefined = !isPositionsTab && anyHoldingDayPnlAvailable
    ? holdingsDayPnlPaise
    : (portfolio?.daily_pnl_paise !== null && portfolio?.daily_pnl_paise !== undefined ? portfolio.daily_pnl_paise : undefined);
  const isDayProfit = (dayPnlPaise ?? 0) >= 0;
  const dayPnlPercent =
    isPositionsTab && portfolio?.daily_pnl_percent !== undefined && portfolio?.daily_pnl_percent !== null
      ? portfolio.daily_pnl_percent
      : (totalInvestedPaise > 0 && dayPnlPaise !== undefined
        ? (dayPnlPaise / totalInvestedPaise) * 100
        : undefined);

  const valuationAvailable = !!portfolio && !portfolioError && (livePositions.length === 0 || totalValuationPaise > 0 || totalInvestedPaise > 0);
  const availableBalancePaise = walletError ? undefined : wallet?.available_balance_paise;
  const blockedMarginPaise = walletError ? undefined : wallet?.blocked_paise;

  // Square off position
  const handleSquareOff = async (pos: Position) => {
    if (!token) return;
    try {
      if (!pos.uuid) throw new Error("Position identity unavailable; refresh the portfolio before exiting.");
      const endpoint = `${apiUrl}/portfolio/positions/${pos.uuid}/squareoff`;
      const retryKey = exitRetryKey(sessionStorage, pos.uuid);
      const res = await sessionFetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Idempotency-Key": retryKey },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const diag = extractApiDiagnostic(res, data, endpoint);
        setDiagnosticTitle(`Square Off Failed: ${pos.symbol}`);
        setDiagnosticError(diag);
        return;
      }
      const result = await res.json();
      completeExitRetry(sessionStorage, pos.uuid, result.data?.status);
      if (result.data?.status !== "EXECUTED") throw new Error(`Exit ${result.data?.status?.toLowerCase() || "pending"}; refresh the position before trying again.`);
      void queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      void queryClient.invalidateQueries({ queryKey: ["wallet"] });
      addToast(
        "Position Squared Off",
        `Successfully squared off ${pos.quantity} shares of ${pos.symbol}.`,
        "success",
      );
    } catch (err: unknown) {
      setDiagnosticTitle(`Square Off Network Error: ${pos.symbol}`);
      const msg = err instanceof Error ? err.message : "Network error squaring off position";
      addToast("Square Off Failed", msg, "error");
      setDiagnosticError({
        status: 0,
        message: msg,
        timestamp: new Date().toISOString(),
      });
    }
  };

  // Square off all MIS positions
  const handleSquareOffAllMIS = async () => {
    if (!token) return;
    try {
      const endpoint = `${apiUrl}/orders/squareoff-mis`;
      const res = await sessionFetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const diag = extractApiDiagnostic(res, data, endpoint);
        setDiagnosticTitle("Bulk MIS Square-Off Failed");
        setDiagnosticError(diag);
        addToast("Bulk Square-Off Failed", "Unable to square off MIS positions.", "error");
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      void queryClient.invalidateQueries({ queryKey: ["wallet"] });
      addToast("Bulk MIS Squared Off", "All intraday MIS positions have been squared off.", "success");
    } catch (err: unknown) {
      setDiagnosticTitle("Bulk MIS Square-Off Network Error");
      const msg = err instanceof Error ? err.message : "Network error during bulk square-off";
      addToast("Bulk Square-Off Error", msg, "error");
      setDiagnosticError({
        status: 0,
        message: msg,
        timestamp: new Date().toISOString(),
      });
    }
  };

  // Holdings use the same durable, position-bound exit workflow.
  const handleExitHolding = async (holding: HoldingItem) => {
    const position = livePositions.find(p => p.uuid && `h-live-${p.uuid}` === holding.id);
    if (position) await handleSquareOff(position);
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
    addToast("Portfolio Exported", "Portfolio summary CSV downloaded successfully.", "success");
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin" />
          <span className="text-xs font-mono text-slate-500">Redirecting to login...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-150">
      <Navbar
        availableBalancePaise={availableBalancePaise}
        unrealizedPnlPaise={totalUnrealizedPnlPaise}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {(!portfolio || portfolioError || availableBalancePaise === undefined) && <p role="status" className="p-3 text-sm text-amber-700">Account data is loading or unavailable. Balances and returns are shown only when verified.</p>}

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
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2">
              <span>Real-time Mark-to-Market across Delivery Demat (CNC), Intraday (MIS), and F&O derivatives.</span>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                {portfolio?.valuation_status === "REALTIME" ? "Live Sync" : "Valuation stale / unavailable"}
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
          {/* 1. Gross Position Value */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2 relative overflow-hidden group hover:border-cyan-500/40 transition-all">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>Gross Position Value</span>
              <span className="text-[10px] font-mono text-cyan-600 dark:text-cyan-400">Live MTM</span>
            </span>
            <div className="text-2xl font-black font-tabular text-slate-900 dark:text-slate-100">
              {formatPaise(valuationAvailable ? totalValuationPaise : undefined)}
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-400">Invested:</span>
              <span className="font-bold font-tabular text-slate-700 dark:text-slate-300">
                {formatPaise(portfolio && !portfolioError ? totalInvestedPaise : undefined)}
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
                {valuationAvailable && isOverallProfit ? "+" : ""}
                {valuationAvailable ? `${totalPnlPercent.toFixed(2)}%` : "Unavailable"}
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
                  {valuationAvailable && isOverallProfit ? "+" : ""}
                  {formatPaise(valuationAvailable ? totalUnrealizedPnlPaise : undefined)}
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
              <span>Holdings Day Movement</span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.2 rounded font-tabular ${
                  isDayProfit
                    ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400"
                    : "bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400"
                }`}
              >
                {dayPnlPercent !== undefined ? `${isDayProfit && dayPnlPercent > 0 ? "+" : ""}${dayPnlPercent.toFixed(2)}%` : "—"}
              </span>
            </span>
            <div
              className={`text-2xl font-black font-tabular ${
                isDayProfit ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {dayPnlPaise !== undefined ? `${isDayProfit && dayPnlPaise > 0 ? "+" : ""}${formatPaise(dayPnlPaise)}` : "—"}
            </div>
            <div className="text-[11px] text-slate-400">
              Current holdings × price change since previous close
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
              label: "Holdings · Delivery (CNC)",
              icon: Briefcase,
              count: activeHoldings.length,
            },
            {
              id: "POSITIONS",
              label: "Positions · Intraday / F&O",
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
              label: "Virtual cash activity",
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
            onExitHolding={handleExitHolding}
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
        {activeTab === "ALLOCATION" && availableBalancePaise !== undefined && valuationAvailable && (
          <PortfolioAllocationView
            holdings={activeHoldings}
            positions={activePositions}
            availableMarginPaise={availableBalancePaise}
            token={token || ""}
          />
        )}

        {/* ===================================================================== */}
        {/* TAB 4: P&L JOURNAL & QUANT ANALYTICS                                  */}
        {/* ===================================================================== */}
        {activeTab === "ANALYTICS" && availableBalancePaise !== undefined && valuationAvailable && (
          <PortfolioPnlAnalytics
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
            token={token || ""}
          />
        )}
      </main>

      {/* Virtual Deposit / Add Funds Modal */}
      {availableBalancePaise !== undefined && <AddFundsModal
        isOpen={isAddFundsOpen}
        onClose={() => setIsAddFundsOpen(false)}
        currentBalancePaise={availableBalancePaise}
      />}

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

      {/* Structured Error Diagnostics Modal for 400/404 & Execution Failures */}
      <ErrorDiagnosticModal
        diagnostic={diagnosticError}
        title={diagnosticTitle}
        onClose={() => setDiagnosticError(null)}
      />
    </div>
  );
}
