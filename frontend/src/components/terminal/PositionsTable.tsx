"use client";

import { useState } from "react";
import { TrendingUp, TrendingDown, Layers, ArrowRightLeft } from "lucide-react";
import { formatPaise, formatPercent } from "@/lib/format";
import type { Position } from "@/types";

type PositionsTableProps = {
  positions: Position[];
  onSquareOff: (position: Position) => void;
};

export default function PositionsTable({
  positions,
  onSquareOff,
}: PositionsTableProps) {
  const [squaringOff, setSquaringOff] = useState<string | null>(null);

  const handleSquareOff = async (pos: Position) => {
    setSquaringOff(pos.uuid);
    try {
      await onSquareOff(pos);
    } finally {
      setSquaringOff(null);
    }
  };

  if (!positions || positions.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500 min-h-[220px]">
        <Layers className="w-10 h-10 text-slate-700 mb-2 stroke-[1.5]" />
        <p className="text-sm font-medium text-slate-400">No Open Positions</p>
        <p className="text-xs text-slate-500 max-w-sm mt-1">
          Execute a Delivery, Intraday MIS, or F&O order to track open holdings and live P&L here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-x-auto">
      <table className="w-full text-left text-xs border-collapse">
        <thead>
          <tr className="border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-900/30">
            <th className="py-2.5 px-4">Instrument</th>
            <th className="py-2.5 px-3">Product</th>
            <th className="py-2.5 px-3 text-right">Qty</th>
            <th className="py-2.5 px-3 text-right">Avg Price</th>
            <th className="py-2.5 px-3 text-right">LTP</th>
            <th className="py-2.5 px-3 text-right">Current Value</th>
            <th className="py-2.5 px-3 text-right">P&L</th>
            <th className="py-2.5 px-4 text-center">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/40">
          {positions.map((pos) => {
            const isLong = pos.quantity > 0;
            const pnlPaise = pos.unrealized_pnl_paise;
            const isProfit = pnlPaise >= 0;
            const investedPaise = pos.invested_value_paise || (pos.average_price_paise * Math.abs(pos.quantity));
            const pnlPercent = investedPaise > 0 ? (pnlPaise / investedPaise) * 100 : 0;

            return (
              <tr
                key={pos.uuid}
                className="hover:bg-slate-900/40 transition-colors group"
              >
                {/* Symbol & Direction */}
                <td className="py-3 px-4 font-bold text-slate-200 flex items-center gap-2">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isLong ? "bg-emerald-400" : "bg-rose-400"
                    }`}
                  />
                  <span>{pos.symbol}</span>
                </td>

                {/* Product Badge */}
                <td className="py-3 px-3">
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                      pos.product === "INTRADAY"
                        ? "bg-amber-950/40 border-amber-500/30 text-amber-300"
                        : pos.product === "FNO"
                        ? "bg-purple-950/40 border-purple-500/30 text-purple-300"
                        : "bg-cyan-950/40 border-cyan-500/30 text-cyan-300"
                    }`}
                  >
                    {pos.product}
                  </span>
                </td>

                {/* Quantity */}
                <td
                  className={`py-3 px-3 text-right font-semibold ${
                    isLong ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {isLong ? `+${pos.quantity}` : pos.quantity}
                </td>

                {/* Average Buy Price */}
                <td className="py-3 px-3 text-right text-slate-300 font-medium">
                  {formatPaise(pos.average_price_paise)}
                </td>

                {/* Current Market Price */}
                <td className="py-3 px-3 text-right text-slate-200 font-bold">
                  {formatPaise(pos.current_price_paise)}
                </td>

                {/* Current Value */}
                <td className="py-3 px-3 text-right text-slate-300">
                  {formatPaise(pos.current_value_paise)}
                </td>

                {/* Unrealized P&L */}
                <td className="py-3 px-3 text-right">
                  <div
                    className={`font-bold flex items-center justify-end gap-1 ${
                      isProfit ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {isProfit ? (
                      <TrendingUp className="w-3 h-3" />
                    ) : (
                      <TrendingDown className="w-3 h-3" />
                    )}
                    {formatPaise(pnlPaise)}
                  </div>
                  <div
                    className={`text-[10px] font-medium ${
                      isProfit ? "text-emerald-500/80" : "text-rose-500/80"
                    }`}
                  >
                    {formatPercent(pnlPercent)}
                  </div>
                </td>

                {/* One-Click Square-Off Action */}
                <td className="py-3 px-4 text-center">
                  <button
                    onClick={() => handleSquareOff(pos)}
                    disabled={squaringOff === pos.uuid}
                    className="px-2.5 py-1 rounded-lg border border-rose-800/40 bg-rose-950/30 hover:bg-rose-900/50 text-rose-300 hover:text-white text-[11px] font-semibold transition-all flex items-center gap-1 mx-auto disabled:opacity-50"
                  >
                    <ArrowRightLeft className="w-3 h-3" />
                    {squaringOff === pos.uuid ? "Closing…" : "Exit"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
