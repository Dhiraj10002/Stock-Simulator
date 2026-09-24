"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import {
  Layers,
  Clock,
  Newspaper,
  Bot,
  RefreshCw,
  Crosshair,
  TrendingUp,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Mail,
  Lock,
  User as UserIcon,
  Zap,
  Shield,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import Header from "@/components/terminal/Header";
import WatchlistSidebar from "@/components/terminal/WatchlistSidebar";
import ChartPanel from "@/components/terminal/ChartPanel";
import OrderEntryTicket from "@/components/terminal/OrderEntryTicket";
import PositionsTable from "@/components/terminal/PositionsTable";
import OrdersTable from "@/components/terminal/OrdersTable";
import GTTTriggersTable from "@/components/terminal/GTTTriggersTable";
import LedgerModal from "@/components/terminal/LedgerModal";
import TradeCopilot from "@/components/terminal/TradeCopilot";
import OptionChainModal from "@/components/terminal/OptionChainModal";
import PerformanceModal from "@/components/terminal/PerformanceModal";
import { useToast } from "@/components/terminal/ToastProvider";
import { useMarketStore, useSymbolQuote } from "@/stores/market-store";
import { getAuthoritativeFeedStatus } from "@/lib/feedStatus";
import { fetchQuote, fetchBatchQuotes, getQuoteSync } from "@/lib/quoteService";
import { getIndianMarketStatus, formatPaise } from "@/lib/format";
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
  GTTTrigger,
} from "@/types";

import { API_URL } from "@/lib/api";

