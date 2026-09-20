"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  X,
  TrendingUp,
  Calendar as CalendarIcon,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Tag,
  AlertCircle,
  RefreshCw,
  Wallet,
  Sparkles,
  Award,
  Zap,
  BarChart3,
  Search,
  IndianRupee,
  Target,
  Scale,
  ArrowUpRight,
  ArrowDownRight,
  SlidersHorizontal,
  Compass,
  Layers,
} from "lucide-react";
import { formatPaise } from "@/lib/format";
import type { PerformanceOverview, PnlCalendarResponse, DailyPnlDay, Trade } from "@/types";
import LedgerStatementView from "@/components/terminal/LedgerStatementView";

export interface AnalyticsConsoleProps {
  apiUrl?: string;
  token?: string | null;
  onClose?: () => void;
  initialTab?: "analytics" | "journal" | "statement";
}

const SETUP_TAGS = [
  "Breakout",
  "Reversal",
  "Scalp",
  "Momentum",
  "Hedge",
  "F&O Expiry",
  "Other",
];

// Curated Showcase Demo Dataset
const DEMO_PERFORMANCE: PerformanceOverview = {
  net_realized_pnl_paise: 7645000,
  gross_profit_paise: 8630000,
  gross_loss_paise: 985000,
  total_trades: 20,
  winning_trades: 15,
  losing_trades: 5,
  break_even_trades: 0,
  win_rate_pct: 75.0,
  profit_factor: 8.76,
  win_loss_ratio: 3.0,
  average_win_paise: 575333,
  average_loss_paise: 197000,
  largest_win_paise: 1480000,
  largest_loss_paise: 320000,
};

const EMPTY_LIVE_PERFORMANCE: PerformanceOverview = {
  net_realized_pnl_paise: 0,
  gross_profit_paise: 0,
  gross_loss_paise: 0,
  total_trades: 0,
  winning_trades: 0,
  losing_trades: 0,
  break_even_trades: 0,
  win_rate_pct: 0,
  profit_factor: 0,
  win_loss_ratio: 0,
  average_win_paise: 0,
  average_loss_paise: 0,
  largest_win_paise: 0,
  largest_loss_paise: 0,
};

const DEMO_CALENDAR_DAYS: DailyPnlDay[] = [
  { date: "2026-09-02", realized_pnl_paise: 340000, trades_count: 2, win_trades: 2, loss_trades: 0 },
  { date: "2026-09-04", realized_pnl_paise: 1250000, trades_count: 3, win_trades: 3, loss_trades: 0 },
  { date: "2026-09-07", realized_pnl_paise: -280000, trades_count: 1, win_trades: 0, loss_trades: 1 },
  { date: "2026-09-08", realized_pnl_paise: 620000, trades_count: 2, win_trades: 2, loss_trades: 0 },
  { date: "2026-09-09", realized_pnl_paise: 410000, trades_count: 1, win_trades: 1, loss_trades: 0 },
  { date: "2026-09-11", realized_pnl_paise: 1480000, trades_count: 2, win_trades: 2, loss_trades: 0 },
  { date: "2026-09-14", realized_pnl_paise: -320000, trades_count: 1, win_trades: 0, loss_trades: 1 },
  { date: "2026-09-15", realized_pnl_paise: 850000, trades_count: 2, win_trades: 2, loss_trades: 0 },
  { date: "2026-09-17", realized_pnl_paise: 960000, trades_count: 2, win_trades: 2, loss_trades: 0 },
  { date: "2026-09-18", realized_pnl_paise: 320000, trades_count: 1, win_trades: 1, loss_trades: 0 },
  { date: "2026-09-21", realized_pnl_paise: -195000, trades_count: 1, win_trades: 0, loss_trades: 1 },
  { date: "2026-09-22", realized_pnl_paise: 510000, trades_count: 2, win_trades: 2, loss_trades: 0 },
  { date: "2026-09-24", realized_pnl_paise: 740000, trades_count: 2, win_trades: 2, loss_trades: 0 },
  { date: "2026-09-25", realized_pnl_paise: 480000, trades_count: 1, win_trades: 1, loss_trades: 0 },
  { date: "2026-09-28", realized_pnl_paise: -210000, trades_count: 1, win_trades: 0, loss_trades: 1 },
  { date: "2026-09-29", realized_pnl_paise: 670000, trades_count: 2, win_trades: 2, loss_trades: 0 },
];

const DEMO_CALENDAR_RESPONSE: PnlCalendarResponse = {
  month: "2026-09",
  days: DEMO_CALENDAR_DAYS,
  month_total_pnl_paise: 7645000,
  profitable_days_count: 12,
  loss_days_count: 4,
};

