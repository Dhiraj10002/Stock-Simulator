"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  Flame,
  Award,
  CheckCircle2,
  ListFilter,
} from "lucide-react";
import { formatPaise } from "@/lib/format";
import { apiFetch } from "@/lib/api";
import {
  type DayPnlRecord,
  type HoldingItem,
} from "./PortfolioTypes";
import type { Position } from "@/types";

export interface LiveTrade {
  uuid: string;
  order_uuid: string;
  symbol: string;
  side: "BUY" | "SELL";
  product: string;
  quantity: number;
  price_paise: number;
  total_paise: number;
  realized_pnl_paise: number;
  executed_at: string;
}

export interface PerformanceOverview {
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  break_even_trades: number;
  win_rate_pct: number;
  net_realized_pnl_paise: number;
  gross_profit_paise: number;
  gross_loss_paise: number;
  profit_factor: number;
  average_win_paise: number;
  average_loss_paise: number;
  largest_win_paise: number;
  largest_win_symbol: string;
  largest_loss_paise: number;
  largest_loss_symbol: string;
}

export interface DailyPnlDay {
  date: string;
  realized_pnl_paise: number;
  trades_count: number;
  win_trades: number;
  loss_trades: number;
}

export interface PnlCalendar {
  month: string;
  days: DailyPnlDay[];
  month_total_pnl_paise: number;
  profitable_days_count: number;
  loss_days_count: number;
}

export interface PortfolioPnlAnalyticsProps {
  totalValuationPaise?: number;
  totalUnrealizedPnlPaise?: number;
  availableBalancePaise: number;
  totalInvestedPaise?: number;
  holdings?: HoldingItem[];
  positions?: Position[];
  token?: string;
}

