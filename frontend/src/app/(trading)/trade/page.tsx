"use client";

import React, { Suspense } from "react";
import StockDetailsPage from "@/components/stocks/StockDetailsPage";

export default function TradePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-500 to-teal-500 animate-pulse" />
        </div>
      }
    >
      <StockDetailsPage initialSymbol="ITC" />
    </Suspense>
  );
}
