"use client";

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Zap, X, CheckCircle2, AlertCircle } from "lucide-react";
import { formatPaise } from "@/lib/format";
import { API_URL, apiFetch } from "@/lib/api";
import { useAuthToken } from "@/hooks/useAuthToken";
import { validLot } from "@/lib/strategyExecution";
import { dayMovement } from "@/lib/marketDisplay";
import { quoteLabel } from "@/lib/marketData";
import { displayQuote } from "@/lib/fnoExplore";
import type { Instrument, Order, Quote } from "@/types";
import { useSymbolQuote, useTargetedSubscription } from "@/stores/market-store";

export interface FnoOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  instrument: Instrument | null;
  initialSide?: "BUY" | "SELL";
  availableBalancePaise?: number;
  onSuccess?: () => void;
  submissionBlock?: string;
}

export default function FnoOrderModal({
  isOpen,
  onClose,
  instrument,
  initialSide = "BUY",
  onSuccess,
  submissionBlock,
}: FnoOrderModalProps) {
  const queryClient = useQueryClient();

  const [side, setSide] = useState<"BUY" | "SELL">(initialSide);
  const [product, setProduct] = useState<"FNO" | "INTRADAY">("FNO");
  const [orderType, setOrderType] = useState<"MARKET" | "LIMIT">("MARKET");
  const [lots, setLots] = useState<number>(1);
  const [limitPrice, setLimitPrice] = useState<string>("");
  const [executing, setExecuting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const token = useAuthToken();

  // Active targeted WebSocket subscription while modal is open
  useTargetedSubscription(
    isOpen && instrument?.symbol ? instrument.symbol : undefined,
  );
  const liveQuote = useSymbolQuote(
    isOpen && instrument?.symbol ? instrument.symbol : undefined,
  );

  // Live price state: fallback REST poll from backend if WebSocket tick is pending
  const [restQuote, setRestQuote] = React.useState<Quote>();

  React.useEffect(() => {
    if (!isOpen || !instrument) return;
    let cancelled = false;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (cancelled) return;
      setRestQuote(undefined);
      setFeedback(null);
      setSubmitted(false);
      setLots(1);
      setSide(initialSide);
      setLimitPrice("");
    });
    let inFlight = false;
    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const res = await fetch(
          `${API_URL}/market/quotes/${encodeURIComponent(instrument.symbol)}?purpose=display`,
          { signal: controller.signal },
        );
        const body = res.ok ? await res.json() : null;
        if (!cancelled) setRestQuote(body?.success ? body.data : undefined);
      } catch {
        if (!cancelled)
          setRestQuote((previous) =>
            previous ? { ...previous, is_quote_stale: true } : undefined,
          );
      } finally {
        inFlight = false;
      }
    };
    void refresh();
    const timer = setInterval(refresh, 3000);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(timer);
    };
  }, [instrument, initialSide, isOpen]);

  const lotSize =
    instrument && validLot(instrument.lot_size) ? instrument.lot_size : 0;
  const totalQuantity = lots * lotSize;
  const validQuantity =
    validLot(lots) && validLot(lotSize) && Number.isSafeInteger(totalQuantity);
  const effectiveQuote = displayQuote(restQuote, liveQuote);
  const effectivePricePaise = effectiveQuote?.price_paise ?? 0;
  const effectiveChangePercent = dayMovement(effectiveQuote)?.percent;

  const ltpRupees = effectivePricePaise / 100;
  const activePrice =
    orderType === "LIMIT" && parseFloat(limitPrice) > 0
      ? parseFloat(limitPrice)
      : ltpRupees;

  const previewBody = {
    symbol: instrument?.symbol,
    side,
    type: orderType,
    product,
    quantity: totalQuantity,
    price_paise: orderType === "MARKET" ? 0 : Math.round(activePrice * 100),
  };
  const preview = useQuery<{
    required_funds_paise: number;
    available_balance_paise: number;
    estimated_price_paise: number;
    sufficient_funds: boolean;
  }>({
    queryKey: ["order-preview", token, previewBody],
    queryFn: () =>
      apiFetch("/orders/preview", {
        method: "POST",
        body: JSON.stringify(previewBody),
      }),
    enabled: isOpen && !!instrument && !!token && validQuantity && !submitted,
    refetchInterval: 5000,
    retry: false,
  });
  const validPreview =
    !preview.isError && !preview.isFetching ? preview.data : undefined;
  const requiredMarginPaise = validPreview?.required_funds_paise;
  const availableBalancePaise = validPreview?.available_balance_paise;
  const hasSufficientMargin =
    validPreview?.sufficient_funds === true &&
    ["LIVE", "SIMULATED"].includes(quoteLabel(effectiveQuote));
  if (!isOpen || !instrument) return null;

  const handleExecuteOrder = async () => {
    if (
      executing ||
      submitted ||
      !hasSufficientMargin ||
      !validQuantity ||
      !token ||
      !!submissionBlock
    )
      return;
    if (orderType === "MARKET" && effectivePricePaise <= 0) {
      setFeedback({
        type: "error",
        message:
          "Market quote is currently unavailable. Place a Limit order or wait for live feed.",
      });
      return;
    }
    setExecuting(true);
    // An uncertain response must never enable another POST from this ticket.
    setSubmitted(true);
    setFeedback(null);

    try {
      // 1. Submit simulated order to backend API
      const placed = await apiFetch<Order>("/orders", {
        method: "POST",
        body: JSON.stringify({
          symbol: instrument.symbol,
          side: side,
          type: orderType,
          product: product,
          quantity: totalQuantity,
          price_paise:
            orderType === "MARKET" ? 0 : Math.round(activePrice * 100),
        }),
      });

      if (!placed?.uuid)
        throw new Error(
          "Order result unknown. Review Orders before submitting again.",
        );

      // Invalidate queries so wallet, portfolio & orders immediately update
      void queryClient.invalidateQueries({ queryKey: ["wallet"] });
      void queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      void queryClient.invalidateQueries({ queryKey: ["trades"] });

      setFeedback({
        type: ["REJECTED", "CANCELLED", "EXPIRED"].includes(placed.status)
          ? "error"
          : "success",
        message:
          placed.status === "EXECUTED"
            ? `Order executed: ${placed.uuid}. ${side} ${totalQuantity} ${instrument.symbol}.`
            : `Order ${placed.uuid}: ${placed.status}. Execution is not confirmed. Review Orders for its current status.`,
      });

      onSuccess?.();
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error
          ? err.message
          : "Failed to place order. Please check network/balance.";
      setFeedback({
        type: "error",
        message: `${errMsg} Review Orders before placing another order.`,
      });
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Paper order ticket"
        className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto bg-[#ffffff] dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl flex flex-col transition-colors"
      >
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-start justify-between gap-3 bg-slate-50/70 dark:bg-slate-950/60">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
                  side === "BUY"
                    ? "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300"
                    : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                }`}
              >
                {side} ORDER
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400">
                {instrument.segment === "FUTURES" ? "FUTURES" : "OPTIONS"}
              </span>
              <span className="text-xs text-slate-400 font-mono">
                {instrument.exchange ? `${instrument.exchange} F&O` : "NSE F&O"}
              </span>
            </div>

            <h2 className="break-words text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight mt-1.5 flex items-center gap-2">
              <span>
                {instrument.display_symbol ||
                  instrument.displayName ||
                  instrument.symbol}
              </span>
            </h2>

            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {instrument.name}{" "}
              {instrument.expiry ? `• Expiry: ${instrument.expiry}` : ""}
            </p>
          </div>

          <div className="shrink-0 text-right">
            <div className="text-lg font-black font-tabular text-slate-900 dark:text-slate-100">
              {ltpRupees > 0
                ? `₹${ltpRupees.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
                : "UNAVAILABLE"}
            </div>
            <div
              className={`text-xs font-bold font-tabular flex items-center justify-end gap-1 ${
                effectiveChangePercent === undefined
                  ? "text-slate-400"
                  : effectiveChangePercent >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
              }`}
            >
              <span>
                {effectiveChangePercent === undefined
                  ? "Day change unavailable"
                  : `${effectiveChangePercent >= 0 ? "+" : ""}${effectiveChangePercent.toFixed(2)}%`}
              </span>
            </div>
            <p
              className="text-[10px] text-slate-500 dark:text-slate-400"
              title={effectiveQuote?.updated_at}
            >
              {quoteLabel(effectiveQuote)}
            </p>
            <button
              aria-label="Close paper order ticket"
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 mt-2 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Form Body */}
        <div className="p-5 space-y-4">
          {/* 1. Side Switcher: BUY vs SELL */}
          <div className="grid grid-cols-2 gap-2 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl">
            <button
              onClick={() => setSide("BUY")}
              className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                side === "BUY"
                  ? "bg-cyan-600 dark:bg-cyan-500 text-white dark:text-slate-950 shadow-xs font-black"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              BUY (Long)
            </button>
            <button
              onClick={() => setSide("SELL")}
              className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                side === "SELL"
                  ? "bg-rose-600 dark:bg-rose-500 text-white font-black shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              SELL (Short)
            </button>
          </div>

          {/* 2. Product (NRML Carry Forward vs MIS Intraday) & Order Type (Market vs Limit) */}
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="space-y-1.5">
              <label className="font-bold text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Product
              </label>
              <div className="grid grid-cols-2 gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                <button
                  onClick={() => setProduct("FNO")}
                  className={`py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    product === "FNO"
                      ? "bg-white dark:bg-slate-700 text-cyan-700 dark:text-cyan-300 shadow-xs"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-white"
                  }`}
                >
                  NRML
                </button>
                <button
                  onClick={() => setProduct("INTRADAY")}
                  className={`py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    product === "INTRADAY"
                      ? "bg-white dark:bg-slate-700 text-cyan-700 dark:text-cyan-300 shadow-xs"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-white"
                  }`}
                >
                  MIS (Intraday)
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Order Type
              </label>
              <div className="grid grid-cols-2 gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                <button
                  onClick={() => setOrderType("MARKET")}
                  className={`py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    orderType === "MARKET"
                      ? "bg-white dark:bg-slate-700 text-cyan-700 dark:text-cyan-300 shadow-xs"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-white"
                  }`}
                >
                  Market
                </button>
                <button
                  onClick={() => setOrderType("LIMIT")}
                  className={`py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    orderType === "LIMIT"
                      ? "bg-white dark:bg-slate-700 text-cyan-700 dark:text-cyan-300 shadow-xs"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-white"
                  }`}
                >
                  Limit
                </button>
              </div>
            </div>
          </div>

          {/* 3. Quantity in Lots (With Quick Multipliers) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <label className="font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Number of Lots (Lot Size: {lotSize || "Unavailable"})
              </label>
              <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400">
                Total Qty: {validQuantity ? totalQuantity : "Unavailable"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max="100"
                value={lots}
                onChange={(e) =>
                  setLots(Math.max(1, parseInt(e.target.value) || 1))
                }
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-black font-tabular text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />

              <div className="flex gap-1">
                {[1, 2, 5, 10].map((q) => (
                  <button
                    key={q}
                    onClick={() => setLots(q)}
                    className={`px-2.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      lots === q
                        ? "bg-cyan-600 text-white dark:bg-cyan-500 dark:text-slate-950 font-black"
                        : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    {q}L
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 4. Limit Price Input (If Order Type is LIMIT) */}
          {orderType === "LIMIT" && (
            <div className="space-y-1.5 animate-in fade-in duration-150">
              <label className="font-bold text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Limit Price (₹)
              </label>
              <input
                type="number"
                step="0.05"
                value={
                  limitPrice !== ""
                    ? limitPrice
                    : ltpRupees > 0
                      ? ltpRupees.toFixed(2)
                      : ""
                }
                placeholder={ltpRupees > 0 ? ltpRupees.toFixed(2) : "0.00"}
                onChange={(e) => setLimitPrice(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold font-tabular text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
          )}

          {/* 5. Margin & Capital Breakdown Box */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 text-xs space-y-1.5">
            <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
              <span>Required additional funds:</span>
              <span className="font-black text-slate-900 dark:text-slate-100 font-tabular text-sm">
                {formatPaise(requiredMarginPaise)}
              </span>
            </div>
            <div className="flex justify-between items-center text-slate-500 dark:text-slate-400 text-[11px]">
              <span>Available Margin:</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400 font-tabular">
                {formatPaise(availableBalancePaise)}
              </span>
            </div>
            <div className="flex justify-between items-center text-slate-400 text-[10px] pt-1 border-t border-slate-200/60 dark:border-slate-700/40">
              <span>Simulated Brokerage:</span>
              <span className="font-mono">₹20.00 (Paper Desk)</span>
            </div>
          </div>

          {/* Simulator Leverage & Margin Policy Disclosure */}
          <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/60 text-[11px] space-y-1">
            <div className="flex items-center justify-between font-bold text-indigo-900 dark:text-indigo-300">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                {instrument.segment === "FUTURES"
                  ? "Futures Margin Policy (~20% / 5x)"
                  : side === "BUY"
                    ? "Long Option Policy (100% Cash Premium)"
                    : "Short Option Policy (~30% Fixed Margin)"}
              </span>
              <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300">
                Paper Trading Model
              </span>
            </div>
            <p className="text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed">
              {instrument.segment === "FUTURES"
                ? "Futures require ~20% contract value margin (5x leverage). Positions are marked-to-market daily and cash-settled against final quote on expiry."
                : side === "BUY"
                  ? "Long options require 100% upfront cash premium and block ₹0 margin. Maximum possible loss is capped strictly at the premium paid."
                  : "Short options block ~30% fixed margin against contract value to absorb non-linear risk. Real broker SPAN + Exposure margins fluctuate dynamically."}
            </p>
          </div>

          <p className="text-xs text-slate-500" role="status">
            {preview.isError
              ? `Preview unavailable: ${preview.error.message}`
              : preview.isFetching
                ? "Checking price and funds…"
                : "Server estimate; price and funds are rechecked at execution."}
          </p>
          {submissionBlock && (
            <p
              role="alert"
              className="text-sm text-amber-800 dark:text-amber-300"
            >
              {submissionBlock}
            </p>
          )}
          {/* Feedback message */}
          {!validQuantity && (
            <p role="alert" className="text-sm text-amber-300">
              A canonical lot size and whole-number lots are required.
            </p>
          )}
          {feedback && (
            <div
              className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in ${
                feedback.type === "success"
                  ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800"
                  : "bg-rose-50 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-300 dark:border-rose-800"
              }`}
            >
              {feedback.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
              )}
              <span>{feedback.message}</span>
            </div>
          )}

          {/* 6. Execution Button */}
          <button
            onClick={handleExecuteOrder}
            disabled={
              executing ||
              submitted ||
              !validQuantity ||
              !token ||
              !!submissionBlock ||
              !hasSufficientMargin ||
              (orderType === "MARKET" && effectivePricePaise <= 0)
            }
            className={`w-full py-3.5 rounded-2xl text-white font-black text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer ${
              !hasSufficientMargin
                ? "bg-slate-400 cursor-not-allowed"
                : side === "BUY"
                  ? "bg-cyan-600 hover:bg-cyan-500 dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950 shadow-cyan-600/20 hover:scale-[1.01]"
                  : "bg-rose-600 hover:bg-rose-500 dark:bg-rose-500 dark:hover:bg-rose-400 shadow-rose-600/20 hover:scale-[1.01]"
            }`}
          >
            {executing ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Zap className="w-4 h-4" />
            )}
            <span>
              {executing
                ? "Routing Order..."
                : `${side} ${totalQuantity} ${instrument.symbol} (${lots} LOT${lots > 1 ? "S" : ""})`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
