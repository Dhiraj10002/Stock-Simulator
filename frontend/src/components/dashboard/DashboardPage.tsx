"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import Navbar from "@/components/layout/Navbar";
import MarketIndicesCard, { IndexData } from "@/components/market/MarketIndicesCard";
import MarketMovers from "@/components/market/MarketMovers";
import NewsFeed from "@/components/market/NewsFeed";
import {
  SlidersHorizontal,
  PieChart,
  BarChart2,
  BrainCircuit,
  ArrowRight,
  Zap,
  TrendingUp,
  TrendingDown,
  Wallet as WalletIcon,
  Layers,
  Bookmark,
} from "lucide-react";
import { formatPaise, formatPercent } from "@/lib/format";
import type { Portfolio, Wallet, ApiResponse } from "@/types";

const MAJOR_INDICES: IndexData[] = [
  {
    symbol: "NIFTY 50",
    name: "NIFTY 50",
    exchange: "NSE",
    value: 25378.4,
    change: 124.6,
    changePercent: 0.49,
    sparkline: [25250, 25280, 25240, 25310, 25340, 25310, 25378],
  },
  {
    symbol: "SENSEX",
    name: "SENSEX",
    exchange: "BSE",
    value: 82890.94,
    change: 398.2,
    changePercent: 0.48,
    sparkline: [82500, 82620, 82550, 82740, 82810, 82750, 82890],
  },
  {
    symbol: "BANKNIFTY",
    name: "BANK NIFTY",
    exchange: "NSE",
    value: 51942.3,
    change: 312.45,
    changePercent: 0.61,
    sparkline: [51600, 51680, 51620, 51800, 51890, 51820, 51942],
  },
  {
    symbol: "FINNIFTY",
    name: "FIN NIFTY",
    exchange: "NSE",
    value: 23875.1,
    change: 115.8,
    changePercent: 0.49,
    sparkline: [23750, 23780, 23740, 23810, 23840, 23820, 23875],
  },
  {
    symbol: "MIDCPNIFTY",
    name: "MIDCAP NIFTY",
    exchange: "NSE",
    value: 13180.5,
    change: -24.3,
    changePercent: -0.18,
    sparkline: [13220, 13200, 13210, 13170, 13190, 13160, 13180],
  },
];

