"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layers, PieChart } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import IndicesTickerStrip from "@/components/layout/IndicesTickerStrip";
import FnoExplorePage from "@/components/trading/FnoExplorePage";
import PaperOrderRecovery from "@/components/trading/PaperOrderRecovery";
import { useAccountWallet } from "@/hooks/useAccountWallet";
import { useAuthToken } from "@/hooks/useAuthToken";
import { formatPaise } from "@/lib/format";
import { apiFetch } from "@/lib/api";
import { isDerivativePosition } from "@/lib/fnoExplore";
import type { Portfolio } from "@/types";

export default function OptionsPage() {
  const [activeTab, setActiveTab] = useState<"explore" | "positions">("explore");

  const token = useAuthToken();
  const wallet = useAccountWallet();
  const portfolioQuery = useQuery<Portfolio>({
    queryKey: ["portfolio", token],
    queryFn: () => apiFetch<Portfolio>("/portfolio"),
    enabled: !!token,
    refetchInterval: token ? 5000 : false,
    retry: false,
  });

  const portfolio =
    token && !portfolioQuery.isError ? portfolioQuery.data : undefined;
  const positions = portfolio?.positions
    .filter(isDerivativePosition)
    .filter((p) => p.quantity !== 0);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 transition-colors duration-150">
      <Navbar
        availableBalancePaise={wallet.data?.available_balance_paise}
        unrealizedPnlPaise={portfolio?.unrealized_pnl_paise}
      />

      {/* HORIZONTAL INDICES STRIP (Screenshot 3) */}
      <IndicesTickerStrip />

      <main className="mx-auto w-full max-w-7xl min-w-0 flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
        {/* 1. EXPLORE DESK (Matches Screenshot 4) */}
        {activeTab === "explore" && (
          <FnoExplorePage
            active={activeTab === "explore"}
            onViewPositions={() => setActiveTab("positions")}
          />
        )}

        {/* 3. POSITIONS VIEW */}
        {activeTab === "positions" && (
          <div className="space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <PieChart className="h-5 w-5 text-cyan-700 dark:text-cyan-400" />
                Derivative positions ({positions?.length ?? "0"})
              </h2>
              <button
                onClick={() => setActiveTab("explore")}
                className="text-xs font-semibold text-cyan-700 hover:underline dark:text-cyan-300"
              >
                ← Back to F&O Explore
              </button>
            </div>

            <PaperOrderRecovery />

            {(!positions || positions.length === 0) ? (
              <div className="py-12 text-center space-y-3 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900/60">
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
                  onClick={() => setActiveTab("explore")}
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-md shadow-cyan-500/20 transition-all cursor-pointer"
                >
                  Explore F&O Contracts
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/60">
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
                    {positions.map((pos, idx) => {
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
