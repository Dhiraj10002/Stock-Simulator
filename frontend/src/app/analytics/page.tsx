"use client";

import React, { useState } from "react";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import {
  BarChart2,
  Calendar,
  FileText,
  BookOpen,
  SlidersHorizontal,
  ArrowRight,
} from "lucide-react";
import ContractNoteView from "@/components/terminal/ContractNoteView";
import LedgerStatementView from "@/components/terminal/LedgerStatementView";

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<"overview" | "contract-note" | "statement">("overview");
  const [token] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("auth_token") || "";
    }
    return "";
  });
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1";

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
              <BarChart2 className="w-6 h-6 text-cyan-400" />
              Console & Statutory Reports
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Monthly P&L calendar, Indian statutory contract notes, and double-entry financial statements.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/trade"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-colors"
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span>Open Terminal</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
          <button
            onClick={() => setActiveTab("overview")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === "overview"
                ? "bg-cyan-950/60 border border-cyan-500/40 text-cyan-300"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>P&L Overview</span>
          </button>
          <button
            onClick={() => setActiveTab("contract-note")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === "contract-note"
                ? "bg-cyan-950/60 border border-cyan-500/40 text-cyan-300"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Contract Notes</span>
          </button>
          <button
            onClick={() => setActiveTab("statement")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === "statement"
                ? "bg-cyan-950/60 border border-cyan-500/40 text-cyan-300"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Ledger Statement</span>
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === "overview" && (
          <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 text-center py-16 space-y-4">
            <div className="w-12 h-12 rounded-full bg-cyan-950/60 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mx-auto">
              <Calendar className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-slate-200">Interactive P&L Heatmap & Journal</h2>
            <p className="text-sm text-slate-400 max-w-md mx-auto">
              The full 7-column Zerodha-style P&L calendar heatmap and trade journaling desk is integrated directly inside the Pro Terminal.
            </p>
            <div className="pt-2">
              <Link
                href="/trade"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-md shadow-cyan-500/20"
              >
                <span>Launch P&L Console in Terminal</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        )}

        {activeTab === "contract-note" && (
          <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800">
            <ContractNoteView token={token} apiUrl={apiUrl} />
          </div>
        )}

        {activeTab === "statement" && (
          <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800">
            <LedgerStatementView token={token} apiUrl={apiUrl} />
          </div>
        )}
      </main>
    </div>
  );
}
