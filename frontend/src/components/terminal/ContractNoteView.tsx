"use client";

import React, { useState, useEffect, useCallback } from "react";
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
  Sparkles,
} from "lucide-react";
import { formatPaise } from "@/lib/format";
import { API_URL } from "@/lib/api";
import type { ContractNoteResponse } from "@/types";

interface ContractNoteViewProps {
  token?: string;
  apiUrl?: string;
  useDemoData?: boolean;
}

// Realistic Demonstration Contract Note matching demo executed trades
const DEMO_CONTRACT_NOTE: ContractNoteResponse = {
  contract_note_number: "CN-20260921-DEMO8910",
  trade_date: "2026-09-21",
  settlement_date: "2026-09-22",
  exchange: "NSE / NFO",
  client_name: "Dhiraj (Trader)",
  client_email: "dhirajgupta1002@gmail.com",
  client_uuid: "48315868-e29e-4cca-b97a-e6e57069b4a0",
  total_trades: 3,
  total_buy_turnover_paise: 147972500, // ₹14,79,725.00
  total_sell_turnover_paise: 0,
  gross_turnover_paise: 147972500,
  charges_summary: {
    brokerage_paise: 2000, // ₹20.00
    stt_paise: 31400, // ₹314.00
    exchange_txn_paise: 58300, // ₹583.00
    sebi_charges_paise: 1500, // ₹15.00
    stamp_duty_paise: 27900, // ₹279.00
    gst_paise: 10800, // ₹108.00
    total_tax_charges_paise: 131900, // ₹1,319.00
  },
  net_payin_payout_paise: -148104400, // -₹14,81,044.00 (Payin debit)
  items: [
    {
      trade_uuid: "tr-demo-1",
      order_uuid: "ord-demo-1",
      symbol: "RELIANCE",
      side: "BUY",
      product: "DELIVERY",
      quantity: 60,
      price_paise: 284000,
      gross_total_paise: 17040000,
      charges: {
        brokerage_paise: 0,
        stt_paise: 17040,
        exchange_txn_paise: 554,
        sebi_charges_paise: 17,
        stamp_duty_paise: 2556,
        gst_paise: 103,
        total_tax_charges_paise: 20270,
      },
      net_obligation_paise: 17060270,
      executed_at: "10:18:24",
    },
    {
      trade_uuid: "tr-demo-2",
      order_uuid: "ord-demo-2",
      symbol: "TCS",
      side: "BUY",
      product: "DELIVERY",
      quantity: 35,
      price_paise: 409500,
      gross_total_paise: 14332500,
      charges: {
        brokerage_paise: 0,
        stt_paise: 14333,
        exchange_txn_paise: 466,
        sebi_charges_paise: 14,
        stamp_duty_paise: 2150,
        gst_paise: 86,
        total_tax_charges_paise: 17049,
      },
      net_obligation_paise: 14349549,
      executed_at: "11:42:05",
    },
    {
      trade_uuid: "tr-demo-3",
      order_uuid: "ord-demo-3",
      symbol: "NIFTY24SEPFUT",
      side: "BUY",
      product: "FNO",
      quantity: 50,
      price_paise: 2332000,
      gross_total_paise: 116600000,
      charges: {
        brokerage_paise: 2000,
        stt_paise: 0,
        exchange_txn_paise: 57280,
        sebi_charges_paise: 1469,
        stamp_duty_paise: 23194,
        gst_paise: 10611,
        total_tax_charges_paise: 94581,
      },
      net_obligation_paise: 116694581,
      executed_at: "14:05:18",
    },
  ],
};

