"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  Receipt,
  ArrowDownLeft,
  ArrowUpRight,
  Lock,
  Unlock,
  RefreshCw,
  Sparkles,
  Download,
  Filter,
  Search,
  CheckCircle2,
  FileText,
} from "lucide-react";
import { formatPaise } from "@/lib/format";
import { useWalletTransactions } from "@/hooks/useWalletTransactions";
import type { Transaction } from "@/types";

interface WalletTransactionsTableProps {
  token?: string;
  compact?: boolean;
  limit?: number;
}

export default function WalletTransactionsTable({
  token = "",
  compact = false,
  limit,
}: WalletTransactionsTableProps) {
  const { transactions: liveTxs, isLoading } = useWalletTransactions(token);

  const [filterType, setFilterType] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const rawTransactions = liveTxs;

  const filteredTransactions = useMemo(() => {
    let list = [...rawTransactions];

    if (filterType !== "ALL") {
      if (filterType === "CREDIT") {
        list = list.filter((t) => t.type === "CREDIT" || t.type === "INITIAL_CREDIT");
      } else if (filterType === "DEBIT") {
        list = list.filter((t) => t.type === "DEBIT");
      } else if (filterType === "MARGIN") {
        list = list.filter((t) => t.type === "RESERVE" || t.type === "RELEASE");
      } else if (filterType === "RESET") {
        list = list.filter((t) => t.type === "RESET");
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (t) =>
          t.note.toLowerCase().includes(q) ||
          t.type.toLowerCase().includes(q) ||
          t.uuid.toLowerCase().includes(q)
      );
    }

    if (limit && limit > 0) {
      list = list.slice(0, limit);
    }

    return list;
  }, [rawTransactions, filterType, searchQuery, limit]);

  // Format Date in IST
  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return dateStr;
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    const rows = [
      ["Date (IST)", "Transaction ID", "Type", "Amount (INR)", "Balance (INR)", "Blocked (INR)", "Note"],
      ...filteredTransactions.map((t) => [
        formatDate(t.created_at),
        t.uuid,
        t.type,
        (t.amount_paise / 100).toFixed(2),
        (t.balance_paise / 100).toFixed(2),
        (t.blocked_paise / 100).toFixed(2),
        `"${t.note.replace(/"/g, '""')}"`,
      ]),
    ];

    const csvContent = "data:text/csv;charset=utf-8," + rows.map((e) => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `wallet_transactions_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderTypeBadge = (type: Transaction["type"]) => {
    switch (type) {
      case "INITIAL_CREDIT":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30">
            <Sparkles className="w-3 h-3" />
            <span>INITIAL SEED</span>
          </span>
        );
      case "CREDIT":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
            <ArrowDownLeft className="w-3 h-3" />
            <span>CREDIT</span>
          </span>
        );
      case "DEBIT":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30">
            <ArrowUpRight className="w-3 h-3" />
            <span>DEBIT</span>
          </span>
        );
      case "RESERVE":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30">
            <Lock className="w-3 h-3" />
            <span>MARGIN BLOCK</span>
          </span>
        );
      case "RELEASE":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30">
            <Unlock className="w-3 h-3" />
            <span>MARGIN RELEASE</span>
          </span>
        );
      case "RESET":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/30">
            <RefreshCw className="w-3 h-3" />
            <span>WALLET RESET</span>
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-500/10 text-slate-700 dark:text-slate-300">
            {type}
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Filter & Action Bar */}
      {!compact && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2">
          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {[
              { id: "ALL", label: "All Events" },
              { id: "CREDIT", label: "Credits" },
              { id: "DEBIT", label: "Debits" },
              { id: "MARGIN", label: "Margin (Block/Release)" },
              { id: "RESET", label: "Resets" },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilterType(f.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  filterType === f.id
                    ? "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30 font-bold shadow-xs"
                    : "bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 border border-slate-200 dark:border-slate-700/60"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Search and Export */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-48">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search ledger..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
            </div>

            <Link
              href="/orders?tab=contract-note"
              title="View Statutory Daily Contract Note"
              className="px-3 py-1.5 rounded-xl bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-950/40 dark:hover:bg-cyan-900/50 border border-cyan-200 dark:border-cyan-800/60 text-xs font-semibold text-cyan-700 dark:text-cyan-300 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Contract Note</span>
            </Link>

            <button
              onClick={handleExportCSV}
              title="Export ledger as CSV"
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800/60 dark:hover:bg-slate-700/60 border border-slate-200 dark:border-slate-700/60 text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">CSV</span>
            </button>
          </div>
        </div>
      )}

      {/* Transactions Table */}
      <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
        {/* Table Header Details */}
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            <span className="font-bold text-slate-900 dark:text-slate-100">
              Immutable Cash Movements Ledger
            </span>
            <span className="text-slate-400 font-mono">
              ({filteredTransactions.length} records)
            </span>
          </div>

          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            AUDIT LEDGER
          </span>
        </div>

        {/* Table Body */}
        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400 text-xs gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-cyan-500" />
            <span>Fetching cash transactions ledger...</span>
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400 text-xs gap-1.5">
            <Receipt className="w-8 h-8 opacity-40 mb-1" />
            <span className="font-semibold text-slate-600 dark:text-slate-300">
              No transactions found
            </span>
            <p className="text-[11px] text-slate-400">
              Cash deposits, trade fills, and margin releases will appear here automatically.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800/80 text-[11px] uppercase tracking-wider text-slate-400 font-semibold bg-slate-50/30 dark:bg-slate-900/30">
                  <th className="py-3 px-4 font-semibold">Timestamp (IST)</th>
                  <th className="py-3 px-4 font-semibold">Event Type</th>
                  <th className="py-3 px-4 font-semibold text-right">Amount</th>
                  <th className="py-3 px-4 font-semibold text-right">Cash Balance</th>
                  <th className="py-3 px-4 font-semibold text-right">Blocked Margin</th>
                  <th className="py-3 px-4 font-semibold">Ledger Note / Purpose</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {filteredTransactions.map((tx) => {
                  const isCredit =
                    tx.type === "CREDIT" || tx.type === "INITIAL_CREDIT" || tx.type === "RELEASE";
                  const isDebit = tx.type === "DEBIT" || tx.type === "RESERVE";

                  return (
                    <tr
                      key={tx.uuid}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* Timestamp */}
                      <td className="py-3 px-4 whitespace-nowrap text-slate-600 dark:text-slate-300 font-mono text-[11px]">
                        {formatDate(tx.created_at)}
                      </td>

                      {/* Event Type Badge */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {renderTypeBadge(tx.type)}
                      </td>

                      {/* Amount */}
                      <td className="py-3 px-4 whitespace-nowrap text-right font-tabular font-bold">
                        <span
                          className={
                            tx.type === "CREDIT" || tx.type === "INITIAL_CREDIT"
                              ? "text-emerald-600 dark:text-emerald-400"
                              : tx.type === "DEBIT"
                              ? "text-rose-600 dark:text-rose-400"
                              : tx.type === "RELEASE"
                              ? "text-indigo-600 dark:text-indigo-400"
                              : tx.type === "RESERVE"
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-purple-600 dark:text-purple-400"
                          }
                        >
                          {isCredit && tx.type !== "RELEASE" ? "+" : isDebit ? "-" : ""}
                          {formatPaise(tx.amount_paise)}
                        </span>
                      </td>

                      {/* Cash Balance */}
                      <td className="py-3 px-4 whitespace-nowrap text-right font-tabular text-slate-900 dark:text-slate-100 font-bold">
                        {formatPaise(tx.balance_paise)}
                      </td>

                      {/* Blocked Margin */}
                      <td className="py-3 px-4 whitespace-nowrap text-right font-tabular text-slate-500 dark:text-slate-400">
                        {formatPaise(tx.blocked_paise)}
                      </td>

                      {/* Note */}
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300 max-w-xs truncate text-[11px]" title={tx.note}>
                        {tx.note}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