export default function PortfolioPnlAnalytics({
  totalUnrealizedPnlPaise = 0,
  availableBalancePaise,
  holdings = [],
  positions = [],
  token = "",
}: PortfolioPnlAnalyticsProps) {
  // ---------------------------------------------------------------------------
  // Real Backend Data Queries
  // ---------------------------------------------------------------------------
  const { data: perf, isError: perfError } = useQuery<PerformanceOverview>({
    queryKey: ["analytics-performance", token],
    queryFn: () => apiFetch<PerformanceOverview>("/analytics/performance"),
    enabled: !!token,
    refetchInterval: 10000,
  });

  const { data: calData, isError: calError } = useQuery<PnlCalendar>({
    queryKey: ["analytics-calendar", token],
    queryFn: () => apiFetch<PnlCalendar>("/analytics/pnl-calendar"),
    enabled: !!token,
    refetchInterval: 10000,
  });

  const { data: liveTrades = [], isError: tradesError } = useQuery<LiveTrade[]>({
    queryKey: ["trades", token],
    queryFn: () => apiFetch<LiveTrade[]>("/trades"),
    enabled: !!token,
    refetchInterval: 10000,
  });

  // ---------------------------------------------------------------------------
  // Build Day P&L Calendar Records
  // ---------------------------------------------------------------------------
  const dayRecords: DayPnlRecord[] = useMemo(() => {

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    // Group live trades by YYYY-MM-DD
    const tradesByDate = new Map<string, LiveTrade[]>();
    liveTrades.forEach((t) => {
      if (!t.executed_at) return;
      const d = t.executed_at.slice(0, 10);
      const list = tradesByDate.get(d) || [];
      list.push(t);
      tradesByDate.set(d, list);
    });

    const dateMap = new Map<string, DayPnlRecord>();
    // Merge with calendar days from backend
    if (calData?.days && calData.days.length > 0) {
      calData.days.forEach((d) => {
        const dt = new Date(d.date);
        const dayName = isNaN(dt.getTime()) ? "Day" : dayNames[dt.getDay()];
        dateMap.set(d.date, {
          date: d.date,
          dayName,
          pnlPaise: d.realized_pnl_paise,
          tradesCount: d.trades_count,
          isProfit: d.realized_pnl_paise >= 0,
        });
      });
    }

    // Ensure all dates with actual trades are populated with real trade counts
    tradesByDate.forEach((trList, dateStr) => {
      const dt = new Date(dateStr);
      const dayName = isNaN(dt.getTime()) ? "Day" : dayNames[dt.getDay()];
      const pnl = trList.reduce((acc, t) => acc + (t.realized_pnl_paise || 0), 0);
      const finalPnl = pnl;
      dateMap.set(dateStr, {
        date: dateStr,
        dayName,
        pnlPaise: finalPnl,
        tradesCount: trList.length,
        isProfit: finalPnl >= 0,
      });
    });

    return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [liveTrades, calData]);

  // Selected calendar day
  const [selectedDayDate, setSelectedDayDate] = useState<string | null>(null);

  const activeSelectedDay: DayPnlRecord | null = useMemo(() => {
    if (selectedDayDate) {
      const found = dayRecords.find((r) => r.date === selectedDayDate);
      if (found) return found;
    }
    // Prefer latest day with trades, or fallback to latest day
    const dayWithTrades = [...dayRecords].reverse().find((r) => r.tradesCount > 0);
    return dayWithTrades || (dayRecords.length > 0 ? dayRecords[dayRecords.length - 1] : null);
  }, [dayRecords, selectedDayDate]);

  // Filter trades for the selected day in live ledger mode
  const selectedDayTrades: LiveTrade[] = useMemo(() => {
    if (!activeSelectedDay) return [];
    return liveTrades.filter((t) => {
      const d = t.executed_at ? t.executed_at.slice(0, 10) : "";
      return d === activeSelectedDay.date;
    });
  }, [activeSelectedDay, liveTrades]);

  // ---------------------------------------------------------------------------
  // Top 4 Metrics
  // ---------------------------------------------------------------------------
  const metrics = useMemo(() => {
    // Live Ledger Metrics
    const realizedPnl = perf?.net_realized_pnl_paise ?? 0;
    const totalTradesCount = perf?.total_trades || liveTrades.length;
    const winningTrades = perf?.winning_trades || 0;
    const winRate =
      perf && perf.total_trades > 0
        ? `${perf.win_rate_pct.toFixed(0)}%`
        : "—";

    const bestDay = perf?.largest_win_paise ?? 0;

    const worstDay = perf?.largest_loss_paise ? perf.largest_loss_paise : 0;

    return {
      cumulativePnlPaise: perf ? realizedPnl : totalUnrealizedPnlPaise,
      pnlLabel: perf ? "Booked Realized P&L" : "Net Unrealized MTM",
      pnlSubtext:
        realizedPnl !== 0
          ? `${totalTradesCount} closed executions`
          : `Floating MTM across ${positions.length + holdings.length} active positions`,
      winRate,
      winRateSubtext:
        perf && perf.total_trades > 0
          ? `${winningTrades} wins of ${perf.total_trades} closed trades`
          : "Closed-trade statistics unavailable",
      bestDayPaise: bestDay,
      bestDaySubtext: perf?.largest_win_symbol
        ? `${perf.largest_win_symbol} winning trade`
        : "No recorded winning trade",
      maxLossPaise: worstDay,
      maxLossSubtext: perf?.largest_loss_symbol
        ? `${perf.largest_loss_symbol} contained loss`
        : "Zero closed capital loss",
    };
  }, [perf, liveTrades, totalUnrealizedPnlPaise, positions.length, holdings.length]);

  // ---------------------------------------------------------------------------
  // Intraday Equity Curve Trajectory
  // ---------------------------------------------------------------------------
  const currentEquityRupees = (availableBalancePaise / 100).toLocaleString(
    "en-IN",
    { minimumFractionDigits: 2, maximumFractionDigits: 2 }
  );

  if (!token || !perf || !calData || perfError || calError || tradesError) return <p role="status" className="p-4 text-sm text-amber-700">Account analytics loading or unavailable. Returns are shown only after verified data arrives.</p>;

  return (
    <div className="space-y-6">
      {/* Live Mode Indicator Banner */}
      <div className="p-3 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-between text-xs animate-fade-in">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="font-bold text-emerald-800 dark:text-emerald-300">
            Live Ledger Active • Authentic Backend Analytics & Fills
          </span>
        </div>
        <span className="font-mono text-[11px] text-emerald-700 dark:text-emerald-400 font-bold">
          Available Margin: ₹{currentEquityRupees}
        </span>
      </div>

      {/* Top 4 Trading Performance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Cumulative Realized / MTM P&L */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              {metrics.pnlLabel}
            </span>
            <Flame className="w-4 h-4 text-emerald-500" />
          </div>
          <div
            className={`text-2xl font-black font-tabular ${
              metrics.cumulativePnlPaise >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400"
            }`}
          >
            {metrics.cumulativePnlPaise >= 0 ? "+" : ""}
            {formatPaise(metrics.cumulativePnlPaise)}
          </div>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">
            {metrics.pnlSubtext}
          </span>
        </div>

        {/* Win Rate */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Win Rate / Fill Rate
            </span>
            <Award className="w-4 h-4 text-cyan-500" />
          </div>
          <div className="text-2xl font-black font-tabular text-slate-900 dark:text-slate-100">
            {metrics.winRate}
          </div>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">
            {metrics.winRateSubtext}
          </span>
        </div>

        {/* Largest Winning Trade */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Largest Winning Trade
            </span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black font-tabular text-emerald-600 dark:text-emerald-400">
            {metrics.bestDayPaise > 0 ? `+${formatPaise(metrics.bestDayPaise)}` : "₹0.00"}
          </div>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">
            {metrics.bestDaySubtext}
          </span>
        </div>

        {/* Largest Losing Trade */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Largest Losing Trade
            </span>
            <TrendingDown className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-black font-tabular text-rose-600 dark:text-rose-400">
            {formatPaise(metrics.maxLossPaise)}
          </div>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">
            {metrics.maxLossSubtext}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* P&L CALENDAR HEATMAP (6 Cols) */}
        <div className="lg:col-span-6 p-6 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                <span>P&L Journal Calendar</span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Actual trading sessions ({dayRecords.length} active recorded days)
              </p>
            </div>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded border text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/60 border-cyan-200 dark:border-cyan-800/50">
              Live Trading History
            </span>
          </div>

          {/* Calendar Day Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
            {dayRecords.map((rec) => {
              const isSelected = activeSelectedDay?.date === rec.date;

              return (
                <button
                  key={rec.date}
                  onClick={() => setSelectedDayDate(rec.date)}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    isSelected
                      ? "ring-2 ring-cyan-500 scale-102 shadow-md bg-white dark:bg-slate-800"
                      : "hover:scale-101"
                  } ${
                    rec.tradesCount === 0 && rec.pnlPaise === 0
                      ? "bg-slate-50/50 dark:bg-slate-850/30 border-slate-200/80 dark:border-slate-800/60"
                      : rec.pnlPaise >= 0
                      ? "bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60"
                      : "bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/60"
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 dark:text-slate-400 mb-1">
                    <span className="font-bold">{rec.dayName}</span>
                    <span>{rec.date.slice(5)}</span>
                  </div>
                  <div
                    className={`text-xs font-black font-tabular ${
                      rec.tradesCount === 0 && rec.pnlPaise === 0
                        ? "text-slate-400 dark:text-slate-500"
                        : rec.pnlPaise >= 0
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-rose-700 dark:text-rose-400"
                    }`}
                  >
                    {rec.tradesCount === 0 && rec.pnlPaise === 0
                      ? "₹0.00"
                      : `${rec.pnlPaise >= 0 ? "+" : ""}${formatPaise(rec.pnlPaise).replace("₹", "")}`}
                  </div>
                  <div className="text-[9px] text-slate-500 dark:text-slate-400 mt-1 font-medium">
                    {rec.tradesCount === 0
                      ? "No trades"
                      : `${rec.tradesCount} ${rec.tradesCount === 1 ? "trade" : "trades"}`}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Selected Day Details Preview */}
          {activeSelectedDay && (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                    {activeSelectedDay.dayName}, {activeSelectedDay.date}
                  </span>
                  <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                    <span>{activeSelectedDay.tradesCount} Orders Executed</span>
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className={`text-sm font-black font-tabular ${
                      activeSelectedDay.pnlPaise >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {activeSelectedDay.pnlPaise >= 0 ? "+" : ""}
                    {formatPaise(activeSelectedDay.pnlPaise)}
                  </div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                    Booked Realized P&L
                  </span>
                </div>
              </div>

              {/* Real Executed Trades List for Live Ledger Mode */}
              {selectedDayTrades.length > 0 && (
                <div className="pt-2.5 border-t border-slate-200 dark:border-slate-700/60 space-y-1.5">
                  <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <ListFilter className="w-3 h-3" />
                    <span>Executed Trades on this Session:</span>
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                    {selectedDayTrades.map((trade, idx) => (
                      <div
                        key={trade.uuid || idx}
                        className="p-2 rounded-lg bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 flex items-center justify-between font-mono text-[11px]"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-1.5 py-0.2 rounded text-[9px] font-black ${
                              trade.side === "BUY"
                                ? "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300"
                                : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                            }`}
                          >
                            {trade.side}
                          </span>
                          <span className="font-bold text-slate-900 dark:text-slate-100">
                            {trade.symbol}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            ({trade.quantity} Qty)
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 dark:text-slate-200 font-tabular">
                            ₹{(trade.price_paise / 100).toFixed(2)}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {trade.executed_at ? trade.executed_at.slice(11, 16) : "15:20"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="lg:col-span-6 p-6 rounded-2xl border border-slate-200 text-sm text-slate-500">
          Intraday equity history is unavailable. A current balance cannot reconstruct the account’s earlier values.
        </div>
      </div>
    </div>
  );
}
