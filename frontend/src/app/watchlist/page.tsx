"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import Navbar from "@/components/layout/Navbar";
import WatchlistManagerDesk from "@/components/watchlist/WatchlistManagerDesk";
import { Bookmark, TrendingUp, ArrowRight } from "lucide-react";
import type { Portfolio, Wallet, ApiResponse } from "@/types";

export default function WatchlistPage() {
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

  // 2. Fetch Portfolio for Navbar unrealized PnL
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

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-150">
      <Navbar
        availableBalancePaise={wallet?.available_balance_paise}
        unrealizedPnlPaise={portfolio?.unrealized_pnl_paise}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Header Title & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Bookmark className="w-6 h-6 text-cyan-600 dark:text-cyan-400" />
              Watchlist Manager
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Organize, search, and monitor custom market groups across NSE & BSE with two-way terminal sync.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/stocks/ITC"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 font-bold text-xs shadow-md shadow-cyan-500/20 transition-all hover:scale-105"
            >
              <TrendingUp className="w-4 h-4" />
              <span>Explore Stocks</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Watchlist Manager Workspace */}
        <WatchlistManagerDesk />
      </main>
    </div>
  );
}
