import { AccountSyncProvider } from "@/providers/account-sync-provider";
import { MarketProvider } from "@/providers/market-provider";
import { QueryProvider } from "@/providers/query-provider";
import TradingChrome from "@/components/layout/TradingChrome";
export default function TradingLayout({ children }: { children: React.ReactNode }) {
  // Public pages do not need the trading query cache or its client bundle.
  return <QueryProvider><AccountSyncProvider><MarketProvider><TradingChrome>{children}</TradingChrome></MarketProvider></AccountSyncProvider></QueryProvider>;
}
