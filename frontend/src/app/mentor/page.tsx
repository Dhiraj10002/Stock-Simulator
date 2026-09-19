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

  // Server state via TanStack Query
  const { data: wallet } = useQuery<Wallet>({
    queryKey: ["wallet", token],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/wallet`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to fetch wallet");
      const json: ApiResponse<Wallet> = await res.json();
      return json.data;
    },
    staleTime: 10_000,
  });

  const { data: portfolio } = useQuery<Portfolio>({
    queryKey: ["portfolio", token],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/portfolio`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to fetch portfolio");
      const json: ApiResponse<Portfolio> = await res.json();
      return json.data;
    },
    staleTime: 15_000,
  });

  const unrealizedPnl = portfolio?.unrealized_pnl_paise ?? 0;
  const isPnlPositive = unrealizedPnl >= 0;
  const openPositionsCount = portfolio?.positions?.length ?? 0;

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
                <BrainCircuit className="w-6 h-6 text-cyan-400" />
                AI Behavioral Copilot & Mentor
              </h1>
              <span className="px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                Gemini Engine
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Real-time trading discipline letter grades (A+ to F), emotional revenge-trading detection, and pre-trade hypothetical risk modeling.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href="/analytics"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs font-medium transition-colors"
            >
              <BarChart3 className="w-3.5 h-3.5 text-slate-400" />
              <span>Performance</span>
            </Link>
            <Link
              href="/trade"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-colors"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Open Terminal</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Live Context Metrics Ribbon */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
              <WalletIcon className="w-3.5 h-3.5 text-emerald-400" />
              <span>Available Margin</span>
            </div>
            <p className="text-base font-bold text-slate-100">
              {wallet ? formatPaise(wallet.available_balance_paise) : "--"}
            </p>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              <span>Blocked Margin</span>
            </div>
            <p className="text-base font-bold text-slate-100">
              {wallet ? formatPaise(wallet.blocked_paise) : "--"}
            </p>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
              <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
              <span>Open Positions</span>
            </div>
            <p className="text-base font-bold text-slate-100">
              {openPositionsCount} {openPositionsCount === 1 ? "Active" : "Active"}
            </p>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
              <TrendingUp className={`w-3.5 h-3.5 ${isPnlPositive ? "text-emerald-400" : "text-rose-400"}`} />
              <span>Live Unrealized P&L</span>
            </div>
            <p className={`text-base font-bold ${isPnlPositive ? "text-emerald-400" : "text-rose-400"}`}>
              {portfolio ? `${isPnlPositive ? "+" : ""}${formatPaise(unrealizedPnl)}` : "--"}
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab("copilot")}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === "copilot"
                ? "border-cyan-400 text-cyan-300 bg-cyan-500/5"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Bot className="w-4 h-4 text-cyan-400" />
            <span>Behavioral Copilot & Audit</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("risklab")}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === "risklab"
                ? "border-indigo-400 text-indigo-300 bg-indigo-500/5"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <ShieldAlert className="w-4 h-4 text-indigo-400" />
            <span>Pre-Trade Risk Lab</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold">
              Simulation
            </span>
          </button>
        </div>

        {/* Tab Content Panel */}
        <div>
          {activeTab === "copilot" && (
            <div className="p-4 sm:p-6 rounded-2xl bg-slate-900/60 border border-slate-800 min-h-[620px]">
              <TradeCopilot token={token} apiUrl={apiUrl} />
            </div>
          )}

          {activeTab === "risklab" && (
            <div className="p-4 sm:p-6 rounded-2xl bg-slate-900/60 border border-slate-800">
              <PreTradeRiskLab token={token} apiUrl={apiUrl} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
