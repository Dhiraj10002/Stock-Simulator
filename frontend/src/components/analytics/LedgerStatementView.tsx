"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BookOpen,
  Download,
  Calendar,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  DollarSign,
  ShieldCheck,
} from "lucide-react";
import { formatPaise } from "@/lib/format";
import type { LedgerStatementResponse, LedgerEntry } from "@/types";

interface LedgerStatementViewProps {
  token?: string | null;
  apiUrl: string;
}

export default function LedgerStatementView({
  token,
  apiUrl,
}: LedgerStatementViewProps) {
  const [rangePreset, setRangePreset] = useState<"MONTH" | "30DAYS" | "ALL">("MONTH");
  const [fromDate, setFromDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [toDate, setToDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
  });

  const [statement, setStatement] = useState<LedgerStatementResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const handleApplyPreset = (preset: "MONTH" | "30DAYS" | "ALL") => {
    setRangePreset(preset);
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      now.getDate()
    ).padStart(2, "0")}`;

    setToDate(todayStr);
    if (preset === "MONTH") {
      setFromDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`);
    } else if (preset === "30DAYS") {
      const prior = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      setFromDate(
        `${prior.getFullYear()}-${String(prior.getMonth() + 1).padStart(2, "0")}-${String(
          prior.getDate()
        ).padStart(2, "0")}`
      );
    } else {
      setFromDate("2026-01-01");
    }
  };

  const fetchStatement = useCallback(async () => {
    if (!token) {
      setStatement(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/reports/ledger-statement?from=${fromDate}&to=${toDate}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const json = await res.json();
      if (res.ok && json.success && json.data) {
        const data: LedgerStatementResponse = json.data;
        setStatement({
          ...data,
          entries: data.entries || [],
        });
      } else {
        setStatement(null);
      }
    } catch {
      setStatement(null);
    } finally {
      setLoading(false);
    }
  }, [apiUrl, token, fromDate, toDate]);

  useEffect(() => {
    queueMicrotask(() => {
      void fetchStatement();
    });
  }, [fetchStatement]);

  const handleExportCSV = () => {
    if (!statement || statement.entries.length === 0) return;

    const headers = ["Date", "Transaction Ref", "Narration", "Type", "Debit (₹)", "Credit (₹)", "Balance (₹)"];
    const rows = statement.entries.map((e) => [
      e.date,
      e.uuid,
      `"${e.narration.replace(/"/g, '""')}"`,
      e.type,
      (e.debit_paise / 100).toFixed(2),
      (e.credit_paise / 100).toFixed(2),
      (e.balance_paise / 100).toFixed(2),
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `LedgerStatement-${statement.period_from}-to-${statement.period_to}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4 text-xs">
      {/* Date Range Controls & Presets */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl transition-colors">
        <div className="flex flex-wrap items-center gap-2">
          <Calendar className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
          <span className="font-semibold text-slate-700 dark:text-slate-300 text-xs">Period:</span>

          <div className="flex items-center gap-1 bg-white dark:bg-slate-950 p-0.5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
            {(["MONTH", "30DAYS", "ALL"] as const).map((p) => (
              <button
                key={p}
                onClick={() => handleApplyPreset(p)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                  rangePreset === p
                    ? "bg-cyan-500 text-slate-950 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                {p === "MONTH" ? "This Month" : p === "30DAYS" ? "Last 30 Days" : "All-Time"}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 ml-2">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs focus:outline-none focus:border-cyan-500 shadow-sm"
            />
            <span className="text-slate-400 text-xs">to</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs focus:outline-none focus:border-cyan-500 shadow-sm"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 px-2.5 py-1 rounded-full shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Live Account Ledger
          </span>
          <button
            onClick={handleExportCSV}
            disabled={!statement || statement.entries.length === 0}
            className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-xs flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
            <span>Export Statement CSV</span>
          </button>
        </div>
      </div>

      {loading && (
        <div className="p-8 text-center text-slate-500 dark:text-slate-400 animate-pulse">
          Auditing virtual ledger & calculating balance checks…
        </div>
      )}

      {statement && !loading && (
        <div className="space-y-4">
          {/* Informative notice for live account with 0 trading debits/credits */}
          {statement.total_debit_paise === 0 && statement.total_credit_paise === 0 && (
            <div className="flex items-center gap-2.5 px-4 py-3 bg-sky-50/90 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/60 rounded-xl text-xs text-sky-800 dark:text-sky-300 shadow-sm">
              <ShieldCheck className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
              <span>
                <strong>Live Account Ledger Active:</strong> Full starting margin of{" "}
                <span className="font-bold">{formatPaise(statement.closing_balance_paise)}</span> is available.
                When you execute buy or sell orders, double-entry debits (buy margins) and credits (trade proceeds) will record here in real time.
              </span>
            </div>
          )}

          {/* 4 Summary Balance Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Opening Balance */}
            <div className="p-3.5 bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col justify-between shadow-sm">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5 text-slate-400" />
                Opening Capital
              </span>
              <span className="text-base font-bold text-slate-900 dark:text-slate-100 font-mono my-1">
                {formatPaise(statement.opening_balance_paise)}
              </span>
              <span className="text-[10px] text-slate-400">As of {statement.period_from}</span>
            </div>

            {/* Total Credits */}
            <div className="p-3.5 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl flex flex-col justify-between shadow-sm">
              <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium flex items-center gap-1.5">
                <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                Total Credits (Cr)
              </span>
              <span className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono my-1">
                +{formatPaise(statement.total_credit_paise)}
              </span>
              <span className="text-[10px] text-emerald-600/70 dark:text-emerald-400/70">Inflows & trade proceeds</span>
            </div>

            {/* Total Debits */}
            <div className="p-3.5 bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/40 rounded-xl flex flex-col justify-between shadow-sm">
              <span className="text-[11px] text-rose-700 dark:text-rose-400 font-medium flex items-center gap-1.5">
                <ArrowUpRight className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                Total Debits (Dr)
              </span>
              <span className="text-base font-bold text-rose-600 dark:text-rose-400 font-mono my-1">
                -{formatPaise(statement.total_debit_paise)}
              </span>
              <span className="text-[10px] text-rose-600/70 dark:text-rose-400/70">Outflows & buy margins</span>
            </div>

            {/* Closing Balance */}
            <div className="p-3.5 bg-cyan-50/50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-500/40 rounded-xl flex flex-col justify-between shadow-sm">
              <span className="text-[11px] text-cyan-700 dark:text-cyan-300 font-medium flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                Closing Balance
              </span>
              <span className="text-base font-bold text-cyan-700 dark:text-cyan-300 font-mono my-1">
                {formatPaise(statement.closing_balance_paise)}
              </span>
              <span className="text-[10px] text-cyan-600/70 dark:text-cyan-400/70">As of {statement.period_to}</span>
            </div>
          </div>

          {/* Double-Entry Ledger Table */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900/40 shadow-sm">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 flex items-center justify-between">
              <span className="font-bold text-slate-800 dark:text-slate-200 text-xs flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                Double-Entry Virtual Capital Ledger ({statement.total_entries}{" "}
                {statement.total_entries === 1 ? "record" : "records"})
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Audited Indian Rupee (INR) Virtual Balances
              </span>
            </div>

            {statement.entries.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                No ledger transactions found for the selected period [{statement.period_from} to{" "}
                {statement.period_to}].
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100/70 dark:bg-slate-950/80 text-slate-600 dark:text-slate-400 font-semibold text-[11px] border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="p-3">Date & Time</th>
                      <th className="p-3">Particulars / Narration</th>
                      <th className="p-3">Type</th>
                      <th className="p-3 text-right">Debit (₹)</th>
                      <th className="p-3 text-right">Credit (₹)</th>
                      <th className="p-3 text-right font-bold text-slate-800 dark:text-slate-200">Net Balance (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                    {statement.entries.map((entry) => (
                      <tr
                        key={entry.uuid}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors text-[11px]"
                      >
                        <td className="p-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">{entry.date}</td>
                        <td className="p-3 font-sans font-medium text-slate-800 dark:text-slate-200 max-w-sm truncate">
                          {entry.narration}
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              entry.type === "CREDIT"
                                ? "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/40"
                                : "bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-500/40"
                            }`}
                          >
                            {entry.type}
                          </span>
                        </td>
                        <td className="p-3 text-right text-rose-600 dark:text-rose-400 font-semibold">
                          {entry.debit_paise > 0 ? `-${formatPaise(entry.debit_paise)}` : "—"}
                        </td>
                        <td className="p-3 text-right text-emerald-600 dark:text-emerald-400 font-semibold">
                          {entry.credit_paise > 0 ? `+${formatPaise(entry.credit_paise)}` : "—"}
                        </td>
                        <td className="p-3 text-right font-bold text-cyan-700 dark:text-cyan-300">
                          {formatPaise(entry.balance_paise)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {!statement && !loading && (
        <div className="p-8 text-center text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <BookOpen className="w-8 h-8 text-slate-400 mx-auto mb-2 opacity-50" />
          <p className="font-semibold text-slate-700 dark:text-slate-300">No Ledger Statement Available</p>
          <p className="text-[11px] text-slate-400 mt-1">
            {!token ? "Please log in to view your ledger statement." : "No records returned for the selected date range."}
          </p>
        </div>
      )}
    </div>
  );
}
