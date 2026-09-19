"use client";

import React from "react";
import { ArrowDownRight, ArrowUpRight, Clock, FileText } from "lucide-react";
import { formatPaise } from "@/lib/format";
import type { Trade } from "@/types";

interface TradesTableProps {
  trades: Trade[];
}

export default function TradesTable({ trades = [] }: TradesTableProps) {
  if (!trades || trades.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-500 min-h-[260px]">
        <Clock className="w-10 h-10 text-slate-700 mb-2 stroke-[1.5]" />
        <p className="text-sm font-semibold text-slate-300">No Executed Trades</p>
        <p className="text-xs text-slate-500 max-w-sm mt-1">
          When your market or limit orders execute on the exchange, your executed trade fills will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs border-collapse">
        <thead>
          <tr className="border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-900/40">
            <th className="py-2.5 px-4">Time</th>
            <th className="py-2.5 px-3">Instrument</th>
            <th className="py-2.5 px-3">Side</th>
            <th className="py-2.5 px-3">Product</th>
            <th className="py-2.5 px-3 text-right">Quantity</th>
            <th className="py-2.5 px-3 text-right">Executed Price</th>
            <th className="py-2.5 px-3 text-right">Gross Turnover</th>
            <th className="py-2.5 px-3 text-right">Realized P&L</th>
            <th className="py-2.5 px-4 text-center">Order Reference</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/40 font-medium">
          {trades.map((trade, idx) => {
            const isBuy = trade.side === "BUY";
            const turnoverPaise = trade.quantity * trade.executed_price_paise;
            const hasRealizedPnl = trade.realized_pnl_paise !== undefined && trade.realized_pnl_paise !== 0;
            const isPnlProfit = (trade.realized_pnl_paise ?? 0) >= 0;

            return (
              <tr
                key={trade.uuid || `trade-${trade.symbol}-${idx}`}
                className="hover:bg-slate-900/50 transition-colors group"
              >
                {/* Time */}
                <td className="py-3 px-4 text-slate-400 text-[11px] whitespace-nowrap">
                  {new Date(trade.executed_at).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </td>

                {/* Instrument */}
                <td className="py-3 px-3">
                  <span className="font-bold text-slate-100">{trade.symbol}</span>
                  <span className="text-[10px] text-slate-500 font-mono ml-1.5">NSE</span>
                </td>

                {/* Side */}
                <td className="py-3 px-3">
                  <span
                    className={`inline-flex items-center gap-1 font-bold text-[11px] px-2 py-0.5 rounded ${
                      isBuy
                        ? "bg-emerald-950/60 text-emerald-400 border border-emerald-800/40"
                        : "bg-rose-950/60 text-rose-400 border border-rose-800/40"
                    }`}
                  >
                    {isBuy ? (
                      <ArrowUpRight className="w-3 h-3" />
                    ) : (
                      <ArrowDownRight className="w-3 h-3" />
                    )}
                    {trade.side}
                  </span>
                </td>

                {/* Product */}
                <td className="py-3 px-3">
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 border border-slate-700/60">
                    {trade.product}
                  </span>
                </td>

                {/* Quantity */}
                <td className="py-3 px-3 text-right font-semibold text-slate-200 font-tabular">
                  {trade.quantity}
                </td>

                {/* Executed Price */}
                <td className="py-3 px-3 text-right font-semibold text-slate-100 font-tabular">
                  {formatPaise(trade.executed_price_paise)}
                </td>

                {/* Turnover */}
                <td className="py-3 px-3 text-right font-semibold text-slate-300 font-tabular">
                  {formatPaise(turnoverPaise)}
                </td>

                {/* Realized PnL */}
                <td className="py-3 px-3 text-right font-tabular">
                  {hasRealizedPnl ? (
                    <span
                      className={`font-bold ${
                        isPnlProfit ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {formatPaise(trade.realized_pnl_paise)}
                    </span>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </td>

                {/* Order ID */}
                <td className="py-3 px-4 text-center">
                  <span
                    title={trade.order_uuid}
                    className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-400 hover:text-cyan-400 cursor-pointer bg-slate-950/60 px-2 py-0.5 rounded border border-slate-800"
                  >
                    <FileText className="w-3 h-3 text-slate-500" />
                    <span>{trade.order_uuid ? trade.order_uuid.slice(0, 8) : "—"}</span>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
