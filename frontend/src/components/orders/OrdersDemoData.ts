import type { Order, Trade } from "@/types";

/**
 * Returns an ISO timestamp for today during regular market session (09:15 to 15:30 IST).
 */
function getMarketSessionTime(hour: number, minute: number, second: number): string {
  const d = new Date();
  d.setHours(hour, minute, second, 0);
  return d.toISOString();
}

export const DEMO_ORDERS: Order[] = [
  {
    uuid: "ord-demo-1",
    symbol: "RELIANCE",
    side: "BUY",
    type: "MARKET",
    product: "DELIVERY",
    quantity: 60,
    price_paise: 284000,
    executed_price_paise: 284000,
    status: "EXECUTED",
    created_at: getMarketSessionTime(9, 24, 18),
  },
  {
    uuid: "ord-demo-2",
    symbol: "TCS",
    side: "BUY",
    type: "LIMIT",
    product: "DELIVERY",
    quantity: 35,
    price_paise: 409500,
    executed_price_paise: 409500,
    status: "EXECUTED",
    created_at: getMarketSessionTime(10, 15, 42),
  },
  {
    uuid: "ord-demo-3",
    symbol: "NIFTY24SEPFUT",
    side: "BUY",
    type: "MARKET",
    product: "FNO",
    quantity: 50,
    price_paise: 2332000,
    executed_price_paise: 2332000,
    status: "EXECUTED",
    created_at: getMarketSessionTime(11, 38, 55),
  },
  {
    uuid: "ord-demo-4",
    symbol: "HDFCBANK",
    side: "BUY",
    type: "LIMIT",
    product: "DELIVERY",
    quantity: 50,
    price_paise: 161000,
    status: "OPEN",
    created_at: getMarketSessionTime(13, 14, 20),
  },
  {
    uuid: "ord-demo-5",
    symbol: "INFY",
    side: "SELL",
    type: "LIMIT",
    product: "INTRADAY",
    quantity: 100,
    price_paise: 189000,
    status: "TRIGGER_PENDING",
    trigger_price_paise: 188500,
    created_at: getMarketSessionTime(14, 5, 10),
  },
  {
    uuid: "ord-demo-6",
    symbol: "TATAMOTORS",
    side: "BUY",
    type: "LIMIT",
    product: "DELIVERY",
    quantity: 100,
    price_paise: 91000,
    status: "CANCELLED",
    created_at: getMarketSessionTime(14, 52, 33),
  },
];

export const DEMO_TRADES: Trade[] = [
  {
    uuid: "tr-demo-1",
    order_uuid: "ord-demo-1",
    symbol: "RELIANCE",
    side: "BUY",
    product: "DELIVERY",
    quantity: 60,
    executed_price_paise: 284000,
    executed_at: getMarketSessionTime(9, 24, 18),
    realized_pnl_paise: 0,
  },
  {
    uuid: "tr-demo-2",
    order_uuid: "ord-demo-2",
    symbol: "TCS",
    side: "BUY",
    product: "DELIVERY",
    quantity: 35,
    executed_price_paise: 409500,
    executed_at: getMarketSessionTime(10, 15, 42),
    realized_pnl_paise: 0,
  },
  {
    uuid: "tr-demo-3",
    order_uuid: "ord-demo-3",
    symbol: "NIFTY24SEPFUT",
    side: "BUY",
    product: "FNO",
    quantity: 50,
    executed_price_paise: 2332000,
    executed_at: getMarketSessionTime(11, 38, 55),
    realized_pnl_paise: 0,
  },
];
