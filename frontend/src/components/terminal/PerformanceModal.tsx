"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  X,
  TrendingUp,
  TrendingDown,
  Calendar as CalendarIcon,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Tag,
  AlertCircle,
  Award,
  RefreshCw,
} from "lucide-react";
import { formatPaise } from "@/lib/format";
import type { PerformanceOverview, PnlCalendarResponse, DailyPnlDay, Trade } from "@/types";

type PerformanceModalProps = {
  isOpen: boolean;
  onClose: () => void;
  apiUrl: string;
  token: string | null;
};

const SETUP_TAGS = [
  "Breakout",
  "Reversal",
  "Scalp",
  "Momentum",
  "Hedge",
  "F&O Expiry",
  "Mistake",
  "Other",
];

const TAG_COLORS: Record<string, string> = {
  Breakout: "bg-emerald-950/80 text-emerald-300 border-emerald-600/40",
  Reversal: "bg-purple-950/80 text-purple-300 border-purple-600/40",
  Scalp: "bg-cyan-950/80 text-cyan-300 border-cyan-600/40",
  Momentum: "bg-blue-950/80 text-blue-300 border-blue-600/40",
  Hedge: "bg-amber-950/80 text-amber-300 border-amber-600/40",
  "F&O Expiry": "bg-indigo-950/80 text-indigo-300 border-indigo-600/40",
  Mistake: "bg-rose-950/80 text-rose-300 border-rose-600/40",
  Other: "bg-slate-800 text-slate-300 border-slate-700",
};

