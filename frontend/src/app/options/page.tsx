"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import Navbar from "@/components/layout/Navbar";
import FnoExplorePage from "@/components/trading/FnoExplorePage";
import OptionChainDesk from "@/components/trading/OptionChainDesk";
import {
  Layers,
  TrendingUp,
  ArrowRight,
  Compass,
  TableProperties,
  PieChart,
  Zap,
} from "lucide-react";
import { formatPaise } from "@/lib/format";
import type { Portfolio, Wallet, ApiResponse } from "@/types";

export default function OptionsPage() {
  // Navigation tabs: Explore (Groww style hub) vs Option Chain (Greek ladder) vs Positions
  const [activeFnoTab, setActiveFnoTab] = useState<"explore" | "chain" | "positions">("explore");
  const [chainUnderlying, setChainUnderlying] = useState<string>("NIFTY");

  const [token] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("auth_token") || "";
    }
    return "";
  });

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1";

  // 1. Fetch Wallet for Navbar available balance
  const { data: wallet } = useQuery<Wallet>({
    queryKey: ["wallet"],
    queryFn: async () => {
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
    },
    refetchInterval: 5000,
  });

  // 2. Fetch Portfolio for Navbar unrealized PnL & Positions
  const { data: portfolio } = useQuery<Portfolio>({
    queryKey: ["portfolio"],
    queryFn: async () => {
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
    },
    refetchInterval: 5000,
  });

  const fnoPositions = (portfolio?.positions ?? []).filter(
    (p) => p.product === "FNO" || p.product === "INTRADAY"
  );

  const handleSelectOptionChain = (symbol: string) => {
    setChainUnderlying(symbol);
    setActiveFnoTab("chain");
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-150">
      <Navbar
        availableBalancePaise={wallet?.available_balance_paise}
        unrealizedPnlPaise={portfolio?.unrealized_pnl_paise}
      />

      <main className="flex-1 max-w-[1720px] w-full mx-auto p-3 sm:p-5 lg:p-6 space-y-6">
        {/* Header Title & Sub-navigation bar (matching Groww Explore / Positions / Orders structure) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-cyan-100 text-cyan-800 dark:bg-cyan-950/80 dark:text-cyan-400 border border-cyan-300 dark:border-cyan-800">
                FUTURES & OPTIONS DESK
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                NSE Derivatives Trading Hub
              </span>
            </div>

            <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight mt-1 flex items-center gap-2">
              <Layers className="w-6 h-6 text-cyan-600 dark:text-cyan-400" />
              <span>F&O Derivatives Hub</span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Live index & stock futures, options strike matrix, Black-Scholes Greeks, and multi-leg strategy execution.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* View Switcher Tabs: Explore | Option Chain | Positions */}
            <div className="flex items-center gap-1 bg-slate-200/80 dark:bg-slate-800 p-1 rounded-xl text-xs font-semibold">
              <button
                onClick={() => setActiveFnoTab("explore")}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeFnoTab === "explore"
                    ? "bg-white dark:bg-slate-700 text-cyan-700 dark:text-cyan-300 shadow-xs font-bold"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <Compass className="w-3.5 h-3.5" />
                <span>Explore</span>
              </button>

              <button
                onClick={() => setActiveFnoTab("chain")}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeFnoTab === "chain"
                    ? "bg-white dark:bg-slate-700 text-cyan-700 dark:text-cyan-300 shadow-xs font-bold"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <TableProperties className="w-3.5 h-3.5" />
                <span>Option Chain</span>
              </button>

              <button
                onClick={() => setActiveFnoTab("positions")}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeFnoTab === "positions"
                    ? "bg-white dark:bg-slate-700 text-cyan-700 dark:text-cyan-300 shadow-xs font-bold"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <PieChart className="w-3.5 h-3.5" />
                <span>Positions ({fnoPositions.length})</span>
              </button>
            </div>

            <Link
              href="/stocks"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors"
            >
              <TrendingUp className="w-3.5 h-3.5 text-cyan-500" />
              <span>Explore Stocks</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* 1. EXPLORE TAB (User requested full F&O Explore desk) */}
        {activeFnoTab === "explore" && (
          <FnoExplorePage onSelectOptionChain={handleSelectOptionChain} />
        )}

        {/* 2. OPTION CHAIN TAB (Interactive strike ladder & Greek analytics) */}
        {activeFnoTab === "chain" && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-xs">
              <span className="text-cyan-800 dark:text-cyan-300 font-semibold flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                Viewing live Option Chain for <strong className="font-bold underline">{chainUnderlying}</strong>
              </span>
              <button
                onClick={() => setActiveFnoTab("explore")}
                className="text-cyan-700 dark:text-cyan-400 hover:underline font-bold cursor-pointer"
              >
                ← Back to F&O Explore
              </button>
            </div>
            <OptionChainDesk initialUnderlying={chainUnderlying} />
          </div>
        )}

        {/* 3. POSITIONS TAB (Derivative contracts quick desk) */}
        {activeFnoTab === "positions" && (
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <PieChart className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                Active F&O Derivative Positions ({fnoPositions.length})
              </h2>
              <Link
                href="/portfolio"
                className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1"
              >
                <span>Full Portfolio Desk</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {fnoPositions.length === 0 ? (
              <div className="py-12 text-center space-y-3">
                <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                  <Layers className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                    No Open Derivative Positions
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    You currently do not have any open futures or options contracts. Explore the desk to trade index options and stock futures.
                  </p>
                </div>
                <button
                  onClick={() => setActiveFnoTab("explore")}
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-md shadow-cyan-500/20 transition-all cursor-pointer"
                >
                  Explore F&O Contracts
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase font-bold tracking-wider text-slate-400 bg-slate-50/50 dark:bg-slate-900/50">
                      <th className="py-2.5 px-3">Contract</th>
                      <th className="py-2.5 px-3">Product</th>
                      <th className="py-2.5 px-3 text-right">Qty</th>
                      <th className="py-2.5 px-3 text-right">Avg Price</th>
                      <th className="py-2.5 px-3 text-right">LTP</th>
                      <th className="py-2.5 px-3 text-right">P&L</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {fnoPositions.map((pos, idx) => {
                      const pnl = pos.unrealized_pnl_paise ?? 0;
                      const isGain = pnl >= 0;
                      return (
                        <tr
                          key={idx}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-3 px-3 font-bold text-slate-900 dark:text-slate-100">
                            {pos.symbol}
                          </td>
                          <td className="py-3 px-3">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-100 dark:bg-cyan-950/80 text-cyan-800 dark:text-cyan-400">
                              {pos.product}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-semibold">
                            {pos.quantity}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-tabular">
                            {formatPaise(pos.average_price_paise)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-tabular">
                            {formatPaise(pos.current_price_paise ?? 0)}
                          </td>
                          <td
                            className={`py-3 px-3 text-right font-black font-tabular ${
                              isGain
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-rose-600 dark:text-rose-400"
                            }`}
                          >
                            {formatPaise(pnl)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
