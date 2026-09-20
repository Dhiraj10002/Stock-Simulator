"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import Navbar from "@/components/layout/Navbar";
import {
  BrainCircuit,
  SlidersHorizontal,
  ArrowRight,
  ShieldAlert,
  Bot,
  Wallet as WalletIcon,
  TrendingUp,
  BarChart3,
  Layers,
  Sparkles,
  Activity,
} from "lucide-react";
import TradeCopilot from "@/components/terminal/TradeCopilot";
import PreTradeRiskLab from "@/components/mentor/PreTradeRiskLab";
import { formatPaise } from "@/lib/format";
import type { Wallet, Portfolio, ApiResponse } from "@/types";

export default function MentorPage() {
  const [activeTab, setActiveTab] = useState<"copilot" | "risklab">("copilot");
  const [token] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("auth_token") || "";
    }
    return "";
  });

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1";

  // Server state via TanStack Query with graceful fallback
  const { data: wallet } = useQuery<Wallet>({
    queryKey: ["wallet", token],
    queryFn: async () => {
      try {
        const res = await fetch(`${apiUrl}/wallet`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
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
    staleTime: 10_000,
  });

  const { data: portfolio } = useQuery<Portfolio>({
    queryKey: ["portfolio", token],
    queryFn: async () => {
      try {
        const res = await fetch(`${apiUrl}/portfolio`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
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
    staleTime: 15_000,
  });

  const availableBalance = wallet?.available_balance_paise ?? 100000000;
  const blockedMargin = wallet?.blocked_paise ?? 0;
  const unrealizedPnl = portfolio?.unrealized_pnl_paise ?? 0;
  const isPnlPositive = unrealizedPnl >= 0;
  const openPositionsCount = portfolio?.positions?.length ?? 0;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-150">
      <Navbar
        availableBalancePaise={availableBalance}
        unrealizedPnlPaise={unrealizedPnl}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-200/90 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="p-2.5 rounded-2xl bg-gradient-to-br from-cyan-500/15 to-blue-500/25 dark:from-cyan-950 dark:to-blue-950/50 border border-cyan-500/30 text-cyan-600 dark:text-cyan-400 shadow-sm shadow-cyan-500/10">
                <BrainCircuit className="w-6 h-6" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
                AI Behavioral Copilot & Risk Mentor
              </h1>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold tracking-wide rounded-full bg-cyan-100 dark:bg-cyan-500/15 text-cyan-800 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-500/30 shadow-sm">
                <Sparkles className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                Gemini 1.5 Pro Engine
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-2xl leading-relaxed">
              Real-time trading discipline letter grades (A+ to F), emotional revenge-trading detection, risk-reward symmetry auditing, and pre-trade simulation.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <Link
              href="/analytics"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 text-xs font-semibold shadow-sm transition-all hover:scale-[1.02]"
            >
              <BarChart3 className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <span>Performance</span>
            </Link>
            <Link
              href="/stocks/ITC"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs shadow-md shadow-cyan-500/20 transition-all hover:scale-[1.02]"
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span>Explore Market</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Live Context Metrics Ribbon */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          {/* Card 1: Available Margin */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm hover:border-emerald-400/50 dark:hover:border-emerald-500/40 transition-all">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Available Margin</span>
              <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400">
                <WalletIcon className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100">
              {formatPaise(availableBalance)}
            </p>
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
              100% Risk-Free Starting Capital
            </span>
          </div>

          {/* Card 2: Blocked Margin */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm hover:border-amber-400/50 dark:hover:border-amber-500/40 transition-all">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Blocked Margin</span>
              <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400">
                <Layers className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100">
              {formatPaise(blockedMargin)}
            </p>
            <span className="text-[11px] text-slate-400">
              Active Order Reserve
            </span>
          </div>

          {/* Card 3: Open Positions */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm hover:border-cyan-400/50 dark:hover:border-cyan-500/40 transition-all">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Open Positions</span>
              <div className="p-1.5 rounded-lg bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800 text-cyan-600 dark:text-cyan-400">
                <TrendingUp className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100">
              {openPositionsCount} {openPositionsCount === 1 ? "Position" : "Positions"}
            </p>
            <span className="text-[11px] text-slate-400">
              Live Holdings & Derivatives
            </span>
          </div>

          {/* Card 4: Live Unrealized P&L */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm hover:border-indigo-400/50 dark:hover:border-indigo-500/40 transition-all">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Live Unrealized P&L</span>
              <div className={`p-1.5 rounded-lg border ${
                isPnlPositive
                  ? "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400"
                  : "bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400"
              }`}>
                <Activity className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className={`text-lg font-bold font-mono ${isPnlPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
              {isPnlPositive ? "+" : ""}{formatPaise(unrealizedPnl)}
            </p>
            <span className="text-[11px] text-slate-400">
              Real-time Portfolio MTM
            </span>
          </div>
        </div>

        {/* Segmented Tab Switcher */}
        <div className="flex items-center bg-slate-200/70 dark:bg-slate-950 p-1.5 rounded-2xl border border-slate-300/80 dark:border-slate-800 shadow-inner w-fit">
          <button
            type="button"
            onClick={() => setActiveTab("copilot")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === "copilot"
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-md shadow-slate-300/40 dark:shadow-black/40 scale-100"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Bot className={`w-4 h-4 ${activeTab === "copilot" ? "text-cyan-500" : ""}`} />
            <span>Behavioral Copilot & Audit</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("risklab")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === "risklab"
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-md shadow-slate-300/40 dark:shadow-black/40 scale-100"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <ShieldAlert className={`w-4 h-4 ${activeTab === "risklab" ? "text-indigo-500" : ""}`} />
            <span>Pre-Trade Risk Lab</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30 font-bold">
              Simulation
            </span>
          </button>
        </div>

        {/* Tab Content Panel */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-xl shadow-slate-200/50 dark:shadow-slate-950/60 p-4 sm:p-6 transition-all">
          {activeTab === "copilot" && (
            <TradeCopilot token={token} apiUrl={apiUrl} />
          )}

          {activeTab === "risklab" && (
            <PreTradeRiskLab token={token} apiUrl={apiUrl} />
          )}
        </div>
      </main>
    </div>
  );
}
