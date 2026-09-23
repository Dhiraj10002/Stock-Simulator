"use client";

import React, { Suspense } from "react";
import { useParams } from "next/navigation";
import StockDetailsPage from "@/components/stocks/StockDetailsPage";

function StockDynamicContent() {
  const params = useParams();
  const rawSymbol = params?.symbol
    ? Array.isArray(params.symbol)
      ? params.symbol[0]
      : params.symbol
    : "ITC";
  const symbol = decodeURIComponent(rawSymbol);

  return <StockDetailsPage initialSymbol={symbol} />;
}

export default function StockSymbolRoutePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-500 to-teal-500 animate-pulse" />
        </div>
      }
    >
      <StockDynamicContent />
    </Suspense>
  );
}
