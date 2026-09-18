"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FileText,
  Download,
  Printer,
  Calendar,
  Building,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Shield,
  Percent,
} from "lucide-react";
import { formatPaise } from "@/lib/format";
import type { ContractNoteResponse } from "@/types";

interface ContractNoteViewProps {
  token: string;
  apiUrl: string;
}

export default function ContractNoteView({ token, apiUrl }: ContractNoteViewProps) {
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
  });

  const [contractNote, setContractNote] = useState<ContractNoteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchContractNote = useCallback(
    async (date: string) => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${apiUrl}/reports/contract-note?date=${date}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const json = await res.json();
        if (res.ok && json.success && json.data) {
          setContractNote(json.data);
        } else {
          setError(json.message || "Failed to load contract note");
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Network error");
      } finally {
        setLoading(false);
      }
    },
    [apiUrl, token]
  );

  useEffect(() => {
    void fetchContractNote(selectedDate);
  }, [selectedDate, fetchContractNote]);

  // CSV Export
  const handleExportCSV = () => {
    if (!contractNote || contractNote.items.length === 0) return;

    const headers = [
      "Trade Time",
      "Symbol",
      "Side",
      "Product",
      "Quantity",
      "Price (₹)",
      "Gross Total (₹)",
      "Brokerage (₹)",
      "STT (₹)",
      "Exchange Txn (₹)",
      "SEBI Charges (₹)",
      "Stamp Duty (₹)",
      "GST (₹)",
      "Net Obligation (₹)",
      "Order UUID",
    ];

    const rows = contractNote.items.map((it) => [
      it.executed_at,
      it.symbol,
      it.side,
      it.product,
      it.quantity,
      (it.price_paise / 100).toFixed(2),
      (it.gross_total_paise / 100).toFixed(2),
      (it.charges.brokerage_paise / 100).toFixed(2),
      (it.charges.stt_paise / 100).toFixed(2),
      (it.charges.exchange_txn_paise / 100).toFixed(2),
      (it.charges.sebi_charges_paise / 100).toFixed(2),
      (it.charges.stamp_duty_paise / 100).toFixed(2),
      (it.charges.gst_paise / 100).toFixed(2),
      (it.net_obligation_paise / 100).toFixed(2),
      it.order_uuid,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `ContractNote-${contractNote.contract_note_number}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Print / Save PDF
  const handlePrint = () => {
    window.print();
  };

  const isNetCredit = (contractNote?.net_payin_payout_paise ?? 0) >= 0;

  return (
    <div className="space-y-4 text-xs">
      {/* Date Picker & Action Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-900/80 border border-slate-800 rounded-xl">
        <div className="flex items-center gap-2.5">
          <Calendar className="w-4 h-4 text-cyan-400" />
          <span className="font-semibold text-slate-300 text-xs">Trade Date:</span>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            disabled={!contractNote || contractNote.items.length === 0}
            className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center gap-1.5 transition-all disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={handlePrint}
            disabled={!contractNote || contractNote.items.length === 0}
            className="px-3 py-1.5 rounded-lg border border-cyan-500/40 bg-cyan-950/40 hover:bg-cyan-900/50 text-cyan-300 font-semibold text-xs flex items-center gap-1.5 transition-all disabled:opacity-40"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print / Save PDF</span>
          </button>
        </div>
      </div>

      {loading && (
        <div className="p-8 text-center text-slate-400 animate-pulse">
          Generating digital contract note & auditing statutory levies…
        </div>
      )}

      {error && !loading && (
        <div className="p-4 bg-rose-950/40 border border-rose-800/60 rounded-xl text-rose-300 text-xs">
          ⚠️ {error}
        </div>
      )}

      {contractNote && !loading && (
        <div className="space-y-4 print:p-0">
          {/* Official NSE / Broking Header Card */}
          <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-3 print:border-black print:bg-white print:text-black">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800/80 pb-3 print:border-gray-300">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Building className="w-4 h-4 text-cyan-400" />
                  <h3 className="font-bold text-sm text-slate-100 print:text-black">
                    Stock Simulator Capital Services Ltd.
                  </h3>
                </div>
                <p className="text-[11px] text-slate-400 font-mono print:text-gray-600">
                  SEBI Reg No: INZ000000000 • Member ID: NSE-90214 • CIN: U67120KA2026PTC000000
                </p>
                <p className="text-[10px] text-slate-500 print:text-gray-500">
                  Registered Office: BKC Financial District, Mumbai, Maharashtra 400051
                </p>
              </div>

              <div className="text-right space-y-0.5">
                <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider print:text-gray-600">
                  Contract Note No.
                </div>
                <div className="font-mono font-bold text-xs text-cyan-300 bg-cyan-950/60 border border-cyan-500/30 px-2 py-0.5 rounded print:bg-transparent print:text-black">
                  {contractNote.contract_note_number}
                </div>
                <div className="text-[10px] text-slate-400 print:text-gray-600 font-mono">
                  Settlement Date (T+1): {contractNote.settlement_date}
                </div>
              </div>
            </div>

            {/* Client Metadata Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
              <div>
                <span className="text-[10px] text-slate-500 block">Client Name</span>
                <span className="font-semibold text-slate-200 print:text-black">{contractNote.client_name}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">Account Email</span>
                <span className="font-semibold text-slate-200 print:text-black">{contractNote.client_email}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">Client ID / UUID</span>
                <span className="font-mono text-slate-300 print:text-black text-[10px]">
                  {contractNote.client_uuid.substring(0, 18)}…
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">Exchange & Segment</span>
                <span className="font-semibold text-cyan-300 print:text-black">{contractNote.exchange}</span>
              </div>
            </div>
          </div>

          {/* Top Aggregate Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {/* Net Settlement Obligation */}
            <div
              className={`p-3 rounded-xl border flex flex-col justify-between col-span-2 sm:col-span-1 ${
                isNetCredit
                  ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
                  : "bg-rose-950/40 border-rose-500/40 text-rose-300"
              }`}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {isNetCredit ? "Net Payout (Credit)" : "Net Payin (Debit)"}
              </span>
              <div className="text-xl font-black my-1 font-mono">
                {formatPaise(Math.abs(contractNote.net_payin_payout_paise))}
              </div>
              <span className="text-[10px] font-medium flex items-center gap-1 text-slate-400">
                {isNetCredit ? (
                  <TrendingUp className="w-3 h-3 text-emerald-400" />
                ) : (
                  <TrendingDown className="w-3 h-3 text-rose-400" />
                )}
                {isNetCredit ? "Receivable to Virtual Account" : "Payable from Available Margin"}
              </span>
            </div>

            {/* Gross Turnover */}
            <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl flex flex-col justify-between">
              <span className="text-[10px] text-slate-400 font-medium">Gross Turnover</span>
              <span className="text-base font-bold text-slate-200 font-mono my-1">
                {formatPaise(contractNote.gross_turnover_paise)}
              </span>
              <span className="text-[10px] text-slate-500">
                Buy: {formatPaise(contractNote.total_buy_turnover_paise)} • Sell:{" "}
                {formatPaise(contractNote.total_sell_turnover_paise)}
              </span>
            </div>

            {/* Total Brokerage */}
            <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl flex flex-col justify-between">
              <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                <Percent className="w-3 h-3 text-cyan-400" />
                Total Brokerage
              </span>
              <span className="text-base font-bold text-slate-200 font-mono my-1">
                {formatPaise(contractNote.charges_summary.brokerage_paise)}
              </span>
              <span className="text-[10px] text-slate-500">₹0 Delivery • ₹20 Intraday/F&O</span>
            </div>

            {/* Total Statutory Taxes */}
            <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl flex flex-col justify-between">
              <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                <Shield className="w-3 h-3 text-amber-400" />
                Total Taxes & Levies
              </span>
              <span className="text-base font-bold text-amber-300 font-mono my-1">
                {formatPaise(
                  contractNote.charges_summary.total_tax_charges_paise -
                    contractNote.charges_summary.brokerage_paise
                )}
              </span>
              <span className="text-[10px] text-slate-500">STT, Exchange, SEBI, Duty & GST</span>
            </div>
          </div>

          {/* Statutory Tax Breakdown Strip */}
          <div className="p-3 bg-slate-900/50 border border-slate-800 rounded-xl">
            <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Regulatory & Statutory Tax Levies Breakdown
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-center text-[11px]">
              <div className="p-2 bg-slate-950/60 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-500 block">Brokerage</span>
                <span className="font-mono font-bold text-slate-200">
                  {formatPaise(contractNote.charges_summary.brokerage_paise)}
                </span>
              </div>
              <div className="p-2 bg-slate-950/60 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-500 block">STT</span>
                <span className="font-mono font-bold text-slate-200">
                  {formatPaise(contractNote.charges_summary.stt_paise)}
                </span>
              </div>
              <div className="p-2 bg-slate-950/60 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-500 block">Exchange Txn</span>
                <span className="font-mono font-bold text-slate-200">
                  {formatPaise(contractNote.charges_summary.exchange_txn_paise)}
                </span>
              </div>
              <div className="p-2 bg-slate-950/60 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-500 block">SEBI Turnover</span>
                <span className="font-mono font-bold text-slate-200">
                  {formatPaise(contractNote.charges_summary.sebi_charges_paise)}
                </span>
              </div>
              <div className="p-2 bg-slate-950/60 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-500 block">Stamp Duty</span>
                <span className="font-mono font-bold text-slate-200">
                  {formatPaise(contractNote.charges_summary.stamp_duty_paise)}
                </span>
              </div>
              <div className="p-2 bg-slate-950/60 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-500 block">GST (18%)</span>
                <span className="font-mono font-bold text-slate-200">
                  {formatPaise(contractNote.charges_summary.gst_paise)}
                </span>
              </div>
            </div>
          </div>

          {/* Itemized Executed Trades Table */}
          <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-900/40">
            <div className="px-3.5 py-2.5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
              <span className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-cyan-400" />
                Executed Transactions Audit Log ({contractNote.total_trades} orders)
              </span>
            </div>

            {contractNote.items.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                No trades were executed on {selectedDate}. Choose another date above to view historical contract notes.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 text-slate-400 font-semibold text-[11px] border-b border-slate-800">
                    <tr>
                      <th className="p-2.5">Time</th>
                      <th className="p-2.5">Symbol</th>
                      <th className="p-2.5">Side</th>
                      <th className="p-2.5">Product</th>
                      <th className="p-2.5 text-right">Qty</th>
                      <th className="p-2.5 text-right">Price</th>
                      <th className="p-2.5 text-right">Gross Total</th>
                      <th className="p-2.5 text-right">Charges</th>
                      <th className="p-2.5 text-right font-bold text-slate-200">Net Obligation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {contractNote.items.map((it) => (
                      <tr key={it.trade_uuid} className="hover:bg-slate-800/40 transition-colors text-[11px]">
                        <td className="p-2.5 text-slate-400">{it.executed_at}</td>
                        <td className="p-2.5 font-bold text-slate-200">{it.symbol}</td>
                        <td className="p-2.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              it.side === "BUY"
                                ? "bg-emerald-950/80 text-emerald-300 border border-emerald-500/40"
                                : "bg-rose-950/80 text-rose-300 border border-rose-500/40"
                            }`}
                          >
                            {it.side}
                          </span>
                        </td>
                        <td className="p-2.5 text-slate-400 text-[10px]">{it.product}</td>
                        <td className="p-2.5 text-right text-slate-300">{it.quantity}</td>
                        <td className="p-2.5 text-right text-slate-300">{formatPaise(it.price_paise)}</td>
                        <td className="p-2.5 text-right text-slate-200">{formatPaise(it.gross_total_paise)}</td>
                        <td className="p-2.5 text-right text-amber-400">
                          {formatPaise(it.charges.total_tax_charges_paise)}
                        </td>
                        <td
                          className={`p-2.5 text-right font-bold ${
                            it.side === "BUY" ? "text-rose-400" : "text-emerald-400"
                          }`}
                        >
                          {it.side === "BUY" ? "-" : "+"}
                          {formatPaise(it.net_obligation_paise)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Legal Compliance Footer */}
          <div className="p-3 bg-slate-950/40 border border-slate-800/60 rounded-xl text-[10px] text-slate-500 leading-relaxed flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              This is an electronic Contract Note as per the regulations issued by SEBI and the Exchange. All statutory
              levies are computed with integer-paise accuracy in compliance with Indian taxation schedules.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
