"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  TrendingUp,
  TrendingDown,
  Search,
  ArrowUpDown,
  Filter,
  ExternalLink,
  Plus,
  Minus,
  Sparkles,
  Layers,
  ArrowUpRight,
} from "lucide-react";
import { formatPaise, formatPercent } from "@/lib/format";
import type { HoldingItem } from "./PortfolioTypes";

interface PortfolioHoldingsTableProps {
  holdings: HoldingItem[];
  onBuyMore?: (symbol: string) => void;
  onExitHolding?: (holding: HoldingItem) => void;
}

type SortField = "value" | "pnl" | "dayChange" | "name";
type SortOrder = "asc" | "desc";

export default function PortfolioHoldingsTable({
  holdings = [],
  onBuyMore,
  onExitHolding,
}: PortfolioHoldingsTableProps) {
  const [search, setSearch] = useState("");
  const [sectorFilter, setSectorFilter] = useState<string>("ALL");
  const [sortField, setSortField] = useState<SortField>("value");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // Distinct sectors
  const sectors = useMemo(() => {
    const set = new Set<string>();
    holdings.forEach((h) => set.add(h.sector));
    return ["ALL", ...Array.from(set)];
  }, [holdings]);

  // Filtered & Sorted
  const filteredHoldings = useMemo(() => {
    const q = search.trim().toUpperCase();
    return holdings
      .filter((h) => {
        const matchesQuery =
          !q || h.symbol.toUpperCase().includes(q) || h.name.toUpperCase().includes(q);
        const matchesSector = sectorFilter === "ALL" || h.sector === sectorFilter;
        return matchesQuery && matchesSector;
      })
      .sort((a, b) => {
        let diff = 0;
        if (sortField === "value") diff = a.currentValuePaise - b.currentValuePaise;
        else if (sortField === "pnl") diff = a.unrealizedPnlPaise - b.unrealizedPnlPaise;
        else if (sortField === "dayChange") diff = a.dayChangePercent - b.dayChangePercent;
        else if (sortField === "name") diff = a.symbol.localeCompare(b.symbol);
        return sortOrder === "asc" ? diff : -diff;
      });
  }, [holdings, search, sectorFilter, sortField, sortOrder]);

  // Aggregate stats
  const totals = useMemo(() => {
    let invested = 0;
    let current = 0;
    let pnl = 0;
    let dayChange = 0;

    filteredHoldings.forEach((h) => {
      invested += h.investedValuePaise;
      current += h.currentValuePaise;
      pnl += h.unrealizedPnlPaise;
      dayChange += h.dayChangePaise;
    });

    const pnlPercent = invested > 0 ? (pnl / invested) * 100 : 0;
    const dayPercent = invested > 0 ? (dayChange / invested) * 100 : 0;

    return { invested, current, pnl, pnlPercent, dayChange, dayPercent };
  }, [filteredHoldings]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  return (
    <div className="space-y-4">
      {/* Search & Sector Filters Strip */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-white dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-2 flex-1 max-w-md bg-slate-100 dark:bg-slate-800/80 rounded-xl px-3 py-2 border border-slate-200 dark:border-slate-700/60">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter holdings by name or symbol (e.g. Reliance, TCS)..."
            className="w-full bg-transparent text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 uppercase font-mono"
            >
              Clear
            </button>
          )}
        </div>

        {/* Sector Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1 shrink-0 flex items-center gap-1">
            <Filter className="w-3 h-3" />
            <span>Sector:</span>
          </span>
          {sectors.map((sec) => (
            <button
              key={sec}
              onClick={() => setSectorFilter(sec)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                sectorFilter === sec
                  ? "bg-cyan-600 dark:bg-cyan-500 text-white dark:text-slate-950 font-bold shadow-xs"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              {sec}
            </button>
          ))}
        </div>
      </div>

      {/* Holdings Table Card */}
      <div className="overflow-hidden rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 select-none">
                <th
                  onClick={() => handleSort("name")}
                  className="py-3 px-4 cursor-pointer hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Instrument</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-3 text-right">Qty</th>
                <th className="py-3 px-3 text-right">Avg Buy Price</th>
                <th className="py-3 px-3 text-right">LTP (CMP)</th>
                <th
                  onClick={() => handleSort("value")}
                  className="py-3 px-3 text-right cursor-pointer hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Current Value</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("dayChange")}
                  className="py-3 px-3 text-right cursor-pointer hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Day P&L</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("pnl")}
                  className="py-3 px-4 text-right cursor-pointer hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Total Unrealized P&L</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {filteredHoldings.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-400 space-y-2">
                    <Layers className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700" />
                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                      No holdings match your filter criteria
                    </p>
                    <p className="text-xs text-slate-400">
                      Try adjusting the search query or selecting &quot;ALL&quot; sectors.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredHoldings.map((h) => {
                  const isGain = h.unrealizedPnlPaise >= 0;
                  const isDayGain = h.dayChangePaise >= 0;

                  return (
                    <tr
                      key={h.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group"
                    >
                      {/* Instrument & Sector */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-extrabold text-[11px] flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700/60 group-hover:border-cyan-500/40">
                            {h.symbol.slice(0, 3)}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <Link
                                href={`/stocks/${h.symbol}`}
                                className="font-bold text-slate-900 dark:text-slate-100 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors flex items-center gap-1"
                              >
                                <span>{h.symbol}</span>
                                <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </Link>
                              <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                                {h.sector}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 truncate max-w-[160px]">
                              {h.name}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Quantity */}
                      <td className="py-3.5 px-3 text-right font-bold font-tabular text-slate-800 dark:text-slate-200">
                        {h.quantity}
                      </td>

                      {/* Avg Price */}
                      <td className="py-3.5 px-3 text-right font-tabular text-slate-600 dark:text-slate-300">
                        {formatPaise(h.avgBuyPricePaise)}
                      </td>

                      {/* LTP */}
                      <td className="py-3.5 px-3 text-right font-black font-tabular text-slate-900 dark:text-slate-100">
                        {formatPaise(h.ltpPaise)}
                      </td>

                      {/* Current Value & Weight Bar */}
                      <td className="py-3.5 px-3 text-right">
                        <div className="font-bold font-tabular text-slate-900 dark:text-slate-100">
                          {formatPaise(h.currentValuePaise)}
                        </div>
                        <div className="flex items-center justify-end gap-1.5 mt-1">
                          <div className="w-12 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-cyan-500 rounded-full"
                              style={{ width: `${Math.min(h.weightPercent * 3, 100)}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-mono text-slate-400">
                            {h.weightPercent.toFixed(1)}%
                          </span>
                        </div>
                      </td>

                      {/* Day Change */}
                      <td className="py-3.5 px-3 text-right">
                        <div
                          className={`font-bold font-tabular flex items-center justify-end gap-0.5 ${
                            isDayGain
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-rose-600 dark:text-rose-400"
                          }`}
                        >
                          {isDayGain ? (
                            <TrendingUp className="w-3 h-3" />
                          ) : (
                            <TrendingDown className="w-3 h-3" />
                          )}
                          <span>{formatPaise(h.dayChangePaise)}</span>
                        </div>
                        <div
                          className={`text-[10px] font-semibold ${
                            isDayGain
                              ? "text-emerald-500 dark:text-emerald-400"
                              : "text-rose-500 dark:text-rose-400"
                          }`}
                        >
                          {isDayGain ? "+" : ""}
                          {h.dayChangePercent.toFixed(2)}%
                        </div>
                      </td>

                      {/* Total Unrealized P&L */}
                      <td className="py-3.5 px-4 text-right">
                        <div
                          className={`font-black text-sm font-tabular ${
                            isGain
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-rose-600 dark:text-rose-400"
                          }`}
                        >
                          {isGain ? "+" : ""}
                          {formatPaise(h.unrealizedPnlPaise)}
                        </div>
                        <span
                          className={`inline-block text-[10px] font-bold font-tabular px-1.5 py-0.2 rounded mt-0.5 ${
                            isGain
                              ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40"
                              : "bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/40"
                          }`}
                        >
                          {isGain ? "+" : ""}
                          {h.pnlPercent.toFixed(2)}%
                        </span>
                      </td>

                      {/* Quick Actions */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <Link
                            href={`/stocks/${h.symbol}`}
                            className="px-2.5 py-1 rounded-lg bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-950/60 dark:hover:bg-cyan-900/60 border border-cyan-200 dark:border-cyan-800/60 text-cyan-700 dark:text-cyan-300 font-bold text-[11px] transition-colors"
                            title="Buy more shares in terminal"
                          >
                            + Add
                          </Link>
                          <button
                            onClick={() => onExitHolding?.(h)}
                            className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-rose-950/60 border border-slate-200 dark:border-slate-700/60 text-slate-600 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 font-semibold text-[11px] transition-colors cursor-pointer"
                            title="Sell / Exit Holding"
                          >
                            Exit
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Footer Summary Row */}
            {filteredHoldings.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/80 font-bold text-xs">
                  <td className="py-3 px-4 text-slate-500 uppercase tracking-wider text-[11px]">
                    Total Portfolio Holdings ({filteredHoldings.length})
                  </td>
                  <td colSpan={3} className="py-3 px-3 text-right text-slate-500">
                    Total Cost:{" "}
                    <span className="text-slate-900 dark:text-slate-100 font-tabular font-bold">
                      {formatPaise(totals.invested)}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right font-black font-tabular text-slate-900 dark:text-slate-100 text-sm">
                    {formatPaise(totals.current)}
                  </td>
                  <td className="py-3 px-3 text-right">
                    <span
                      className={`font-bold font-tabular ${
                        totals.dayChange >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {totals.dayChange >= 0 ? "+" : ""}
                      {formatPaise(totals.dayChange)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span
                      className={`font-black font-tabular text-sm ${
                        totals.pnl >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {totals.pnl >= 0 ? "+" : ""}
                      {formatPaise(totals.pnl)} ({totals.pnl >= 0 ? "+" : ""}
                      {totals.pnlPercent.toFixed(2)}%)
                    </span>
                  </td>
                  <td className="py-3 px-4"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
