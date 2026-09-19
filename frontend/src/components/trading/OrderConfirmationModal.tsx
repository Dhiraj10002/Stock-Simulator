"use client";

import React, { useEffect } from "react";
import {
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  AlertTriangle,
  Wallet,
  X,
  CheckCircle2,
} from "lucide-react";
import { formatPaise } from "@/lib/format";

export interface OrderConfirmationDetails {
  symbol: string;
  side: "BUY" | "SELL";
  product: "DELIVERY" | "INTRADAY" | "FNO";
  type: "MARKET" | "LIMIT" | "SL" | "SL-M";
  variety: "REGULAR" | "COVER" | "BRACKET";
  quantity: number;
  priceRupees: number;
  triggerPriceRupees?: number;
  targetRupees?: number;
  stopLossRupees?: number;
  requiredMarginPaise: number;
  availableBalancePaise: number;
}

interface OrderConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  details: OrderConfirmationDetails | null;
  submitting: boolean;
}

export default function OrderConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  details,
  submitting,
}: OrderConfirmationModalProps) {
  // Keyboard listeners: Enter to confirm, Esc to close
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) {
        onClose();
      } else if (e.key === "Enter" && !submitting) {
        e.preventDefault();
        onConfirm();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, submitting, onClose, onConfirm]);

  if (!isOpen || !details) return null;

  const isBuy = details.side === "BUY";
  const hasInsufficientMargin =
    details.requiredMarginPaise > details.availableBalancePaise;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-slide-up">
        {/* Header Strip */}
        <div
          className={`px-5 py-4 flex items-center justify-between border-b ${
            isBuy
              ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-300"
              : "bg-rose-950/40 border-rose-500/30 text-rose-300"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {isBuy ? (
              <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
                <TrendingUp className="w-5 h-5" />
              </div>
            ) : (
              <div className="p-1.5 rounded-lg bg-rose-500/20 text-rose-400">
                <TrendingDown className="w-5 h-5" />
              </div>
            )}
            <div>
              <h3 className="font-bold text-base leading-none text-white">
                Confirm {details.side} Order
              </h3>
              <span className="text-[11px] font-semibold text-slate-400">
                Fat-Finger Safeguard
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={submitting}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Order Details Body */}
        <div className="p-5 space-y-4 text-xs">
          {/* Symbol & Product Banner */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/70 border border-slate-800">
            <div>
              <span className="font-mono text-base font-bold text-white tracking-tight">
                {details.symbol}
              </span>
              <div className="text-[10px] text-slate-400 font-semibold uppercase">
                NSE Cash & Derivatives
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-cyan-300 border border-slate-700">
                {details.product}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                {details.type}
              </span>
              {details.variety !== "REGULAR" && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-800">
                  {details.variety}
                </span>
              )}
            </div>
          </div>

          {/* Core Fields Grid */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-2.5 rounded-lg bg-slate-950/40 border border-slate-800/80">
              <span className="text-slate-400 text-[11px] block">Order Quantity</span>
              <strong className="text-sm font-semibold text-slate-100 font-tabular">
                {details.quantity} Shares / Lots
              </strong>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-950/40 border border-slate-800/80">
              <span className="text-slate-400 text-[11px] block">Execution Price</span>
              <strong className="text-sm font-semibold text-slate-100 font-tabular">
                {details.type === "MARKET"
                  ? "MARKET (Best Offer)"
                  : `₹${details.priceRupees.toFixed(2)}`}
              </strong>
            </div>

            {(details.type === "SL" || details.type === "SL-M") &&
              details.triggerPriceRupees && (
                <div className="p-2.5 rounded-lg bg-slate-950/40 border border-slate-800/80 col-span-2">
                  <span className="text-slate-400 text-[11px] block">
                    Trigger Price
                  </span>
                  <strong className="text-sm font-semibold text-amber-300 font-tabular">
                    ₹{details.triggerPriceRupees.toFixed(2)}
                  </strong>
                </div>
              )}
          </div>

          {/* Attached Bracket Protection (if enabled) */}
          {(details.stopLossRupees || details.targetRupees) && (
            <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800 space-y-2">
              <div className="text-[11px] font-semibold text-slate-300 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                <span>Attached OCO Safeguards</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                {details.stopLossRupees && (
                  <div className="text-rose-300 flex items-center justify-between">
                    <span className="text-slate-400">Stop Loss:</span>
                    <strong className="font-tabular font-bold">
                      ₹{details.stopLossRupees.toFixed(2)}
                    </strong>
                  </div>
                )}
                {details.targetRupees && (
                  <div className="text-emerald-300 flex items-center justify-between">
                    <span className="text-slate-400">Target:</span>
                    <strong className="font-tabular font-bold">
                      ₹{details.targetRupees.toFixed(2)}
                    </strong>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Margin & Wallet Card */}
          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5 text-cyan-400" />
                <span>Required Margin</span>
              </span>
              <strong className="font-bold text-slate-100 font-tabular">
                {formatPaise(details.requiredMarginPaise)}
              </strong>
            </div>

            <div className="flex items-center justify-between border-t border-slate-800/80 pt-1.5 text-[11px]">
              <span className="text-slate-400">Available Account Cash</span>
              <span className="font-semibold text-slate-300 font-tabular">
                {formatPaise(details.availableBalancePaise)}
              </span>
            </div>

            {hasInsufficientMargin && (
              <div className="mt-2 p-2 rounded-lg bg-rose-950/60 border border-rose-500/40 flex items-center gap-2 text-rose-300 text-[11px]">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  Insufficient funds. Order might be rejected by risk engine.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-slate-950/60 border-t border-slate-800 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
          >
            Cancel (Esc)
          </button>

          <button
            onClick={onConfirm}
            disabled={submitting}
            className={`px-5 py-2 rounded-xl text-xs font-bold text-slate-950 shadow-lg transition-all flex items-center gap-1.5 ${
              isBuy
                ? "bg-emerald-400 hover:bg-emerald-300 shadow-emerald-500/20"
                : "bg-rose-400 hover:bg-rose-300 shadow-rose-500/20"
            }`}
          >
            {submitting ? (
              <span>Submitting...</span>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirm {details.side} (Enter)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
