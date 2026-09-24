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
