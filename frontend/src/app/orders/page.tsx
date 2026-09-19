"use client";

import React from "react";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import { ClipboardList, SlidersHorizontal, ArrowRight } from "lucide-react";

export default function OrdersPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
              <ClipboardList className="w-6 h-6 text-cyan-400" />
              Order Book & Trades
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Active pending orders, GTT conditional triggers, and historical trade logs.
            </p>
          </div>

          <Link
            href="/trade"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-colors"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Open in Terminal</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 text-center py-16 space-y-3">
          <div className="w-12 h-12 rounded-full bg-cyan-950/60 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mx-auto">
            <ClipboardList className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-200">Order Book Hub</h2>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            Dedicated multi-status order filter table is staged for Phase F3. You can review and place orders right now inside the Pro Terminal.
          </p>
          <div className="pt-2">
            <Link
              href="/trade"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700"
            >
              <span>View Active Orders in Terminal</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