const DEMO_TRADES: Trade[] = [
  {
    uuid: "t-001",
    order_uuid: "ord-001",
    symbol: "RELIANCE",
    side: "BUY",
    product: "DELIVERY",
    quantity: 50,
    executed_price_paise: 294000,
    executed_at: "2026-09-29T14:30:00Z",
    realized_pnl_paise: 670000,
    tag: "Breakout",
    notes: "Clean daily horizontal breakout with high volume confirmation.",
  },
  {
    uuid: "t-002",
    order_uuid: "ord-002",
    symbol: "TATAMOTORS",
    side: "BUY",
    product: "INTRADAY",
    quantity: 100,
    executed_price_paise: 96800,
    executed_at: "2026-09-28T11:15:00Z",
    realized_pnl_paise: -210000,
    notes: "Chased entry near the session high without waiting for VWAP pullback.",
  },
  {
    uuid: "t-003",
    order_uuid: "ord-003",
    symbol: "TITAN",
    side: "BUY",
    product: "DELIVERY",
    quantity: 30,
    executed_price_paise: 345000,
    executed_at: "2026-09-25T13:45:00Z",
    realized_pnl_paise: 480000,
    tag: "Momentum",
    notes: "Followed pre-festive retail demand trend. Target reached cleanly.",
  },
  {
    uuid: "t-004",
    order_uuid: "ord-004",
    symbol: "NIFTY 25500 PE",
    side: "BUY",
    product: "FNO",
    quantity: 75,
    executed_price_paise: 11200,
    executed_at: "2026-09-24T10:20:00Z",
    realized_pnl_paise: 740000,
    tag: "Hedge",
    notes: "Weekly expiry hedge after rejection at 25,600 psychological resistance.",
  },
  {
    uuid: "t-005",
    order_uuid: "ord-005",
    symbol: "SUNPHARMA",
    side: "BUY",
    product: "INTRADAY",
    quantity: 60,
    executed_price_paise: 168000,
    executed_at: "2026-09-22T14:10:00Z",
    realized_pnl_paise: 510000,
    tag: "Scalp",
    notes: "Quick 20-minute scalp off the 15M 20 EMA rebound.",
  },
  {
    uuid: "t-006",
    order_uuid: "ord-006",
    symbol: "AXISBANK",
    side: "BUY",
    product: "INTRADAY",
    quantity: 45,
    executed_price_paise: 122000,
    executed_at: "2026-09-21T10:05:00Z",
    realized_pnl_paise: -195000,
    notes: "Failed double-bottom setup; respected stop loss immediately.",
  },
  {
    uuid: "t-007",
    order_uuid: "ord-007",
    symbol: "KOTAKBANK",
    side: "BUY",
    product: "DELIVERY",
    quantity: 40,
    executed_price_paise: 181000,
    executed_at: "2026-09-18T12:30:00Z",
    realized_pnl_paise: 320000,
    tag: "Breakout",
    notes: "Range expansion breakout at European market open.",
  },
  {
    uuid: "t-008",
    order_uuid: "ord-008",
    symbol: "LT",
    side: "BUY",
    product: "DELIVERY",
    quantity: 25,
    executed_price_paise: 365000,
    executed_at: "2026-09-17T14:50:00Z",
    realized_pnl_paise: 960000,
    tag: "Momentum",
    notes: "Heavy order flow post-infrastructure capex contract announcement.",
  },
  {
    uuid: "t-009",
    order_uuid: "ord-009",
    symbol: "TCS",
    side: "BUY",
    product: "INTRADAY",
    quantity: 35,
    executed_price_paise: 428000,
    executed_at: "2026-09-15T11:40:00Z",
    realized_pnl_paise: 850000,
    tag: "Scalp",
    notes: "Gap fill trade following NASDAQ strength overnight.",
  },
  {
    uuid: "t-010",
    order_uuid: "ord-010",
    symbol: "BAJFINANCE",
    side: "BUY",
    product: "INTRADAY",
    quantity: 20,
    executed_price_paise: 735000,
    executed_at: "2026-09-14T09:45:00Z",
    realized_pnl_paise: -320000,
    tag: "Breakout",
    notes: "Traded opening volatility before 9:30 AM range stabilized.",
  },
  {
    uuid: "t-011",
    order_uuid: "ord-011",
    symbol: "NIFTY 25400 CE",
    side: "BUY",
    product: "FNO",
    quantity: 150,
    executed_price_paise: 14500,
    executed_at: "2026-09-11T13:20:00Z",
    realized_pnl_paise: 1480000,
    tag: "F&O Expiry",
    notes: "Hero-or-zero expiry momentum play on afternoon short covering rally.",
  },
  {
    uuid: "t-012",
    order_uuid: "ord-012",
    symbol: "ICICIBANK",
    side: "BUY",
    product: "INTRADAY",
    quantity: 50,
    executed_price_paise: 124000,
    executed_at: "2026-09-09T10:15:00Z",
    realized_pnl_paise: 410000,
    tag: "Scalp",
    notes: "Standard opening 5-minute high breakout with 1:2 risk-reward.",
  },
];

