import { MarketProvider } from "@/providers/market-provider";
import TradingChrome from "@/components/layout/TradingChrome";
export default function TradingLayout({ children }: { children: React.ReactNode }) {
  return <MarketProvider><TradingChrome>{children}</TradingChrome></MarketProvider>;
}
