"use client";

import { useState } from "react";
import { Clock, Ban, CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { formatPaise } from "@/lib/format";
import type { Order } from "@/types";

type OrdersTableProps = {
  orders: Order[];
  onCancelOrder: (order: Order) => void;
};

export default function OrdersTable({ orders, onCancelOrder }: OrdersTableProps) {
  const [cancelling, setCancelling] = useState<string | null>(null);

  const handleCancel = async (order: Order) => {
    setCancelling(order.uuid);
    try {
      await onCancelOrder(order);
    } finally {
      setCancelling(null);
    }
  };

  if (!orders || orders.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500 min-h-[220px]">
        <Clock className="w-10 h-10 text-slate-700 mb-2 stroke-[1.5]" />
        <p className="text-sm font-medium text-slate-400">No Orders in History</p>
        <p className="text-xs text-slate-500 max-w-sm mt-1">
          Place your first market or limit order to view live execution details and fill status here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-x-auto">
      <table className="w-full text-left text-xs border-collapse">
        <thead>
          <tr className="border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-900/30">
            <th className="py-2.5 px-4">Time</th>
            <th className="py-2.5 px-3">Instrument</th>
            <th className="py-2.5 px-3">Side</th>
            <th className="py-2.5 px-3">Type</th>
            <th className="py-2.5 px-3">Product</th>
            <th className="py-2.5 px-3 text-right">Qty</th>
            <th className="py-2.5 px-3 text-right">Price</th>
            <th className="py-2.5 px-3 text-right">Fill Price</th>
            <th className="py-2.5 px-3">Status</th>
            <th className="py-2.5 px-4 text-center">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/40">
          {orders.map((ord, idx) => {
            const isBuy = ord.side === "BUY";
            const isOpen = ord.status === "OPEN" || ord.status === "PENDING";
            const isExecuted = ord.status === "EXECUTED";
            const isCancelled = ord.status === "CANCELLED";
            const isRejected = ord.status === "REJECTED";

            return (
              <tr
                key={ord.uuid || `ord-${ord.symbol}-${idx}`}
                className="hover:bg-slate-900/40 transition-colors group"
              >
                {/* Time */}
                <td className="py-3 px-4 text-slate-400 text-[11px] whitespace-nowrap">
                  {new Date(ord.created_at).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </td>

                {/* Symbol */}
                <td className="py-3 px-3 font-bold text-slate-200">
                  {ord.symbol}
                </td>

                {/* Side */}
                <td className="py-3 px-3">
                  <span
                    className={`font-bold text-[11px] ${
                      isBuy ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {ord.side}
                  </span>
                </td>

                {/* Type */}
                <td className="py-3 px-3 text-slate-400 text-[11px]">
                  {ord.type}
                </td>

                {/* Product */}
                <td className="py-3 px-3">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-300 font-medium">
                    {ord.product}
                  </span>
                </td>

                {/* Quantity */}
                <td className="py-3 px-3 text-right font-semibold text-slate-200">
                  {ord.quantity}
                </td>

                {/* Price */}
                <td className="py-3 px-3 text-right text-slate-300">
                  {ord.type === "LIMIT" ? formatPaise(ord.price_paise) : "MARKET"}
                </td>

                {/* Executed Fill Price */}
                <td className="py-3 px-3 text-right font-medium text-slate-200">
                  {ord.executed_price_paise && ord.executed_price_paise > 0
                    ? formatPaise(ord.executed_price_paise)
                    : "—"}
                </td>

                {/* Status Badge */}
                <td className="py-3 px-3">
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      isExecuted
                        ? "bg-emerald-950/60 border-emerald-500/40 text-emerald-300"
                        : isOpen
                        ? "bg-cyan-950/60 border-cyan-500/40 text-cyan-300 animate-pulse"
                        : isCancelled
                        ? "bg-slate-800/60 border-slate-700 text-slate-400"
                        : isRejected
                        ? "bg-rose-950/60 border-rose-500/40 text-rose-300"
                        : "bg-amber-950/60 border-amber-500/40 text-amber-300"
                    }`}
                  >
                    {isExecuted && <CheckCircle2 className="w-2.5 h-2.5" />}
                    {isOpen && <Clock className="w-2.5 h-2.5" />}
                    {isCancelled && <XCircle className="w-2.5 h-2.5" />}
                    {isRejected && <AlertCircle className="w-2.5 h-2.5" />}
                    {ord.status}
                  </span>
                </td>

                {/* Action */}
                <td className="py-3 px-4 text-center">
                  {isOpen ? (
                    <button
                      onClick={() => handleCancel(ord)}
                      disabled={cancelling === ord.uuid}
                      className="px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-800 hover:border-rose-500/40 hover:bg-rose-950/30 text-slate-300 hover:text-rose-300 text-[11px] font-semibold transition-all flex items-center gap-1 mx-auto disabled:opacity-50"
                    >
                      <Ban className="w-3 h-3" />
                      {cancelling === ord.uuid ? "Cancelling…" : "Cancel"}
                    </button>
                  ) : (
                    <span className="text-slate-600 text-[11px]">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
