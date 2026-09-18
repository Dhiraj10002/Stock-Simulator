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
  underlying_symbol?: string;
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
  type: "MARKET" | "LIMIT" | "SL" | "SL-M";
  product: "DELIVERY" | "INTRADAY" | "FNO";
  quantity: number;
  price_paise: number;
  trigger_price_paise?: number;
  executed_price_paise?: number;
  reserved_paise?: number;
  status: "PENDING" | "OPEN" | "TRIGGER_PENDING" | "EXECUTED" | "CANCELLED" | "REJECTED" | "EXPIRED";
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
  lower_circuit_paise?: number;
  upper_circuit_paise?: number;
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

export type RiskOverview = {
  account_equity_paise: number;
  cash_balance_paise: number;
  blocked_paise: number;
  available_balance_paise: number;
  unrealized_pnl_paise: number;
  margin_utilization_pct: number;
  status: "HEALTHY" | "WARNING" | "MARGIN_CALL" | "CRITICAL";
  message: string;
  intraday_positions_count: number;
  delivery_positions_count: number;
  active_orders_count: number;
};

export type OptionContract = {
  symbol: string;
  option_type: "CE" | "PE";
  strike_price_paise: number;
  ltp_paise: number;
  open_interest: number;
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  lot_size: number;
};

export type StrikeRow = {
  strike_price_paise: number;
  is_atm: boolean;
  call: OptionContract;
  put: OptionContract;
};

export type OptionChainResponse = {
  underlying_symbol: string;
  spot_price_paise: number;
  expiry_date: string;
  total_call_oi: number;
  total_put_oi: number;
  put_call_ratio: number;
  lot_size: number;
  strikes: StrikeRow[];
};

export type PreTradeCheckRequest = {
  symbol: string;
  side: "BUY" | "SELL";
  product: "DELIVERY" | "INTRADAY" | "FNO";
  type: "MARKET" | "LIMIT" | "SL" | "SL-M";
  quantity: number;
  price_paise: number;
};

export type PreTradeCheckResponse = {
  risk_level: "SAFE" | "MODERATE" | "HIGH_RISK";
  required_margin_paise: number;
  available_balance_paise: number;
  margin_impact_pct: number;
  concentration_impact_pct: number;
  warnings: string[];
  advice: string;
};

export type Trade = {
  uuid: string;
  order_uuid: string;
  symbol: string;
  side: "BUY" | "SELL";
  product: "DELIVERY" | "INTRADAY" | "FNO";
  quantity: number;
  executed_price_paise: number;
  realized_pnl_paise: number;
  tag?: string;
  notes?: string;
  executed_at: string;
};

export type PerformanceOverview = {
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  break_even_trades: number;
  win_rate_pct: number;
  net_realized_pnl_paise: number;
  gross_profit_paise: number;
  gross_loss_paise: number;
  profit_factor: number;
  average_win_paise: number;
  average_loss_paise: number;
  win_loss_ratio: number;
  largest_win_paise: number;
  largest_win_symbol?: string;
  largest_loss_paise: number;
  largest_loss_symbol?: string;
};

export type DailyPnlDay = {
  date: string;
  realized_pnl_paise: number;
  trades_count: number;
  win_trades: number;
  loss_trades: number;
};

export type PnlCalendarResponse = {
  month: string; // YYYY-MM
  days: DailyPnlDay[];
  month_total_pnl_paise: number;
  profitable_days_count: number;
  loss_days_count: number;
};

