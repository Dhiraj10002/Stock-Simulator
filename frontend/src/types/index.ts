export type User = {
  name: string;
  email: string;
  uuid: string;
};

export type Wallet = {
  uuid: string;
  cash_balance_paise: number;
  available_balance_paise: number;
  blocked_paise: number;
};

export type Position = {
  uuid: string;
  symbol: string;
  product: "DELIVERY" | "INTRADAY" | "FNO";
  quantity: number;
  average_price_paise: number;
  current_price_paise: number;
  invested_value_paise?: number;
  current_value_paise: number;
  unrealized_pnl_paise: number;
  realized_pnl_paise?: number;
  margin_blocked_paise?: number;
};

export type Portfolio = {
  invested_value_paise: number;
  current_value_paise: number;
  unrealized_pnl_paise: number;
  realized_pnl_paise?: number;
  positions: Position[];
};

export type Order = {
  id?: number;
  uuid: string;
  symbol: string;
  side: "BUY" | "SELL";
  type: "MARKET" | "LIMIT";
  product: "DELIVERY" | "INTRADAY" | "FNO";
  quantity: number;
  price_paise: number;
  executed_price_paise?: number;
  reserved_paise?: number;
  status: "PENDING" | "OPEN" | "EXECUTED" | "CANCELLED" | "REJECTED" | "EXPIRED";
  created_at: string;
  updated_at?: string;
};

export type Transaction = {
  uuid: string;
  type: "INITIAL_CREDIT" | "CREDIT" | "DEBIT" | "RESERVE" | "RELEASE" | "RESET";
  amount_paise: number;
  balance_paise: number;
  blocked_paise: number;
  note: string;
  created_at: string;
};

export type Quote = {
  symbol: string;
  price_paise: number;
  updated_at: string;
  change_percent?: number;
  high_paise?: number;
  low_paise?: number;
  open_paise?: number;
};

export type Candle = {
  timestamp: number;
  open_paise: number;
  high_paise: number;
  low_paise: number;
  close_paise: number;
  volume: number;
};

export type Article = {
  title: string;
  url: string;
  source: string;
  published_at: string;
  sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
  score: number;
  symbols: string[];
};

export type DepthItem = {
  price_paise: number;
  orders: number;
  quantity: number;
};

export type MarketDepth = {
  bids: DepthItem[];
  asks: DepthItem[];
  total_bid_qty: number;
  total_ask_qty: number;
};

export type BehavioralFlag = {
  type: "POSITIVE" | "WARNING" | "CRITICAL";
  title: string;
  description: string;
};

export type CritiqueMetrics = {
  win_rate: number;
  concentration_risk: "LOW" | "MODERATE" | "HIGH";
  leverage_risk: "SAFE" | "ELEVATED" | "HIGH";
  revenge_trading_detected: boolean;
  limit_order_usage_pct: number;
  total_trades_evaluated: number;
};

export type TradeCritiqueResponse = {
  discipline_score: number;
  risk_rating: "EXCELLENT" | "MODERATE" | "HIGH_RISK";
  metrics: CritiqueMetrics;
  behavioral_flags: BehavioralFlag[];
  critique: string;
};

export type ApiResponse<T> = {
  success: boolean;
  message: string;
  data: T;
};


