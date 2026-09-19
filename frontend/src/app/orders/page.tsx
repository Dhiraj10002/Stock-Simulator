"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Navbar from "@/components/layout/Navbar";
import OrdersTable from "@/components/terminal/OrdersTable";
import TradesTable from "@/components/orders/TradesTable";
import GTTTriggersTable from "@/components/terminal/GTTTriggersTable";
import { getDefaultQuotes } from "@/lib/mockData";
import { formatPaise } from "@/lib/format";
import {
  ClipboardList,
  SlidersHorizontal,
  ArrowRight,
  RefreshCw,
  Clock,
  CheckCircle2,
  Crosshair,
  TrendingUp,
  TrendingDown,
  Layers,
} from "lucide-react";
import type { Order, Trade, GTTTrigger, Quote, Wallet, Portfolio, ApiResponse } from "@/types";

type OrdersTab = "orders" | "trades" | "gtt";

export default function OrdersPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<OrdersTab>("orders");

  const [token] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("auth_token") || "";
    }
    return "";
  });

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1";

  // 1. Fetch Orders via TanStack Query
  const {
    data: orders = [],
    isLoading: loadingOrders,
    refetch: refetchOrders,
  } = useQuery<Order[]>({
    queryKey: ["orders"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/orders`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json: ApiResponse<Order[]> = await res.json();
      return json.data || [];
    },
    refetchInterval: 5000,
  });

  // 2. Fetch Trades via TanStack Query
  const {
    data: trades = [],
    isLoading: loadingTrades,
    refetch: refetchTrades,
  } = useQuery<Trade[]>({
    queryKey: ["trades"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/trades`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json: ApiResponse<Trade[]> = await res.json();
      return json.data || [];
    },
    refetchInterval: 5000,
  });

  // 3. Fetch Wallet for Navbar margin
  const { data: wallet } = useQuery<Wallet>({
    queryKey: ["wallet"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/wallet`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json: ApiResponse<Wallet> = await res.json();
      return (
        json.data || {
          uuid: "",
          cash_balance_paise: 100000000,
          available_balance_paise: 100000000,
          blocked_paise: 0,
        }
      );
    },
    refetchInterval: 5000,
  });

  // 4. Fetch Portfolio for Navbar unrealized PnL
  const { data: portfolio } = useQuery<Portfolio>({
    queryKey: ["portfolio"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/portfolio`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json: ApiResponse<Portfolio> = await res.json();
      return (
        json.data || {
          invested_value_paise: 0,
          current_value_paise: 0,
          unrealized_pnl_paise: 0,
          positions: [],
        }
      );
    },
    refetchInterval: 5000,
  });

  // 5. GTT Triggers state from local storage
  const [gttTriggers, setGttTriggers] = useState<GTTTrigger[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem("stock-simulator-gtt-triggers");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [quotes] = useState<Record<string, Quote>>(() => getDefaultQuotes());

  // Cancel order action
  const handleCancelOrder = async (order: Order) => {
    if (!token) return;
    await fetch(`${apiUrl}/orders/${order.uuid}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    void queryClient.invalidateQueries({ queryKey: ["orders"] });
    void queryClient.invalidateQueries({ queryKey: ["wallet"] });
  };

  // Cancel GTT trigger action
  const handleCancelGTT = (triggerId: string) => {
    setGttTriggers((prev) => {
      const updated = prev.filter((t) => t.id !== triggerId);
      try {
        localStorage.setItem("stock-simulator-gtt-triggers", JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  // KPI Calculations
  const orderCounts = useMemo(() => {
    let open = 0;
    let executed = 0;
    let cancelled = 0;
    orders.forEach((o) => {
      if (o.status === "OPEN" || o.status === "PENDING" || o.status === "TRIGGER_PENDING") {
        open++;
      } else if (o.status === "EXECUTED") {
        executed++;
      } else if (o.status === "CANCELLED" || o.status === "REJECTED") {
        cancelled++;
      }
    });
    return { all: orders.length, open, executed, cancelled };
  }, [orders]);

  const tradeMetrics = useMemo(() => {
    let turnoverPaise = 0;
    let realizedPnlPaise = 0;
    trades.forEach((t) => {
      turnoverPaise += t.quantity * t.executed_price_paise;
      realizedPnlPaise += t.realized_pnl_paise ?? 0;
    });
    return {
      count: trades.length,
      turnoverPaise,
      realizedPnlPaise,
    };
  }, [trades]);

  const activeGttCount = useMemo(() => {
    return gttTriggers.filter((t) => t.status === "ACTIVE").length;
  }, [gttTriggers]);

  const handleRefreshAll = () => {
    void refetchOrders();
    void refetchTrades();
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Navbar
        availableBalancePaise={wallet?.available_balance_paise}
        unrealizedPnlPaise={portfolio?.unrealized_pnl_paise}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Header Title & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
              <ClipboardList className="w-6 h-6 text-cyan-400" />
              Order Book & Execution Desk
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Live pending orders, filled trade records, and automated GTT target & stop-loss triggers.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleRefreshAll}
              className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
              title="Refresh Orders & Trades"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            <Link
              href="/trade"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-md shadow-cyan-500/20 transition-all hover:scale-105"
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span>Trading Terminal</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Top KPI Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Orders Card */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <ClipboardList className="w-3.5 h-3.5 text-cyan-400" />
              Total Orders
            </span>
            <div className="text-2xl font-bold font-tabular text-slate-100">
              {orderCounts.all}
            </div>
            <div className="text-[10px] text-slate-400 flex items-center gap-2">
              <span className="text-cyan-400 font-semibold">{orderCounts.open} Open</span>
              <span>·</span>
              <span className="text-emerald-400 font-semibold">{orderCounts.executed} Filled</span>
              <span>·</span>
              <span className="text-slate-500">{orderCounts.cancelled} Cancelled</span>
            </div>
          </div>

          {/* Trade Fills Card */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              Executed Fills
            </span>
            <div className="text-2xl font-bold font-tabular text-slate-100">
              {tradeMetrics.count}
            </div>
            <span className="text-[10px] text-slate-500">Completed exchange transactions</span>
          </div>

          {/* Gross Turnover Card */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              Turnover Today
            </span>
            <div className="text-2xl font-bold font-tabular text-slate-200">
              {formatPaise(tradeMetrics.turnoverPaise)}
            </div>
            <span className="text-[10px] text-slate-500">Gross transactional volume</span>
          </div>

          {/* Realized P&L Card */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              {tradeMetrics.realizedPnlPaise >= 0 ? (
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
              )}
              Realized P&L
            </span>
            <div
              className={`text-2xl font-bold font-tabular ${
                tradeMetrics.realizedPnlPaise >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {formatPaise(tradeMetrics.realizedPnlPaise)}
            </div>
            <span className="text-[10px] text-slate-500">Closed position returns</span>
          </div>
        </div>

        {/* Main Orders / Trades / GTT Desk */}
        <div className="rounded-xl bg-slate-900/40 border border-slate-800 overflow-hidden shadow-xl">
          {/* Segmented Tab Navigation Header */}
          <div className="px-4 py-2.5 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab("orders")}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  activeTab === "orders"
                    ? "bg-cyan-500 text-slate-950 shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                }`}
              >
                <ClipboardList className="w-3.5 h-3.5" />
                <span>Orders</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    activeTab === "orders"
                      ? "bg-slate-950/30 text-slate-950"
                      : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {orders.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab("trades")}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  activeTab === "trades"
                    ? "bg-cyan-500 text-slate-950 shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Trade Fills</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    activeTab === "trades"
                      ? "bg-slate-950/30 text-slate-950"
                      : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {trades.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab("gtt")}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  activeTab === "gtt"
                    ? "bg-cyan-500 text-slate-950 shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                }`}
              >
                <Crosshair className="w-3.5 h-3.5" />
                <span>GTT Triggers</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    activeTab === "gtt"
                      ? "bg-slate-950/30 text-slate-950"
                      : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {activeGttCount}
                </span>
              </button>
            </div>
          </div>

          {/* Tab Viewport */}
          <div>
            {activeTab === "orders" && (
              <>
                {loadingOrders ? (
                  <div className="p-16 text-center text-slate-500">
                    <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-xs">Loading order book from exchange…</p>
                  </div>
                ) : (
                  <OrdersTable orders={orders} onCancelOrder={handleCancelOrder} />
                )}
              </>
            )}

            {activeTab === "trades" && (
              <>
                {loadingTrades ? (
                  <div className="p-16 text-center text-slate-500">
                    <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-xs">Loading trade execution logs…</p>
                  </div>
                ) : (
                  <TradesTable trades={trades} />
                )}
              </>
            )}

            {activeTab === "gtt" && (
              <GTTTriggersTable
                triggers={gttTriggers}
                quotes={quotes}
                onCancelTrigger={handleCancelGTT}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
