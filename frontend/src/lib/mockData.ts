import type { Candle, MarketDepth, Quote } from "@/types";

export interface InstrumentMetadata {
  symbol: string;
  name: string;
  exchange: string;
  basePricePaise: number;
  lotSize: number;
  dayChangePercent: number;
  high52WPaise: number;
  low52WPaise: number;
}

export const INSTRUMENT_METADATA: Record<string, InstrumentMetadata> = {
  RELIANCE: {
    symbol: "RELIANCE",
    name: "Reliance Industries Ltd",
    exchange: "NSE",
    basePricePaise: 298050, // ₹2,980.50
    lotSize: 1,
    dayChangePercent: 1.25,
    high52WPaise: 321790,
    low52WPaise: 222030,
  },
  TCS: {
    symbol: "TCS",
    name: "Tata Consultancy Services",
    exchange: "NSE",
    basePricePaise: 412500, // ₹4,125.00
    lotSize: 1,
    dayChangePercent: 0.65,
    high52WPaise: 459225,
    low52WPaise: 331300,
  },
  INFY: {
    symbol: "INFY",
    name: "Infosys Ltd",
    exchange: "NSE",
    basePricePaise: 189025, // ₹1,890.25
    lotSize: 1,
    dayChangePercent: -0.45,
    high52WPaise: 199145,
    low52WPaise: 135835,
  },
  HDFCBANK: {
    symbol: "HDFCBANK",
    name: "HDFC Bank Ltd",
    exchange: "NSE",
    basePricePaise: 164080, // ₹1,640.80
    lotSize: 1,
    dayChangePercent: 1.82,
    high52WPaise: 179400,
    low52WPaise: 136355,
  },
  NIFTY: {
    symbol: "NIFTY",
    name: "NIFTY 50 Index",
    exchange: "NSE",
    basePricePaise: 2532000, // ₹25,320.00
    lotSize: 25,
    dayChangePercent: 0.55,
    high52WPaise: 2627735,
    low52WPaise: 1967000,
  },
  BANKNIFTY: {
    symbol: "BANKNIFTY",
    name: "Bank Nifty Index",
    exchange: "NSE",
    basePricePaise: 5215000, // ₹52,150.00
    lotSize: 15,
    dayChangePercent: 0.94,
    high52WPaise: 5446735,
    low52WPaise: 4323000,
  },
};

/**
 * Returns default benchmark quotes for all instruments.
 */
export function getDefaultQuotes(): Record<string, Quote> {
  const result: Record<string, Quote> = {};
  const nowStr = new Date().toISOString();

  Object.values(INSTRUMENT_METADATA).forEach((meta) => {
    const change = meta.dayChangePercent;
    const prevClosePaise = Math.round(meta.basePricePaise / (1 + change / 100));
    const range = Math.round(meta.basePricePaise * 0.015);

    result[meta.symbol] = {
      symbol: meta.symbol,
      price_paise: meta.basePricePaise,
      updated_at: nowStr,
      change_percent: change,
      open_paise: prevClosePaise + Math.round(range * 0.2),
      high_paise: meta.basePricePaise + Math.round(range * 0.7),
      low_paise: meta.basePricePaise - Math.round(range * 0.6),
    };
  });

  return result;
}

/**
 * Generates realistic historical candlestick series ending near the current time.
 */
export function generateSyntheticCandles(
  symbol: string,
  basePricePaise?: number,
  count = 100,
  timeframe = "5m"
): Candle[] {
  const meta = INSTRUMENT_METADATA[symbol] ?? {
    basePricePaise: basePricePaise ?? 200000,
  };

  const targetPrice = basePricePaise ?? meta.basePricePaise;
  const stepMinutes =
    timeframe === "1m"
      ? 1
      : timeframe === "5m"
      ? 5
      : timeframe === "15m"
      ? 15
      : 1440; // 1D

  const nowSeconds = Math.floor(Date.now() / 1000);
  const intervalSeconds = stepMinutes * 60;
  const startSeconds = nowSeconds - count * intervalSeconds;

  // Walk backwards from targetPrice to generate an authentic random walk
  const prices: number[] = new Array(count);
  let cur = targetPrice;
  prices[count - 1] = cur;

  // Pseudo-random seed walk
  for (let i = count - 2; i >= 0; i--) {
    const drift = (Math.sin(i / 10) + Math.cos(i / 15)) * 0.001;
    const noise = ((Math.random() - 0.495) * 0.008);
    const delta = cur * (drift + noise);
    cur = Math.round(cur - delta);
    prices[i] = Math.max(100, cur);
  }

  const candles: Candle[] = [];

  for (let i = 0; i < count; i++) {
    const timestamp = startSeconds + i * intervalSeconds;
    const open = i === 0 ? prices[0] : candles[i - 1].close_paise;
    const close = prices[i];
    const spread = Math.abs(close - open);
    const wick = Math.round(Math.max(spread * 0.5, open * 0.002) * Math.random());

    const high = Math.max(open, close) + wick;
    const low = Math.min(open, close) - Math.round(wick * 0.8);
    const volume = Math.round(15000 + Math.random() * 85000 * (1 + spread / (open * 0.005)));

    candles.push({
      timestamp,
      open_paise: open,
      high_paise: high,
      low_paise: Math.max(1, low),
      close_paise: close,
      volume,
    });
  }

  return candles;
}

/**
 * Generates Level 2 Market Depth (Top 5 Bids and Asks) around a given LTP.
 */
export function generateMarketDepth(ltpPaise: number): MarketDepth {
  const bids = [];
  const asks = [];
  const tickSize = Math.max(5, Math.round(ltpPaise * 0.0005)); // 5 paise min tick

  let totalBidQty = 0;
  let totalAskQty = 0;

  for (let i = 1; i <= 5; i++) {
    const bidPrice = ltpPaise - i * tickSize;
    const bidQty = Math.round(200 + Math.random() * 2500 * (6 - i));
    const bidOrders = Math.round(3 + Math.random() * 15);
    totalBidQty += bidQty;
    bids.push({
      price_paise: bidPrice,
      orders: bidOrders,
      quantity: bidQty,
    });

    const askPrice = ltpPaise + i * tickSize;
    const askQty = Math.round(200 + Math.random() * 2500 * (6 - i));
    const askOrders = Math.round(3 + Math.random() * 15);
    totalAskQty += askQty;
    asks.push({
      price_paise: askPrice,
      orders: askOrders,
      quantity: askQty,
    });
  }

  return {
    bids,
    asks,
    total_bid_qty: totalBidQty,
    total_ask_qty: totalAskQty,
  };
}
