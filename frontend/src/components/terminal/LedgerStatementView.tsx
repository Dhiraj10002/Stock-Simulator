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
} from "lucide-react";
import { formatPaise } from "@/lib/format";
import type { LedgerStatementResponse } from "@/types";

interface LedgerStatementViewProps {
  token: string;
  apiUrl: string;
}

export default function LedgerStatementView({ token, apiUrl }: LedgerStatementViewProps) {
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
  const [error, setError] = useState<string | null>(null);

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
      // All time
      setFromDate("2024-01-01");
    }
  };

  const fetchStatement = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/reports/ledger-statement?from=${fromDate}&to=${toDate}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const json = await res.json();
      if (res.ok && json.success && json.data) {
        setStatement(json.data);
      } else {
        setError(json.message || "Failed to load statement");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [apiUrl, token, fromDate, toDate]);

  useEffect(() => {
    void fetchStatement();
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
    link.setAttribute("download", `LedgerStatement-${statement.period_from}-to-${statement.period_to}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4 text-xs">
      {/* Date Range Controls & Presets */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-900/80 border border-slate-800 rounded-xl">
        <div className="flex flex-wrap items-center gap-2">
          <Calendar className="w-4 h-4 text-cyan-400" />
          <span className="font-semibold text-slate-300 text-xs">Period:</span>

          <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
            {(["MONTH", "30DAYS", "ALL"] as const).map((p) => (
              <button
                key={p}
                onClick={() => handleApplyPreset(p)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                  rangePreset === p
                    ? "bg-cyan-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
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
              className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
            />
            <span className="text-slate-500 text-xs">to</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        <button
          onClick={handleExportCSV}
          disabled={!statement || statement.entries.length === 0}
          className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center gap-1.5 transition-all disabled:opacity-40"
        >
          <Download className="w-3.5 h-3.5 text-cyan-400" />
          <span>Export Statement CSV</span>
        </button>
      </div>

      {loading && (
        <div className="p-8 text-center text-slate-400 animate-pulse">
          Auditing financial ledger & running double-entry balance check…
        </div>
      )}

      {error && !loading && (
        <div className="p-4 bg-rose-950/40 border border-rose-800/60 rounded-xl text-rose-300 text-xs">
          ⚠️ {error}
        </div>
      )}

      {statement && !loading && (
        <div className="space-y-4">
          {/* 4 Summary Balance Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {/* Opening Balance */}
            <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl flex flex-col justify-between">
              <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                <Wallet className="w-3 h-3 text-slate-400" />
                Opening Balance
              </span>
              <span className="text-base font-bold text-slate-200 font-mono my-1">
                {formatPaise(statement.opening_balance_paise)}
              </span>
              <span className="text-[10px] text-slate-500">As of {statement.period_from}</span>
            </div>

            {/* Total Credits */}
            <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl flex flex-col justify-between">
              <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                <ArrowDownLeft className="w-3 h-3 text-emerald-400" />
                Total Credits (Cr)
              </span>
              <span className="text-base font-bold text-emerald-400 font-mono my-1">
                +{formatPaise(statement.total_credit_paise)}
              </span>
              <span className="text-[10px] text-slate-500">Inflows & trade proceeds</span>
            </div>

            {/* Total Debits */}
            <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl flex flex-col justify-between">
              <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                <ArrowUpRight className="w-3 h-3 text-rose-400" />
                Total Debits (Dr)
              </span>
              <span className="text-base font-bold text-rose-400 font-mono my-1">
                -{formatPaise(statement.total_debit_paise)}
              </span>
              <span className="text-[10px] text-slate-500">Outflows, margins & buy orders</span>
            </div>

            {/* Closing Balance */}
            <div className="p-3 bg-cyan-950/30 border border-cyan-500/40 rounded-xl flex flex-col justify-between">
              <span className="text-[10px] text-cyan-300 font-medium flex items-center gap-1">
                <DollarSign className="w-3 h-3 text-cyan-400" />
                Closing Balance
              </span>
              <span className="text-base font-bold text-cyan-200 font-mono my-1">
                {formatPaise(statement.closing_balance_paise)}
              </span>
              <span className="text-[10px] text-cyan-400/70">As of {statement.period_to}</span>
            </div>
          </div>

          {/* Double-Entry Ledger Table */}
          <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-900/40">
            <div className="px-3.5 py-2.5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
              <span className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
                Double-Entry Accounting Ledger ({statement.total_entries} records)
              </span>
            </div>

            {statement.entries.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                No ledger transactions found for the selected period [{statement.period_from} to{" "}
                {statement.period_to}].
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 text-slate-400 font-semibold text-[11px] border-b border-slate-800">
                    <tr>
                      <th className="p-2.5">Date & Time</th>
                      <th className="p-2.5">Particulars / Narration</th>
                      <th className="p-2.5">Type</th>
                      <th className="p-2.5 text-right">Debit (₹)</th>
                      <th className="p-2.5 text-right">Credit (₹)</th>
                      <th className="p-2.5 text-right font-bold text-slate-200">Net Balance (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {statement.entries.map((entry) => (
                      <tr key={entry.uuid} className="hover:bg-slate-800/40 transition-colors text-[11px]">
                        <td className="p-2.5 text-slate-400 whitespace-nowrap">{entry.date}</td>
                        <td className="p-2.5 font-sans font-medium text-slate-200 max-w-xs truncate">
                          {entry.narration}
                        </td>
                        <td className="p-2.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              entry.type === "CREDIT"
                                ? "bg-emerald-950/80 text-emerald-300 border border-emerald-500/40"
                                : "bg-rose-950/80 text-rose-300 border border-rose-500/40"
                            }`}
                          >
                            {entry.type}
                          </span>
                        </td>
                        <td className="p-2.5 text-right text-rose-400">
                          {entry.debit_paise > 0 ? `-${formatPaise(entry.debit_paise)}` : "-"}
                        </td>
                        <td className="p-2.5 text-right text-emerald-400">
                          {entry.credit_paise > 0 ? `+${formatPaise(entry.credit_paise)}` : "-"}
                        </td>
                        <td className="p-2.5 text-right font-bold text-cyan-300">
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
    </div>
  );
}
