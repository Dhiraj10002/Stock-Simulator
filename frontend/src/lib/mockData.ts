import type { Candle, MarketDepth, Quote } from "@/types";
import { getIndianMarketStatus } from "@/lib/format";

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
  ETERNAL: {
    symbol: "ETERNAL",
    name: "Eternal Ltd (formerly Zomato)",
    exchange: "NSE",
    basePricePaise: 27850, // ₹278.50
    lotSize: 1,
    dayChangePercent: 1.85,
    high52WPaise: 30400,
    low52WPaise: 12500,
  },
  APARINDS: {
    symbol: "APARINDS",
    name: "Apar Industries Ltd",
    exchange: "NSE",
    basePricePaise: 845000, // ₹8,450.00
    lotSize: 1,
    dayChangePercent: 1.45,
    high52WPaise: 1025000,
    low52WPaise: 510000,
  },
  TATAMOTORS: {
    symbol: "TATAMOTORS",
    name: "Tata Motors Ltd",
    exchange: "NSE",
    basePricePaise: 96550, // ₹965.50
    lotSize: 1,
    dayChangePercent: 0.85,
    high52WPaise: 117900,
    low52WPaise: 60000,
  },
  SBIN: {
    symbol: "SBIN",
    name: "State Bank of India",
    exchange: "NSE",
    basePricePaise: 78500, // ₹785.00
    lotSize: 1,
    dayChangePercent: -0.35,
    high52WPaise: 91200,
    low52WPaise: 55500,
  },
};

/**
 * Returns dynamic metadata for any searched symbol so ₹--- never appears.
 */
export function getDynamicMetadata(symbol: string): InstrumentMetadata {
  const clean = (symbol || "").toUpperCase().replace(/-EQ$/, "").replace(/-BE$/, "").replace(/-SM$/, "").trim();
  if (!clean) {
    return {
      symbol: "STOCK",
      name: "Stock Instrument",
      exchange: "NSE",
      basePricePaise: 250000,
      lotSize: 1,
      dayChangePercent: 0.5,
      high52WPaise: 300000,
      low52WPaise: 180000,
    };
  }
  if (INSTRUMENT_METADATA[clean]) {
    return INSTRUMENT_METADATA[clean];
  }

  // Deterministic generator from symbol letters
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = (hash << 5) - hash + clean.charCodeAt(i);
    hash |= 0;
  }
  const absHash = Math.abs(hash);
  const priceRupees = 140 + (absHash % 4760);
  const basePricePaise = priceRupees * 100;
  const changePct = Number((((absHash % 600) - 280) / 100).toFixed(2));
  const high52WPaise = Math.round(basePricePaise * 1.32);
  const low52WPaise = Math.round(basePricePaise * 0.74);

  const dynamicMeta: InstrumentMetadata = {
    symbol: clean,
    name: `${clean} Limited`,
    exchange: "NSE",
    basePricePaise,
    lotSize: 1,
    dayChangePercent: changePct,
    high52WPaise,
    low52WPaise,
  };

  INSTRUMENT_METADATA[clean] = dynamicMeta;
  return dynamicMeta;
}

/**
 * Returns an authoritative or dynamically seeded quote for any instrument symbol.
 */
export function getOrSeedQuote(symbol: string): Quote {
  const meta = getDynamicMetadata(symbol);
  const change = meta.dayChangePercent;
  const prevClosePaise = Math.round(meta.basePricePaise / (1 + change / 100));
  const range = Math.round(meta.basePricePaise * 0.015);

  return {
    symbol: meta.symbol,
    price_paise: meta.basePricePaise,
    updated_at: new Date().toISOString(),
    change_percent: change,
    open_paise: prevClosePaise + Math.round(range * 0.2),
    high_paise: meta.basePricePaise + Math.round(range * 0.7),
    low_paise: meta.basePricePaise - Math.round(range * 0.6),
  };
}

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

  const targetPrice = basePricePaise && basePricePaise > 0 ? basePricePaise : meta.basePricePaise;
  const stepMinutes =
    timeframe === "1m"
      ? 1
      : timeframe === "5m"
      ? 5
      : timeframe === "15m"
      ? 15
      : 1440; // 1D

  const marketStatus = getIndianMarketStatus();
  const effectiveEndSeconds = marketStatus.isOpen
    ? Math.floor(Date.now() / 1000)
    : marketStatus.sessionCloseSeconds;

  const intervalSeconds = stepMinutes * 60;
  const alignedEndSeconds = Math.floor(effectiveEndSeconds / intervalSeconds) * intervalSeconds;
  const startSeconds = alignedEndSeconds - count * intervalSeconds;

  // Walk backwards from targetPrice to generate an authentic random walk
  const prices: number[] = new Array(count);
  let cur = targetPrice;
  prices[count - 1] = cur;

  // Deterministic seed based on symbol characters so chart is consistent across renders
  let seed = 0;
  for (let i = 0; i < symbol.length; i++) {
    seed += symbol.charCodeAt(i);
  }

  for (let i = count - 2; i >= 0; i--) {
    const pseudoRand = ((seed * (i + 13) * 9301 + 49297) % 233280) / 233280;
    const drift = (Math.sin(i / 10) + Math.cos(i / 15)) * 0.001;
    const noise = (pseudoRand - 0.495) * 0.008;
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
    const pseudoRand = ((seed * (i + 1) * 31) % 100) / 100;
    const wick = Math.round(Math.max(spread * 0.5, open * 0.002) * pseudoRand);

    const high = Math.max(open, close) + wick;
    const low = Math.min(open, close) - Math.round(wick * 0.8);
    const volume = Math.round(15000 + pseudoRand * 85000 * (1 + spread / (open * 0.005)));

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
 * Uses a deterministic hash based on ltpPaise so when the market is closed,
 * the order book is 100% frozen and NEVER flickers or moves!
 */
export function generateMarketDepth(ltpPaise: number): MarketDepth {
  const bids = [];
  const asks = [];
  const tickSize = Math.max(5, Math.round(ltpPaise * 0.0005)); // 5 paise min tick

  let totalBidQty = 0;
  let totalAskQty = 0;

  for (let i = 1; i <= 5; i++) {
    // Deterministic pseudo-random seed based on ltpPaise and depth level
    const seed = ((ltpPaise * 31 + i * 137) % 1000) / 1000;
    const bidPrice = ltpPaise - i * tickSize;
    const bidQty = Math.round(500 + seed * 2500 * (6 - i));
    const bidOrders = Math.round(3 + seed * 15);
    totalBidQty += bidQty;
    bids.push({
      price_paise: bidPrice,
      orders: bidOrders,
      quantity: bidQty,
    });

    const askPrice = ltpPaise + i * tickSize;
    const askQty = Math.round(450 + (1 - seed) * 2500 * (6 - i));
    const askOrders = Math.round(3 + (1 - seed) * 15);
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
