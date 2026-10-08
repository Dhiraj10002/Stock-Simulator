"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, PieChart } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import IndicesTickerStrip from "@/components/layout/IndicesTickerStrip";
import FnoExplorePage from "@/components/trading/FnoExplorePage";
import OptionChainDesk from "@/components/trading/OptionChainDesk";
import PaperOrderRecovery from "@/components/trading/PaperOrderRecovery";
import { useAccountWallet } from "@/hooks/useAccountWallet";
import { useAccountPortfolio } from "@/hooks/useAccountPortfolio";
import { useAuthToken } from "@/hooks/useAuthToken";
import { formatPaise } from "@/lib/format";
import { isDerivativePosition } from "@/lib/fnoExplore";

export default function OptionsPage() {
  const [tab, setTab] = useState<"chain" | "futures" | "positions">("chain");
  const token = useAuthToken();
  const wallet = useAccountWallet();
  const portfolioQuery = useAccountPortfolio();
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
        <div className="flex items-center justify-between">
          <div
            role="tablist"
            aria-label="Derivatives views"
            className="inline-flex rounded-xl bg-slate-200/70 p-1 dark:bg-slate-800/80"
          >
            <button
              id="chain-tab"
              type="button"
              role="tab"
              aria-selected={tab === "chain"}
              aria-controls="chain-panel"
              onClick={() => setTab("chain")}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                tab === "chain"
                  ? "bg-white text-cyan-800 shadow-xs dark:bg-slate-700 dark:text-cyan-200"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              Option Chain
            </button>
            <button
              id="futures-tab"
              type="button"
              role="tab"
              aria-selected={tab === "futures"}
              aria-controls="futures-panel"
              onClick={() => setTab("futures")}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                tab === "futures"
                  ? "bg-white text-cyan-800 shadow-xs dark:bg-slate-700 dark:text-cyan-200"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              Futures Desk
            </button>
            <button
              id="positions-tab"
              type="button"
              role="tab"
              aria-selected={tab === "positions"}
              aria-controls="positions-panel"
              onClick={() => setTab("positions")}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                tab === "positions"
                  ? "bg-white text-cyan-800 shadow-xs dark:bg-slate-700 dark:text-cyan-200"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              Positions ({positions?.length ?? "0"})
            </button>
          </div>
          <Link
            href="/orders"
            className="text-xs font-semibold text-slate-500 hover:text-cyan-700 dark:text-slate-400 dark:hover:text-cyan-400"
          >
            Order book →
          </Link>
        </div>

        {/* 1. L2 OPTION CHAIN DESK */}
        <div
          id="chain-panel"
          role="tabpanel"
          aria-labelledby="chain-tab"
          hidden={tab !== "chain"}
        >
          {tab === "chain" && <OptionChainDesk />}
        </div>

        {/* 2. EXPLORE DESK (Matches Screenshot 2) */}
        <div
          id="futures-panel"
          role="tabpanel"
          aria-labelledby="futures-tab"
          hidden={tab !== "futures"}
        >
          {tab === "futures" && (
            <FnoExplorePage
              active={tab === "futures"}
              onViewPositions={() => setTab("positions")}
            />
          )}
        </div>

        {/* 2. POSITIONS VIEW */}
        {tab === "positions" && (
          <div
            id="positions-panel"
            role="tabpanel"
            aria-label="Derivative positions"
            className="space-y-5"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-100">
                <PieChart
                  aria-hidden
                  className="h-5 w-5 text-cyan-700 dark:text-cyan-400"
                />
                Derivative positions ({positions?.length ?? "0"})
              </h2>
              <button
                onClick={() => setTab("futures")}
                className="text-xs font-bold text-cyan-700 hover:text-cyan-600 dark:text-cyan-400 dark:hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>← Back to F&O Explore</span>
              </button>
            </div>

            <PaperOrderRecovery />

            <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-slate-900/60 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                  Active Holdings
                </h3>
                <Link
                  href="/portfolio"
                  className="text-xs font-semibold text-cyan-700 underline dark:text-cyan-400"
                >
                  Full Portfolio Desk
                </Link>
              </div>

              {!positions ? (
                <p
                  role="status"
                  className="py-8 text-sm text-slate-600 dark:text-slate-400"
                >
                  {!token
                    ? "Sign in to view derivative positions."
                    : portfolioQuery.isError
                      ? "Portfolio unavailable. Exposure cannot be confirmed."
                      : "Loading derivative positions…"}
                </p>
              ) : positions.length === 0 ? (
                <div className="py-12 text-center space-y-3">
                  <h3 className="font-bold text-sm text-slate-700 dark:text-slate-300">
                    No open derivative positions
                  </h3>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    You currently do not have any open futures or options contracts. Explore the desk to trade index options and stock futures.
                  </p>
                  <button
                    onClick={() => setTab("futures")}
                    className="mt-3 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-md shadow-cyan-500/20 transition-all cursor-pointer"
                  >
                    Explore F&O Contracts
                  </button>
                </div>
              ) : (
                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {positions.map((pos) => {
                    const available =
                      pos.is_quote_available === true &&
                      pos.quote_status !== "UNAVAILABLE" &&
                      Number.isFinite(pos.current_price_paise) &&
                      pos.current_price_paise > 0;
                    const pnl =
                      available && Number.isFinite(pos.unrealized_pnl_paise)
                        ? pos.unrealized_pnl_paise
                        : undefined;
                    return (
                      <article
                        key={pos.uuid || `${pos.symbol}:${pos.product}`}
                        className="min-w-0 rounded-xl border border-slate-200 p-4 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30"
                      >
                        <h3 className="break-all font-bold text-slate-900 dark:text-slate-100">
                          {pos.symbol}
                        </h3>
                        <p className="mt-1 text-xs text-slate-500 font-mono">
                          {pos.product} · Qty {pos.quantity}
                        </p>
                        <dl className="mt-4 space-y-3 text-xs">
                          {[
                            [
                              "Average price",
                              formatPaise(pos.average_price_paise),
                            ],
                            [
                              "Last price",
                              available
                                ? formatPaise(pos.current_price_paise)
                                : "Unavailable",
                            ],
                            [
                              "Unrealized P&L",
                              pnl === undefined
                                ? "Unavailable"
                                : formatPaise(pnl),
                            ],
                          ].map(([label, value]) => (
                            <div
                              key={label}
                              className="flex flex-wrap justify-between gap-2"
                            >
                              <dt className="text-slate-500">
                                {label}
                              </dt>
                              <dd className="font-bold tabular-nums">
                                {value}
                              </dd>
                            </div>
                          ))}
                        </dl>
                        {available &&
                          (pos.is_quote_stale ||
                            pos.quote_status !== "FRESH") && (
                            <p className="mt-3 text-xs text-amber-800 dark:text-amber-300">
                              Last available valuation
                            </p>
                          )}
                        <Link
                          href="/portfolio"
                          className="mt-4 inline-flex items-center text-xs font-bold text-cyan-700 underline dark:text-cyan-400"
                        >
                          Review / close position →
                        </Link>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
