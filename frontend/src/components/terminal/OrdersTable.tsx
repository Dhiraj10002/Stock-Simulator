"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  Clock,
  Ban,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Filter,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
} from "lucide-react";
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
  const [search, setSearch] = useState("");

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
    const q = search.trim().toUpperCase();

    return orders.filter((o) => {
      const matchSearch = !q || o.symbol.toUpperCase().includes(q);

      let matchStatus = true;
      if (statusFilter === "OPEN") {
        matchStatus =
          o.status === "OPEN" ||
          o.status === "PENDING" ||
          o.status === "TRIGGER_PENDING";
      } else if (statusFilter === "EXECUTED") {
        matchStatus = o.status === "EXECUTED";
      } else if (statusFilter === "CANCELLED") {
        matchStatus = o.status === "CANCELLED" || o.status === "REJECTED";
      }

      return matchSearch && matchStatus;
    });
  }, [orders, statusFilter, search]);

  if (!orders || orders.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-500 min-h-[260px] bg-white dark:bg-slate-950/60">
        <Clock className="w-10 h-10 text-slate-300 dark:text-slate-700 mb-2 stroke-[1.5]" />
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-300">No Orders Placed Yet</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 max-w-sm mt-1">
          Place your first market, limit, or bracket order to view live execution details and trigger states here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 bg-white dark:bg-slate-950/60 text-slate-900 dark:text-slate-100">
      {/* Status Filter Tabs & Search Bar */}
      <div className="px-4 py-2.5 bg-slate-50/80 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1 flex items-center gap-1">
            <Filter className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
            <span>Filter:</span>
          </span>
          {[
            { id: "ALL", label: "All Orders", count: counts.all },
            { id: "OPEN", label: "Open & Pending", count: counts.open },
            { id: "EXECUTED", label: "Executed", count: counts.executed },
            { id: "CANCELLED", label: "Cancelled", count: counts.cancelled },
          ].map((tab) => {
            const isActive = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id as OrderStatusFilter)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  isActive
                    ? "bg-cyan-600 dark:bg-cyan-500 text-white dark:text-slate-950 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                    isActive
                      ? "bg-white/25 text-white dark:bg-slate-950/20 dark:text-slate-950"
                      : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="flex items-center gap-2 bg-white dark:bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700/60 max-w-xs w-full shadow-xs">
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="Search order by symbol..."
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

      {/* Orders Table Body */}
      <div className="flex-1 overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider bg-slate-50/70 dark:bg-slate-900/40">
              <th className="py-3 px-4">Time</th>
              <th className="py-3 px-3">Instrument</th>
              <th className="py-3 px-3">Side</th>
              <th className="py-3 px-3">Type</th>
              <th className="py-3 px-3">Product</th>
              <th className="py-3 px-3 text-right">Quantity</th>
              <th className="py-3 px-3 text-right">Order Price</th>
              <th className="py-3 px-3 text-right">Trigger Price</th>
              <th className="py-3 px-3 text-right">Executed Price</th>
              <th className="py-3 px-3">Status</th>
              <th className="py-3 px-4 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40 font-medium font-tabular">
            {filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-12 text-center text-slate-400 text-xs">
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
                    className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors group"
                  >
                    {/* Time */}
                    <td className="py-3 px-4 text-slate-500 dark:text-slate-400 text-[11px] whitespace-nowrap font-mono">
                      {new Date(ord.created_at).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </td>

                    {/* Symbol */}
                    <td className="py-3 px-3 font-bold text-slate-900 dark:text-slate-100 font-sans">
                      <Link
                        href={`/stocks/${ord.symbol}`}
                        className="hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
                      >
                        {ord.symbol}
                      </Link>
                    </td>

                    {/* Side */}
                    <td className="py-3 px-3">
                      <span
                        className={`font-black text-[11px] px-2 py-0.5 rounded-md inline-flex items-center gap-0.5 ${
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
                        <span>{ord.side}</span>
                      </span>
                    </td>

                    {/* Type */}
                    <td className="py-3 px-3 font-sans">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                          ord.type === "SL" || ord.type === "SL-M"
                            ? "bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800/40 text-purple-700 dark:text-purple-300"
                            : ord.type === "LIMIT"
                            ? "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800/40 text-indigo-700 dark:text-indigo-300"
                            : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700/60 text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        {ord.type}
                      </span>
                    </td>

                    {/* Product */}
                    <td className="py-3 px-3 font-sans">
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border ${
                          ord.product === "INTRADAY"
                            ? "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/40 text-amber-700 dark:text-amber-300"
                            : ord.product === "FNO"
                            ? "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800/40 text-indigo-700 dark:text-indigo-300"
                            : "bg-cyan-50 dark:bg-cyan-950/40 border-cyan-200 dark:border-cyan-800/40 text-cyan-700 dark:text-cyan-300"
                        }`}
                      >
                        {ord.product === "INTRADAY" ? "MIS" : ord.product === "FNO" ? "F&O" : "CNC"}
                      </span>
                    </td>

                    {/* Quantity */}
                    <td className="py-3 px-3 text-right font-bold text-slate-800 dark:text-slate-200">
                      {ord.quantity}
                    </td>

                    {/* Price */}
                    <td className="py-3 px-3 text-right font-semibold text-slate-700 dark:text-slate-300">
                      {ord.type === "MARKET" ? "MKT" : formatPaise(ord.price_paise)}
                    </td>

                    {/* Trigger Price */}
                    <td className="py-3 px-3 text-right text-slate-500 font-mono">
                      {ord.trigger_price_paise ? formatPaise(ord.trigger_price_paise) : "—"}
                    </td>

                    {/* Fill Price */}
                    <td className="py-3 px-3 text-right font-bold text-slate-900 dark:text-slate-100">
                      {ord.executed_price_paise ? formatPaise(ord.executed_price_paise) : "—"}
                    </td>

                    {/* Status */}
                    <td className="py-3 px-3 font-sans">
                      <span
                        className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          isExecuted
                            ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/40"
                            : isOpen
                            ? "bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800/40"
                            : isTriggerPending
                            ? "bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800/40"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                        }`}
                      >
                        {isOpen && <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />}
                        {isExecuted && <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />}
                        {isCancelled && <Ban className="w-3 h-3 text-slate-400" />}
                        {isRejected && <XCircle className="w-3 h-3 text-rose-500" />}
                        <span>{ord.status}</span>
                      </span>
                    </td>

                    {/* Action */}
                    <td className="py-3 px-4 text-center font-sans">
                      {canCancel ? (
                        <button
                          onClick={() => handleCancel(ord)}
                          disabled={cancelling === ord.uuid}
                          className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-rose-200 dark:border-rose-800/50 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                        >
                          {cancelling === ord.uuid ? "Cancelling…" : "Cancel"}
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400 font-mono">—</span>
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
