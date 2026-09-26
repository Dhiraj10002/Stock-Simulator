"use client";

import React, { Suspense } from "react";
import NewsDeskPage from "@/components/news/NewsDeskPage";

export default function NewsRoutePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin" />
            <span className="text-xs font-mono text-cyan-400">Loading Financial News Desk...</span>
          </div>
        </div>
      }
    >
      <NewsDeskPage />
    </Suspense>
  );
}
