"use client";

import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Wallet,
  X,
  Plus,
  CheckCircle2,
  RefreshCcw,
  Sparkles,
  ShieldCheck,
  Zap,
  Receipt,
} from "lucide-react";
import { formatPaise } from "@/lib/format";
import type { Wallet as WalletData } from "@/types";
import WalletTransactionsTable from "./WalletTransactionsTable";

interface AddFundsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBalancePaise: number;
}

export default function AddFundsModal({
  isOpen,
  onClose,
  currentBalancePaise,
}: AddFundsModalProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"DEPOSIT" | "TRANSACTIONS">("DEPOSIT");
  const [selectedAmount, setSelectedAmount] = useState<number>(500000); // ₹5,00,000
  const [customAmount, setCustomAmount] = useState<string>("");
  const [isResetting, setIsResetting] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const [token] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("auth_token") || "";
    }
    return "";
  });

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1";

  if (!isOpen) return null;

  const activeAmount = customAmount ? parseFloat(customAmount) || 0 : selectedAmount;

  // Handle Add Paper Margin
  const handleAddFunds = async () => {
    if (activeAmount <= 0) return;
    setIsAdding(true);
    setFeedback(null);

    try {
      // If we don't have a direct backend deposit endpoint, we can call reset or update wallet
      // Also update local mock / query cache
      queryClient.setQueryData(["wallet"], (old: WalletData | undefined) => {
        if (!old) return old;
        const addPaise = activeAmount * 100;
        return {
          ...old,
          cash_balance_paise: old.cash_balance_paise + addPaise,
          available_balance_paise: old.available_balance_paise + addPaise,
        };
      });

      setFeedback({
        type: "success",
        message: `Successfully credited ₹${activeAmount.toLocaleString("en-IN")} into your paper trading margin account!`,
      });

      setTimeout(() => {
        onClose();
        setFeedback(null);
      }, 1400);
    } catch {
      setFeedback({
        type: "error",
        message: "Failed to allocate paper funds. Please try again.",
      });
    } finally {
      setIsAdding(false);
    }
  };

  // Handle Reset to initial ₹10,00,000 via backend simulation reset
  const handleResetWallet = async () => {
    setIsResetting(true);
    setFeedback(null);

    try {
      if (token) {
        await fetch(`${apiUrl}/simulation/reset`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["wallet"] }),
        queryClient.invalidateQueries({ queryKey: ["wallet-transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["portfolio"] }),
        queryClient.invalidateQueries({ queryKey: ["orders"] }),
        queryClient.invalidateQueries({ queryKey: ["trades"] }),
        queryClient.invalidateQueries({ queryKey: ["risk-overview"] }),
      ]);

      setFeedback({
        type: "success",
        message: "Simulation account reset back to ₹10,00,000.00 baseline capital!",
      });

      setTimeout(() => {
        onClose();
        setFeedback(null);
      }, 1400);
    } catch {
      setFeedback({
        type: "error",
        message: "Could not reset simulation account.",
      });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-cyan-50 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400 flex items-center justify-center border border-cyan-200 dark:border-cyan-800">
              <Wallet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                Paper Trading Margin Desk
              </h3>
              <p className="text-[11px] text-slate-400">
                Allocate virtual capital, review cash ledger, or reset balance
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Sub-Tabs */}
        <div className="flex items-center border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 px-5 pt-2 gap-3">
          <button
            type="button"
            onClick={() => setActiveTab("DEPOSIT")}
            className={`flex items-center gap-1.5 pb-2.5 px-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === "DEPOSIT"
                ? "border-cyan-500 text-cyan-600 dark:text-cyan-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>Top Up Margin</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("TRANSACTIONS")}
            className={`flex items-center gap-1.5 pb-2.5 px-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === "TRANSACTIONS"
                ? "border-cyan-500 text-cyan-600 dark:text-cyan-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>Transaction History</span>
          </button>
        </div>

        {/* Current Balance Ribbon */}
        <div className="px-5 py-2.5 bg-cyan-500/5 border-b border-cyan-500/10 flex items-center justify-between">
          <span className="text-xs text-slate-500 dark:text-slate-400">Current Margin Available:</span>
          <span className="font-black font-tabular text-sm text-cyan-700 dark:text-cyan-300">
            {formatPaise(currentBalancePaise)}
          </span>
        </div>

        {/* Modal Tab Content */}
        {activeTab === "DEPOSIT" ? (
          <div className="p-5 space-y-5 overflow-y-auto">
            {feedback && (
              <div
                className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                  feedback.type === "success"
                    ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                    : "bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
                }`}
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{feedback.message}</span>
              </div>
            )}

            {/* Quick Preset Buttons */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Select Virtual Deposit Amount:
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "₹1,00,000", value: 100000 },
                  { label: "₹5,00,000", value: 500000 },
                  { label: "₹10,00,000", value: 1000000 },
                  { label: "₹25,00,000", value: 2500000 },
                ].map((chip) => (
                  <button
                    key={chip.value}
                    type="button"
                    onClick={() => {
                      setSelectedAmount(chip.value);
                      setCustomAmount("");
                    }}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-bold font-tabular transition-all cursor-pointer ${
                      selectedAmount === chip.value && !customAmount
                        ? "bg-cyan-600 dark:bg-cyan-500 text-white dark:text-slate-950 border-transparent shadow-sm"
                        : "bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    +{chip.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Amount Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                Or Custom Amount (₹):
              </label>
              <input
                type="number"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                placeholder="e.g. 2000000"
                className="w-full px-3 py-2 text-sm font-bold font-tabular bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-2">
              <button
                onClick={handleAddFunds}
                disabled={isAdding || activeAmount <= 0}
                className="w-full py-2.5 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 font-bold text-xs shadow-md shadow-cyan-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                <span>Credit ₹{activeAmount.toLocaleString("en-IN")} Margin</span>
              </button>

              <button
                onClick={handleResetWallet}
                disabled={isResetting}
                className="w-full py-2 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RefreshCcw className={`w-3.5 h-3.5 ${isResetting ? "animate-spin" : ""}`} />
                <span>Reset Simulation Account (₹10,00,000)</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 overflow-y-auto max-h-[65vh]">
            <WalletTransactionsTable token={token} compact limit={15} />
          </div>
        )}
      </div>
    </div>
  );
}
