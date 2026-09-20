import type { Position } from "@/types";

export interface HoldingItem {
  id: string;
  symbol: string;
  name: string;
  exchange: string;
  sector: "IT" | "Banking" | "Energy" | "Auto" | "FMCG" | "Pharma" | "Metals" | "Other";
  quantity: number;
  avgBuyPricePaise: number;
  ltpPaise: number;
  prevClosePaise: number;
  investedValuePaise: number;
  currentValuePaise: number;
  unrealizedPnlPaise: number;
  pnlPercent: number;
  dayChangePaise: number;
  dayChangePercent: number;
  weightPercent: number;
}

export interface DayPnlRecord {
  date: string; // "2026-09-19"
  dayName: string; // "Fri"
  pnlPaise: number;
  tradesCount: number;
  isProfit: boolean;
}

export interface AssetAllocationItem {
  name: string;
  segment: "EQUITY" | "FUTURES" | "OPTIONS" | "CASH";
  valuePaise: number;
  percentage: number;
  color: string;
  subtext: string;
}

export interface SectorExposureItem {
  sector: string;
  valuePaise: number;
  percentage: number;
  color: string;
  stocksCount: number;
}

// ---------------------------------------------------------------------------
// Institutional Demo Portfolio Fixtures
// ---------------------------------------------------------------------------
export const DEMO_HOLDINGS: HoldingItem[] = [
  {
    id: "h-1",
    symbol: "RELIANCE",
    name: "Reliance Industries Ltd",
    exchange: "NSE",
    sector: "Energy",
    quantity: 60,
    avgBuyPricePaise: 284000, // ₹2,840.00
    ltpPaise: 298550, // ₹2,985.50
    prevClosePaise: 295000,
    investedValuePaise: 17040000, // ₹1,70,400.00
    currentValuePaise: 17913000, // ₹1,79,130.00
    unrealizedPnlPaise: 873000, // +₹8,730.00
    pnlPercent: 5.12,
    dayChangePaise: 213000,
    dayChangePercent: 1.2,
    weightPercent: 25.4,
  },
  {
    id: "h-2",
    symbol: "TCS",
    name: "Tata Consultancy Services Ltd",
    exchange: "NSE",
    sector: "IT",
    quantity: 35,
    avgBuyPricePaise: 409500, // ₹4,095.00
    ltpPaise: 426800, // ₹4,268.00
    prevClosePaise: 423500,
    investedValuePaise: 14332500, // ₹1,43,325.00
    currentValuePaise: 14938000, // ₹1,49,380.00
    unrealizedPnlPaise: 605500, // +₹6,055.00
    pnlPercent: 4.22,
    dayChangePaise: 115500,
    dayChangePercent: 0.78,
    weightPercent: 21.2,
  },
  {
    id: "h-3",
    symbol: "HDFCBANK",
    name: "HDFC Bank Ltd",
    exchange: "NSE",
    sector: "Banking",
    quantity: 80,
    avgBuyPricePaise: 157500, // ₹1,575.00
    ltpPaise: 164280, // ₹1,642.80
    prevClosePaise: 161800,
    investedValuePaise: 12600000, // ₹1,26,000.00
    currentValuePaise: 13142400, // ₹1,31,424.00
    unrealizedPnlPaise: 542400, // +₹5,424.00
    pnlPercent: 4.3,
    dayChangePaise: 198400,
    dayChangePercent: 1.53,
    weightPercent: 18.6,
  },
  {
    id: "h-4",
    symbol: "TATAMOTORS",
    name: "Tata Motors Ltd",
    exchange: "NSE",
    sector: "Auto",
    quantity: 110,
    avgBuyPricePaise: 91500, // ₹915.00
    ltpPaise: 98450, // ₹984.50
    prevClosePaise: 99200,
    investedValuePaise: 10065000, // ₹1,00,650.00
    currentValuePaise: 10829500, // ₹1,08,295.00
    unrealizedPnlPaise: 764500, // +₹7,645.00
    pnlPercent: 7.6,
    dayChangePaise: -82500,
    dayChangePercent: -0.76,
    weightPercent: 15.3,
  },
  {
    id: "h-5",
    symbol: "INFY",
    name: "Infosys Ltd",
    exchange: "NSE",
    sector: "IT",
    quantity: 50,
    avgBuyPricePaise: 179000, // ₹1,790.00
    ltpPaise: 187420, // ₹1,874.20
    prevClosePaise: 185600,
    investedValuePaise: 8950000, // ₹89,500.00
    currentValuePaise: 9371000, // ₹93,710.00
    unrealizedPnlPaise: 421000, // +₹4,210.00
    pnlPercent: 4.7,
    dayChangePaise: 91000,
    dayChangePercent: 0.98,
    weightPercent: 13.3,
  },
  {
    id: "h-6",
    symbol: "ITC",
    name: "ITC Ltd",
    exchange: "NSE",
    sector: "FMCG",
    quantity: 90,
    avgBuyPricePaise: 46200, // ₹462.00
    ltpPaise: 49410, // ₹494.10
    prevClosePaise: 49100,
    investedValuePaise: 4158000, // ₹41,580.00
    currentValuePaise: 4446900, // ₹44,469.00
    unrealizedPnlPaise: 288900, // +₹2,889.00
    pnlPercent: 6.95,
    dayChangePaise: 27900,
    dayChangePercent: 0.63,
    weightPercent: 6.2,
  },
];

