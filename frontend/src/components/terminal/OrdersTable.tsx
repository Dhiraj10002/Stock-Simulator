"use client";

import React, { useState, useMemo } from "react";
import { Clock, Ban, CheckCircle2, AlertCircle, XCircle, Filter } from "lucide-react";
import { formatPaise } from "@/lib/format";
import type { Order } from "@/types";

type OrderStatusFilter = "ALL" | "OPEN" | "EXECUTED" | "CANCELLED";

type OrdersTableProps = {
  orders: Order[];
  onCancelOrder: (order: Order) => void;
};

export default function OrdersTable({ orders = [], onCancelOrder }: OrdersTableProps) {
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>("ALL");

  const handleCancel = async (order: Order) => {
    setCancelling(order.uuid);
    try {
      await onCancelOrder(order);
    } finally {
      setCancelling(null);
    }
  };

  const counts = useMemo(() => {
    let open = 0;
    let executed = 0;
    let cancelled = 0;

    orders.forEach((ord) => {
      if (
        ord.status === "OPEN" ||
        ord.status === "PENDING" ||
        ord.status === "TRIGGER_PENDING"
      ) {
        open++;
      } else if (ord.status === "EXECUTED") {
        executed++;
      } else if (ord.status === "CANCELLED" || ord.status === "REJECTED") {
        cancelled++;
      }
    });

    return {
      all: orders.length,
      open,
      executed,
      cancelled,
    };
  }, [orders]);

  const filteredOrders = useMemo(() => {
    if (statusFilter === "ALL") return orders;
    if (statusFilter === "OPEN") {
      return orders.filter(
        (o) =>
          o.status === "OPEN" ||
          o.status === "PENDING" ||
          o.status === "TRIGGER_PENDING"
      );
    }
    if (statusFilter === "EXECUTED") {
      return orders.filter((o) => o.status === "EXECUTED");
    }
    if (statusFilter === "CANCELLED") {
      return orders.filter(
        (o) => o.status === "CANCELLED" || o.status === "REJECTED"
      );
    }
    return orders;
  }, [orders, statusFilter]);

  if (!orders || orders.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-500 min-h-[260px]">
        <Clock className="w-10 h-10 text-slate-700 mb-2 stroke-[1.5]" />
        <p className="text-sm font-semibold text-slate-300">No Orders Placed Yet</p>
        <p className="text-xs text-slate-500 max-w-sm mt-1">
          Place your first market, limit, or bracket order to view live execution details and trigger states here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1">
      {/* Status Filter Tabs */}
      <div className="px-4 py-2 bg-slate-950/60 border-b border-slate-800/80 flex items-center gap-1 overflow-x-auto">
        <span className="text-[11px] font-semibold text-slate-500 mr-2 flex items-center gap-1">
          <Filter className="w-3 h-3 text-cyan-400" />
          Filter:
        </span>
        {[
          { id: "ALL", label: "All Orders", count: counts.all },
          { id: "OPEN", label: "Open & Pending", count: counts.open },
          { id: "EXECUTED", label: "Executed", count: counts.executed },
          { id: "CANCELLED", label: "Cancelled / Rejected", count: counts.cancelled },
        ].map((tab) => {
          const isActive = statusFilter === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id as OrderStatusFilter)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                isActive
                  ? "bg-slate-800 text-cyan-300 border border-slate-700"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  isActive
                    ? "bg-cyan-950 text-cyan-300 border border-cyan-800/50"
                    : "bg-slate-900 text-slate-500"
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Orders Table Body */}
      <div className="flex-1 overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-900/40">
              <th className="py-2.5 px-4">Time</th>
              <th className="py-2.5 px-3">Instrument</th>
              <th className="py-2.5 px-3">Side</th>
              <th className="py-2.5 px-3">Type</th>
              <th className="py-2.5 px-3">Product</th>
              <th className="py-2.5 px-3 text-right">Quantity</th>
              <th className="py-2.5 px-3 text-right">Price</th>
              <th className="py-2.5 px-3 text-right">Trigger</th>
              <th className="py-2.5 px-3 text-right">Fill Price</th>
              <th className="py-2.5 px-3">Status</th>
              <th className="py-2.5 px-4 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40 font-medium">
            {filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-8 text-center text-slate-500 text-xs">
                  No orders match the selected filter ({statusFilter}).
                </td>
              </tr>
            ) : (
              filteredOrders.map((ord, idx) => {
                const isBuy = ord.side === "BUY";
                const isTriggerPending = ord.status === "TRIGGER_PENDING";
                const isOpen = ord.status === "OPEN" || ord.status === "PENDING";
                const canCancel = isOpen || isTriggerPending;
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
                    <td className="py-3 px-3 font-bold text-slate-100">
                      {ord.symbol}
                    </td>

                    {/* Side */}
                    <td className="py-3 px-3">
                      <span
                        className={`font-bold text-[11px] px-2 py-0.5 rounded ${
                          isBuy
                            ? "bg-emerald-950/60 text-emerald-400 border border-emerald-800/40"
                            : "bg-rose-950/60 text-rose-400 border border-rose-800/40"
                        }`}
                      >
                        {ord.side}
                      </span>
                    </td>

                    {/* Type */}
                    <td className="py-3 px-3">
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                          ord.type === "SL" || ord.type === "SL-M"
                            ? "bg-purple-950/40 border-purple-500/30 text-purple-300"
                            : ord.type === "LIMIT"
                            ? "bg-cyan-950/40 border-cyan-500/30 text-cyan-300"
                            : "bg-slate-800/80 border-slate-700 text-slate-300"
                        }`}
                      >
                        {ord.type}
                      </span>
                    </td>

                    {/* Product */}
                    <td className="py-3 px-3">
                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 font-medium">
                        {ord.product}
                      </span>
                    </td>

                    {/* Quantity */}
                    <td className="py-3 px-3 text-right font-semibold text-slate-200 font-tabular">
                      {ord.quantity}
                    </td>

                    {/* Price */}
                    <td className="py-3 px-3 text-right text-slate-300 font-tabular font-medium">
                      {ord.type === "LIMIT" || ord.type === "SL"
                        ? formatPaise(ord.price_paise)
                        : "MKT"}
                    </td>

                    {/* Trigger Price */}
                    <td className="py-3 px-3 text-right text-slate-400 font-tabular">
                      {ord.trigger_price_paise && ord.trigger_price_paise > 0
                        ? formatPaise(ord.trigger_price_paise)
                        : "—"}
                    </td>

                    {/* Executed Fill Price */}
                    <td className="py-3 px-3 text-right font-semibold text-slate-200 font-tabular">
                      {ord.executed_price_paise && ord.executed_price_paise > 0
                        ? formatPaise(ord.executed_price_paise)
                        : "—"}
                    </td>

                    {/* Status Badge */}
                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                          isExecuted
                            ? "bg-emerald-950/60 border-emerald-500/40 text-emerald-300"
                            : isTriggerPending
                            ? "bg-amber-950/60 border-amber-500/40 text-amber-300 animate-pulse"
                            : isOpen
                            ? "bg-cyan-950/60 border-cyan-500/40 text-cyan-300 animate-pulse"
                            : isCancelled
                            ? "bg-slate-800/60 border-slate-700 text-slate-400"
                            : isRejected
                            ? "bg-rose-950/60 border-rose-500/40 text-rose-300"
                            : "bg-slate-800 border-slate-700 text-slate-400"
                        }`}
                      >
                        {isExecuted && <CheckCircle2 className="w-2.5 h-2.5" />}
                        {isTriggerPending && <Clock className="w-2.5 h-2.5 text-amber-400" />}
                        {isOpen && !isTriggerPending && <Clock className="w-2.5 h-2.5 text-cyan-400" />}
                        {isCancelled && <XCircle className="w-2.5 h-2.5" />}
                        {isRejected && <AlertCircle className="w-2.5 h-2.5" />}
                        {isTriggerPending ? "TRIGGER PENDING" : ord.status}
                      </span>
                    </td>

                    {/* Action */}
                    <td className="py-3 px-4 text-center">
                      {canCancel ? (
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
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
