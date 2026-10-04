"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Layers, PieChart } from "lucide-react";
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
  const [tab, setTab] = useState<"futures" | "positions">("futures");
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
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Navbar
        availableBalancePaise={wallet.data?.available_balance_paise}
        unrealizedPnlPaise={portfolio?.unrealized_pnl_paise}
      />
      <IndicesTickerStrip />
      <main className="mx-auto w-full max-w-7xl min-w-0 flex-1 space-y-4 p-4 sm:p-6 lg:p-8">
        <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-cyan-800 dark:text-cyan-300">
              Paper trading · derivatives
            </p>
            <h1 className="mt-1 flex items-center gap-2 text-xl font-bold sm:text-2xl">
              <Layers
                aria-hidden
                className="h-6 w-6 shrink-0 text-cyan-700 dark:text-cyan-400"
              />
              F&O trading
            </h1>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              Real market discovery and futures paper trading with Angel One
              quotes.
            </p>
          </div>
          <Link
            href="/orders"
            className="flex min-h-11 items-center gap-2 text-sm font-semibold text-cyan-800 dark:text-cyan-300"
          >
            Order book
            <ArrowRight aria-hidden className="h-4 w-4" />
          </Link>
        </header>
        <div
          role="tablist"
          aria-label="Derivatives views"
          onKeyDown={(e) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
              return;
            e.preventDefault();
            const next =
              e.key === "Home"
                ? "futures"
                : e.key === "End"
                  ? "positions"
                  : tab === "futures"
                    ? "positions"
                    : "futures";
            setTab(next);
            document.getElementById(`${next}-tab`)?.focus();
          }}
          className="flex w-fit max-w-full gap-1 rounded-xl bg-slate-200 p-1 text-sm dark:bg-slate-800"
        >
          <button
            id="futures-tab"
            role="tab"
            aria-selected={tab === "futures"}
            aria-controls="futures-panel"
            tabIndex={tab === "futures" ? 0 : -1}
            onClick={() => setTab("futures")}
            className={`min-h-11 rounded-lg px-4 font-semibold ${tab === "futures" ? "bg-white text-cyan-800 shadow-sm dark:bg-slate-700 dark:text-cyan-200" : "text-slate-700 dark:text-slate-300"}`}
          >
            Explore
          </button>
          <button
            id="positions-tab"
            role="tab"
            aria-selected={tab === "positions"}
            aria-controls="positions-panel"
            tabIndex={tab === "positions" ? 0 : -1}
            onClick={() => setTab("positions")}
            className={`min-h-11 rounded-lg px-4 font-semibold ${tab === "positions" ? "bg-white text-cyan-800 shadow-sm dark:bg-slate-700 dark:text-cyan-200" : "text-slate-700 dark:text-slate-300"}`}
          >
            Positions ({positions?.length ?? "—"})
          </button>
        </div>
        <div
          id="futures-panel"
          role="tabpanel"
          aria-labelledby="futures-tab"
          hidden={tab !== "futures"}
        >
          <FnoExplorePage
            active={tab === "futures"}
            onViewPositions={() => setTab("positions")}
          />
        </div>
        {tab === "positions" && (
          <div
            id="positions-panel"
            role="tabpanel"
            aria-labelledby="positions-tab"
            className="space-y-5"
          >
            <PaperOrderRecovery />
            <section className="rounded-2xl border border-slate-200 bg-[#ffffff] p-4 sm:p-6 dark:border-slate-800 dark:bg-[#0f172a]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-lg font-bold">
                  <PieChart
                    aria-hidden
                    className="h-5 w-5 text-cyan-700 dark:text-cyan-400"
                  />
                  Derivative positions ({positions?.length ?? "—"})
                </h2>
                <Link
                  href="/portfolio"
                  className="text-sm font-semibold text-cyan-800 underline dark:text-cyan-300"
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
                <div className="py-10 text-center">
                  <h3 className="font-semibold">
                    No open derivative positions
                  </h3>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                    Choose a current futures contract to start a paper trade.
                  </p>
                  <button
                    onClick={() => setTab("futures")}
                    className="mt-4 min-h-11 rounded-xl bg-cyan-700 px-4 text-sm font-semibold text-white"
                  >
                    Explore futures
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
                        className="min-w-0 rounded-xl border border-slate-200 p-4 dark:border-slate-700"
                      >
                        <h3 className="break-all font-semibold">
                          {pos.symbol}
                        </h3>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                          {pos.product} · Qty {pos.quantity}
                        </p>
                        <dl className="mt-4 space-y-3 text-sm">
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
                              <dt className="text-slate-600 dark:text-slate-400">
                                {label}
                              </dt>
                              <dd className="font-semibold tabular-nums">
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
                          className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-cyan-800 underline dark:text-cyan-300"
                        >
                          Review / close position
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
