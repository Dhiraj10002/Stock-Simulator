"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Layers,
  Clock,
  Newspaper,
  Bot,
  RefreshCw,
} from "lucide-react";
import Header from "@/components/terminal/Header";
import WatchlistSidebar from "@/components/terminal/WatchlistSidebar";
import ChartPanel from "@/components/terminal/ChartPanel";
import OrderEntryTicket from "@/components/terminal/OrderEntryTicket";
import PositionsTable from "@/components/terminal/PositionsTable";
import OrdersTable from "@/components/terminal/OrdersTable";
import LedgerModal from "@/components/terminal/LedgerModal";
import TradeCopilot from "@/components/terminal/TradeCopilot";
import OptionChainModal from "@/components/terminal/OptionChainModal";
import PerformanceModal from "@/components/terminal/PerformanceModal";
import { useToast } from "@/components/terminal/ToastProvider";
import { getDefaultQuotes, getOrSeedQuote } from "@/lib/mockData";
import type {
  User,
  Wallet,
  Portfolio,
  Order,
  Position,
  Transaction,
  Quote,
  Article,
  ApiResponse,
  OptionContract,
} from "@/types";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api/v1";
const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8080/ws/market";

function getUnderlyingSymbol(sym: string): string {
  const upper = (sym || "").toUpperCase();
  for (const underlying of [
    "RELIANCE",
    "TCS",
    "INFY",
    "HDFCBANK",
    "BANKNIFTY",
    "NIFTY",
    "TATAMOTORS",
    "SBIN",
    "ICICIBANK",
    "AXISBANK",
    "KOTAKBANK",
    "ETERNAL",
    "APARINDS",
  ]) {
    if (upper.startsWith(underlying)) return underlying;
  }
  return "";
}

