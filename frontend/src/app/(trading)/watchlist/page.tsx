"use client";
import { sessionFetch } from "@/lib/api";
import { useAccountWallet } from "@/hooks/useAccountWallet";
import { useRequireAuth } from "@/hooks/useRequireAuth";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import Navbar from "@/components/layout/Navbar";
import WatchlistManagerDesk from "@/components/watchlist/WatchlistManagerDesk";
import { Bookmark, TrendingUp, ArrowRight } from "lucide-react";
import { API_URL } from "@/lib/api";
import type { Portfolio, ApiResponse } from "@/types";

export default function WatchlistPage() {
  const token = useRequireAuth("/watchlist");

  const apiUrl = API_URL;

  // 1. Fetch Wallet for Navbar available balance
  const { data: wallet } = useAccountWallet();

  // 2. Fetch Portfolio for Navbar unrealized PnL
  const { data: portfolio } = useQuery<Portfolio>({
    queryKey: ["portfolio", token],
    queryFn: async () => {
      if (!token) {
        return {
          invested_value_paise: 0,
          current_value_paise: 0,
          unrealized_pnl_paise: 0,
          positions: [],
        };
      }
      try {
        const res = await sessionFetch(`${apiUrl}/portfolio`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          return {
            invested_value_paise: 0,
            current_value_paise: 0,
            unrealized_pnl_paise: 0,
            positions: [],
          };
        }
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
    enabled: !!token,
    refetchInterval: token ? 5000 : false,
  });

  if (!token) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
        <Navbar />
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
          <div className="p-16 text-center text-slate-500">
            <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs">Redirecting to login…</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
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
              Organize, search, and monitor custom market groups across NSE & BSE with real-time market sync.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/stocks/ITC"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white font-bold text-xs shadow-md shadow-cyan-600/20 transition-all hover:scale-105 active:scale-95"
            >
              <TrendingUp className="w-4 h-4 text-white" />
              <span>Explore Stocks</span>
              <ArrowRight className="w-3.5 h-3.5 text-white" />
            </Link>
          </div>
        </div>

        {/* Watchlist Manager Workspace */}
        <WatchlistManagerDesk token={token} />
      </main>
    </div>
  );
}
