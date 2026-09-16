"use client";

import { useState, useId } from "react";
import {
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { formatPaise } from "@/lib/format";
import { INSTRUMENT_METADATA } from "@/lib/mockData";
import MarketDepth from "./MarketDepth";
import type { Wallet, Quote } from "@/types";

type OrderEntryTicketProps = {
  symbol: string;
  quote: Quote | null;
  wallet: Wallet | null;
  onOrderPlaced: () => void;
  onRequest: <T>(path: string, options?: RequestInit) => Promise<T>;
  onToast: (title: string, message?: string, type?: "success" | "error" | "info") => void;
};

export default function OrderEntryTicket({
  symbol,
  quote,
  wallet,
  onOrderPlaced,
  onRequest,
  onToast,
}: OrderEntryTicketProps) {
  const meta = INSTRUMENT_METADATA[symbol] ?? {
    basePricePaise: 250000,
  };

  const defaultPriceRupees = (quote?.price_paise ?? meta.basePricePaise) / 100;

  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [product, setProduct] = useState<"DELIVERY" | "INTRADAY" | "FNO">("DELIVERY");
  const [type, setType] = useState<"MARKET" | "LIMIT">("MARKET");
  const [quantity, setQuantity] = useState<number>(1);
  const [limitRupees, setLimitRupees] = useState<number>(defaultPriceRupees);
  const [submitting, setSubmitting] = useState(false);

  const [prevSymbol, setPrevSymbol] = useState(symbol);
  if (prevSymbol !== symbol) {
    setPrevSymbol(symbol);
    setLimitRupees((quote?.price_paise ?? meta.basePricePaise) / 100);
  }

  const ltpRupees = (quote?.price_paise ?? meta.basePricePaise) / 100;
  const activePriceRupees = type === "LIMIT" ? limitRupees : ltpRupees;
  const estimatedTurnoverPaise = Math.round(quantity * activePriceRupees * 100);

  // Margin calculation
  // Delivery = 100% turnover
  // Intraday (MIS) = 20% turnover (5x leverage)
  // FNO = 20% turnover
  const requiredMarginPaise =
    product === "INTRADAY"
      ? Math.ceil(estimatedTurnoverPaise / 5)
      : product === "FNO"
      ? Math.ceil(estimatedTurnoverPaise / 5)
      : estimatedTurnoverPaise;

  const availablePaise = wallet?.available_balance_paise ?? 0;
  const isAffordable =
    side === "SELL" && product === "DELIVERY"
      ? true // verified by holdings pre-check in backend
      : requiredMarginPaise <= availablePaise;

  // Percentage allocation shortcut (25%, 50%, 75%, 100%)
  const handleMarginPercent = (pct: number) => {
    if (availablePaise <= 0 || activePriceRupees <= 0) return;
    const targetBudgetPaise = availablePaise * (pct / 100);
    const leverage = product === "INTRADAY" || product === "FNO" ? 5 : 1;
    const marginPerUnitPaise = Math.ceil((activePriceRupees * 100) / leverage);
    const qty = Math.max(1, Math.floor(targetBudgetPaise / marginPerUnitPaise));
    setQuantity(qty);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (quantity <= 0) {
      onToast("Invalid Quantity", "Quantity must be greater than zero", "error");
      return;
    }

    if (side === "BUY" && !isAffordable) {
      onToast(
        "Insufficient Funds",
        `Required margin is ${formatPaise(requiredMarginPaise)}, but available balance is ${formatPaise(availablePaise)}`,
        "error"
      );
      return;
    }

    setSubmitting(true);
    try {
      const pricePaise = type === "LIMIT" ? Math.round(limitRupees * 100) : 0;
      await onRequest("/orders", {
        method: "POST",
        body: JSON.stringify({
          symbol,
          side,
          type,
          product,
          quantity,
          price_paise: pricePaise,
        }),
      });

      onToast(
        "Order Placed",
        `${side} ${quantity} ${symbol} (${product}) submitted successfully`,
        "success"
      );
      onOrderPlaced();
    } catch (err) {
      onToast(
        "Order Failed",
        err instanceof Error ? err.message : "Failed to place order",
        "error"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const isBuy = side === "BUY";
  const qtyInputId = useId();
  const limitInputId = useId();

  return (
    <div className="w-full lg:w-[320px] xl:w-[350px] flex flex-col bg-slate-950/80 border-l border-slate-800/80 p-4 shrink-0 overflow-y-auto space-y-4">
      {/* Order Side Segmented Switch */}
      <div className="grid grid-cols-2 p-1 bg-slate-900/90 rounded-xl border border-slate-800">
        <button
          type="button"
          onClick={() => setSide("BUY")}
          className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${
            isBuy
              ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          BUY
        </button>
        <button
          type="button"
          onClick={() => setSide("SELL")}
          className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${
            !isBuy
              ? "bg-rose-500 text-white shadow-lg shadow-rose-500/20"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <TrendingDown className="w-3.5 h-3.5" />
          SELL
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3.5">
        {/* Product Category (CNC / MIS / F&O) */}
        <div className="space-y-1">
          <span className="text-[11px] font-semibold text-slate-400">
            Product Category
          </span>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { id: "DELIVERY", label: "CNC", tip: "Long-only" },
              { id: "INTRADAY", label: "MIS", tip: "5x Margin" },
              { id: "FNO", label: "F&O", tip: "Derivatives" },
            ].map((prod) => (
              <button
                key={prod.id}
                type="button"
                onClick={() => setProduct(prod.id as "DELIVERY" | "INTRADAY" | "FNO")}
                className={`flex flex-col items-center py-1.5 px-1 rounded-xl border text-xs font-bold transition-all ${
                  product === prod.id
                    ? isBuy
                      ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-300"
                      : "bg-rose-950/40 border-rose-500/50 text-rose-300"
                    : "bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700"
                }`}
              >
                <span>{prod.label}</span>
                <span className="text-[9px] font-normal text-slate-500">
                  {prod.tip}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Order Type (Market vs Limit) */}
        <div className="space-y-1">
          <span className="text-[11px] font-semibold text-slate-400">
            Order Type
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { id: "MARKET", label: "Market", sub: "At Best LTP" },
              { id: "LIMIT", label: "Limit", sub: "Set Price" },
            ].map((ord) => (
              <button
                key={ord.id}
                type="button"
                onClick={() => setType(ord.id as "MARKET" | "LIMIT")}
                className={`py-1.5 px-2 rounded-lg border text-xs font-medium text-center transition-all ${
                  type === ord.id
                    ? "bg-slate-800 border-cyan-500/40 text-cyan-300"
                    : "bg-slate-900/40 border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                <div className="font-semibold">{ord.label}</div>
                <div className="text-[9px] text-slate-500">{ord.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Quantity Controls */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <label htmlFor={qtyInputId} className="font-semibold">
              Quantity
            </label>
            <div className="flex gap-1">
              {[1, 5, 25, 100].map((step) => (
                <button
                  key={step}
                  type="button"
                  onClick={() => setQuantity((q) => q + step)}
                  className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300 hover:bg-slate-700"
                >
                  +{step}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center border border-slate-800 rounded-xl bg-slate-900/80 overflow-hidden">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="px-3 py-1.5 text-slate-400 hover:text-white bg-slate-800/40 hover:bg-slate-800 transition-colors font-bold"
            >
              -
            </button>
            <input
              id={qtyInputId}
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full text-center bg-transparent text-sm font-bold text-white focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setQuantity((q) => q + 1)}
              className="px-3 py-1.5 text-slate-400 hover:text-white bg-slate-800/40 hover:bg-slate-800 transition-colors font-bold"
            >
              +
            </button>
          </div>

          {/* Margin Allocation Shortcuts */}
          <div className="grid grid-cols-4 gap-1 pt-0.5">
            {[25, 50, 75, 100].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => handleMarginPercent(pct)}
                className="py-1 text-[10px] font-semibold rounded bg-slate-900/80 border border-slate-800/80 text-slate-400 hover:text-cyan-300 hover:border-cyan-500/40 transition-all font-mono"
              >
                {pct === 100 ? "MAX" : `${pct}%`}
              </button>
            ))}
          </div>
        </div>

        {/* Limit Price Input */}
        {type === "LIMIT" && (
          <div className="space-y-1">
            <label htmlFor={limitInputId} className="text-[11px] font-semibold text-slate-400">
              Limit Price (₹)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-bold">
                ₹
              </span>
              <input
                id={limitInputId}
                type="number"
                step="0.05"
                min="0.05"
                value={limitRupees}
                onChange={(e) => setLimitRupees(parseFloat(e.target.value) || 0)}
                className="w-full pl-8 pr-4 py-1.5 bg-slate-900/80 border border-slate-800 rounded-xl text-sm font-bold text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>
        )}

        {/* Margin Requirement Summary */}
        <div className="bg-slate-900/50 rounded-xl border border-slate-800/60 p-2.5 space-y-1.5 text-xs font-mono">
          <div className="flex justify-between text-slate-400">
            <span>Estimated Turnover</span>
            <span className="text-slate-200">
              {formatPaise(estimatedTurnoverPaise)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400 flex items-center gap-1">
              Required Margin
              {product === "INTRADAY" && (
                <span className="text-[10px] text-cyan-400 font-semibold">
                  (5x)
                </span>
              )}
            </span>
            <strong
              className={`font-bold ${
                isAffordable ? "text-cyan-400" : "text-rose-400"
              }`}
            >
              {formatPaise(requiredMarginPaise)}
            </strong>
          </div>
          <div className="flex justify-between items-center text-slate-400 pt-1 border-t border-slate-800/60">
            <span>Available Balance</span>
            <span className="font-semibold text-slate-300">
              {formatPaise(availablePaise)}
            </span>
          </div>
        </div>

        {/* Submission Button */}
        <button
          type="submit"
          disabled={submitting || (side === "BUY" && !isAffordable)}
          className={`w-full py-2.5 rounded-xl font-bold text-sm text-white shadow-xl transition-all flex items-center justify-center gap-2 ${
            isBuy
              ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30 disabled:bg-emerald-950 disabled:text-emerald-700"
              : "bg-rose-600 hover:bg-rose-500 shadow-rose-600/30 disabled:bg-rose-950 disabled:text-rose-700"
          }`}
        >
          {submitting ? (
            <span className="animate-pulse">Placing Order…</span>
          ) : (
            <>
              <Zap className="w-4 h-4" />
              Place {side} Order
            </>
          )}
        </button>
      </form>

      {/* Embedded Level 2 Market Depth Widget */}
      <MarketDepth symbol={symbol} quote={quote} />

      {/* Footer Safeguard Note */}
      <div className="pt-1 text-[10px] text-slate-500 flex items-center gap-1.5 leading-tight">
        <ShieldCheck className="w-3.5 h-3.5 text-cyan-500/60 shrink-0" />
        <span>Pre-trade ledger checks & 15:20 MIS square-off enforced by server.</span>
      </div>
    </div>
  );
}
