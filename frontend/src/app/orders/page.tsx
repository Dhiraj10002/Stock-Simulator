"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Navbar from "@/components/layout/Navbar";
import OrdersTable from "@/components/terminal/OrdersTable";
import TradesTable from "@/components/orders/TradesTable";
import ContractNoteView from "@/components/terminal/ContractNoteView";
import { DEMO_ORDERS, DEMO_TRADES } from "@/components/orders/OrdersDemoData";
import { formatPaise } from "@/lib/format";
import {
  ClipboardList,
  ArrowRight,
  RefreshCw,
  Clock,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Layers,
  Sparkles,
  Download,
  FileText,
} from "lucide-react";
import type { Order, Trade, Wallet, Portfolio, ApiResponse } from "@/types";

type OrdersTab = "orders" | "trades" | "contract-note";

export default function OrdersPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<OrdersTab>("orders");

  // Showcase Demo vs Live Ledger toggle
  const [useDemoData, setUseDemoData] = useState(true);

  const [token] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("auth_token") || "";
    }
    return "";
  });

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1";

  // Check URL query parameters for ?tab=contract-note or ?tab=trades
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab");
      if (tabParam === "contract-note" || tabParam === "trades" || tabParam === "orders") {
        setActiveTab(tabParam as OrdersTab);
      }
    }
  }, []);

  // 1. Fetch Orders via TanStack Query
  const {
    data: liveOrders = [],
    isLoading: loadingOrders,
    refetch: refetchOrders,
  } = useQuery<Order[]>({
    queryKey: ["orders", token],
    queryFn: async () => {
      if (!token) return [];
      try {
        const res = await fetch(`${apiUrl}/orders`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return [];
        const json: ApiResponse<Order[]> = await res.json();
        return json.data || [];
      } catch {
        return [];
      }
    },
    enabled: !!token,
    refetchInterval: token ? 5000 : false,
  });

  // 2. Fetch Trades via TanStack Query
  const {
    data: liveTrades = [],
    isLoading: loadingTrades,
    refetch: refetchTrades,
  } = useQuery<Trade[]>({
    queryKey: ["trades", token],
    queryFn: async () => {
      if (!token) return [];
      try {
        const res = await fetch(`${apiUrl}/trades`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return [];
        const json: ApiResponse<Trade[]> = await res.json();
        return json.data || [];
      } catch {
        return [];
      }
    },
    enabled: !!token,
    refetchInterval: token ? 5000 : false,
  });

  // 3. Fetch Wallet for Navbar margin
  const { data: wallet } = useQuery<Wallet>({
    queryKey: ["wallet", token],
    queryFn: async () => {
      if (!token) {
        return {
          uuid: "",
          cash_balance_paise: 100000000,
          available_balance_paise: 100000000,
          blocked_paise: 0,
        };
      }
      try {
        const res = await fetch(`${apiUrl}/wallet`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          return {
            uuid: "",
            cash_balance_paise: 100000000,
            available_balance_paise: 100000000,
            blocked_paise: 0,
          };
        }
        const json: ApiResponse<Wallet> = await res.json();
        return (
          json.data || {
            uuid: "",
            cash_balance_paise: 100000000,
            available_balance_paise: 100000000,
            blocked_paise: 0,
          }
        );
      } catch {
        return {
          uuid: "",
          cash_balance_paise: 100000000,
          available_balance_paise: 100000000,
          blocked_paise: 0,
        };
      }
    },
    enabled: !!token,
    refetchInterval: token ? 5000 : false,
  });

  // 4. Fetch Portfolio for Navbar unrealized PnL
  const { data: portfolio } = useQuery<Portfolio>({
    queryKey: ["portfolio", token],
    queryFn: async () => {
      if (!token) {
        return {
          invested_value_paise: 0,
          current_value_paise: 0,
          unrealized_pnl_paise: 0,
          positions: [],
        };
      }
      try {
        const res = await fetch(`${apiUrl}/portfolio`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          return {
            invested_value_paise: 0,
            current_value_paise: 0,
            unrealized_pnl_paise: 0,
            positions: [],
          };
        }
        const json: ApiResponse<Portfolio> = await res.json();
        return (
          json.data || {
            invested_value_paise: 0,
            current_value_paise: 0,
            unrealized_pnl_paise: 0,
            positions: [],
          }
        );
      } catch {
        return {
          invested_value_paise: 0,
          current_value_paise: 0,
          unrealized_pnl_paise: 0,
          positions: [],
        };
      }
    },
    enabled: !!token,
    refetchInterval: token ? 5000 : false,
  });

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

  // Determine active dataset (Demo vs Live)
  const displayOrders = useDemoData ? DEMO_ORDERS : liveOrders;
  const displayTrades = useDemoData ? DEMO_TRADES : liveTrades;

  // KPI Calculations
  const orderCounts = useMemo(() => {
    let open = 0;
    let executed = 0;
    let cancelled = 0;
    displayOrders.forEach((o) => {
      if (o.status === "OPEN" || o.status === "PENDING" || o.status === "TRIGGER_PENDING") {
        open++;
      } else if (o.status === "EXECUTED") {
        executed++;
      } else if (o.status === "CANCELLED" || o.status === "REJECTED") {
        cancelled++;
      }
    });
    return { all: displayOrders.length, open, executed, cancelled };
  }, [displayOrders]);

  const tradeMetrics = useMemo(() => {
    let turnoverPaise = 0;
    let realizedPnlPaise = 0;
    displayTrades.forEach((t) => {
      turnoverPaise += t.quantity * t.executed_price_paise;
      realizedPnlPaise += t.realized_pnl_paise ?? 0;
    });
    return {
      count: displayTrades.length,
      turnoverPaise,
      realizedPnlPaise,
    };
  }, [displayTrades]);

  const handleRefreshAll = () => {
    void refetchOrders();
    void refetchTrades();
  };

  // Export CSV
  const handleExportCSV = () => {
    const rows = [
      ["Order UUID", "Symbol", "Side", "Type", "Product", "Quantity", "Price (INR)", "Status", "Time"],
      ...displayOrders.map((o) => [
        o.uuid,
        o.symbol,
        o.side,
        o.type,
        o.product,
        o.quantity.toString(),
        (o.price_paise / 100).toFixed(2),
        o.status,
        o.created_at,
      ]),
    ];

    const csvContent = "data:text/csv;charset=utf-8," + rows.map((e) => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `orders_report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-150">
      <Navbar
        availableBalancePaise={wallet?.available_balance_paise}
        unrealizedPnlPaise={portfolio?.unrealized_pnl_paise}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* ===================================================================== */}
        {/* TOP HEADER & INSTITUTIONAL ACTIONS BAR                                */}
        {/* ===================================================================== */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <ClipboardList className="w-6 h-6 text-cyan-600 dark:text-cyan-400" />
                <span>Order Book & Execution Desk</span>
              </h1>

              {/* Elegant Luxury Segmented Capsule Switcher */}
              <div className="inline-flex items-center p-1 rounded-full bg-slate-100/90 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 shadow-xs backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => setUseDemoData(true)}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-tight transition-all duration-200 cursor-pointer select-none ${
                    useDemoData
                      ? "bg-white dark:bg-slate-900 text-cyan-700 dark:text-cyan-300 shadow-sm border border-slate-200/80 dark:border-slate-700"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  <Sparkles
                    className={`w-3.5 h-3.5 transition-colors ${
                      useDemoData ? "text-cyan-600 dark:text-cyan-400" : "text-slate-400"
                    }`}
                  />
                  <span>Showcase Demo</span>
                </button>

                <button
                  type="button"
                  onClick={() => setUseDemoData(false)}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-tight transition-all duration-200 cursor-pointer select-none ${
                    !useDemoData
                      ? "bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 shadow-sm border border-slate-200/80 dark:border-slate-700"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  <span className="relative flex h-2 w-2">
                    {!useDemoData && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    )}
                    <span
                      className={`relative inline-flex rounded-full h-2 w-2 ${
                        !useDemoData ? "bg-emerald-500" : "bg-slate-400"
                      }`}
                    ></span>
                  </span>
                  <span>Live Ledger</span>
                </button>
              </div>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2">
              <span>Live pending orders, filled trade records, and execution logs across Equity & F&O derivatives.</span>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                Exchange Synced
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleExportCSV}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
              title="Export CSV Orders Report"
            >
              <Download className="w-4 h-4" />
            </button>

            <button
              onClick={handleRefreshAll}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
              title="Refresh Orders & Trades"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            <Link
              href="/stocks/ITC"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 font-bold text-xs shadow-md shadow-cyan-500/20 transition-all hover:scale-[1.02]"
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Explore Stocks</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* ===================================================================== */}
        {/* TOP KPI CARDS (TOTAL ORDERS, EXECUTED, TURNOVER, REALIZED P&L)         */}
        {/* ===================================================================== */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Orders Card */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2 group hover:border-cyan-500/40 transition-all">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <ClipboardList className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                <span>Total Orders</span>
              </span>
              <span className="text-[10px] font-mono text-cyan-600 dark:text-cyan-400">Ledger</span>
            </span>
            <div className="text-2xl font-black font-tabular text-slate-900 dark:text-slate-100">
              {orderCounts.all}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2 font-mono">
              <span className="text-cyan-600 dark:text-cyan-400 font-bold">{orderCounts.open} Open</span>
              <span>·</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">{orderCounts.executed} Filled</span>
              <span>·</span>
              <span className="text-slate-400">{orderCounts.cancelled} Cancelled</span>
            </div>
          </div>

          {/* Executed Fills Card */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2 group hover:border-cyan-500/40 transition-all">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Executed Fills</span>
              </span>
              <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">100% Rate</span>
            </span>
            <div className="text-2xl font-black font-tabular text-slate-900 dark:text-slate-100">
              {tradeMetrics.count}
            </div>
            <span className="text-[11px] text-slate-400">Completed exchange transactions</span>
          </div>

          {/* Gross Turnover Card */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2 group hover:border-cyan-500/40 transition-all">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-amber-500" />
                <span>Turnover Today</span>
              </span>
              <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400">NSE Volume</span>
            </span>
            <div className="text-2xl font-black font-tabular text-slate-900 dark:text-slate-100">
              {formatPaise(tradeMetrics.turnoverPaise)}
            </div>
            <span className="text-[11px] text-slate-400">Gross traded contract value</span>
          </div>

          {/* Realized P&L Card */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2 group hover:border-cyan-500/40 transition-all">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                {tradeMetrics.realizedPnlPaise >= 0 ? (
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                )}
                <span>Realized P&L</span>
              </span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                  tradeMetrics.realizedPnlPaise >= 0
                    ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400"
                    : "bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400"
                }`}
              >
                Booked
              </span>
            </span>
            <div
              className={`text-2xl font-black font-tabular ${
                tradeMetrics.realizedPnlPaise >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {tradeMetrics.realizedPnlPaise >= 0 ? "+" : ""}
              {formatPaise(tradeMetrics.realizedPnlPaise)}
            </div>
            <span className="text-[11px] text-slate-400">Closed position booked returns</span>
          </div>
        </div>

        {/* ===================================================================== */}
        {/* MAIN WORKSPACE TABS (ORDERS & TRADE FILLS - GTT REMOVED)              */}
        {/* ===================================================================== */}
        <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          {/* Segmented Tab Navigation Header */}
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab("orders")}
                className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === "orders"
                    ? "bg-cyan-600 dark:bg-cyan-500 text-white dark:text-slate-950 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800"
                }`}
              >
                <ClipboardList className="w-3.5 h-3.5" />
                <span>Orders</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                    activeTab === "orders"
                      ? "bg-white/25 text-white dark:bg-slate-950/20 dark:text-slate-950"
                      : "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-400"
                  }`}
                >
                  {displayOrders.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("trades")}
                className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === "trades"
                    ? "bg-cyan-600 dark:bg-cyan-500 text-white dark:text-slate-950 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800"
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Trade Fills</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                    activeTab === "trades"
                      ? "bg-white/25 text-white dark:bg-slate-950/20 dark:text-slate-950"
                      : "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-400"
                  }`}
                >
                  {displayTrades.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("contract-note")}
                className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === "contract-note"
                    ? "bg-cyan-600 dark:bg-cyan-500 text-white dark:text-slate-950 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800"
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Daily Contract Note</span>
                <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 font-bold">
                  SEBI
                </span>
              </button>
            </div>

            <div className="text-[11px] font-mono text-slate-400">
              Live Order Stream • NFO / NSE
            </div>
          </div>

          {/* Tab Viewport */}
          <div>
            {activeTab === "orders" && (
              <>
                {!useDemoData && loadingOrders ? (
                  <div className="p-16 text-center text-slate-500">
                    <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-xs">Loading order book from exchange…</p>
                  </div>
                ) : (
                  <OrdersTable orders={displayOrders} onCancelOrder={handleCancelOrder} />
                )}
              </>
            )}

            {activeTab === "trades" && (
              <>
                {!useDemoData && loadingTrades ? (
                  <div className="p-16 text-center text-slate-500">
                    <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-xs">Loading trade execution logs…</p>
                  </div>
                ) : (
                  <TradesTable trades={displayTrades} />
                )}
              </>
            )}

            {activeTab === "contract-note" && (
              <div className="p-4 sm:p-6">
                <ContractNoteView
                  token={token}
                  apiUrl={apiUrl}
                  useDemoData={useDemoData}
                />
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