export default function PerformanceModal({
  isOpen,
  onClose,
  apiUrl,
  token,
}: PerformanceModalProps) {
  const [activeTab, setActiveTab] = useState<"analytics" | "journal">("analytics");

  // Performance data states
  const [performance, setPerformance] = useState<PerformanceOverview | null>(null);
  const [calendarData, setCalendarData] = useState<PnlCalendarResponse | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Month navigation: YYYY-MM
  const [currentMonth, setCurrentMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  // Journal filtering
  const [tagFilter, setTagFilter] = useState<string>("ALL");
  const [outcomeFilter, setOutcomeFilter] = useState<"ALL" | "WIN" | "LOSS">("ALL");

  // Active hover day for calendar tooltip
  const [hoveredDay, setHoveredDay] = useState<DailyPnlDay | null>(null);

  // Notes update state per trade: { [uuid]: { notes: string, tag: string, saving: boolean, saved: boolean } }
  const [journalEdits, setJournalEdits] = useState<
    Record<string, { tag: string; notes: string; saving: boolean; saved: boolean }>
  >({});

  // Ensure clean API root regardless of trailing /api/v1
  const baseApi = useMemo(() => {
    return apiUrl.endsWith("/api/v1") ? apiUrl : `${apiUrl.replace(/\/+$/, "")}/api/v1`;
  }, [apiUrl]);

  // Fetch Performance Analytics Overview
  const fetchPerformance = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${baseApi}/analytics/performance`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setPerformance(data.data);
      }
    } catch {
      // ignore
    }
  }, [baseApi, token]);

  // Fetch PnL Calendar for current month
  const fetchCalendar = useCallback(async (monthStr: string) => {
    if (!token) return;
    try {
      const res = await fetch(`${baseApi}/analytics/pnl-calendar?month=${monthStr}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setCalendarData(data.data);
      }
    } catch {
      // ignore
    }
  }, [baseApi, token]);

  // Fetch Trades list for journal
  const fetchTrades = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${baseApi}/trades`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setTrades(data.data || []);
        // Initialize journal edits
        const edits: Record<
          string,
          { tag: string; notes: string; saving: boolean; saved: boolean }
        > = {};
        (data.data || []).forEach((t: Trade) => {
          edits[t.uuid] = {
            tag: t.tag || "",
            notes: t.notes || "",
            saving: false,
            saved: false,
          };
        });
        setJournalEdits(edits);
      }
    } catch {
      // ignore
    }
  }, [baseApi, token]);

  // Initial load when modal opens
  useEffect(() => {
    if (!isOpen || !token) return;
    setLoading(true);
    setError(null);
    Promise.all([fetchPerformance(), fetchCalendar(currentMonth), fetchTrades()])
      .catch((err) => setError(err?.message || "Failed to load analytics"))
      .finally(() => setLoading(false));
  }, [isOpen, token, currentMonth, fetchPerformance, fetchCalendar, fetchTrades]);

  // Calendar grid computation
  const { monthLabel, leadingDays, daysOfMonth } = useMemo(() => {
    const [yStr, mStr] = currentMonth.split("-");
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10) - 1; // 0-indexed month

    const dateObj = new Date(y, m, 1);
    const monthLabel = dateObj.toLocaleDateString("en-US", { month: "long", year: "numeric" });

    // Monday-based day of week (1 = Mon, 7 = Sun)
    const dow = (dateObj.getDay() + 6) % 7 + 1;
    const leadingDays = dow - 1;

    const totalDays = new Date(y, m + 1, 0).getDate();

    // Index backend days by date string for O(1) lookup
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

  // Handle Month Navigation
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
    if (!token) return;
    setJournalEdits((prev) => ({
      ...prev,
      [tradeUuid]: { ...prev[tradeUuid], saving: true, saved: false },
    }));

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
        setTrades((prev) =>
          prev.map((t) => (t.uuid === tradeUuid ? { ...t, tag: newTag, notes: newNotes } : t))
        );
        setJournalEdits((prev) => ({
          ...prev,
          [tradeUuid]: { tag: newTag, notes: newNotes, saving: false, saved: true },
        }));
        setTimeout(() => {
          setJournalEdits((prev) => ({
            ...prev,
            [tradeUuid]: { ...prev[tradeUuid], saved: false },
          }));
        }, 2500);
      }
    } catch {
      setJournalEdits((prev) => ({
        ...prev,
        [tradeUuid]: { ...prev[tradeUuid], saving: false, saved: false },
      }));
    }
  };

  // Filtered trades for journal
  const filteredTrades = useMemo(() => {
    return trades.filter((t) => {
      // Tag filter
      if (tagFilter === "UNTAGGED" && t.tag) return false;
      if (tagFilter !== "ALL" && tagFilter !== "UNTAGGED" && t.tag !== tagFilter) return false;

      // Outcome filter
      if (outcomeFilter === "WIN" && t.realized_pnl_paise <= 0) return false;
      if (outcomeFilter === "LOSS" && t.realized_pnl_paise >= 0) return false;

      return true;
    });
  }, [trades, tagFilter, outcomeFilter]);

  if (!isOpen) return null;

  const totalTradingDays =
    (calendarData?.profitable_days_count ?? 0) + (calendarData?.loss_days_count ?? 0);
  const winDaysRate =
    totalTradingDays > 0
      ? ((calendarData?.profitable_days_count ?? 0) / totalTradingDays) * 100
      : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-5xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-950/70 border border-cyan-500/30 text-cyan-400">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Trader Performance & Journal
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950 border border-cyan-500/30 text-cyan-300 font-mono">
                  Console v2
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Institutional metrics, Zerodha-style P&L calendar heatmap, and trade setups.
              </p>
            </div>
          </div>

          {/* Right Action: Tab Buttons & Close */}
          <div className="flex items-center gap-3">
            {/* Tabs */}
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setActiveTab("analytics")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === "analytics"
                    ? "bg-cyan-600 text-white shadow-lg shadow-cyan-900/30"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <CalendarIcon className="w-3.5 h-3.5" />
                Analytics & Calendar
              </button>
              <button
                onClick={() => setActiveTab("journal")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === "journal"
                    ? "bg-cyan-600 text-white shadow-lg shadow-cyan-900/30"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                Trade Journal
                {trades.length > 0 && (
                  <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300 font-mono">
                    {trades.length}
                  </span>
                )}
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
              <RefreshCw className="w-8 h-8 animate-spin text-cyan-500" />
              <p className="text-xs">Computing trader analytics and monthly calendar...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400" />
              {error}
            </div>
          ) : activeTab === "analytics" ? (
            <>
              {/* Top Overview Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
                {/* Net Realized P&L */}
                <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 flex flex-col justify-between">
                  <span className="text-[11px] text-slate-400 font-medium">Net Realized P&L</span>
                  <div className="my-1.5">
                    <strong
                      className={`text-xl font-black font-mono ${
                        (performance?.net_realized_pnl_paise ?? 0) >= 0
                          ? "text-emerald-400"
                          : "text-rose-400"
                      }`}
                    >
                      {(performance?.net_realized_pnl_paise ?? 0) >= 0 ? "+" : ""}
                      {formatPaise(performance?.net_realized_pnl_paise ?? 0)}
                    </strong>
                  </div>
                  <div className="text-[10px] text-slate-500 flex items-center justify-between">
                    <span className="text-emerald-500">
                      +{formatPaise(performance?.gross_profit_paise ?? 0)}
                    </span>
                    <span className="text-rose-500">
                      -{formatPaise(performance?.gross_loss_paise ?? 0)}
                    </span>
                  </div>
                </div>

                {/* Win Rate */}
                <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 flex flex-col justify-between">
                  <span className="text-[11px] text-slate-400 font-medium">Win Rate</span>
                  <div className="my-1.5 flex items-baseline gap-2">
                    <strong
                      className={`text-xl font-black font-mono ${
                        (performance?.win_rate_pct ?? 0) >= 50
                          ? "text-emerald-400"
                          : (performance?.win_rate_pct ?? 0) > 0
                          ? "text-amber-400"
                          : "text-slate-400"
                      }`}
                    >
                      {(performance?.win_rate_pct ?? 0).toFixed(1)}%
                    </strong>
                    <span className="text-[10px] text-slate-400 font-mono">
                      ({performance?.winning_trades ?? 0}W / {performance?.losing_trades ?? 0}L)
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden flex">
                    <div
                      className="bg-emerald-500 h-full"
                      style={{ width: `${Math.min(100, performance?.win_rate_pct ?? 0)}%` }}
                    />
                    <div
                      className="bg-rose-500 h-full"
                      style={{
                        width: `${Math.min(
                          100,
                          100 - (performance?.win_rate_pct ?? 0)
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Profit Factor */}
                <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-400 font-medium">Profit Factor</span>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                        (performance?.profit_factor ?? 0) >= 2.0
                          ? "bg-emerald-950 text-emerald-400 border border-emerald-800/40"
                          : (performance?.profit_factor ?? 0) >= 1.0
                          ? "bg-cyan-950 text-cyan-400 border border-cyan-800/40"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {(performance?.profit_factor ?? 0) >= 2.0
                        ? "Elite"
                        : (performance?.profit_factor ?? 0) >= 1.0
                        ? "Profitable"
                        : "Developing"}
                    </span>
                  </div>
                  <div className="my-1.5">
                    <strong className="text-xl font-black font-mono text-cyan-300">
                      {(performance?.profit_factor ?? 0).toFixed(2)}x
                    </strong>
                  </div>
                  <span className="text-[10px] text-slate-500">
                    Gross Profit / Gross Loss ratio
                  </span>
                </div>

                {/* Avg Win vs Loss */}
                <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 flex flex-col justify-between">
                  <span className="text-[11px] text-slate-400 font-medium">
                    Avg Win / Avg Loss
                  </span>
                  <div className="my-1.5 flex items-baseline justify-between">
                    <span className="text-xs font-bold font-mono text-emerald-400">
                      +{formatPaise(performance?.average_win_paise ?? 0)}
                    </span>
                    <span className="text-xs font-bold font-mono text-rose-400">
                      -{formatPaise(performance?.average_loss_paise ?? 0)}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 flex justify-between">
                    <span>Best: {formatPaise(performance?.largest_win_paise ?? 0)}</span>
                    <span>Worst: -{formatPaise(performance?.largest_loss_paise ?? 0)}</span>
                  </div>
                </div>
              </div>

              {/* Zerodha-Style Monthly P&L Calendar */}
              <div className="bg-slate-950/40 border border-slate-800 rounded-2xl p-5 space-y-4">
                {/* Calendar Controls & Monthly Summary Banner */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1">
                      <button
                        onClick={handlePrevMonth}
                        title="Previous Month"
                        className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="px-3 text-xs font-bold text-white min-w-[130px] text-center">
                        {monthLabel}
                      </span>
                      <button
                        onClick={handleNextMonth}
                        title="Next Month"
                        className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>

                    <button
                      onClick={handleCurrentMonth}
                      className="px-2.5 py-1.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-medium transition-colors"
                    >
                      Current Month
                    </button>
                  </div>

                  {/* Monthly Summary Statistics */}
                  <div className="flex items-center gap-4 text-xs font-mono">
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-400">Monthly Net:</span>
                      <strong
                        className={`font-black ${
                          (calendarData?.month_total_pnl_paise ?? 0) >= 0
                            ? "text-emerald-400"
                            : "text-rose-400"
                        }`}
                      >
                        {(calendarData?.month_total_pnl_paise ?? 0) >= 0 ? "+" : ""}
                        {formatPaise(calendarData?.month_total_pnl_paise ?? 0)}
                      </strong>
                    </div>
                    <div className="h-4 w-px bg-slate-800" />
                    <div className="text-slate-400">
                      Days:{" "}
                      <span className="text-emerald-400 font-bold">
                        {calendarData?.profitable_days_count ?? 0}W
                      </span>{" "}
                      /{" "}
                      <span className="text-rose-400 font-bold">
                        {calendarData?.loss_days_count ?? 0}L
                      </span>
                    </div>
                    <div className="h-4 w-px bg-slate-800" />
                    <div className="text-slate-400">
                      Win Days:{" "}
                      <span className="text-cyan-400 font-bold">
                        {winDaysRate.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Calendar Grid */}
                <div className="space-y-1.5">
                  {/* Day of Week Headers */}
                  <div className="grid grid-cols-7 gap-2 text-center text-[11px] font-bold text-slate-500 uppercase tracking-wider pb-1">
                    <div>Mon</div>
                    <div>Tue</div>
                    <div>Wed</div>
                    <div>Thu</div>
                    <div>Fri</div>
                    <div className="text-slate-600">Sat</div>
                    <div className="text-slate-600">Sun</div>
                  </div>

                  {/* Days Tiles */}
                  <div className="grid grid-cols-7 gap-2">
                    {/* Prefix empty slots for padding before the 1st day of month */}
                    {Array.from({ length: leadingDays }).map((_, i) => (
                      <div
                        key={`empty-${i}`}
                        className="min-h-[76px] rounded-xl bg-slate-950/20 border border-dashed border-slate-900/60 opacity-30"
                      />
                    ))}

                    {daysOfMonth.map(({ date, dayNum, data }) => {
                      const hasTrades = !!data && data.trades_count > 0;
                      const pnl = data?.realized_pnl_paise ?? 0;
                      const isProfit = pnl > 0;
                      const isLoss = pnl < 0;

                      return (
                        <div
                          key={date}
                          onMouseEnter={() =>
                            data ? setHoveredDay(data) : setHoveredDay(null)
                          }
                          onMouseLeave={() => setHoveredDay(null)}
                          className={`relative min-h-[76px] p-2.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                            hasTrades
                              ? isProfit
                                ? "bg-emerald-950/40 border-emerald-700/50 hover:border-emerald-400 hover:bg-emerald-900/40 shadow-sm shadow-emerald-950/30"
                                : isLoss
                                ? "bg-rose-950/40 border-rose-700/50 hover:border-rose-400 hover:bg-rose-900/40 shadow-sm shadow-rose-950/30"
                                : "bg-amber-950/30 border-amber-700/40 hover:border-amber-400"
                              : "bg-slate-900/30 border-slate-800/60 hover:border-slate-700 opacity-70"
                          }`}
                        >
                          {/* Top Row: Day of Month & Trade count pill */}
                          <div className="flex items-center justify-between">
                            <span
                              className={`text-xs font-mono font-bold ${
                                hasTrades ? "text-white" : "text-slate-500"
                              }`}
                            >
                              {dayNum}
                            </span>
                            {hasTrades && (
                              <span
                                className={`text-[9px] px-1.5 py-0.2 rounded-full font-mono font-medium ${
                                  isProfit
                                    ? "bg-emerald-900/80 text-emerald-300"
                                    : isLoss
                                    ? "bg-rose-900/80 text-rose-300"
                                    : "bg-slate-800 text-slate-300"
                                }`}
                              >
                                {data.trades_count}t
                              </span>
                            )}
                          </div>

                          {/* Center / Bottom Row: Net Realized Amount */}
                          <div className="mt-1">
                            {hasTrades ? (
                              <span
                                className={`text-[11px] font-black font-mono block truncate ${
                                  isProfit
                                    ? "text-emerald-400"
                                    : isLoss
                                    ? "text-rose-400"
                                    : "text-amber-400"
                                }`}
                              >
                                {isProfit ? "+" : ""}
                                {formatPaise(pnl)}
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-700 font-mono">-</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Day Hover Tooltip Banner */}
                <div className="h-8 flex items-center px-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400">
                  {hoveredDay ? (
                    <div className="flex items-center gap-4">
                      <span className="text-white font-bold font-mono">{hoveredDay.date}</span>
                      <span>
                        Net P&L:{" "}
                        <strong
                          className={`font-mono ${
                            hoveredDay.realized_pnl_paise >= 0
                              ? "text-emerald-400"
                              : "text-rose-400"
                          }`}
                        >
                          {hoveredDay.realized_pnl_paise >= 0 ? "+" : ""}
                          {formatPaise(hoveredDay.realized_pnl_paise)}
                        </strong>
                      </span>
                      <span>
                        Trades:{" "}
                        <strong className="text-white font-mono">
                          {hoveredDay.trades_count}
                        </strong>{" "}
                        ({hoveredDay.win_trades} wins, {hoveredDay.loss_trades} losses)
                      </span>
                    </div>
                  ) : (
                    <span className="text-slate-500 italic">
                      Hover over any day tile to inspect daily trade distribution and realized returns.
                    </span>
                  )}
                </div>
              </div>
            </>
          ) : (
            /* Tab 2: Trade Journaling Desk */
            <div className="space-y-4">
              {/* Journal Filter Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-950/50 border border-slate-800">
                <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-semibold text-white">Setup Tags:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {["ALL", "UNTAGGED", ...SETUP_TAGS].map((tag) => (
                      <button
                        key={tag}
                        onClick={() => setTagFilter(tag)}
                        className={`text-[11px] px-2.5 py-1 rounded-lg border font-medium transition-all ${
                          tagFilter === tag
                            ? "bg-cyan-950 border-cyan-500 text-cyan-300 font-bold"
                            : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Outcome Toggle */}
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-slate-400 text-[11px]">Outcome:</span>
                  <select
                    value={outcomeFilter}
                    onChange={(e) => setOutcomeFilter(e.target.value as "ALL" | "WIN" | "LOSS")}
                    className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white outline-none focus:border-cyan-500"
                  >
                    <option value="ALL">All Outcomes</option>
                    <option value="WIN">Profitable Only</option>
                    <option value="LOSS">Losses Only</option>
                  </select>
                </div>
              </div>

              {/* Trades List */}
              {filteredTrades.length === 0 ? (
                <div className="p-12 text-center text-slate-500 text-xs border border-slate-800 rounded-2xl bg-slate-950/20">
                  <BookOpen className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  No executed trades matching the selected filter. Execute trades or adjust filters to review.
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredTrades.map((t) => {
                    const edit = journalEdits[t.uuid] || {
                      tag: t.tag || "",
                      notes: t.notes || "",
                      saving: false,
                      saved: false,
                    };
                    const isProfit = t.realized_pnl_paise > 0;
                    const isLoss = t.realized_pnl_paise < 0;

                    return (
                      <div
                        key={t.uuid}
                        className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 hover:border-slate-700 transition-all space-y-3"
                      >
                        {/* Trade Row Header */}
                        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-2.5">
                            <span
                              className={`text-[10px] font-black px-1.5 py-0.5 rounded font-mono ${
                                t.side === "BUY"
                                  ? "bg-emerald-950 text-emerald-400 border border-emerald-800/40"
                                  : "bg-rose-950 text-rose-400 border border-rose-800/40"
                              }`}
                            >
                              {t.side}
                            </span>
                            <strong className="text-white font-bold text-sm tracking-wide">
                              {t.symbol}
                            </strong>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                              {t.product}
                            </span>
                            <span className="text-slate-400 font-mono">
                              Qty: <strong className="text-slate-200">{t.quantity}</strong> @{" "}
                              <strong className="text-slate-200">
                                {formatPaise(t.executed_price_paise)}
                              </strong>
                            </span>
                          </div>

                          {/* Right: Realized P&L & Timestamp */}
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <span
                                className={`text-sm font-black font-mono ${
                                  isProfit
                                    ? "text-emerald-400"
                                    : isLoss
                                    ? "text-rose-400"
                                    : "text-slate-400"
                                }`}
                              >
                                {isProfit ? "+" : ""}
                                {formatPaise(t.realized_pnl_paise)}
                              </span>
                              <span className="text-[10px] text-slate-500 block">
                                {t.executed_at ? new Date(t.executed_at).toLocaleString() : ""}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Journal Tag & Inline Notes Editor */}
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2 border-t border-slate-800/60">
                          {/* Tag Dropdown */}
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-slate-400 whitespace-nowrap">
                              Setup:
                            </span>
                            <select
                              value={edit.tag}
                              onChange={(e) => {
                                const newTag = e.target.value;
                                setJournalEdits((prev) => ({
                                  ...prev,
                                  [t.uuid]: { ...prev[t.uuid], tag: newTag },
                                }));
                                void handleSaveJournal(t.uuid, newTag, edit.notes);
                              }}
                              className={`text-xs px-2.5 py-1 rounded-lg border outline-none font-medium ${
                                edit.tag && TAG_COLORS[edit.tag]
                                  ? TAG_COLORS[edit.tag]
                                  : "bg-slate-900 text-slate-300 border-slate-800"
                              }`}
                            >
                              <option value="" className="bg-slate-900 text-slate-400">
                                -- Select Setup Tag --
                              </option>
                              {SETUP_TAGS.map((tag) => (
                                <option
                                  key={tag}
                                  value={tag}
                                  className="bg-slate-900 text-slate-200"
                                >
                                  {tag}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Notes input */}
                          <div className="flex-1 flex items-center gap-2">
                            <input
                              type="text"
                              placeholder="Add trade rationale, discipline notes, or exit strategy..."
                              value={edit.notes}
                              onChange={(e) => {
                                const newNotes = e.target.value;
                                setJournalEdits((prev) => ({
                                  ...prev,
                                  [t.uuid]: { ...prev[t.uuid], notes: newNotes },
                                }));
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  void handleSaveJournal(t.uuid, edit.tag, edit.notes);
                                }
                              }}
                              className="flex-1 bg-slate-900/90 border border-slate-800 focus:border-cyan-500 rounded-lg px-3 py-1 text-xs text-slate-200 placeholder-slate-600 outline-none transition-colors"
                            />

                            <button
                              onClick={() => void handleSaveJournal(t.uuid, edit.tag, edit.notes)}
                              disabled={edit.saving}
                              className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                                edit.saved
                                  ? "bg-emerald-950 border border-emerald-600/40 text-emerald-400"
                                  : "bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
                              }`}
                            >
                              {edit.saving ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                              ) : edit.saved ? (
                                <>
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>Saved</span>
                                </>
                              ) : (
                                "Save"
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-400" />
            <span>
              Realized P&L is calculated accurately using cost-basis matching per trade execution.
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
