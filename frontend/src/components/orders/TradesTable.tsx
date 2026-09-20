"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Clock, FileText, Search } from "lucide-react";
import { formatPaise } from "@/lib/format";
import type { Trade } from "@/types";

interface TradesTableProps {
  trades: Trade[];
}

export default function TradesTable({ trades = [] }: TradesTableProps) {
  const [search, setSearch] = useState("");

  const filteredTrades = useMemo(() => {
    const q = search.trim().toUpperCase();
    if (!q) return trades;
    return trades.filter((t) => t.symbol.toUpperCase().includes(q));
  }, [trades, search]);

  if (!trades || trades.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-500 min-h-[260px] bg-white dark:bg-slate-950/60">
        <Clock className="w-10 h-10 text-slate-300 dark:text-slate-700 mb-2 stroke-[1.5]" />
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-300">No Executed Trades Yet</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 max-w-sm mt-1">
          When your market or limit orders execute on the exchange, your executed trade fills will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 bg-white dark:bg-slate-950/60 text-slate-900 dark:text-slate-100">
      {/* Search Header */}
      <div className="px-4 py-2.5 bg-slate-50/80 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
        <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
          Showing {filteredTrades.length} Trade Executions
        </div>

        <div className="flex items-center gap-2 bg-white dark:bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700/60 max-w-xs w-full shadow-xs">
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="Search fills by symbol..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider bg-slate-50/70 dark:bg-slate-900/40">
              <th className="py-3 px-4">Time</th>
              <th className="py-3 px-3">Instrument</th>
              <th className="py-3 px-3">Side</th>
              <th className="py-3 px-3">Product</th>
              <th className="py-3 px-3 text-right">Quantity</th>
              <th className="py-3 px-3 text-right">Executed Price</th>
              <th className="py-3 px-3 text-right">Gross Turnover</th>
              <th className="py-3 px-3 text-right">Realized P&L</th>
              <th className="py-3 px-4 text-center">Reference ID</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40 font-medium font-tabular">
            {filteredTrades.map((trade, idx) => {
              const isBuy = trade.side === "BUY";
              const turnoverPaise = trade.quantity * trade.executed_price_paise;
              const hasRealizedPnl = trade.realized_pnl_paise !== undefined && trade.realized_pnl_paise !== 0;
              const isPnlProfit = (trade.realized_pnl_paise ?? 0) >= 0;

              return (
                <tr
                  key={trade.uuid || `trade-${trade.symbol}-${idx}`}
                  className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors group"
                >
                  {/* Time */}
                  <td className="py-3 px-4 text-slate-500 dark:text-slate-400 text-[11px] whitespace-nowrap font-mono">
                    {new Date(trade.executed_at).toLocaleTimeString("en-IN", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </td>

                  {/* Instrument */}
                  <td className="py-3 px-3 font-sans">
                    <Link
                      href={`/stocks/${trade.symbol}`}
                      className="font-bold text-slate-900 dark:text-slate-100 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
                    >
                      {trade.symbol}
                    </Link>
                    <span className="text-[10px] text-slate-400 font-mono ml-1.5 uppercase">NSE</span>
                  </td>

                  {/* Side */}
                  <td className="py-3 px-3">
                    <span
                      className={`inline-flex items-center gap-1 font-black text-[11px] px-2 py-0.5 rounded-md ${
                        isBuy
                          ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40"
                          : "bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/40"
                      }`}
                    >
                      {isBuy ? (
                        <ArrowUpRight className="w-3 h-3" />
                      ) : (
                        <ArrowDownRight className="w-3 h-3" />
                      )}
                      <span>{trade.side}</span>
                    </span>
                  </td>

                  {/* Product */}
                  <td className="py-3 px-3 font-sans">
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border ${
                        trade.product === "INTRADAY"
                          ? "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/40 text-amber-700 dark:text-amber-300"
                          : trade.product === "FNO"
                          ? "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800/40 text-indigo-700 dark:text-indigo-300"
                          : "bg-cyan-50 dark:bg-cyan-950/40 border-cyan-200 dark:border-cyan-800/40 text-cyan-700 dark:text-cyan-300"
                      }`}
                    >
                      {trade.product === "INTRADAY" ? "MIS" : trade.product === "FNO" ? "F&O" : "CNC"}
                    </span>
                  </td>

                  {/* Quantity */}
                  <td className="py-3 px-3 text-right font-bold text-slate-800 dark:text-slate-200">
                    {trade.quantity}
                  </td>

                  {/* Executed Price */}
                  <td className="py-3 px-3 text-right font-bold text-slate-900 dark:text-slate-100">
                    {formatPaise(trade.executed_price_paise)}
                  </td>

                  {/* Turnover */}
                  <td className="py-3 px-3 text-right font-semibold text-slate-700 dark:text-slate-300">
                    {formatPaise(turnoverPaise)}
                  </td>

                  {/* Realized P&L */}
                  <td className="py-3 px-3 text-right font-sans">
                    {hasRealizedPnl ? (
                      <span
                        className={`font-black font-tabular ${
                          isPnlProfit
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-rose-600 dark:text-rose-400"
                        }`}
                      >
                        {isPnlProfit ? "+" : ""}
                        {formatPaise(trade.realized_pnl_paise ?? 0)}
                      </span>
                    ) : (
                      <span className="text-slate-400 font-mono text-[11px]">—</span>
                    )}
                  </td>

                  {/* Order Reference */}
                  <td className="py-3 px-4 text-center font-mono text-[11px] text-slate-400">
                    <span className="truncate max-w-[90px] inline-block" title={trade.order_uuid}>
                      {trade.order_uuid.slice(0, 8)}…
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
