"use client";

import { X, FileText, ArrowDownRight, ArrowUpRight, Lock, Unlock, RefreshCw } from "lucide-react";
import { formatPaise } from "@/lib/format";
import type { Wallet, Transaction } from "@/types";

type LedgerModalProps = {
  isOpen: boolean;
  onClose: () => void;
  wallet: Wallet | null;
  transactions: Transaction[];
};

export default function LedgerModal({
  isOpen,
  onClose,
  wallet,
  transactions,
}: LedgerModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-950/60 border border-cyan-500/30 text-cyan-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">
                Double-Entry Ledger Statement
              </h2>
              <p className="text-xs text-slate-400">
                Immutable audit history of virtual cash & margin movements.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Ledger Summary Cards */}
        <div className="grid grid-cols-3 gap-3 p-6 pb-4 bg-slate-950/30 border-b border-slate-800/80 text-xs">
          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-[11px] text-slate-400 block mb-1">
              Liquid Cash Balance
            </span>
            <strong className="text-sm font-bold text-white">
              {formatPaise(wallet?.cash_balance_paise)}
            </strong>
          </div>
          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-[11px] text-slate-400 block mb-1">
              Blocked / Margin
            </span>
            <strong className="text-sm font-bold text-amber-400">
              {formatPaise(wallet?.blocked_paise)}
            </strong>
          </div>
          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-[11px] text-slate-400 block mb-1">
              Available For Orders
            </span>
            <strong className="text-sm font-bold text-cyan-400">
              {formatPaise(wallet?.available_balance_paise)}
            </strong>
          </div>
        </div>

        {/* Transaction History Table */}
        <div className="flex-1 overflow-y-auto p-6 pt-2">
          {transactions.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-8">
              No ledger transactions recorded yet.
            </p>
          ) : (
            <div className="divide-y divide-slate-800/60">
              {transactions.map((tx) => {
                const isCredit =
                  tx.type === "CREDIT" || tx.type === "INITIAL_CREDIT";
                const isDebit = tx.type === "DEBIT";
                const isReserve = tx.type === "RESERVE";
                const isRelease = tx.type === "RELEASE";
                const isReset = tx.type === "RESET";

                return (
                  <div
                    key={tx.uuid}
                    className="py-3 flex items-center justify-between text-xs hover:bg-slate-800/20 px-2 rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2 rounded-lg shrink-0 ${
                          isCredit
                            ? "bg-emerald-950/60 text-emerald-400 border border-emerald-800/40"
                            : isDebit
                            ? "bg-rose-950/60 text-rose-400 border border-rose-800/40"
                            : isReserve
                            ? "bg-amber-950/60 text-amber-400 border border-amber-800/40"
                            : isRelease
                            ? "bg-cyan-950/60 text-cyan-400 border border-cyan-800/40"
                            : "bg-purple-950/60 text-purple-400 border border-purple-800/40"
                        }`}
                      >
                        {isCredit && <ArrowDownRight className="w-4 h-4" />}
                        {isDebit && <ArrowUpRight className="w-4 h-4" />}
                        {isReserve && <Lock className="w-4 h-4" />}
                        {isRelease && <Unlock className="w-4 h-4" />}
                        {isReset && <RefreshCw className="w-4 h-4" />}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-200">
                            {tx.type}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {new Date(tx.created_at).toLocaleString("en-IN", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {tx.note || "System Ledger Adjustment"}
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <div
                        className={`font-bold ${
                          isCredit
                            ? "text-emerald-400"
                            : isDebit
                            ? "text-rose-400"
                            : "text-slate-200"
                        }`}
                      >
                        {isCredit ? "+" : isDebit ? "-" : ""}
                        {formatPaise(tx.amount_paise)}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        Bal: {formatPaise(tx.balance_paise)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
