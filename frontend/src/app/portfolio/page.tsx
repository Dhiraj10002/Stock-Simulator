"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Navbar from "@/components/layout/Navbar";
import PositionsTable from "@/components/terminal/PositionsTable";
import {
  PieChart,
  SlidersHorizontal,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Wallet as WalletIcon,
  RefreshCw,
  Layers,
} from "lucide-react";
import { formatPaise, formatPercent } from "@/lib/format";
import type { Portfolio, Wallet, ApiResponse, Position } from "@/types";

export default function PortfolioPage() {
  const queryClient = useQueryClient();
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
    queryKey: ["portfolio"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/portfolio`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json: ApiResponse<Portfolio> = await res.json();
      return json.data || {
        invested_value_paise: 0,
        current_value_paise: 0,
        unrealized_pnl_paise: 0,
        positions: [],
      };
    },
    refetchInterval: 5000,
  });

  // 2. Fetch Wallet via TanStack Query
  const { data: wallet } = useQuery<Wallet>({
    queryKey: ["wallet"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/wallet`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json: ApiResponse<Wallet> = await res.json();
      return json.data || {
        uuid: "",
        cash_balance_paise: 100000000,
        available_balance_paise: 100000000,
        blocked_paise: 0,
      };
    },
    refetchInterval: 5000,
  });

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

  const investedPaise = portfolio?.invested_value_paise ?? 0;
  const currentPaise = portfolio?.current_value_paise ?? 0;
  const pnlPaise = portfolio?.unrealized_pnl_paise ?? 0;
  const pnlPercent = investedPaise > 0 ? (pnlPaise / investedPaise) * 100 : 0;
  const isProfit = pnlPaise >= 0;

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Navbar
        availableBalancePaise={wallet?.available_balance_paise}
        unrealizedPnlPaise={pnlPaise}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Header Title & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
              <PieChart className="w-6 h-6 text-cyan-400" />
              Portfolio & Positions
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Mark-to-market valuations across Delivery (CNC), Intraday (MIS), and F&O derivatives.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                void refetchPortfolio();
              }}
              className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
              title="Refresh Portfolio"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            <Link
              href="/trade"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-md shadow-cyan-500/20 transition-all hover:scale-105"
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span>Trading Terminal</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Top KPI Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Current Portfolio Valuation */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Total Valuation
            </span>
            <div className="text-xl font-bold font-tabular text-slate-100">
              {formatPaise(currentPaise)}
            </div>
            <span className="text-[10px] text-slate-500">Live mark-to-market value</span>
          </div>

          {/* Invested Capital */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Invested Capital
            </span>
            <div className="text-xl font-bold font-tabular text-slate-200">
              {formatPaise(investedPaise)}
            </div>
            <span className="text-[10px] text-slate-500">Cost basis across all holdings</span>
          </div>

          {/* Unrealized PnL */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Total Unrealized P&L
            </span>
            <div className="flex items-center gap-2">
              {isProfit ? (
                <TrendingUp className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : (
                <TrendingDown className="w-5 h-5 text-rose-400 shrink-0" />
              )}
              <span
                className={`text-xl font-bold font-tabular ${
                  isProfit ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {formatPaise(pnlPaise)}
              </span>
              <span
                className={`text-[11px] font-bold px-1.5 py-0.2 rounded font-tabular ${
                  isProfit
                    ? "bg-emerald-950/60 text-emerald-400 border border-emerald-800/40"
                    : "bg-rose-950/60 text-rose-400 border border-rose-800/40"
                }`}
              >
                {formatPercent(pnlPercent)}
              </span>
            </div>
            <span className="text-[10px] text-slate-500">Net unrealized return</span>
          </div>

          {/* Available Margin */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <WalletIcon className="w-3.5 h-3.5 text-cyan-400" />
              Available Margin
            </span>
            <div className="text-xl font-bold font-tabular text-cyan-300">
              {formatPaise(wallet?.available_balance_paise ?? 100000000)}
            </div>
            <span className="text-[10px] text-slate-500">
              Blocked: {formatPaise(wallet?.blocked_paise ?? 0)}
            </span>
          </div>
        </div>

        {/* Positions Table Workspace */}
        <div className="rounded-xl bg-slate-900/40 border border-slate-800 overflow-hidden shadow-xl">
          <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/70 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              <h2 className="font-bold text-sm text-slate-100">Active Positions Desk</h2>
              <span className="text-[11px] px-2 py-0.5 rounded-full font-mono bg-slate-800 text-slate-400 border border-slate-700">
                {portfolio?.positions?.length ?? 0}
              </span>
            </div>
          </div>

          {loadingPortfolio ? (
            <div className="p-16 text-center text-slate-500">
              <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-xs">Loading positions from exchange ledger…</p>
            </div>
          ) : (
            <PositionsTable
              positions={portfolio?.positions ?? []}
              onSquareOff={handleSquareOff}
              onSquareOffAllMIS={handleSquareOffAllMIS}
            />
          )}
        </div>
      </main>
    </div>
  );
}
