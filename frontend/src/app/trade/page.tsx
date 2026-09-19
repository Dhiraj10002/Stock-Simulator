import TradingTerminal from "../trading-terminal";

export const metadata = {
  title: "Trading Terminal — Stock Simulator",
  description: "Institutional multi-asset paper trading terminal with real-time charts, options chain, and order book.",
};

export default function TradePage() {
  return <TradingTerminal />;
}