export const DEMO_POSITIONS: Position[] = [
  {
    uuid: "dp-1",
    symbol: "NIFTY24SEPFUT",
    product: "FNO",
    underlying_symbol: "NIFTY",
    quantity: 50, // 1 Lot Long
    average_price_paise: 2332000, // ₹23,320.00
    current_price_paise: 2337850, // ₹23,378.50
    invested_value_paise: 116600000, // Notional Value
    current_value_paise: 116892500,
    unrealized_pnl_paise: 292500, // +₹2,925.00
    margin_blocked_paise: 21000000, // ₹2,10,000 margin
  },
  {
    uuid: "dp-2",
    symbol: "TCS24SEPFUT",
    product: "FNO",
    underlying_symbol: "TCS",
    quantity: 175, // 1 Lot Long
    average_price_paise: 411000, // ₹4,110.00
    current_price_paise: 413850, // ₹4,138.50
    invested_value_paise: 71925000,
    current_value_paise: 72423750,
    unrealized_pnl_paise: 498750, // +₹4,987.50
    margin_blocked_paise: 13000000,
  },
  {
    uuid: "dp-3",
    symbol: "NIFTY24SEP25300CE",
    product: "FNO",
    underlying_symbol: "NIFTY",
    quantity: 100, // 2 Lots Long
    average_price_paise: 11500, // ₹115.00
    current_price_paise: 14850, // ₹148.50
    invested_value_paise: 1150000, // ₹11,500 premium
    current_value_paise: 1485000, // ₹14,850 premium
    unrealized_pnl_paise: 335000, // +₹3,350.00
    margin_blocked_paise: 1150000,
  },
  {
    uuid: "dp-4",
    symbol: "ZOMATO",
    product: "INTRADAY",
    quantity: 300,
    average_price_paise: 27500, // ₹275.00
    current_price_paise: 28240, // ₹282.40
    invested_value_paise: 8250000,
    current_value_paise: 8472000,
    unrealized_pnl_paise: 222000, // +₹2,220.00
    margin_blocked_paise: 1650000, // 5x leverage MIS
  },
];

export const DEMO_DAY_PNL_RECORDS: DayPnlRecord[] = [
  { date: "2026-09-08", dayName: "Tue", pnlPaise: 124000, tradesCount: 4, isProfit: true },
  { date: "2026-09-09", dayName: "Wed", pnlPaise: 315000, tradesCount: 6, isProfit: true },
  { date: "2026-09-10", dayName: "Thu", pnlPaise: -145000, tradesCount: 5, isProfit: false },
  { date: "2026-09-11", dayName: "Fri", pnlPaise: 480000, tradesCount: 8, isProfit: true },
  { date: "2026-09-12", dayName: "Mon", pnlPaise: 210000, tradesCount: 3, isProfit: true },
  { date: "2026-09-15", dayName: "Tue", pnlPaise: -85000, tradesCount: 4, isProfit: false },
  { date: "2026-09-16", dayName: "Wed", pnlPaise: 540000, tradesCount: 7, isProfit: true },
  { date: "2026-09-17", dayName: "Thu", pnlPaise: 620000, tradesCount: 9, isProfit: true },
  { date: "2026-09-18", dayName: "Fri", pnlPaise: 395000, tradesCount: 5, isProfit: true },
  { date: "2026-09-19", dayName: "Mon", pnlPaise: 457400, tradesCount: 6, isProfit: true },
];

export const DEMO_EQUITY_CURVE = [
  { time: "09:15", pnl: 0, balance: 100000000 },
  { time: "10:00", pnl: 45000, balance: 100045000 },
  { time: "11:00", pnl: 120000, balance: 100120000 },
  { time: "12:00", pnl: 85000, balance: 100085000 },
  { time: "13:00", pnl: 240000, balance: 100240000 },
  { time: "14:00", pnl: 380000, balance: 100380000 },
  { time: "15:00", pnl: 425000, balance: 100425000 },
  { time: "15:30", pnl: 457400, balance: 100457400 },
];