export default function DashboardPage() {
  const [token] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("auth_token") || "";
    }
    return "";
  });

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1";

  // 1. Fetch Portfolio via TanStack Query
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
    refetchInterval: 10000,
  });

  // 2. Fetch Wallet via TanStack Query
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
    refetchInterval: 10000,
  });

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
        {/* Top Market Indices Horizontal Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {MAJOR_INDICES.map((idx) => (
            <MarketIndicesCard key={idx.symbol} index={idx} />
          ))}
        </div>

        {/* Hero Banner & Portfolio Quick Glance Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Welcome & Launch Platform */}
          <div className="lg:col-span-2 relative rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900/90 to-cyan-950/40 border border-slate-800 p-6 sm:p-8 overflow-hidden shadow-2xl flex flex-col justify-between space-y-4">
            <div className="absolute right-0 top-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 space-y-3 max-w-xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 text-xs font-semibold">
                <Zap className="w-3.5 h-3.5" />
                <span>Zerodha & Groww Engineered Paper Trading</span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                Institutional Trading Sim with{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400">
                  Zero Financial Risk
                </span>
              </h1>

              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Practice intraday MIS, delivery CNC, and F&O derivatives with ₹10 Lakhs virtual capital,
                real-time NSE Level-2 depth, target/stop-loss OCO brackets, and AI behavioral audits.
              </p>
            </div>

            <div className="relative z-10 pt-2 flex flex-wrap items-center gap-3">
              <Link
                href="/trade"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs sm:text-sm shadow-lg shadow-cyan-500/25 transition-all hover:scale-105"
              >
                <SlidersHorizontal className="w-4 h-4" />
                <span>Launch Pro Terminal</span>
                <ArrowRight className="w-4 h-4" />
              </Link>

              <Link
                href="/portfolio"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-200 font-semibold text-xs sm:text-sm transition-colors"
              >
                <PieChart className="w-4 h-4 text-cyan-400" />
                <span>Portfolio Desk</span>
              </Link>

              <Link
                href="/analytics"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-200 font-semibold text-xs sm:text-sm transition-colors"
              >
                <BarChart2 className="w-4 h-4 text-cyan-400" />
                <span>P&L Calendar</span>
              </Link>
            </div>
          </div>

          {/* Portfolio & Margin Quick Glance Widget */}
          <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-6 flex flex-col justify-between shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <PieChart className="w-4 h-4 text-cyan-400" />
                Your Account Glance
              </span>
              <Link
                href="/portfolio"
                className="text-[11px] font-semibold text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5"
              >
                <span>Full Desk</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            <div className="space-y-4">
              {/* Portfolio Valuation */}
              <div>
                <span className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
                  Portfolio Current Valuation
                </span>
                <div className="text-2xl font-black font-tabular text-slate-100 mt-0.5">
                  {formatPaise(currentPaise)}
                </div>
              </div>

              {/* Unrealized P&L */}
              <div>
                <span className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
                  Unrealized P&L
                </span>
                <div className="flex items-center gap-2 mt-0.5">
                  {isProfit ? (
                    <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <span
                    className={`text-lg font-extrabold font-tabular ${
                      isProfit ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {formatPaise(pnlPaise)}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.2 rounded font-tabular ${
                      isProfit
                        ? "bg-emerald-950/60 text-emerald-400 border border-emerald-800/40"
                        : "bg-rose-950/60 text-rose-400 border border-rose-800/40"
                    }`}
                  >
                    {formatPercent(pnlPercent)}
                  </span>
                </div>
              </div>

              {/* Available Margin */}
              <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1">
                    <WalletIcon className="w-3 h-3 text-cyan-400" />
                    Available Margin
                  </span>
                  <span className="text-sm font-bold font-tabular text-cyan-300">
                    {formatPaise(wallet?.available_balance_paise ?? 100000000)}
                  </span>
                </div>

                <div className="text-right">
                  <span className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1 justify-end">
                    <Layers className="w-3 h-3 text-slate-400" />
                    Open Positions
                  </span>
                  <span className="text-sm font-bold font-tabular text-slate-200">
                    {portfolio?.positions?.length ?? 0} active
                  </span>
                </div>
              </div>
            </div>

            <Link
              href="/trade"
              className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs text-center border border-slate-700 transition-colors mt-2 block"
            >
              Enter Trading Desk →
            </Link>
          </div>
        </div>

        {/* 2-Column Discovery & Intelligence Split View */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[460px]">
          {/* Left (7 cols): Market Movers (Gainers, Losers, Most Active) */}
          <div className="lg:col-span-7">
            <MarketMovers />
          </div>

          {/* Right (5 cols): Live News & Sentiment Stream */}
          <div className="lg:col-span-5">
            <NewsFeed token={token} apiUrl={apiUrl} limit={20} />
          </div>
        </div>

        {/* Quick Module Navigation Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
          <Link
            href="/trade"
            className="p-5 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800 hover:border-cyan-500/40 transition-all group flex flex-col justify-between space-y-3"
          >
            <div className="w-10 h-10 rounded-lg bg-cyan-950/60 border border-cyan-500/30 flex items-center justify-center text-cyan-400 group-hover:scale-110 transition-transform">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base text-slate-100">Trading Terminal</h2>
              <p className="text-xs text-slate-400 mt-1">
                Full-featured candlestick chart, Level-2 depth, bracket orders, and option chain.
              </p>
            </div>
            <span className="text-xs text-cyan-400 font-semibold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
              Open terminal →
            </span>
          </Link>

          <Link
            href="/watchlist"
            className="p-5 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800 hover:border-cyan-500/40 transition-all group flex flex-col justify-between space-y-3"
          >
            <div className="w-10 h-10 rounded-lg bg-amber-950/60 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
              <Bookmark className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base text-slate-100">Watchlists Manager</h2>
              <p className="text-xs text-slate-400 mt-1">
                Multi-watchlist organization, fast equity search, and custom portfolio baskets.
              </p>
            </div>
            <span className="text-xs text-cyan-400 font-semibold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
              Manage lists →
            </span>
          </Link>

          <Link
            href="/analytics"
            className="p-5 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800 hover:border-cyan-500/40 transition-all group flex flex-col justify-between space-y-3"
          >
            <div className="w-10 h-10 rounded-lg bg-purple-950/60 border border-purple-500/30 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform">
              <BarChart2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base text-slate-100">Console & Analytics</h2>
              <p className="text-xs text-slate-400 mt-1">
                Monthly P&L calendar heatmap, statutory contract notes, and trade journaling.
              </p>
            </div>
            <span className="text-xs text-cyan-400 font-semibold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
              Explore console →
            </span>
          </Link>

          <Link
            href="/mentor"
            className="p-5 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800 hover:border-cyan-500/40 transition-all group flex flex-col justify-between space-y-3"
          >
            <div className="w-10 h-10 rounded-lg bg-rose-950/60 border border-rose-500/30 flex items-center justify-center text-rose-400 group-hover:scale-110 transition-transform">
              <BrainCircuit className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base text-slate-100">AI Trade Copilot</h2>
              <p className="text-xs text-slate-400 mt-1">
                Pre-trade risk checks, institutional letter grades (A+ to F), and discipline audits.
              </p>
            </div>
            <span className="text-xs text-cyan-400 font-semibold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
              Chat with mentor →
            </span>
          </Link>
        </div>
      </main>
    </div>
  );
}
