"use client";

import React, { Suspense } from "react";
import StocksExplorePage from "@/components/stocks/StocksExplorePage";

export default function StocksOverviewRoute() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#080d1a] flex items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-500 to-teal-500 animate-pulse" />
        </div>
      }
    >
      <StocksExplorePage />
    </Suspense>
  );
}