function getUnderlyingSymbol(sym: string): string {
  const upper = (sym || "").toUpperCase();
  const canonical = useMarketStore.getState().instruments[upper];
  if (canonical?.underlying) return canonical.underlying;
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

  const feedStatus = useMarketStore((s) => s.feedStatus);
  const serverMarketStatus = useMarketStore((s) => s.marketStatus);
  const connectionState = useMarketStore((s) => s.connectionState);
  const instrumentList = useMarketStore((s) => s.instrumentList);
  const clientMarket = getIndianMarketStatus();
  const authoritativeStatus = getAuthoritativeFeedStatus(
    feedStatus,
    serverMarketStatus,
    connectionState,
    clientMarket.istTime
  );

  const [token, setToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [user, setUser] = useState<User | null>(null);

  // Active Selected Symbol
  const [selectedSymbol, setSelectedSymbol] = useState("RELIANCE");

  // Mobile responsive view panel: "workspace" | "watchlist" | "ticket"
  const [mobilePanel, setMobilePanel] = useState<"workspace" | "watchlist" | "ticket">("workspace");

  // Domain State
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});



  // Bottom Tabs: positions | orders | gtt | news | mentor
  const [bottomTab, setBottomTab] = useState<"positions" | "orders" | "gtt" | "news" | "mentor">("positions");

  // Bracket & GTT State
  const [gttTriggers, setGttTriggers] = useState<GTTTrigger[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem("stock-simulator-gtt-triggers");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [previewTargetPrice, setPreviewTargetPrice] = useState<number | null>(null);
  const [previewStopLossPrice, setPreviewStopLossPrice] = useState<number | null>(null);

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

  // Fetch real backend quotes on initial mount and when active watchlist symbols change
  useEffect(() => {
    const canonicalSymbols = instrumentList.map((i) => i.symbol);
    const symbolsToFetch = Array.from(
      new Set([
        selectedSymbol,
        ...activeWatchlistSymbols,
        ...canonicalSymbols,
      ])
    ).filter(Boolean);
    let isCancelled = false;
    fetchBatchQuotes(symbolsToFetch)
      .then((batch) => {
        if (!isCancelled && Object.keys(batch).length > 0) {
          setQuotes((prev) => ({
            ...prev,
            ...batch,
          }));
        }
      })
      .catch(() => {});

    return () => {
      isCancelled = true;
    };
  }, [activeWatchlistSymbols, selectedSymbol]);

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
      const activeToken = token;
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
  const loadDataRef = useRef<(token: string) => Promise<void>>(async () => {});
  const loadData = useCallback(
    async (accessToken: string) => {
      try {
        const meRes = await fetch(`${API_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (meRes.status === 401) {
          const newToken = await tryRefreshToken();
          if (newToken) {
            return loadDataRef.current(newToken);
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
            fetch(`${API_URL}/trades`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            })
              .then((r) => r.json())
              .then((b) => (b.data ?? []) as Transaction[]),
          ]);

        if (nextUser) setUser(nextUser);
        if (nextWallet) setWallet(nextWallet);
        if (nextPortfolio) setPortfolio(nextPortfolio);
        if (nextOrders) setOrders(nextOrders);
        if (nextTransactions) setTransactions(nextTransactions);

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
                const uq = getQuoteSync(und);
                if (uq) next[und] = uq;
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
  useEffect(() => {
    loadDataRef.current = loadData;
  }, [loadData]);

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



  // Prefetch authoritative quotes from backend on mount
  useEffect(() => {
    const symbols = instrumentList.length > 0
      ? instrumentList.slice(0, 15).map((i) => i.symbol)
      : [selectedSymbol];
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
                    : prev[sym]?.change_percent ?? 0,
              },
            }));
          }
        })
        .catch(() => {});
    });
  }, []);

  // Fetch quote from backend whenever selectedSymbol changes
  useEffect(() => {
    let isCancelled = false;
    fetchQuote(selectedSymbol)
      .then((q) => {
        if (!isCancelled && q) {
          setQuotes((prev) => ({
            ...prev,
            [selectedSymbol]: q,
          }));
        }
      })
      .catch(() => {});
    return () => {
      isCancelled = true;
    };
  }, [selectedSymbol]);

  // Dynamically augment portfolio with live quotes and option delta pricing
  const augmentedPortfolio = useMemo(() => {
    if (!portfolio) return null;
    let totalInvested = 0;
    let totalCurrent = 0;
    let totalUnrealized = 0;

    const augmentedPositions = portfolio.positions.map((pos) => {
      const liveStoreQuotes = typeof window !== "undefined" ? useMarketStore.getState().quotes : {};
      const q = quotes[pos.symbol] ?? liveStoreQuotes[pos.symbol];
      let currentPricePaise = q?.price_paise ?? pos.current_price_paise;

      // Dynamic F&O Option Pricing & P&L calculation based on underlying equity movement
      const isFno =
        pos.product === "FNO" ||
        pos.symbol.includes("CE") ||
        pos.symbol.includes("PE") ||
        pos.symbol.includes("FUT");

      if (isFno) {
        const und = pos.underlying_symbol || getUnderlyingSymbol(pos.symbol);
        const undQuote = und ? (quotes[und] ?? liveStoreQuotes[und]) : null;
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

  // Register GTT / Bracket Order Triggers
  const handleRegisterGTT = useCallback(
    (gtt: {
      targetPriceRupees?: number;
      stopLossPriceRupees?: number;
      side: "BUY" | "SELL";
      product: "DELIVERY" | "INTRADAY" | "FNO";
      quantity: number;
      symbol: string;
      entryPriceRupees: number;
    }) => {
      const newTrigger: GTTTrigger = {
        id: `gtt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        symbol: gtt.symbol,
        side: gtt.side,
        product: gtt.product,
        quantity: gtt.quantity,
        entry_price_paise: Math.round(gtt.entryPriceRupees * 100),
        target_price_paise: gtt.targetPriceRupees
          ? Math.round(gtt.targetPriceRupees * 100)
          : undefined,
        stop_loss_price_paise: gtt.stopLossPriceRupees
          ? Math.round(gtt.stopLossPriceRupees * 100)
          : undefined,
        status: "ACTIVE",
        created_at: new Date().toISOString(),
      };

      setGttTriggers((prev) => {
        const updated = [newTrigger, ...prev];
        localStorage.setItem("stock-simulator-gtt-triggers", JSON.stringify(updated));
        return updated;
      });

      addToast(
        "Bracket Order Armed",
        `Active OCO triggers: Target ${
          gtt.targetPriceRupees ? `₹${gtt.targetPriceRupees.toFixed(2)}` : "None"
        } | SL ${
          gtt.stopLossPriceRupees ? `₹${gtt.stopLossPriceRupees.toFixed(2)}` : "None"
        }`,
        "info"
      );
    },
    [addToast]
  );

  // Cancel GTT Trigger
  const handleCancelGTT = useCallback(
    (triggerId: string) => {
      setGttTriggers((prev) => {
        const updated = prev.map((t) =>
          t.id === triggerId ? { ...t, status: "CANCELLED" as const } : t
        );
        localStorage.setItem("stock-simulator-gtt-triggers", JSON.stringify(updated));
        return updated;
      });
      addToast("Trigger Cancelled", "Automated bracket trigger deactivated.", "info");
    },
    [addToast]
  );

  // Live Automated Bracket / GTT Execution Monitor
  useEffect(() => {
    if (!token || !gttTriggers.some((t) => t.status === "ACTIVE")) return;

    gttTriggers.forEach((trigger) => {
      if (trigger.status !== "ACTIVE") return;

      const quote = quotes[trigger.symbol];
      if (!quote || quote.price_paise <= 0) return;

      const ltpPaise = quote.price_paise;
      const isLong = trigger.side === "BUY";
      const exitSide = isLong ? "SELL" : "BUY";

      let triggeredReason: "TARGET" | "SL" | null = null;

      if (isLong) {
        if (trigger.stop_loss_price_paise && ltpPaise <= trigger.stop_loss_price_paise) {
          triggeredReason = "SL";
        } else if (trigger.target_price_paise && ltpPaise >= trigger.target_price_paise) {
          triggeredReason = "TARGET";
        }
      } else {
        if (trigger.stop_loss_price_paise && ltpPaise >= trigger.stop_loss_price_paise) {
          triggeredReason = "SL";
        } else if (trigger.target_price_paise && ltpPaise <= trigger.target_price_paise) {
          triggeredReason = "TARGET";
        }
      }

      if (triggeredReason) {
        // Mark trigger executed immediately to prevent duplicate requests
        const newStatus: "TRIGGERED_TARGET" | "TRIGGERED_SL" =
          triggeredReason === "TARGET" ? "TRIGGERED_TARGET" : "TRIGGERED_SL";

        setGttTriggers((prev) => {
          const updated: GTTTrigger[] = prev.map((t) =>
            t.id === trigger.id
              ? { ...t, status: newStatus, triggered_at: new Date().toISOString() }
              : t
          );
          localStorage.setItem("stock-simulator-gtt-triggers", JSON.stringify(updated));
          return updated;
        });

        // Submit automated exit order to server
        request<Order>("/orders", {
          method: "POST",
          body: JSON.stringify({
            symbol: trigger.symbol,
            side: exitSide,
            type: "MARKET",
            product: trigger.product,
            quantity: trigger.quantity,
            price_paise: 0,
          }),
        })
          .then(() => {
            if (triggeredReason === "TARGET") {
              addToast(
                "🎯 GTT Target Achieved!",
                `Booked profit on ${trigger.quantity} ${trigger.symbol}. Bracket closed.`,
                "success"
              );
            } else {
              addToast(
                "🛑 GTT Stop-Loss Executed!",
                `Protected capital on ${trigger.quantity} ${trigger.symbol}. Position squared off.`,
                "error"
              );
            }
            void loadData(token);
          })
          .catch((err) => {
            addToast(
              "GTT Auto-Exit Error",
              err instanceof Error ? err.message : "Failed to execute automated GTT exit",
              "error"
            );
          });
      }
    });
  }, [quotes, gttTriggers, token, request, addToast, loadData]);

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
      setMobilePanel("ticket");
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

  const liveSelectedQuote = useSymbolQuote(selectedSymbol);
  const activeQuote = liveSelectedQuote ?? quotes[selectedSymbol] ?? getQuoteSync(selectedSymbol);

  if (!token) {
    return (
      <AuthScreen
        onAuthenticated={(access, refresh) => {
          localStorage.setItem("stock-simulator-access-token", access);
          localStorage.setItem("stock-simulator-refresh-token", refresh);
          localStorage.setItem("auth_token", access);
          setToken(access);
          setRefreshToken(refresh);
          window.location.href = "/";
        }}
        onToast={addToast}
        apiUrl={API_URL}
      />
    );
  }

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
        {/* Watchlist Sidebar (Responsive: full-width on mobile when mobilePanel === "watchlist", fixed col on desktop) */}
        <div
          className={`${
            mobilePanel === "watchlist" ? "flex" : "hidden"
          } lg:flex w-full lg:w-80 flex-col shrink-0 border-r border-slate-800/80 bg-slate-950/70`}
        >
          {/* Mobile Back Button */}
          <div className="lg:hidden flex items-center justify-between p-3 bg-slate-900/90 border-b border-slate-800 shrink-0">
            <button
              type="button"
              onClick={() => setMobilePanel("workspace")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-cyan-400 font-semibold text-xs active:scale-95 transition-transform"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Chart</span>
            </button>
            <span className="text-xs font-bold text-slate-200">Market Watchlist</span>
          </div>

          <WatchlistSidebar
            selectedSymbol={selectedSymbol}
            onSelectSymbol={(sym) => {
              setSelectedSymbol(sym);
              setMobilePanel("workspace");
            }}
            quotes={quotes}
            apiUrl={API_URL}
            onQuickOrder={handleQuickOrder}
            positions={augmentedPortfolio?.positions ?? []}
            onActiveSymbolsChange={setActiveWatchlistSymbols}
          />
        </div>

        {/* Center Canvas: Chart on Top, Tabbed Desk on Bottom */}
        <div
          className={`${
            mobilePanel === "workspace" ? "flex" : "hidden"
          } lg:flex flex-1 flex-col overflow-hidden border-r border-slate-800/80 min-w-0`}
        >
          {/* Top: TradingView Candlestick Chart */}
          <ChartPanel
            symbol={selectedSymbol}
            quote={activeQuote}
            apiUrl={API_URL}
            targetPriceRupees={previewTargetPrice}
            stopLossPriceRupees={previewStopLossPrice}
            entryPriceRupees={
              augmentedPortfolio?.positions?.find(
                (p) => p.symbol === selectedSymbol && p.quantity !== 0
              )
                ? (augmentedPortfolio.positions.find(
                    (p) => p.symbol === selectedSymbol && p.quantity !== 0
                  )!.average_price_paise / 100)
                : null
            }
          />

          {/* Mobile Sticky Quick-Trade Dock (visible only on mobile screens in workspace view) */}
          <div className="lg:hidden shrink-0 flex items-center justify-between gap-2 p-2.5 bg-slate-950/95 border-t border-slate-800/90 backdrop-blur-md">
            <button
              type="button"
              onClick={() => setMobilePanel("watchlist")}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300 active:scale-95 transition-transform"
            >
              <Bookmark className="w-3.5 h-3.5 text-cyan-400" />
              <span>Watchlist</span>
            </button>

            <div className="flex-1 min-w-0 text-center px-1">
              <div className="text-xs font-bold text-slate-100 truncate">{selectedSymbol}</div>
              <div className="text-[11px] font-mono text-slate-400">
                {activeQuote ? formatPaise(activeQuote.price_paise) : "--"}
                {activeQuote && activeQuote.change_percent !== undefined && (
                  <span
                    className={`ml-1 font-semibold ${
                      activeQuote.change_percent >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {activeQuote.change_percent >= 0 ? "+" : ""}
                    {activeQuote.change_percent.toFixed(2)}%
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setPrefillOrder({ side: "BUY" });
                  setMobilePanel("ticket");
                }}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs shadow-lg shadow-emerald-500/20 active:scale-95 transition-transform"
              >
                BUY
              </button>
              <button
                type="button"
                onClick={() => {
                  setPrefillOrder({ side: "SELL" });
                  setMobilePanel("ticket");
                }}
                className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-bold text-xs shadow-lg shadow-rose-500/20 active:scale-95 transition-transform"
              >
                SELL
              </button>
            </div>
          </div>

          {/* Bottom Tabbed Desk: Positions | Orders | GTT | News | AI Mentor */}
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
                    id: "gtt",
                    label: "GTT / Triggers",
                    icon: Crosshair,
                    count: gttTriggers.filter((t) => t.status === "ACTIVE").length,
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
                  {
                    id: "analytics",
                    label: "Analytics & P&L",
                    icon: TrendingUp,
                  },
                ].map((tab) => {
                  const Icon = tab.icon;
                  const isActive = bottomTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        if (tab.id === "analytics") {
                          setIsPerformanceOpen(true);
                        } else {
                          setBottomTab(
                            tab.id as "positions" | "orders" | "gtt" | "news" | "mentor"
                          );
                        }
                      }}
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
              {bottomTab === "gtt" && (
                <GTTTriggersTable
                  triggers={gttTriggers}
                  quotes={quotes}
                  onCancelTrigger={handleCancelGTT}
                />
              )}
              {bottomTab === "news" && <NewsFeed token={token} apiUrl={API_URL} />}
              {bottomTab === "mentor" && <TradeCopilot token={token} apiUrl={API_URL} />}
            </div>
          </div>
        </div>

        {/* Right Dock: Order Entry Ticket */}
        <div
          className={`${
            mobilePanel === "ticket" ? "flex" : "hidden"
          } lg:flex w-full lg:w-[320px] xl:w-[350px] flex-col shrink-0 overflow-y-auto`}
        >
          {/* Mobile Back Button */}
          <div className="lg:hidden flex items-center justify-between p-3 bg-slate-900/90 border-b border-slate-800 shrink-0">
            <button
              type="button"
              onClick={() => setMobilePanel("workspace")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-cyan-400 font-semibold text-xs active:scale-95 transition-transform"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Chart</span>
            </button>
            <span className="text-xs font-bold text-slate-200">
              Order Ticket: {selectedSymbol}
            </span>
          </div>

          <OrderEntryTicket
            symbol={selectedSymbol}
            quote={activeQuote}
            wallet={wallet}
            positions={augmentedPortfolio?.positions ?? []}
            onOrderPlaced={(gtt) => {
              void loadData(token);
              if (gtt && (gtt.targetPriceRupees || gtt.stopLossPriceRupees)) {
                handleRegisterGTT(gtt);
              }
              setMobilePanel("workspace");
            }}
            onRequest={request}
            onToast={addToast}
            prefill={prefillOrder}
            onPriceLevelsChange={(target, sl) => {
              setPreviewTargetPrice(target);
              setPreviewStopLossPrice(sl);
            }}
          />
        </div>
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
        token={token}
        initialSymbol={selectedSymbol}
        onSelectContract={handleSelectOptionContract}
        onStrategyExecuted={() => {
          if (token) {
            void loadData(token);
          }
        }}
      />

      {/* Performance Analytics & Trade Journal Modal */}
      <PerformanceModal
        isOpen={isPerformanceOpen}
        onClose={() => setIsPerformanceOpen(false)}
        apiUrl={API_URL}
        token={token}
      />

      {/* Institutional Hotkeys Status Strip */}
      <footer className="hidden md:flex px-3 py-1 bg-slate-950/95 border-t border-slate-800/80 items-center justify-between text-[11px] text-slate-400 select-none shrink-0 z-10 font-sans">
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
        <div className="hidden sm:flex items-center gap-2 text-[10px] text-slate-400 font-mono" title={authoritativeStatus.tooltip}>
          <span className={`w-1.5 h-1.5 rounded-full ${authoritativeStatus.dotClasses}`} />
          <span className="font-semibold">{authoritativeStatus.fullLabel}</span>
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

  const handleDemoAutofill = () => {
    setEmail("trader@example.com");
    setPassword("password123");
    if (isRegister) setName("Demo Scalper");
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-[#03060d] text-slate-100 relative overflow-hidden">
      {/* Background isometric grid & ambient nebula blooms */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b0d_1px,transparent_1px),linear-gradient(to_bottom,#1e293b0d_1px,transparent_1px)] bg-[size:4rem_4rem] pointer-events-none" />
      <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-cyan-500/12 rounded-full blur-[130px] pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] bg-orange-500/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-500/8 rounded-full blur-[160px] pointer-events-none" />

      {/* Main Dual-Pane Flight Console Card */}
      <div className="w-full max-w-4xl bg-[#090e1a]/90 border border-white/10 rounded-3xl shadow-2xl backdrop-blur-2xl relative z-10 overflow-hidden grid grid-cols-1 lg:grid-cols-12 transition-all">
        {/* Multi-Spectrum Top Hairline */}
        <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-gradient-to-r from-cyan-400 via-emerald-400 to-orange-400 z-20" />

        {/* Left Column: Brand & Live Market Telemetry (Col 5) */}
        <div className="lg:col-span-5 p-6 sm:p-8 bg-slate-950/60 border-b lg:border-b-0 lg:border-r border-white/[0.08] flex flex-col justify-between space-y-6">
          <div>
            {/* Back link */}
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-400 hover:text-cyan-300 mb-6 group transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform" />
              <span>Back to Overview</span>
            </Link>

            {/* Brand Title */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 via-teal-300 to-emerald-400 p-[1px] shadow-lg shadow-cyan-500/25 shrink-0">
                <div className="w-full h-full bg-slate-950 rounded-[11px] flex items-center justify-center font-black text-sm text-white">
                  SS
                </div>
              </div>
              <div>
                <h2 className="font-black text-base text-white tracking-tight">STOCK SIMULATOR</h2>
                <div className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest">
                  TRADING TERMINAL GATE
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed font-normal mb-6">
              Institutional-grade paper execution for Indian financial markets. Master cash equities, BankNifty options chains, and Greeks in real-time.
            </p>

            {/* Live Indian Market Telemetry Badges */}
            <div className="space-y-2.5 mb-6">
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-mono font-bold text-white">NIFTY 50</span>
                </div>
                <div className="text-right font-mono">
                  <div className="text-xs font-bold text-slate-200">25,378.40</div>
                  <div className="text-[10px] text-emerald-400 font-bold">+0.49%</div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-mono font-bold text-white">BANKNIFTY</span>
                </div>
                <div className="text-right font-mono">
                  <div className="text-xs font-bold text-slate-200">51,942.30</div>
                  <div className="text-[10px] text-emerald-400 font-bold">+0.61%</div>
                </div>
              </div>
            </div>

            {/* Micro Highlights */}
            <div className="space-y-2 text-[11px] font-mono text-slate-400">
              <div className="flex items-center gap-2 text-slate-300">
                <Zap className="w-3.5 h-3.5 text-cyan-400" />
                <span>Sub-30ms Order Matching Engine</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <Shield className="w-3.5 h-3.5 text-emerald-400" />
                <span>₹10,00,000 Free Virtual Capital</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                <span>AI Mentor Trade Debriefs</span>
              </div>
            </div>
          </div>

          {/* Engine Status */}
          <div className="pt-4 border-t border-white/[0.08] flex items-center justify-between text-[10px] font-mono text-slate-400">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              NSE FEED ACTIVE
            </span>
            <span>LATENCY: 24ms</span>
          </div>
        </div>

        {/* Right Column: Authentication Form Deck (Col 7) */}
        <div className="lg:col-span-7 p-6 sm:p-8 lg:p-10 flex flex-col justify-between space-y-6">
          <div className="space-y-5">
            {/* Tabbed Segmented Switch */}
            <div className="flex items-center justify-between gap-3">
              <div className="p-1 rounded-xl bg-slate-950/80 border border-white/[0.08] inline-flex items-center gap-1 text-xs font-mono">
                <button
                  type="button"
                  onClick={() => setIsRegister(false)}
                  className={`px-4 py-1.5 rounded-lg font-bold transition-all duration-200 ${
                    !isRegister
                      ? "bg-white/[0.12] text-white shadow-sm border border-white/10"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => setIsRegister(true)}
                  className={`px-4 py-1.5 rounded-lg font-bold transition-all duration-200 ${
                    isRegister
                      ? "bg-white/[0.12] text-white shadow-sm border border-white/10"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Create Account
                </button>
              </div>

              {/* 1-Click Fast-Track Demo Autofill Button */}
              <button
                type="button"
                onClick={handleDemoAutofill}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-[11px] font-mono font-bold transition-all hover:scale-105"
                title="Autofill with sample credentials for rapid review"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>1-Click Demo Fill</span>
              </button>
            </div>

            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                {isRegister ? "Activate Your Trader Account" : "Sign In to Terminal"}
              </h1>
              <p className="text-xs text-slate-400 mt-1 font-normal">
                {isRegister
                  ? "Instant signup with ₹10,00,000 risk-free seed allocation."
                  : "Enter your trader credentials to unlock your active positions & orders."}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {isRegister && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-mono font-semibold text-slate-300 flex items-center gap-1.5">
                    <UserIcon className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Full Name</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rahul Sharma"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-white/10 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-400/80 focus:ring-1 focus:ring-cyan-400/30 transition-all font-mono"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[11px] font-mono font-semibold text-slate-300 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Email Address</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="trader@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-white/10 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-400/80 focus:ring-1 focus:ring-cyan-400/30 transition-all font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-mono font-semibold text-slate-300 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Password</span>
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-white/10 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-400/80 focus:ring-1 focus:ring-cyan-400/30 transition-all font-mono"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl bg-[linear-gradient(135deg,#ff7a29_0%,#f43f5e_50%,#7c3aed_100%)] hover:bg-[linear-gradient(135deg,#ff8f4a_0%,#fb7185_50%,#8b5cf6_100%)] text-white font-bold text-sm tracking-wide shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_8px_25px_-4px_rgba(255,122,41,0.5),0_6px_20px_-4px_rgba(124,58,237,0.4)] hover:shadow-[inset_0_1px_1px_rgba(255,255,255,0.5),0_12px_32px_-4px_rgba(255,122,41,0.65),0_8px_25px_-4px_rgba(124,58,237,0.55)] border border-white/20 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <span>
                  {loading
                    ? "Authenticating Session…"
                    : isRegister
                    ? "Claim ₹10,00,000 & Access Terminal"
                    : "Access Trading Terminal"}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>

          {/* Micro Trust Guarantee Footer */}
          <div className="pt-4 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
            <span className="flex items-center gap-1 text-slate-300">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              100% Risk-Free
            </span>
            <span className="flex items-center gap-1 text-slate-300">
              <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
              Zero Credit Card
            </span>
            <span className="flex items-center gap-1 text-slate-300">
              <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
              SEBI-Aligned Mechanics
            </span>
          </div>
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
