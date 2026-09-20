"use client";

import React, { useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  Activity,
  Flame,
  Award,
  BarChart3,
  Sparkles,
} from "lucide-react";
import { formatPaise } from "@/lib/format";
import {
  DEMO_DAY_PNL_RECORDS,
  DEMO_EQUITY_CURVE,
  type DayPnlRecord,
} from "./PortfolioTypes";

export default function PortfolioPnlAnalytics() {
  const [selectedDay, setSelectedDay] = useState<DayPnlRecord | null>(DEMO_DAY_PNL_RECORDS[DEMO_DAY_PNL_RECORDS.length - 1]);

  const totalPnl = DEMO_DAY_PNL_RECORDS.reduce((acc, r) => acc + r.pnlPaise, 0);
  const winningDays = DEMO_DAY_PNL_RECORDS.filter((r) => r.isProfit).length;
  const winRate = (winningDays / DEMO_DAY_PNL_RECORDS.length) * 100;
  const bestDay = Math.max(...DEMO_DAY_PNL_RECORDS.map((r) => r.pnlPaise));
  const worstDay = Math.min(...DEMO_DAY_PNL_RECORDS.map((r) => r.pnlPaise));

  // Build SVG path for equity curve
  const minBal = Math.min(...DEMO_EQUITY_CURVE.map((p) => p.balance));
  const maxBal = Math.max(...DEMO_EQUITY_CURVE.map((p) => p.balance));
  const range = maxBal - minBal || 1;

  const points = DEMO_EQUITY_CURVE.map((pt, i) => {
    const x = (i / (DEMO_EQUITY_CURVE.length - 1)) * 360 + 20;
    const y = 140 - ((pt.balance - minBal) / range) * 100;
    return `${x},${y}`;
  }).join(" ");

  return (
    <div className="space-y-6">
      {/* Top 4 Trading Performance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Cumulative Realized P&L */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              14-Day Realized P&L
            </span>
            <Flame className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black font-tabular text-emerald-600 dark:text-emerald-400">
            +{formatPaise(totalPnl)}
          </div>
          <span className="text-[10px] text-slate-400">Net booked trading profit</span>
        </div>

        {/* Win Rate */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Day Win Rate
            </span>
            <Award className="w-4 h-4 text-cyan-500" />
          </div>
          <div className="text-2xl font-black font-tabular text-slate-900 dark:text-slate-100">
            {winRate.toFixed(0)}%
          </div>
          <span className="text-[10px] text-slate-400">
            {winningDays} profitable of {DEMO_DAY_PNL_RECORDS.length} days
          </span>
        </div>

        {/* Best Day */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Best Day P&L
            </span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black font-tabular text-emerald-600 dark:text-emerald-400">
            +{formatPaise(bestDay)}
          </div>
          <span className="text-[10px] text-slate-400">High watermark single session</span>
        </div>

        {/* Max Daily Loss */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Max Daily Loss
            </span>
            <TrendingDown className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-black font-tabular text-rose-600 dark:text-rose-400">
            {formatPaise(worstDay)}
          </div>
          <span className="text-[10px] text-slate-400">Strictly contained risk profile</span>
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
              <p className="text-[11px] text-slate-400 mt-0.5">
                Session performance timeline across recent trading days
              </p>
            </div>
            <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded">
              Green Streak
            </span>
          </div>

          <div className="grid grid-cols-5 gap-2.5">
            {DEMO_DAY_PNL_RECORDS.map((rec) => {
              const isSelected = selectedDay?.date === rec.date;

              return (
                <button
                  key={rec.date}
                  onClick={() => setSelectedDay(rec)}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    isSelected
                      ? "ring-2 ring-cyan-500 scale-105 shadow-md"
                      : "hover:scale-102"
                  } ${
                    rec.isProfit
                      ? "bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60"
                      : "bg-rose-50/80 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/60"
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 dark:text-slate-400 mb-1">
                    <span>{rec.dayName}</span>
                    <span>{rec.date.slice(8)}</span>
                  </div>
                  <div
                    className={`text-xs font-black font-tabular ${
                      rec.isProfit
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-rose-700 dark:text-rose-400"
                    }`}
                  >
                    {rec.isProfit ? "+" : ""}
                    {formatPaise(rec.pnlPaise).replace("₹", "")}
                  </div>
                  <div className="text-[9px] text-slate-400 mt-1">
                    {rec.tradesCount} trades
                  </div>
                </button>
              );
            })}
          </div>

          {/* Selected Day Details Preview */}
          {selectedDay && (
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-center justify-between text-xs">
              <div>
                <span className="text-slate-400 font-mono text-[11px]">
                  {selectedDay.dayName}, {selectedDay.date}
                </span>
                <div className="font-bold text-slate-900 dark:text-slate-100">
                  {selectedDay.tradesCount} Orders Executed
                </div>
              </div>
              <div className="text-right">
                <div
                  className={`text-sm font-black font-tabular ${
                    selectedDay.isProfit
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400"
                  }`}
                >
                  {selectedDay.isProfit ? "+" : ""}
                  {formatPaise(selectedDay.pnlPaise)}
                </div>
                <span className="text-[10px] text-slate-400">Net Closed P&L</span>
              </div>
            </div>
          )}
        </div>

        {/* INTRADAY EQUITY CURVE (6 Cols) */}
        <div className="lg:col-span-6 p-6 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                <span>Intraday Equity Curve</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Mark-to-market trajectory through today&apos;s market hours
              </p>
            </div>
            <span className="text-xs font-mono font-bold text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/60 px-2 py-0.5 rounded">
              09:15 - 15:30 IST
            </span>
          </div>

          {/* SVG Sparkline Chart */}
          <div className="w-full h-44 relative flex items-center justify-center">
            <svg viewBox="0 0 400 160" className="w-full h-full overflow-visible">
              <defs>
                <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid lines */}
              <line x1="20" y1="40" x2="380" y2="40" stroke="#334155" strokeWidth="0.5" strokeDasharray="3 3" opacity="0.4" />
              <line x1="20" y1="90" x2="380" y2="90" stroke="#334155" strokeWidth="0.5" strokeDasharray="3 3" opacity="0.4" />
              <line x1="20" y1="140" x2="380" y2="140" stroke="#334155" strokeWidth="0.5" strokeDasharray="3 3" opacity="0.4" />

              {/* Area */}
              <polygon
                points={`20,140 ${points} 380,140`}
                fill="url(#equityGrad)"
              />

              {/* Line */}
              <polyline
                fill="none"
                stroke="#06b6d4"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={points}
              />

              {/* End Point Pulse */}
              {DEMO_EQUITY_CURVE.length > 0 && (
                <circle cx="380" cy="40" r="4" fill="#06b6d4" className="animate-pulse" />
              )}
            </svg>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono pt-2 border-t border-slate-100 dark:border-slate-800">
            <span>Market Open: 09:15</span>
            <span className="text-emerald-500 font-bold">Peak: ₹10,04,574</span>
            <span>Market Close: 15:30</span>
          </div>
        </div>
      </div>
    </div>
  );
}