export default function ContractNoteView({
  token = "",
  apiUrl = API_URL,
  useDemoData = false,
}: ContractNoteViewProps) {
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
      if (useDemoData) {
        setContractNote({
          ...DEMO_CONTRACT_NOTE,
          trade_date: date,
        });
        return;
      }

      if (!token) {
        setContractNote(null);
        return;
      }

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
          // Guard against null items array from backend
          const safeData: ContractNoteResponse = {
            ...json.data,
            items: json.data.items || [],
          };
          setContractNote(safeData);
        } else {
          setError(json.message || "Failed to load contract note");
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Network error");
      } finally {
        setLoading(false);
      }
    },
    [apiUrl, token, useDemoData]
  );

  useEffect(() => {
    void fetchContractNote(selectedDate);
  }, [selectedDate, fetchContractNote]);

  const items = contractNote?.items || [];
  const hasItems = items.length > 0;

  // CSV Export
  const handleExportCSV = () => {
    if (!contractNote || !hasItems) return;

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

    const rows = items.map((it) => [
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

    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].map((e) => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `ContractNote-${contractNote.contract_note_number}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  const isNetCredit = (contractNote?.net_payin_payout_paise ?? 0) >= 0;

  return (
    <div className="space-y-4 text-xs">
      {/* Date Picker & Action Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">Settlement Date:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-xs font-mono font-semibold focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
          </div>

          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            {useDemoData ? "SHOWCASE DEMO" : "POSTGRES LIVE"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            disabled={!contractNote || !hasItems}
            className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs flex items-center gap-1.5 transition-all disabled:opacity-40 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={handlePrint}
            disabled={!contractNote || !hasItems}
            className="px-3.5 py-1.5 rounded-xl border border-cyan-500/40 bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-950/40 dark:hover:bg-cyan-900/50 text-cyan-700 dark:text-cyan-300 font-semibold text-xs flex items-center gap-1.5 transition-all disabled:opacity-40 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print / Save PDF</span>
          </button>
        </div>
      </div>

      {loading && (
        <div className="p-12 text-center text-slate-500 dark:text-slate-400 animate-pulse text-xs">
          Generating digital contract note & auditing statutory levies…
        </div>
      )}

      {error && !loading && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-xl text-rose-700 dark:text-rose-300 text-xs">
          ⚠️ {error}
        </div>
      )}

      {contractNote && !loading && (
        <div className="space-y-4 print:p-0">
          {/* Official NSE / Broking Header Card */}
          <div className="p-5 bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs space-y-4 print:border-black print:bg-white print:text-black">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-3.5 print:border-gray-300">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Building className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                  <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 print:text-black">
                    Stock Simulator Capital Services Ltd.
                  </h3>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono print:text-gray-600">
                  SEBI Reg No: INZ000000000 • Member ID: NSE-90214 • CIN: U67120KA2026PTC000000
                </p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 print:text-gray-500">
                  Registered Office: BKC Financial District, Mumbai, Maharashtra 400051
                </p>
              </div>

              <div className="text-right space-y-0.5">
                <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider print:text-gray-600">
                  Contract Note No.
                </div>
                <div className="font-mono font-bold text-xs text-cyan-700 dark:text-cyan-300 bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-500/30 px-2.5 py-0.5 rounded-lg print:bg-transparent print:text-black">
                  {contractNote.contract_note_number}
                </div>
                <div className="text-[10px] text-slate-400 print:text-gray-600 font-mono pt-0.5">
                  Settlement Date (T+1): {contractNote.settlement_date}
                </div>
              </div>
            </div>

            {/* Client Metadata Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
              <div>
                <span className="text-[10px] text-slate-400 block">Client Name</span>
                <span className="font-semibold text-slate-900 dark:text-slate-200 print:text-black">{contractNote.client_name}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">Account Email</span>
                <span className="font-semibold text-slate-900 dark:text-slate-200 print:text-black">{contractNote.client_email}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">Client ID / UUID</span>
                <span className="font-mono text-slate-600 dark:text-slate-300 print:text-black text-[10px]">
                  {contractNote.client_uuid.substring(0, 18)}…
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">Exchange & Segment</span>
                <span className="font-semibold text-cyan-600 dark:text-cyan-400 print:text-black">{contractNote.exchange}</span>
              </div>
            </div>
          </div>

          {/* Top Aggregate Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Net Settlement Obligation */}
            <div
              className={`p-4 rounded-2xl border flex flex-col justify-between col-span-2 sm:col-span-1 shadow-xs ${
                isNetCredit
                  ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-500/40 text-emerald-800 dark:text-emerald-300"
                  : "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-500/40 text-rose-800 dark:text-rose-300"
              }`}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">
                {isNetCredit ? "Net Payout (Credit)" : "Net Payin (Debit)"}
              </span>
              <div className="text-xl font-black my-1.5 font-mono">
                {formatPaise(Math.abs(contractNote.net_payin_payout_paise))}
              </div>
              <span className="text-[10px] font-medium flex items-center gap-1 opacity-75">
                {isNetCredit ? (
                  <TrendingUp className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <TrendingDown className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                )}
                {isNetCredit ? "Receivable to Virtual Account" : "Payable from Available Margin"}
              </span>
            </div>

            {/* Gross Turnover */}
            <div className="p-4 bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs flex flex-col justify-between">
              <span className="text-[10px] text-slate-400 font-medium">Gross Turnover</span>
              <span className="text-base font-bold text-slate-900 dark:text-slate-100 font-mono my-1">
                {formatPaise(contractNote.gross_turnover_paise)}
              </span>
              <span className="text-[10px] text-slate-500">
                Buy: {formatPaise(contractNote.total_buy_turnover_paise)} • Sell:{" "}
                {formatPaise(contractNote.total_sell_turnover_paise)}
              </span>
            </div>

            {/* Total Brokerage */}
            <div className="p-4 bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs flex flex-col justify-between">
              <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                <Percent className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
                Total Brokerage
              </span>
              <span className="text-base font-bold text-slate-900 dark:text-slate-100 font-mono my-1">
                {formatPaise(contractNote.charges_summary.brokerage_paise)}
              </span>
              <span className="text-[10px] text-slate-500">₹0 Delivery • ₹20 Intraday/F&O</span>
            </div>

            {/* Total Statutory Taxes */}
            <div className="p-4 bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs flex flex-col justify-between">
              <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                <Shield className="w-3 h-3 text-amber-500" />
                Total Taxes & Levies
              </span>
              <span className="text-base font-bold text-amber-600 dark:text-amber-400 font-mono my-1">
                {formatPaise(
                  contractNote.charges_summary.total_tax_charges_paise -
                    contractNote.charges_summary.brokerage_paise
                )}
              </span>
              <span className="text-[10px] text-slate-500">STT, Exchange, SEBI, Duty & GST</span>
            </div>
          </div>

          {/* Statutory Tax Breakdown Strip */}
          <div className="p-4 bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
            <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2.5">
              Regulatory & Statutory Tax Levies Breakdown
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-center text-[11px]">
              <div className="p-2.5 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 block">Brokerage</span>
                <span className="font-mono font-bold text-slate-900 dark:text-slate-200">
                  {formatPaise(contractNote.charges_summary.brokerage_paise)}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 block">STT</span>
                <span className="font-mono font-bold text-slate-900 dark:text-slate-200">
                  {formatPaise(contractNote.charges_summary.stt_paise)}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 block">Exchange Txn</span>
                <span className="font-mono font-bold text-slate-900 dark:text-slate-200">
                  {formatPaise(contractNote.charges_summary.exchange_txn_paise)}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 block">SEBI Turnover</span>
                <span className="font-mono font-bold text-slate-900 dark:text-slate-200">
                  {formatPaise(contractNote.charges_summary.sebi_charges_paise)}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 block">Stamp Duty</span>
                <span className="font-mono font-bold text-slate-900 dark:text-slate-200">
                  {formatPaise(contractNote.charges_summary.stamp_duty_paise)}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 block">GST (18%)</span>
                <span className="font-mono font-bold text-slate-900 dark:text-slate-200">
                  {formatPaise(contractNote.charges_summary.gst_paise)}
                </span>
              </div>
            </div>
          </div>

          {/* Itemized Executed Trades Table */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900/40 shadow-xs">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-between">
              <span className="font-bold text-slate-900 dark:text-slate-200 text-xs flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                Executed Transactions Audit Log ({contractNote.total_trades} orders)
              </span>
            </div>

            {!hasItems ? (
              <div className="p-12 text-center text-slate-400 text-xs">
                No trades were executed on {selectedDate}. Choose another date above to view historical contract notes.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-950/80 text-slate-400 font-semibold text-[11px] border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="p-3">Time</th>
                      <th className="p-3">Symbol</th>
                      <th className="p-3">Side</th>
                      <th className="p-3">Product</th>
                      <th className="p-3 text-right">Qty</th>
                      <th className="p-3 text-right">Price</th>
                      <th className="p-3 text-right">Gross Total</th>
                      <th className="p-3 text-right">Charges</th>
                      <th className="p-3 text-right font-bold text-slate-900 dark:text-slate-200">Net Obligation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                    {items.map((it) => (
                      <tr key={it.trade_uuid} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors text-[11px]">
                        <td className="p-3 text-slate-500 dark:text-slate-400">{it.executed_at}</td>
                        <td className="p-3 font-bold text-slate-900 dark:text-slate-200">{it.symbol}</td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              it.side === "BUY"
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/40"
                                : "bg-rose-50 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-200 dark:border-rose-500/40"
                            }`}
                          >
                            {it.side}
                          </span>
                        </td>
                        <td className="p-3 text-slate-500 dark:text-slate-400">{it.product}</td>
                        <td className="p-3 text-right text-slate-900 dark:text-slate-200 font-bold">{it.quantity}</td>
                        <td className="p-3 text-right text-slate-900 dark:text-slate-200">{formatPaise(it.price_paise)}</td>
                        <td className="p-3 text-right text-slate-900 dark:text-slate-200">{formatPaise(it.gross_total_paise)}</td>
                        <td className="p-3 text-right text-amber-600 dark:text-amber-400">
                          {formatPaise(it.charges.total_tax_charges_paise)}
                        </td>
                        <td className="p-3 text-right font-bold text-slate-900 dark:text-slate-100">
                          {formatPaise(it.net_obligation_paise)}
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