export default function TradingTerminal() {
  const { addToast } = useToast();

  const [token, setToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [user, setUser] = useState<User | null>(null);

  // Active Selected Symbol
  const [selectedSymbol, setSelectedSymbol] = useState("RELIANCE");

  // Domain State
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>(() => getDefaultQuotes());

  // Bottom Tabs: positions | orders | news | mentor
  const [bottomTab, setBottomTab] = useState<"positions" | "orders" | "news" | "mentor">("positions");

  // Modals & Async States
  const [isLedgerOpen, setIsLedgerOpen] = useState(false);
  const [isOptionChainOpen, setIsOptionChainOpen] = useState(false);
  const [isPerformanceOpen, setIsPerformanceOpen] = useState(false);
  const [prefillOrder, setPrefillOrder] = useState<{
    side?: "BUY" | "SELL";
    product?: "DELIVERY" | "INTRADAY" | "FNO";
    type?: "MARKET" | "LIMIT" | "SL" | "SL-M";
    quantity?: number;
    priceRupees?: number;
  } | null>(null);
  const [resetting, setResetting] = useState(false);
  const [activeWatchlistSymbols, setActiveWatchlistSymbols] = useState<string[]>([]);

  // Token refresh helper
  const tryRefreshToken = useCallback(async (): Promise<string | null> => {
    const curRefresh = refreshToken || localStorage.getItem("stock-simulator-refresh-token");
    if (!curRefresh) return null;
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: curRefresh }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.data?.access_token) {
        const newAccess = data.data.access_token as string;
        const newRefresh = (data.data.refresh_token as string) || curRefresh;
        setToken(newAccess);
        setRefreshToken(newRefresh);
        localStorage.setItem("stock-simulator-access-token", newAccess);
        localStorage.setItem("stock-simulator-refresh-token", newRefresh);
        return newAccess;
      }
    } catch {
      // ignore network glitch
    }
    // Refresh token expired or invalid: reset session cleanly
    localStorage.removeItem("stock-simulator-access-token");
    localStorage.removeItem("stock-simulator-refresh-token");
    setToken("");
    setRefreshToken("");
    setUser(null);
    return null;
  }, [refreshToken]);

  // Authenticated HTTP Request Helper
  const request = useCallback(
    async <T,>(path: string, options: RequestInit = {}): Promise<T> => {
      let activeToken = token;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
        ...((options.headers as Record<string, string>) || {}),
      };

      let response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers,
      });

      if (response.status === 401) {
        const newToken = await tryRefreshToken();
        if (newToken) {
          headers["Authorization"] = `Bearer ${newToken}`;
          response = await fetch(`${API_URL}${path}`, {
            ...options,
            headers,
          });
        }
      }

      const body = (await response.json()) as ApiResponse<T>;
      if (!response.ok || !body.success) {
        throw new Error(body.message || "Request failed");
      }
      return body.data;
    },
    [token, tryRefreshToken]
  );

  // Load account data from backend
  const loadData = useCallback(
    async (accessToken: string) => {
      try {
        const meRes = await fetch(`${API_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (meRes.status === 401) {
          const newToken = await tryRefreshToken();
          if (newToken) {
            return loadData(newToken);
          }
          return;
        }

        const [nextUser, nextWallet, nextPortfolio, nextOrders, nextTransactions] =
          await Promise.all([
            meRes.json().then((b) => b.data as User),
            fetch(`${API_URL}/wallet`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            })
              .then((r) => r.json())
              .then((b) => b.data as Wallet),
            fetch(`${API_URL}/portfolio`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            })
              .then((r) => r.json())
              .then((b) => b.data as Portfolio),
            fetch(`${API_URL}/orders`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            })
              .then((r) => r.json())
              .then((b) => (b.data ?? []) as Order[]),
            fetch(`${API_URL}/wallet/transactions`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            })
              .then((r) => r.json())
              .then((b) => (b.data ?? []) as Transaction[]),
          ]);

        setUser(nextUser);
        setWallet(nextWallet);
        setPortfolio(nextPortfolio);
        setOrders(nextOrders);
        setTransactions(nextTransactions);

        // Ensure every open position and its underlying stock has an active quote initialized
        if (nextPortfolio && Array.isArray(nextPortfolio.positions)) {
          setQuotes((prev) => {
            const next = { ...prev };
            nextPortfolio.positions.forEach((pos) => {
              if (!next[pos.symbol]) {
                next[pos.symbol] = {
                  symbol: pos.symbol,
                  price_paise: pos.current_price_paise || pos.average_price_paise,
                  change_percent: 0,
                  updated_at: new Date().toISOString(),
                };
              }
              const und = pos.underlying_symbol || getUnderlyingSymbol(pos.symbol);
              if (und && !next[und]) {
                next[und] = getOrSeedQuote(und);
              }
            });
            return next;
          });
        }
      } catch (err) {
        console.warn("Backend connectivity paused:", err instanceof Error ? err.message : err);
      }
    },
    [tryRefreshToken]
  );

  // Restore session from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("stock-simulator-access-token");
    const savedRefresh = localStorage.getItem("stock-simulator-refresh-token");
    if (saved) {
      setTimeout(() => {
        setToken(saved);
        setRefreshToken(savedRefresh ?? "");
        void loadData(saved);
      }, 0);
    }
  }, [loadData]);

  // WebSocket Subscription for Real-time Quotes
  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout;

    const connect = () => {
      socket = new WebSocket(WS_URL);

      socket.onopen = () => {
        socket?.send(
          JSON.stringify({
            action: "subscribe",
            symbols: [
              "RELIANCE",
              "TCS",
              "INFY",
              "HDFCBANK",
              "NIFTY",
              "BANKNIFTY",
            ],
          })
        );
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === "quote" && payload.quote) {
            const q: Quote = payload.quote;
            setQuotes((prev) => {
              const old = prev[q.symbol];
              const changePercent =
                old && old.price_paise > 0
                  ? ((q.price_paise - old.price_paise) / old.price_paise) * 100
                  : q.change_percent ?? 0;
              return {
                ...prev,
                [q.symbol]: { ...q, change_percent: changePercent },
              };
            });
          }
        } catch {
          // ignore parse errors
        }
      };

      socket.onerror = () => {
        socket?.close();
      };

      socket.onclose = () => {
        reconnectTimeout = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      socket?.close();
    };
  }, []);

  // Prefetch authoritative quotes from backend on mount
  useEffect(() => {
    const symbols = ["RELIANCE", "TCS", "INFY", "HDFCBANK", "NIFTY", "BANKNIFTY", "ETERNAL", "APARINDS"];
    symbols.forEach((sym) => {
      fetch(`${API_URL}/market/quotes/${sym}`)
        .then((res) => res.json())
        .then((body) => {
          if (body.success && body.data) {
            setQuotes((prev) => ({
              ...prev,
              [sym]: {
                ...prev[sym],
                ...body.data,
                change_percent:
                  body.data.change_percent !== undefined && body.data.change_percent !== 0
                    ? body.data.change_percent
                    : prev[sym]?.change_percent ?? 0.35,
              },
            }));
          }
        })
        .catch(() => {});
    });
  }, []);

  // Ensure any newly searched or selected symbol has a quote immediately seeded
  useEffect(() => {
    if (!quotes[selectedSymbol]) {
      setQuotes((prev) => ({
        ...prev,
        [selectedSymbol]: getOrSeedQuote(selectedSymbol),
      }));
    }
    fetch(`${API_URL}/market/quotes/${selectedSymbol}`)
      .then((res) => res.json())
      .then((body) => {
        if (body.success && body.data) {
          setQuotes((prev) => ({
            ...prev,
            [selectedSymbol]: {
              ...prev[selectedSymbol],
              ...body.data,
            },
          }));
        }
      })
      .catch(() => {});
  }, [selectedSymbol]);

  // Simulated Micro-Jitter (24/7 Live Practice Feed for selected symbol, holdings & heavyweights)
  useEffect(() => {
    const interval = setInterval(() => {
      setQuotes((prev) => {
        const activeSymbols = new Set<string>([selectedSymbol]);
        if (portfolio?.positions) {
          portfolio.positions.forEach((p) => {
            activeSymbols.add(p.symbol);
            const und = p.underlying_symbol || getUnderlyingSymbol(p.symbol);
            if (und) activeSymbols.add(und);
          });
        }
        ["RELIANCE", "TCS", "INFY", "HDFCBANK", "NIFTY", "BANKNIFTY"].forEach((s) =>
          activeSymbols.add(s)
        );

        const next = { ...prev };
        activeSymbols.forEach((sym) => {
          const cur = next[sym] ?? getOrSeedQuote(sym);
          const deltaPct = (Math.random() - 0.495) * 0.05;
          const deltaPaise = Math.round(cur.price_paise * (deltaPct / 100));
          const newPrice = Math.max(10, cur.price_paise + deltaPaise);
          const changePct =
            cur.change_percent !== undefined && cur.change_percent !== 0
              ? Number((cur.change_percent + deltaPct).toFixed(2))
              : Number((deltaPct * 4).toFixed(2));

          next[sym] = {
            ...cur,
            price_paise: newPrice,
            change_percent: changePct,
            high_paise: Math.max(cur.high_paise ?? newPrice, newPrice),
            low_paise: Math.min(cur.low_paise ?? newPrice, newPrice),
            updated_at: new Date().toISOString(),
          };
        });

        return next;
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [selectedSymbol, portfolio]);

  // Dynamically augment portfolio with live quotes and option delta pricing
  const augmentedPortfolio = useMemo(() => {
    if (!portfolio) return null;
    let totalInvested = 0;
    let totalCurrent = 0;
    let totalUnrealized = 0;

    const augmentedPositions = portfolio.positions.map((pos) => {
      const q = quotes[pos.symbol];
      let currentPricePaise = q?.price_paise ?? pos.current_price_paise;

      // Dynamic F&O Option Pricing & P&L calculation based on underlying equity movement
      const isFno =
        pos.product === "FNO" ||
        pos.symbol.includes("CE") ||
        pos.symbol.includes("PE") ||
        pos.symbol.includes("FUT");

      if (isFno) {
        const und = pos.underlying_symbol || getUnderlyingSymbol(pos.symbol);
        const undQuote = und ? quotes[und] : null;
        if (undQuote && undQuote.change_percent !== undefined) {
          const isCall = pos.symbol.includes("CE");
          const isPut = pos.symbol.includes("PE");
          const deltaLeverage = isCall ? 4.5 : isPut ? -4.5 : 1.0;
          const optChangePct = (undQuote.change_percent || 0) * deltaLeverage;
          currentPricePaise = Math.max(
            5,
            Math.round(pos.average_price_paise * (1 + optChangePct / 100))
          );
        }
      }

      const qty = pos.quantity;
      const avgPrice = pos.average_price_paise;

      let pnlPaise = 0;
      if (qty > 0) {
        pnlPaise = (currentPricePaise - avgPrice) * qty;
      } else {
        pnlPaise = (avgPrice - currentPricePaise) * Math.abs(qty);
      }

      const investedPaise = avgPrice * Math.abs(qty);
      const currentValPaise = currentPricePaise * Math.abs(qty);

      totalInvested += investedPaise;
      totalCurrent += currentValPaise;
      totalUnrealized += pnlPaise;

      return {
        ...pos,
        current_price_paise: currentPricePaise,
        invested_value_paise: investedPaise,
        current_value_paise: currentValPaise,
        unrealized_pnl_paise: pnlPaise,
      };
    });

    return {
      ...portfolio,
      invested_value_paise: totalInvested,
      current_value_paise: totalCurrent,
      unrealized_pnl_paise: totalUnrealized,
      positions: augmentedPositions,
    };
  }, [portfolio, quotes]);

  // One-click square off handler
  const handleSquareOff = async (pos: Position) => {
    try {
      const side = pos.quantity > 0 ? "SELL" : "BUY";
      const quantity = Math.abs(pos.quantity);

      await request<Order>("/orders", {
        method: "POST",
        body: JSON.stringify({
          symbol: pos.symbol,
          side,
          type: "MARKET",
          product: pos.product,
          quantity,
          price_paise: 0,
        }),
      });

      addToast(
        "Position Squared Off",
        `Liquidated ${quantity} ${pos.symbol} at market price.`,
        "success"
      );
      void loadData(token);
    } catch (err) {
      addToast(
        "Square-off Failed",
        err instanceof Error ? err.message : "Error closing position",
        "error"
      );
    }
  };

  // Square off all open intraday (MIS) positions
  const handleSquareOffAllMIS = async () => {
    try {
      const res = await request<ApiResponse<{ closed_positions_count: number }>>("/orders/squareoff-mis", {
        method: "POST",
      });
      addToast(
        "MIS Square-Off Completed",
        res.message || "All intraday MIS positions closed and pending orders cancelled.",
        "success"
      );
      void loadData(token);
    } catch (err) {
      addToast(
        "MIS Square-Off Failed",
        err instanceof Error ? err.message : "Error executing MIS square-off",
        "error"
      );
    }
  };

  // Cancel order handler
  const handleCancelOrder = async (order: Order) => {
    try {
      await request<null>(`/orders/${order.uuid}`, {
        method: "DELETE",
      });
      addToast(
        "Order Cancelled",
        `Order ${order.symbol} (${order.side} ${order.quantity}) cancelled. Reserved funds released.`,
        "info"
      );
      void loadData(token);
    } catch (err) {
      addToast(
        "Cancellation Failed",
        err instanceof Error ? err.message : "Error cancelling order",
        "error"
      );
    }
  };

  // Simulation reset handler
  const handleResetSimulation = async () => {
    setResetting(true);
    try {
      await request<null>("/simulation/reset", {
        method: "POST",
      });
      addToast(
        "Simulation Reset",
        "Portfolio cleared and wallet restored to ₹10,00,000 cash.",
        "success"
      );
      void loadData(token);
    } catch (err) {
      addToast(
        "Reset Failed",
        err instanceof Error ? err.message : "Error resetting simulation",
        "error"
      );
    } finally {
      setResetting(false);
    }
  };

  const handleSignOut = async () => {
    if (refreshToken) {
      try {
        await request<null>("/auth/logout", {
          method: "POST",
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
      } catch {
        // ignore logout server error
      }
    }
    localStorage.removeItem("stock-simulator-access-token");
    localStorage.removeItem("stock-simulator-refresh-token");
    setToken("");
    setUser(null);
    addToast("Signed Out", "You have been logged out.", "info");
  };

  const handleSelectOptionContract = (contract: OptionContract, side: "BUY" | "SELL") => {
    const contractPriceRupees = contract.ltp_paise / 100;
    setQuotes((prev) => ({
      ...prev,
      [contract.symbol]: {
        symbol: contract.symbol,
        price_paise: contract.ltp_paise,
        change_percent: 0,
        open_paise: contract.ltp_paise,
        high_paise: Math.round(contract.ltp_paise * 1.05),
        low_paise: Math.round(contract.ltp_paise * 0.95),
        lower_circuit_paise: Math.round(contract.ltp_paise * 0.8),
        upper_circuit_paise: Math.round(contract.ltp_paise * 1.2),
        updated_at: new Date().toISOString(),
      },
    }));

    setSelectedSymbol(contract.symbol);
    setPrefillOrder({
      side,
      product: "FNO",
      type: "LIMIT",
      quantity: contract.lot_size,
      priceRupees: contractPriceRupees,
    });
    addToast(
      `Loaded ${contract.symbol}`,
      `Selected ${contract.option_type} strike at ₹${contractPriceRupees.toFixed(2)} (Lot: ${contract.lot_size})`,
      "info"
    );
  };

  const handleQuickOrder = useCallback(
    (symbol: string, side: "BUY" | "SELL") => {
      setSelectedSymbol(symbol);
      setPrefillOrder({ side });
      addToast(
        `Quick ${side} Primed`,
        `Selected ${symbol} with ${side} action ready in ticket`,
        "info"
      );
    },
    [addToast]
  );

  // Global Institutional Hotkeys Listener
  useEffect(() => {
    if (!token) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is currently typing in an input or editable field
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      // Escape closes open modals
      if (e.key === "Escape") {
        if (isOptionChainOpen) setIsOptionChainOpen(false);
        else if (isLedgerOpen) setIsLedgerOpen(false);
        else if (isPerformanceOpen) setIsPerformanceOpen(false);
        return;
      }

      // 'b' or 'B' -> Prime BUY on selected symbol
      if (e.key === "b" || e.key === "B") {
        e.preventDefault();
        handleQuickOrder(selectedSymbol, "BUY");
        return;
      }

      // 's' or 'S' -> Prime SELL on selected symbol
      if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        handleQuickOrder(selectedSymbol, "SELL");
        return;
      }

      // 'o' or 'O' -> Toggle Option Chain
      if (e.key === "o" || e.key === "O") {
        e.preventDefault();
        setIsOptionChainOpen((prev) => !prev);
        return;
      }

      // 'l' or 'L' -> Toggle Ledger
      if (e.key === "l" || e.key === "L") {
        e.preventDefault();
        setIsLedgerOpen((prev) => !prev);
        return;
      }

      // 'p' or 'P' -> Toggle Performance Analytics
      if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        setIsPerformanceOpen((prev) => !prev);
        return;
      }

      // ArrowUp / ArrowDown -> Cycle through active watchlist symbols
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (activeWatchlistSymbols.length > 0) {
          const curIdx = activeWatchlistSymbols.indexOf(selectedSymbol);
          const nextIdx = curIdx <= 0 ? activeWatchlistSymbols.length - 1 : curIdx - 1;
          setSelectedSymbol(activeWatchlistSymbols[nextIdx]);
        }
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (activeWatchlistSymbols.length > 0) {
          const curIdx = activeWatchlistSymbols.indexOf(selectedSymbol);
          const nextIdx =
            curIdx === -1 || curIdx >= activeWatchlistSymbols.length - 1 ? 0 : curIdx + 1;
          setSelectedSymbol(activeWatchlistSymbols[nextIdx]);
        }
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    token,
    selectedSymbol,
    activeWatchlistSymbols,
    isOptionChainOpen,
    isLedgerOpen,
    isPerformanceOpen,
    handleQuickOrder,
  ]);

  if (!token) {
    return (
      <AuthScreen
        onAuthenticated={(access, refresh) => {
          localStorage.setItem("stock-simulator-access-token", access);
          localStorage.setItem("stock-simulator-refresh-token", refresh);
          setToken(access);
          setRefreshToken(refresh);
          void loadData(access);
        }}
        onToast={addToast}
        apiUrl={API_URL}
      />
    );
  }

  const activeQuote = quotes[selectedSymbol] ?? getOrSeedQuote(selectedSymbol);

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Institutional Header */}
      <Header
        user={user}
        wallet={wallet}
        portfolio={augmentedPortfolio}
        onSignOut={handleSignOut}
        onOpenLedger={() => setIsLedgerOpen(true)}
        onOpenOptionChain={() => setIsOptionChainOpen(true)}
        onOpenPerformance={() => setIsPerformanceOpen(true)}
        onResetSimulation={handleResetSimulation}
        onSquareOffMIS={handleSquareOffAllMIS}
        resetting={resetting}
      />

      {/* Main Terminal Workspace */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Watchlist Sidebar */}
        <WatchlistSidebar
          selectedSymbol={selectedSymbol}
          onSelectSymbol={setSelectedSymbol}
          quotes={quotes}
          apiUrl={API_URL}
          onQuickOrder={handleQuickOrder}
          positions={augmentedPortfolio?.positions ?? []}
          onActiveSymbolsChange={setActiveWatchlistSymbols}
        />

        {/* Center Canvas: Chart on Top, Tabbed Desk on Bottom */}
        <div className="flex-1 flex flex-col overflow-hidden border-r border-slate-800/80">
          {/* Top: TradingView Candlestick Chart */}
          <ChartPanel
            symbol={selectedSymbol}
            quote={activeQuote}
            apiUrl={API_URL}
          />

          {/* Bottom Tabbed Desk: Positions | Orders | News | AI Mentor */}
          <div className="h-[280px] lg:h-[300px] flex flex-col border-t border-slate-800/80 bg-slate-950/80 backdrop-blur-sm">
            {/* Tab Selector Strip */}
            <div className="flex items-center justify-between px-4 border-b border-slate-800/80 bg-slate-900/40">
              <div className="flex items-center gap-2">
                {[
                  {
                    id: "positions",
                    label: "Positions",
                    icon: Layers,
                    count: augmentedPortfolio?.positions.length ?? 0,
                  },
                  {
                    id: "orders",
                    label: "Orders",
                    icon: Clock,
                    count: orders.length,
                  },
                  {
                    id: "news",
                    label: "Market News",
                    icon: Newspaper,
                  },
                  {
                    id: "mentor",
                    label: "AI Mentor",
                    icon: Bot,
                  },
                ].map((tab) => {
                  const Icon = tab.icon;
                  const isActive = bottomTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setBottomTab(tab.id as "positions" | "orders" | "news" | "mentor")}
                      className={`flex items-center gap-1.5 py-2.5 px-3 text-xs font-semibold border-b-2 transition-all ${
                        isActive
                          ? "border-cyan-400 text-cyan-300"
                          : "border-transparent text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{tab.label}</span>
                      {tab.count !== undefined && tab.count > 0 && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300">
                          {tab.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => void loadData(token)}
                title="Refresh Workspace"
                className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Tab Contents */}
            <div className="flex-1 overflow-y-auto">
              {bottomTab === "positions" && (
                <PositionsTable
                  positions={augmentedPortfolio?.positions ?? []}
                  onSquareOff={handleSquareOff}
                  onSquareOffAllMIS={handleSquareOffAllMIS}
                />
              )}
              {bottomTab === "orders" && (
                <OrdersTable
                  orders={orders}
                  onCancelOrder={handleCancelOrder}
                />
              )}
              {bottomTab === "news" && <NewsFeed token={token} apiUrl={API_URL} />}
              {bottomTab === "mentor" && <TradeCopilot token={token} apiUrl={API_URL} />}
            </div>
          </div>
        </div>

        {/* Right Dock: Order Entry Ticket */}
        <OrderEntryTicket
          symbol={selectedSymbol}
          quote={activeQuote}
          wallet={wallet}
          positions={augmentedPortfolio?.positions ?? []}
          onOrderPlaced={() => void loadData(token)}
          onRequest={request}
          onToast={addToast}
          prefill={prefillOrder}
        />
      </div>

      {/* Double-Entry Ledger Statement Modal */}
      <LedgerModal
        isOpen={isLedgerOpen}
        onClose={() => setIsLedgerOpen(false)}
        wallet={wallet}
        transactions={transactions}
      />

      {/* F&O Option Chain Modal */}
      <OptionChainModal
        isOpen={isOptionChainOpen}
        onClose={() => setIsOptionChainOpen(false)}
        apiUrl={API_URL}
        initialSymbol={selectedSymbol}
        onSelectContract={handleSelectOptionContract}
      />

      {/* Institutional Hotkeys Status Strip */}
      <footer className="px-3 py-1 bg-slate-950/95 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 select-none shrink-0 z-10 font-sans">
        <div className="flex items-center gap-2.5 overflow-x-auto">
          <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Shortcuts:</span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.2 rounded bg-slate-800 text-emerald-400 font-mono text-[10px] font-bold border border-slate-700">B</kbd>
            <span>Buy</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.2 rounded bg-slate-800 text-rose-400 font-mono text-[10px] font-bold border border-slate-700">S</kbd>
            <span>Sell</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.2 rounded bg-slate-800 text-cyan-300 font-mono text-[10px] font-bold border border-slate-700">↑↓</kbd>
            <span>Cycle Watchlist</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-mono text-[10px] font-bold border border-slate-700">O</kbd>
            <span>F&O Chain</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-mono text-[10px] font-bold border border-slate-700">L</kbd>
            <span>Ledger</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-mono text-[10px] font-bold border border-slate-700">P</kbd>
            <span>Analytics</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono text-[10px] font-bold border border-slate-700">Esc</kbd>
            <span>Close</span>
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-[10px] text-slate-500 font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>NSE / BSE Simulated Real-Time Feeds</span>
        </div>
      </footer>
    </div>
  );
}

// -------------------------------------------------------------
// Authentication Screen (Sign In & Registration)
// -------------------------------------------------------------
function AuthScreen({
  onAuthenticated,
  onToast,
  apiUrl,
}: {
  onAuthenticated: (access: string, refresh: string) => void;
  onToast: (title: string, message?: string, type?: "success" | "error" | "info") => void;
  apiUrl: string;
}) {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isRegister) {
        const regRes = await fetch(`${apiUrl}/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password }),
        });
        const regBody = await regRes.json();
        if (!regRes.ok || !regBody.success) {
          throw new Error(regBody.message || "Registration failed");
        }
        onToast("Account Created", "Welcome to Stock Simulator!", "success");
      }

      const loginRes = await fetch(`${apiUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const loginBody = await loginRes.json();
      if (!loginRes.ok || !loginBody.success) {
        throw new Error(loginBody.message || "Invalid email or password");
      }

      const { access_token, refresh_token } = loginBody.data;
      onAuthenticated(access_token, refresh_token);
    } catch (err) {
      onToast(
        "Authentication Failed",
        err instanceof Error ? err.message : "Error authenticating",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-slate-950 relative overflow-hidden">
      {/* Ambient background glows */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-cyan-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-emerald-600/15 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-3xl p-8 shadow-2xl backdrop-blur-xl relative z-10 space-y-6">
        <div className="text-center space-y-1.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-500 to-emerald-400 mx-auto flex items-center justify-center font-black text-slate-950 text-xl shadow-lg shadow-cyan-500/20 mb-4">
            SS
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">
            {isRegister ? "Create Account" : "Sign In to Terminal"}
          </h1>
          <p className="text-xs text-slate-400">
            Professional Indian paper trading with real market data.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-400">
                Full Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Rahul Sharma"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50"
              />
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-400">
              Email Address
            </label>
            <input
              type="email"
              required
              placeholder="trader@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-400">
              Password
            </label>
            <input
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-bold text-sm shadow-xl shadow-cyan-500/20 transition-all disabled:opacity-50"
          >
            {loading ? "Authenticating…" : isRegister ? "Register & Receive ₹10,00,000" : "Access Terminal"}
          </button>
        </form>

        <div className="text-center">
          <button
            type="button"
            onClick={() => setIsRegister(!isRegister)}
            className="text-xs text-cyan-400 hover:text-cyan-300 font-medium transition-colors"
          >
            {isRegister
              ? "Already have an account? Sign In"
              : "New trader? Create account & get ₹10,00,000"}
          </button>
        </div>
      </div>
    </main>
  );
}

// -------------------------------------------------------------
// News Sentiment Tab
// -------------------------------------------------------------
function NewsFeed({ token, apiUrl }: { token: string; apiUrl: string }) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${apiUrl}/news?limit=25`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((b) => {
        setArticles(b.data ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [token, apiUrl]);

  if (loading) {
    return (
      <div className="p-8 text-center text-xs text-slate-500">
        Loading financial news feeds…
      </div>
    );
  }

  if (articles.length === 0) {
    return (
      <div className="p-8 text-center text-xs text-slate-500">
        No news articles ingested yet. Start the Python news worker to stream live headlines.
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-800/40 p-4">
      {articles.map((art, idx) => (
        <article key={idx} className="py-2.5 flex items-start gap-3 text-xs">
          <span
            className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase mt-0.5 ${
              art.sentiment === "POSITIVE"
                ? "bg-emerald-950 text-emerald-400 border border-emerald-800/40"
                : art.sentiment === "NEGATIVE"
                ? "bg-rose-950 text-rose-400 border border-rose-800/40"
                : "bg-slate-800 text-slate-300"
            }`}
          >
            {art.sentiment}
          </span>
          <div className="flex-1">
            <a
              href={art.url}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-slate-200 hover:text-cyan-400 transition-colors"
            >
              {art.title}
            </a>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {art.source} · {new Date(art.published_at).toLocaleString()}
            </p>
          </div>
        </article>
      ))}
    </div>
  );
}
