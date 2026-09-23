import React from "react";
import { MarketProvider } from "@/providers/market-provider";

export default function TradingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MarketProvider>{children}</MarketProvider>;
}