export default function AnalyticsConsole({
  apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1",
  token: propToken,
  onClose,
  initialTab = "analytics",
}: AnalyticsConsoleProps) {
  const queryClient = useQueryClient();

  // Tab State: analytics | journal | statement
  const [activeTab, setActiveTab] = useState<"analytics" | "journal" | "statement">(initialTab);

  // Showcase Demo vs Live Ledger Mode
  const [dataSource, setDataSource] = useState<"demo" | "live">("demo");

  const [token] = useState<string>(() => {
    if (propToken) return propToken;
    if (typeof window !== "undefined") {
      return (
        localStorage.getItem("auth_token") ||
        localStorage.getItem("stock-simulator-access-token") ||
        ""
      );
    }
    return "";
  });

  // Month navigation: YYYY-MM
  const [currentMonth, setCurrentMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  // Journal filtering
  const [tagFilter, setTagFilter] = useState<string>("ALL");
  const [outcomeFilter, setOutcomeFilter] = useState<"ALL" | "WIN" | "LOSS">("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Active hover day for calendar tooltip
  const [hoveredDay, setHoveredDay] = useState<DailyPnlDay | null>(null);

  // Notes update state per trade: { [uuid]: { notes: string, tag: string, saving: boolean, saved: boolean } }
  const [journalEdits, setJournalEdits] = useState<
    Record<string, { tag: string; notes: string; saving: boolean; saved: boolean }>
  >({});

  const baseApi = useMemo(() => {
    return apiUrl.endsWith("/api/v1") ? apiUrl : `${apiUrl.replace(/\/+$/, "")}/api/v1`;
  }, [apiUrl]);

  // 1. Fetch Performance Analytics Overview
  const {
    data: livePerformance,
    isLoading: loadingPerformance,
    error: errorPerformance,
  } = useQuery<PerformanceOverview | null>({
    queryKey: ["analytics-performance"],
    queryFn: async () => {
      if (!token) return null;
      const res = await fetch(`${baseApi}/analytics/performance`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return data.success ? data.data : null;
    },
    enabled: !!token && dataSource === "live",
  });

  // 2. Fetch PnL Calendar for current month
  const {
    data: liveCalendarData,
    isLoading: loadingCalendar,
    error: errorCalendar,
  } = useQuery<PnlCalendarResponse | null>({
    queryKey: ["analytics-calendar", currentMonth],
    queryFn: async () => {
      if (!token) return null;
      const res = await fetch(`${baseApi}/analytics/pnl-calendar?month=${currentMonth}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return data.success ? data.data : null;
    },
    enabled: !!token && dataSource === "live",
  });

  // 3. Fetch Trades list for journal
  const {
    data: liveTrades = [],
    isLoading: loadingTrades,
    error: errorTrades,
  } = useQuery<Trade[]>({
    queryKey: ["trades"],
    queryFn: async () => {
      if (!token) return [];
      const res = await fetch(`${baseApi}/trades`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return data.success ? data.data || [] : [];
    },
    enabled: !!token && dataSource === "live",
  });

  // STRICT SEPARATION: Demo vs Live
  const isDemo = dataSource === "demo";

  // In live mode, use true backend live data, OR clean zero empty state if no trades closed yet
  const performance: PerformanceOverview = isDemo
    ? DEMO_PERFORMANCE
    : livePerformance || EMPTY_LIVE_PERFORMANCE;

  const calendarData: PnlCalendarResponse = isDemo
    ? DEMO_CALENDAR_RESPONSE
    : liveCalendarData || {
        month: currentMonth,
        days: [],
        month_total_pnl_paise: 0,
        profitable_days_count: 0,
        loss_days_count: 0,
      };

  const trades: Trade[] = isDemo ? DEMO_TRADES : liveTrades;

  const loading = dataSource === "live" && (loadingPerformance || loadingCalendar || loadingTrades);
  const error =
    dataSource === "live"
      ? (errorPerformance instanceof Error ? errorPerformance.message : null) ||
        (errorCalendar instanceof Error ? errorCalendar.message : null) ||
        (errorTrades instanceof Error ? errorTrades.message : null)
      : null;

  // Calendar grid computation
  const { monthLabel, leadingDays, daysOfMonth } = useMemo(() => {
    const [yStr, mStr] = currentMonth.split("-");
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10) - 1;

    const dateObj = new Date(y, m, 1);
    const monthLabel = dateObj.toLocaleDateString("en-US", { month: "long", year: "numeric" });

    const dow = ((dateObj.getDay() + 6) % 7) + 1;
    const leadingDays = dow - 1;

    const totalDays = new Date(y, m + 1, 0).getDate();

    const daysMap = new Map<string, DailyPnlDay>();
    (calendarData?.days || []).forEach((d) => {
      daysMap.set(d.date, d);
    });

    const daysOfMonth = [];
    for (let dayNum = 1; dayNum <= totalDays; dayNum++) {
      const dateStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
      const dayData = daysMap.get(dateStr);
      daysOfMonth.push({
        date: dateStr,
        dayNum,
        data: dayData || null,
      });
    }

    return { monthLabel, leadingDays, daysOfMonth };
  }, [currentMonth, calendarData]);

  const handlePrevMonth = () => {
    const [y, m] = currentMonth.split("-").map(Number);
    const d = new Date(y, m - 2, 1);
    setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const handleNextMonth = () => {
    const [y, m] = currentMonth.split("-").map(Number);
    const d = new Date(y, m, 1);
    setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const handleCurrentMonth = () => {
    const d = new Date();
    setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  // Save Trade Journal (tag and notes)
  const handleSaveJournal = async (tradeUuid: string, newTag: string, newNotes: string) => {
    setJournalEdits((prev) => {
      const existing = prev[tradeUuid];
      return {
        ...prev,
        [tradeUuid]: {
          tag: newTag ?? existing?.tag ?? "",
          notes: newNotes ?? existing?.notes ?? "",
          saving: true,
          saved: false,
        },
      };
    });

    if (!token || isDemo) {
      setTimeout(() => {
        setJournalEdits((prev) => {
          const existing = prev[tradeUuid];
          return {
            ...prev,
            [tradeUuid]: {
              tag: newTag ?? existing?.tag ?? "",
              notes: newNotes ?? existing?.notes ?? "",
              saving: false,
              saved: true,
            },
          };
        });
        setTimeout(() => {
          setJournalEdits((prev) => {
            const existing = prev[tradeUuid];
            return {
              ...prev,
              [tradeUuid]: {
                tag: existing?.tag ?? "",
                notes: existing?.notes ?? "",
                saving: false,
                saved: false,
              },
            };
          });
        }, 2000);
      }, 400);
      return;
    }

    try {
      const res = await fetch(`${baseApi}/trades/${tradeUuid}/journal`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tag: newTag, notes: newNotes }),
      });
      const data = await res.json();
      if (data.success) {
        void queryClient.invalidateQueries({ queryKey: ["trades"] });
        setJournalEdits((prev) => {
          const existing = prev[tradeUuid];
          return {
            ...prev,
            [tradeUuid]: {
              tag: newTag ?? existing?.tag ?? "",
              notes: newNotes ?? existing?.notes ?? "",
              saving: false,
              saved: true,
            },
          };
        });
        setTimeout(() => {
          setJournalEdits((prev) => {
            const existing = prev[tradeUuid];
            return {
              ...prev,
              [tradeUuid]: {
                tag: existing?.tag ?? "",
                notes: existing?.notes ?? "",
                saving: false,
                saved: false,
              },
            };
          });
        }, 2500);
      }
    } catch {
      setJournalEdits((prev) => {
        const existing = prev[tradeUuid];
        return {
          ...prev,
          [tradeUuid]: {
            tag: existing?.tag ?? "",
            notes: existing?.notes ?? "",
            saving: false,
            saved: false,
          },
        };
      });
    }
  };

  // Filtered trades for journal
  const filteredTrades = useMemo(() => {
    return trades.filter((t) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesSymbol = t.symbol.toLowerCase().includes(q);
        const matchesNotes = (t.notes || "").toLowerCase().includes(q);
        const matchesTag = (t.tag || "").toLowerCase().includes(q);
        if (!matchesSymbol && !matchesNotes && !matchesTag) return false;
      }

      if (tagFilter === "UNTAGGED" && t.tag) return false;
      if (tagFilter !== "ALL" && tagFilter !== "UNTAGGED" && t.tag !== tagFilter) return false;

      if (outcomeFilter === "WIN" && t.realized_pnl_paise <= 0) return false;
      if (outcomeFilter === "LOSS" && t.realized_pnl_paise >= 0) return false;

      return true;
    });
  }, [trades, tagFilter, outcomeFilter, searchQuery]);

  const totalTradingDays =
    (calendarData?.profitable_days_count ?? 0) + (calendarData?.loss_days_count ?? 0);
  const winDaysRate =
    totalTradingDays > 0
      ? ((calendarData?.profitable_days_count ?? 0) / totalTradingDays) * 100
      : 0;

  // DYNAMIC Cumulative Equity Points
  const cumulativePoints = useMemo(() => {
    if (trades.length === 0) return [];
    let running = 0;
    const sorted = [...trades].sort(
      (a, b) => new Date(a.executed_at).getTime() - new Date(b.executed_at).getTime()
    );
    return sorted.map((t, idx) => {
      running += t.realized_pnl_paise / 100;
      return { idx, pnl: running, symbol: t.symbol };
    });
  }, [trades]);

  // DYNAMIC Setup Strategy Accuracy
  const setupAccuracy = useMemo(() => {
    if (trades.length === 0) return [];
    const map = new Map<string, { total: number; wins: number }>();
    trades.forEach((t) => {
      const tag = t.tag || "Untagged";
      const curr = map.get(tag) || { total: 0, wins: 0 };
      curr.total += 1;
      if (t.realized_pnl_paise > 0) curr.wins += 1;
      map.set(tag, curr);
    });

    const colors: Record<string, string> = {
      Breakout: "bg-emerald-500",
      Scalp: "bg-cyan-500",
      Momentum: "bg-blue-500",
      "F&O Expiry": "bg-indigo-500",
      Reversal: "bg-purple-500",
      Hedge: "bg-amber-500",
      Mistake: "bg-rose-500",
      Untagged: "bg-slate-400",
      Other: "bg-slate-500",
    };

    return Array.from(map.entries())
      .filter(
        ([name, stat]) =>
          name.toLowerCase() !== "mistake" &&
          name.toLowerCase() !== "untagged" &&
          stat.wins > 0
      )
      .map(([name, stat]) => ({
        name,
        count: stat.total,
        rate: Math.round((stat.wins / stat.total) * 100),
        color: colors[name] || "bg-cyan-500",
      }))
      .filter((s) => s.rate > 0)
      .sort((a, b) => b.count - a.count);
  }, [trades]);

  // Trade Product Breakdown (Delivery, Intraday, F&O)
  const productBreakdown = useMemo(() => {
    let delivery = 0;
    let intraday = 0;
    let fno = 0;

    if (isDemo) {
      delivery = 9;
      intraday = 7;
      fno = 4;
    } else {
      trades.forEach((t) => {
        if (t.product === "DELIVERY") delivery++;
        else if (t.product === "INTRADAY") intraday++;
        else if (t.product === "FNO") fno++;
      });
    }

    const total = isDemo ? 20 : trades.length;
    return { total, delivery, intraday, fno };
  }, [trades, isDemo]);

  return (
    <div className="flex flex-col bg-white dark:bg-slate-900/90 border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-2xl shadow-slate-200/60 dark:shadow-slate-950/70 overflow-hidden transition-all duration-300">
      {/* Top Console Navigation & Mode Switcher Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 px-6 py-5 border-b border-slate-200/80 dark:border-slate-800 bg-gradient-to-r from-slate-50/90 via-white to-slate-50/90 dark:from-slate-950/80 dark:via-slate-900/80 dark:to-slate-950/80">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-cyan-500/10 to-blue-500/20 dark:from-cyan-950 dark:to-blue-950/50 border border-cyan-500/30 text-cyan-600 dark:text-cyan-400 shadow-sm shadow-cyan-500/10">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                Trader Performance & Journal Console
              </h2>
              {isDemo ? (
                <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800 font-semibold">
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  Showcase Simulation
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800 font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Live Account Ledger
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {isDemo
                ? "Previewing institutional benchmark metrics, win ratios, and trade setups journal."
                : "Auditing live closed paper trades from your active trading session."}
            </p>
          </div>
        </div>

        {/* Right Controls: Showcase / Live Segmented Switcher & Workspace Tabs */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Segmented Mode Switcher */}
          <div className="flex items-center bg-slate-200/70 dark:bg-slate-950 p-1 rounded-2xl border border-slate-300/80 dark:border-slate-800 shadow-inner">
            <button
              onClick={() => setDataSource("demo")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                isDemo
                  ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-md shadow-slate-300/40 dark:shadow-black/40 scale-100"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <Sparkles className={`w-3.5 h-3.5 ${isDemo ? "text-amber-500" : ""}`} />
              <span>Showcase Demo</span>
            </button>
            <button
              onClick={() => setDataSource("live")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                !isDemo
                  ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-md shadow-slate-300/40 dark:shadow-black/40 scale-100"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <Zap className={`w-3.5 h-3.5 ${!isDemo ? "text-emerald-500" : ""}`} />
              <span>Live Ledger</span>
            </button>
          </div>

          {/* Primary View Tabs */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-950 p-1 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-x-auto scrollbar-none shadow-sm">
            <button
              onClick={() => setActiveTab("analytics")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                activeTab === "analytics"
                  ? "bg-sky-200 dark:bg-sky-950/80 border border-sky-400 dark:border-sky-700 text-sky-950 dark:text-sky-100 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <CalendarIcon className={`w-3.5 h-3.5 ${activeTab === "analytics" ? "text-sky-600 dark:text-sky-400" : ""}`} />
              <span>Analytics & Heatmap</span>
            </button>
            <button
              onClick={() => setActiveTab("journal")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                activeTab === "journal"
                  ? "bg-sky-200 dark:bg-sky-950/80 border border-sky-400 dark:border-sky-700 text-sky-950 dark:text-sky-100 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <BookOpen className={`w-3.5 h-3.5 ${activeTab === "journal" ? "text-sky-600 dark:text-sky-400" : ""}`} />
              <span>Trade Journal</span>
              <span
                className={`ml-1 text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  activeTab === "journal"
                    ? "bg-sky-300/60 dark:bg-sky-900 text-sky-950 dark:text-sky-200 font-bold"
                    : "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                }`}
              >
                {trades.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab("statement")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                activeTab === "statement"
                  ? "bg-sky-200 dark:bg-sky-950/80 border border-sky-400 dark:border-sky-700 text-sky-950 dark:text-sky-100 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <Wallet className={`w-3.5 h-3.5 ${activeTab === "statement" ? "text-sky-600 dark:text-sky-400" : ""}`} />
              <span>Statements</span>
            </button>
          </div>

          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Main Tab Views Body */}
      <div className="p-6 md:p-8 overflow-y-auto max-h-[calc(85vh-80px)] space-y-6">
        {loading && (
          <div className="flex items-center justify-center p-12 text-slate-500 dark:text-slate-400 text-sm gap-2.5">
            <RefreshCw className="w-5 h-5 animate-spin text-cyan-600 dark:text-cyan-400" />
            <span>Calculating trading ledger metrics from live session…</span>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* TAB 1: ANALYTICS & PNL CALENDAR */}
        {activeTab === "analytics" && (
          <div className="space-y-6">
            {/* Top 4 Elevated KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* 1. Net Realized P&L */}
              <div className="relative p-5 rounded-2xl bg-white dark:bg-slate-950/60 border border-slate-200/90 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow overflow-hidden group">
                <div
                  className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${
                    performance.net_realized_pnl_paise > 0
                      ? "from-emerald-400 to-teal-500"
                      : performance.net_realized_pnl_paise < 0
                      ? "from-rose-500 to-red-500"
                      : "from-slate-300 to-slate-400 dark:from-slate-700 dark:to-slate-600"
                  }`}
                />
                <div className="flex items-center justify-between pb-1">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Net Realized P&L
                  </span>
                  <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                    <IndianRupee className="w-4 h-4" />
                  </div>
                </div>

                <div
                  className={`text-2xl sm:text-3xl font-extrabold font-tabular tracking-tight my-1 ${
                    performance.net_realized_pnl_paise > 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : performance.net_realized_pnl_paise < 0
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-slate-700 dark:text-slate-300"
                  }`}
                >
                  {performance.net_realized_pnl_paise > 0 ? "+" : ""}
                  {formatPaise(performance.net_realized_pnl_paise)}
                </div>

                <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-900">
                  <span>Gross Profit: {formatPaise(performance.gross_profit_paise)}</span>
                  <span>Gross Loss: {formatPaise(performance.gross_loss_paise)}</span>
                </div>
              </div>

              {/* 2. Win Rate */}
              <div className="relative p-5 rounded-2xl bg-white dark:bg-slate-950/60 border border-slate-200/90 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow overflow-hidden group">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-400 to-blue-500" />
                <div className="flex items-center justify-between pb-1">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Win Rate %
                  </span>
                  <div className="p-1.5 rounded-lg bg-cyan-50 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400">
                    <Target className="w-4 h-4" />
                  </div>
                </div>

                <div className="text-2xl sm:text-3xl font-extrabold font-tabular text-slate-900 dark:text-slate-100 tracking-tight my-1 flex items-baseline gap-2">
                  <span>{performance.win_rate_pct.toFixed(1)}%</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-normal">
                    ({performance.winning_trades}W / {performance.losing_trades}L)
                  </span>
                </div>

                <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden mt-3">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-full transition-all duration-700"
                    style={{
                      width: `${Math.min(100, Math.max(0, performance.win_rate_pct))}%`,
                    }}
                  />
                </div>
              </div>

              {/* 3. Total Number of Trades & Breakdown */}
              <div className="relative p-5 rounded-2xl bg-white dark:bg-slate-950/60 border border-slate-200/90 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow overflow-hidden group">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-400 to-indigo-500" />
                <div className="flex items-center justify-between pb-1">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Total Number of Trades
                  </span>
                  <div className="p-1.5 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400">
                    <Layers className="w-4 h-4" />
                  </div>
                </div>

                <div className="text-2xl sm:text-3xl font-extrabold font-tabular text-slate-900 dark:text-slate-100 tracking-tight my-1 flex items-baseline gap-2">
                  <span>{productBreakdown.total}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-normal">
                    Closed Trades
                  </span>
                </div>

                {/* Delivery, Intraday, and F&O Breakdown */}
                <div className="grid grid-cols-3 gap-1 pt-2 border-t border-slate-100 dark:border-slate-900 text-[11px]">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 font-medium">Delivery</span>
                    <span className="font-bold text-cyan-600 dark:text-cyan-400 font-mono">
                      {productBreakdown.delivery}
                    </span>
                  </div>
                  <div className="flex flex-col border-x border-slate-100 dark:border-slate-800 px-1.5 text-center">
                    <span className="text-[10px] text-slate-400 font-medium">Intraday</span>
                    <span className="font-bold text-amber-600 dark:text-amber-400 font-mono">
                      {productBreakdown.intraday}
                    </span>
                  </div>
                  <div className="flex flex-col text-right">
                    <span className="text-[10px] text-slate-400 font-medium">F&O</span>
                    <span className="font-bold text-purple-600 dark:text-purple-400 font-mono">
                      {productBreakdown.fno}
                    </span>
                  </div>
                </div>
              </div>

              {/* 4. Avg Win / Avg Loss */}
              <div className="relative p-5 rounded-2xl bg-white dark:bg-slate-950/60 border border-slate-200/90 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow overflow-hidden group">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 to-orange-500" />
                <div className="flex items-center justify-between pb-1">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Avg Win / Avg Loss
                  </span>
                  <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
                    <Scale className="w-4 h-4" />
                  </div>
                </div>

                <div className="text-sm sm:text-base font-bold font-tabular flex items-center justify-between my-2">
                  <span className="text-emerald-600 dark:text-emerald-400">
                    +{formatPaise(performance.average_win_paise)}
                  </span>
                  <span className="text-slate-300 dark:text-slate-700">/</span>
                  <span className="text-rose-600 dark:text-rose-400">
                    -{formatPaise(performance.average_loss_paise)}
                  </span>
                </div>

                <div className="text-[10px] text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-900 flex justify-between">
                  <span>Max Win: {formatPaise(performance.largest_win_paise)}</span>
                  <span>Max Loss: {formatPaise(performance.largest_loss_paise)}</span>
                </div>
              </div>
            </div>

            {/* Visual Analytics Row: Cumulative Equity SVG + Setup Strategy Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Cumulative Equity Curve */}
              <div className="lg:col-span-2 p-5 rounded-3xl bg-slate-50/70 dark:bg-slate-950/60 border border-slate-200/90 dark:border-slate-800/80 shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200/70 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      Cumulative Realized P&L Growth Curve
                    </span>
                  </div>
                  <span
                    className={`text-xs font-bold font-tabular ${
                      performance.net_realized_pnl_paise >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {performance.net_realized_pnl_paise > 0 ? "+" : ""}
                    {formatPaise(performance.net_realized_pnl_paise)}
                  </span>
                </div>

                {/* SVG Curve or Zero-State Visual */}
                <div className="h-36 w-full flex items-end pt-4">
                  {cumulativePoints.length > 1 ? (
                    <svg className="w-full h-full overflow-visible" viewBox="0 0 500 100" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.35" />
                          <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>
                      {/* Area Fill & Stroke */}
                      {(() => {
                        const min = Math.min(0, ...cumulativePoints.map((p) => p.pnl));
                        const max = Math.max(1000, ...cumulativePoints.map((p) => p.pnl));
                        const range = max - min || 1;
                        const coords = cumulativePoints.map((p, i) => {
                          const x = (i / (cumulativePoints.length - 1)) * 500;
                          const y = 90 - ((p.pnl - min) / range) * 80;
                          return `${x},${y}`;
                        });
                        const areaPath = `M0,100 L${coords.join(" L")} L500,100 Z`;
                        const linePath = `M${coords.join(" L")}`;
                        return (
                          <>
                            <path d={areaPath} fill="url(#equityGrad)" />
                            <path
                              d={linePath}
                              fill="none"
                              stroke="#06b6d4"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                            />
                          </>
                        );
                      })()}
                    </svg>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-center p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                      <Compass className="w-6 h-6 text-slate-400 mb-1" />
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {isDemo ? "Building equity curve..." : "No live closed trades yet"}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-sm mt-0.5">
                        {isDemo
                          ? "Trade simulation will plot performance here."
                          : "Execute buy and sell paper orders on Terminal or Stocks to see your live equity curve plot automatically."}
                      </p>
                      {!isDemo && (
                        <button
                          onClick={() => setDataSource("demo")}
                          className="mt-2 text-[11px] font-bold text-cyan-600 dark:text-cyan-400 hover:underline"
                        >
                          View Showcase Demo Curve →
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Setup Strategy Accuracy Breakdown */}
              <div className="p-5 rounded-3xl bg-slate-50/70 dark:bg-slate-950/60 border border-slate-200/90 dark:border-slate-800/80 shadow-sm flex flex-col justify-between space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200/70 dark:border-slate-800 pb-2">
                  <div className="flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      Setup Strategy Accuracy
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {setupAccuracy.length > 0 ? `${setupAccuracy.length} Setups` : "0 Setups"}
                  </span>
                </div>

                {setupAccuracy.length > 0 ? (
                  <div className="space-y-2.5 text-xs py-1">
                    {setupAccuracy.map((s) => (
                      <div key={s.name} className="space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {s.name} ({s.count})
                          </span>
                          <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                            {s.rate}% win
                          </span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full ${s.color} rounded-full transition-all duration-500`}
                            style={{ width: `${s.rate}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-4 text-xs text-slate-400">
                    <Tag className="w-5 h-5 text-slate-400 mb-1" />
                    <span>Tag your trades in the journal to view setup win rates.</span>
                  </div>
                )}

                <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800 text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
                  <span>Based on closed trade setups</span>
                  <Link href="/stocks/RELIANCE" className="text-cyan-600 dark:text-cyan-400 hover:underline font-semibold">
                    Explore Stocks →
                  </Link>
                </div>
              </div>
            </div>

            {/* Zerodha-Style Monthly P&L Calendar Heatmap */}
            <div className="p-6 rounded-3xl bg-slate-50/70 dark:bg-slate-950/80 border border-slate-200/90 dark:border-slate-800 space-y-4 shadow-sm">
              {/* Calendar Header with Controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                    <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                      Monthly P&L Heatmap — {monthLabel}
                    </h3>
                  </div>

                  {hoveredDay && (
                    <span
                      className={`text-[11px] font-bold font-tabular px-2.5 py-0.5 rounded-full border animate-in fade-in ${
                        hoveredDay.realized_pnl_paise >= 0
                          ? "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700/50"
                          : "bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-700/50"
                      }`}
                    >
                      {hoveredDay.date}: {hoveredDay.realized_pnl_paise >= 0 ? "+" : ""}
                      {formatPaise(hoveredDay.realized_pnl_paise)} ({hoveredDay.trades_count} trades)
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePrevMonth}
                    className="p-1.5 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors shadow-sm"
                    title="Previous Month"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleCurrentMonth}
                    className="px-3.5 py-1 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors shadow-sm"
                  >
                    Current
                  </button>
                  <button
                    onClick={handleNextMonth}
                    className="p-1.5 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors shadow-sm"
                    title="Next Month"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* 7-Column Day Names Header */}
              <div className="grid grid-cols-7 gap-2 text-center text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <div>Mon</div>
                <div>Tue</div>
                <div>Wed</div>
                <div>Thu</div>
                <div>Fri</div>
                <div className="text-slate-400 dark:text-slate-600">Sat</div>
                <div className="text-slate-400 dark:text-slate-600">Sun</div>
              </div>

              {/* Calendar Days Grid */}
              <div className="grid grid-cols-7 gap-2">
                {/* Empty leading cells */}
                {Array.from({ length: leadingDays }).map((_, i) => (
                  <div
                    key={`lead-${i}`}
                    className="h-20 rounded-2xl bg-slate-100/50 dark:bg-slate-950/20 border border-slate-200/40 dark:border-slate-900/40 opacity-30"
                  />
                ))}

                {/* Actual month days */}
                {daysOfMonth.map(({ date, dayNum, data }) => {
                  const hasTrades = !!data && data.trades_count > 0;
                  const isProfit = hasTrades && data.realized_pnl_paise >= 0;

                  return (
                    <div
                      key={date}
                      onMouseEnter={() => setHoveredDay(data)}
                      onMouseLeave={() => setHoveredDay(null)}
                      className={`h-20 rounded-2xl p-2.5 flex flex-col justify-between transition-all relative border select-none cursor-default ${
                        !hasTrades
                          ? "bg-white/80 dark:bg-slate-900/40 border-slate-200/80 dark:border-slate-800/60 text-slate-400 dark:text-slate-600"
                          : isProfit
                          ? "bg-gradient-to-br from-emerald-50 to-emerald-100/60 dark:from-emerald-950/40 dark:to-emerald-900/30 border-emerald-300 dark:border-emerald-500/50 text-emerald-700 dark:text-emerald-400 hover:border-emerald-400 shadow-sm hover:scale-[1.02]"
                          : "bg-gradient-to-br from-rose-50 to-rose-100/60 dark:from-rose-950/40 dark:to-rose-900/30 border-rose-300 dark:border-rose-500/50 text-rose-700 dark:text-rose-400 hover:border-rose-400 shadow-sm hover:scale-[1.02]"
                      }`}
                    >
                      {/* Day Number Header */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 font-mono">
                          {dayNum}
                        </span>
                        {hasTrades && (
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full font-mono ${
                              isProfit
                                ? "bg-emerald-200/80 dark:bg-emerald-900/80 text-emerald-900 dark:text-emerald-300"
                                : "bg-rose-200/80 dark:bg-rose-900/80 text-rose-900 dark:text-rose-300"
                            }`}
                          >
                            {data.trades_count}t
                          </span>
                        )}
                      </div>

                      {/* Day P&L Label */}
                      {hasTrades ? (
                        <div className="text-right">
                          <span className="text-[11px] font-extrabold font-tabular block leading-tight">
                            {data.realized_pnl_paise >= 0 ? "+" : ""}
                            {formatPaise(data.realized_pnl_paise)}
                          </span>
                        </div>
                      ) : (
                        <div className="text-[10px] text-slate-300 dark:text-slate-700 text-right">—</div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Monthly Net Totals Banner */}
              <div className="mt-4 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between text-xs gap-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="text-slate-600 dark:text-slate-400 font-semibold">Monthly Net Realized:</span>
                  <span
                    className={`font-bold font-tabular text-sm ${
                      (calendarData?.month_total_pnl_paise ?? 0) > 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : (calendarData?.month_total_pnl_paise ?? 0) < 0
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    {(calendarData?.month_total_pnl_paise ?? 0) > 0 ? "+" : ""}
                    {formatPaise(calendarData?.month_total_pnl_paise ?? 0)}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-slate-600 dark:text-slate-400 font-tabular flex-wrap">
                  <span>
                    Profitable Days:{" "}
                    <strong className="text-emerald-600 dark:text-emerald-400 font-bold">
                      {calendarData?.profitable_days_count ?? 0}
                    </strong>
                  </span>
                  <span>
                    Loss Days:{" "}
                    <strong className="text-rose-600 dark:text-rose-400 font-bold">
                      {calendarData?.loss_days_count ?? 0}
                    </strong>
                  </span>
                  <span>
                    Win Days %:{" "}
                    <strong className="text-slate-900 dark:text-white font-bold">
                      {winDaysRate.toFixed(1)}%
                    </strong>
                  </span>
                </div>
              </div>

              {/* Friendly helper when in Live Ledger mode with no trades */}
              {!isDemo && calendarData.profitable_days_count === 0 && calendarData.loss_days_count === 0 && (
                <div className="p-4 rounded-2xl bg-cyan-50/60 dark:bg-cyan-950/30 border border-cyan-200/80 dark:border-cyan-800/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <Sparkles className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
                    <span className="text-slate-700 dark:text-slate-300">
                      No live closed trades recorded for this month yet. Switch to Showcase Demo to preview full historical calendar analytics, or place a paper trade on the terminal!
                    </span>
                  </div>
                  <button
                    onClick={() => setDataSource("demo")}
                    className="shrink-0 px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-sm transition-all"
                  >
                    Switch to Demo
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: TRADE JOURNAL & PSYCHOLOGICAL TAGGING */}
        {activeTab === "journal" && (
          <div className="space-y-4">
            {/* Filter Bar & Search */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-2xl">
              {/* Setup Tag Pills */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => setTagFilter("ALL")}
                  className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all ${
                    tagFilter === "ALL"
                      ? "bg-sky-100 dark:bg-sky-950/80 border border-sky-300 dark:border-sky-700 text-sky-950 dark:text-sky-100 font-bold shadow-sm"
                      : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  All Setups
                </button>
                {SETUP_TAGS.map((tag) => {
                  const isSelected = tagFilter === tag;
                  return (
                    <button
                      key={tag}
                      onClick={() => setTagFilter(tag)}
                      className={`px-2.5 py-1 rounded-xl text-xs font-semibold transition-all border ${
                        isSelected
                          ? "bg-sky-100 dark:bg-sky-950/80 border-sky-300 dark:border-sky-700 text-sky-950 dark:text-sky-100 font-bold shadow-sm"
                          : "bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
                <button
                  onClick={() => setTagFilter("UNTAGGED")}
                  className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all ${
                    tagFilter === "UNTAGGED"
                      ? "bg-amber-100 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-700 text-amber-950 dark:text-amber-200 font-bold shadow-sm"
                      : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  Untagged
                </button>
              </div>

              {/* Outcome filter & Search input */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search journal..."
                    className="pl-8 pr-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-cyan-500 w-36 sm:w-44 shadow-sm"
                  />
                </div>

                <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-xs shadow-sm">
                  <button
                    onClick={() => setOutcomeFilter("ALL")}
                    className={`px-2.5 py-0.5 rounded-lg font-semibold ${
                      outcomeFilter === "ALL"
                        ? "bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white"
                        : "text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setOutcomeFilter("WIN")}
                    className={`px-2.5 py-0.5 rounded-lg font-semibold ${
                      outcomeFilter === "WIN"
                        ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300"
                        : "text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    Wins
                  </button>
                  <button
                    onClick={() => setOutcomeFilter("LOSS")}
                    className={`px-2.5 py-0.5 rounded-lg font-semibold ${
                      outcomeFilter === "LOSS"
                        ? "bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300"
                        : "text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    Losses
                  </button>
                </div>
              </div>
            </div>

            {/* Trades List with Inline Note Editing */}
            {filteredTrades.length === 0 ? (
              <div className="p-12 text-center text-slate-500 dark:text-slate-400 text-xs bg-white dark:bg-slate-900/40 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-2">
                <BookOpen className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="font-semibold text-slate-700 dark:text-slate-300">
                  No trades match the selected journal filters.
                </p>
                {!isDemo && (
                  <p className="text-slate-500">
                    Switch to Showcase Demo to preview realistic trade journal entries with mindset notes.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredTrades.map((t) => {
                  const isProfit = t.realized_pnl_paise >= 0;
                  const edit = {
                    tag: journalEdits[t.uuid]?.tag ?? t.tag ?? "",
                    notes: journalEdits[t.uuid]?.notes ?? t.notes ?? "",
                    saving: journalEdits[t.uuid]?.saving ?? false,
                    saved: journalEdits[t.uuid]?.saved ?? false,
                  };

                  return (
                    <div
                      key={t.uuid}
                      className="p-5 rounded-3xl bg-white dark:bg-slate-950/60 border border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-colors shadow-sm space-y-3"
                    >
                      {/* Top Row: Symbol, Side, Execution Details, P&L */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                            {t.symbol}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                              t.side === "BUY"
                                ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800"
                                : "bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-400 border border-rose-300 dark:border-rose-800"
                            }`}
                          >
                            {t.side}
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {t.quantity} qty @ {formatPaise(t.executed_price_paise)}
                          </span>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                            {new Date(t.executed_at).toLocaleString("en-IN", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>

                        {/* Realized P&L */}
                        <div className="text-right">
                          <span
                            className={`text-base font-extrabold font-tabular ${
                              isProfit
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-rose-600 dark:text-rose-400"
                            }`}
                          >
                            {isProfit ? "+" : ""}
                            {formatPaise(t.realized_pnl_paise)}
                          </span>
                        </div>
                      </div>

                      {/* Middle Row: Tag Selector & Notes Input */}
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2.5 border-t border-slate-100 dark:border-slate-900">
                        {/* Setup Tag Dropdown */}
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                            <Tag className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
                            Setup Type
                          </label>
                          <select
                            value={edit.tag}
                            onChange={(e) => {
                              const newTag = e.target.value;
                              const currentNotes = journalEdits[t.uuid]?.notes ?? t.notes ?? "";
                              setJournalEdits((prev) => ({
                                ...prev,
                                [t.uuid]: {
                                  tag: newTag,
                                  notes: currentNotes,
                                  saving: false,
                                  saved: false,
                                },
                              }));
                              void handleSaveJournal(t.uuid, newTag, currentNotes);
                            }}
                            className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500 shadow-sm"
                          >
                            <option value="">Select Setup...</option>
                            {SETUP_TAGS.map((tag) => (
                              <option key={tag} value={tag}>
                                {tag}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Psychology & Review Notes */}
                        <div className="md:col-span-3 flex flex-col gap-1">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">
                              Mindset & Review Notes
                            </label>
                            {edit.saving && (
                              <span className="text-[10px] text-cyan-600 dark:text-cyan-400 animate-pulse">
                                Saving…
                              </span>
                            )}
                            {edit.saved && (
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                                <CheckCircle2 className="w-3 h-3" /> Saved
                              </span>
                            )}
                          </div>
                          <input
                            type="text"
                            value={edit.notes}
                            placeholder="Why did you take this trade? Any FOMO, discipline errors, or plan adherence?"
                            onChange={(e) => {
                              const val = e.target.value;
                              const currentTag = journalEdits[t.uuid]?.tag ?? t.tag ?? "";
                              setJournalEdits((prev) => ({
                                ...prev,
                                [t.uuid]: {
                                  tag: currentTag,
                                  notes: val,
                                  saving: false,
                                  saved: false,
                                },
                              }));
                            }}
                            onBlur={() => {
                              const currentNotes = journalEdits[t.uuid]?.notes ?? t.notes ?? "";
                              if (currentNotes !== (t.notes || "")) {
                                void handleSaveJournal(t.uuid, edit.tag, currentNotes);
                              }
                            }}
                            className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-cyan-500 shadow-sm"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: VIRTUAL CAPITAL LEDGER */}
        {activeTab === "statement" && (
          <LedgerStatementView token={token} apiUrl={baseApi} isDemo={isDemo} />
        )}
      </div>
    </div>
  );
}
