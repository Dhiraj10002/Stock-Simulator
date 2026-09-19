"use client";

import React, { useState } from "react";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import { BrainCircuit, SlidersHorizontal, ArrowRight } from "lucide-react";
import TradeCopilot from "@/components/terminal/TradeCopilot";

export default function MentorPage() {
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
              <BrainCircuit className="w-6 h-6 text-cyan-400" />
              AI Behavioral Copilot & Mentor
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Real-time trading discipline letter grades (A+ to F), emotional revenge-trading detection, and strategic mentorship.
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

        {/* Trade Copilot Embed */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 min-h-[600px]">
          <TradeCopilot token={token} apiUrl={apiUrl} />
        </div>
      </main>
    </div>
  );
}
