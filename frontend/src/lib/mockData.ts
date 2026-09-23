import type { Candle, MarketDepth, Quote } from "@/types";
import { getIndianMarketStatus } from "@/lib/format";

export interface InstrumentMetadata {
  symbol: string;
  name: string;
  exchange: string;
  basePricePaise: number;
  lotSize: number;
  dayChangePercent: number;
  high52WPaise?: number;
  low52WPaise?: number;
  segment?: "EQUITY" | "INDEX" | "FUTURES" | "OPTIONS";
  underlying?: string;
  expiry?: string;
  strikePrice?: number;
  optionType?: "CE" | "PE";
}

export const INSTRUMENT_METADATA: Record<string, InstrumentMetadata> = {
  // =========================================================================
  // 1. MAJOR BENCHMARK INDICES
  // =========================================================================
  NIFTY: {
    symbol: "NIFTY 50",
    name: "NIFTY 50 Benchmark Index",
    exchange: "NSE",
    basePricePaise: 2532000,
    lotSize: 25,
    dayChangePercent: 0.55,
    high52WPaise: 2627735,
    low52WPaise: 1967000,
    segment: "INDEX",
  },
  BANKNIFTY: {
    symbol: "BANK NIFTY",
    name: "Nifty Bank Sectoral Index",
    exchange: "NSE",
    basePricePaise: 5215000,
    lotSize: 15,
    dayChangePercent: 0.94,
    high52WPaise: 5446735,
    low52WPaise: 4323000,
    segment: "INDEX",
  },
  FINNIFTY: {
    symbol: "FIN NIFTY",
    name: "Nifty Financial Services Index",
    exchange: "NSE",
    basePricePaise: 2551000,
    lotSize: 25,
    dayChangePercent: 0.19,
    high52WPaise: 2610000,
    low52WPaise: 2015000,
    segment: "INDEX",
  },
  MIDCPNIFTY: {
    symbol: "MIDCP NIFTY",
    name: "Nifty Midcap Select Index",
    exchange: "NSE",
    basePricePaise: 1450075,
    lotSize: 50,
    dayChangePercent: 0.55,
    high52WPaise: 1520000,
    low52WPaise: 1050000,
    segment: "INDEX",
  },
  SENSEX: {
    symbol: "SENSEX",
    name: "BSE Sensex 30 Index",
    exchange: "BSE",
    basePricePaise: 8245000,
    lotSize: 10,
    dayChangePercent: 0.18,
    high52WPaise: 8597800,
    low52WPaise: 6500000,
    segment: "INDEX",
  },

  // =========================================================================
  // 2. NSE CASH EQUITIES (ALL CORE STOCKS & F&O UNDERLYINGS)
  // =========================================================================
  RELIANCE: {
    symbol: "RELIANCE",
    name: "Reliance Industries Ltd",
    exchange: "NSE",
    basePricePaise: 298050,
    lotSize: 1,
    dayChangePercent: 0.84,
    high52WPaise: 321790,
    low52WPaise: 222030,
    segment: "EQUITY",
  },
  TCS: {
    symbol: "TCS",
    name: "Tata Consultancy Services",
    exchange: "NSE",
    basePricePaise: 412500,
    lotSize: 1,
    dayChangePercent: -0.82,
    high52WPaise: 459225,
    low52WPaise: 331300,
    segment: "EQUITY",
  },
  INFY: {
    symbol: "INFY",
    name: "Infosys Ltd",
    exchange: "NSE",
    basePricePaise: 178520,
    lotSize: 1,
    dayChangePercent: -0.69,
    high52WPaise: 199145,
    low52WPaise: 135835,
    segment: "EQUITY",
  },
  HDFCBANK: {
    symbol: "HDFCBANK",
    name: "HDFC Bank Ltd",
    exchange: "NSE",
    basePricePaise: 164250,
    lotSize: 1,
    dayChangePercent: 0.99,
    high52WPaise: 179400,
    low52WPaise: 136355,
    segment: "EQUITY",
  },
  ICICIBANK: {
    symbol: "ICICIBANK",
    name: "ICICI Bank Ltd",
    exchange: "NSE",
    basePricePaise: 121530,
    lotSize: 1,
    dayChangePercent: 1.12,
    high52WPaise: 132000,
    low52WPaise: 91000,
    segment: "EQUITY",
  },
  SBIN: {
    symbol: "SBIN",
    name: "State Bank of India",
    exchange: "NSE",
    basePricePaise: 78500,
    lotSize: 1,
    dayChangePercent: -0.35,
    high52WPaise: 91200,
    low52WPaise: 55500,
    segment: "EQUITY",
  },
  ITC: {
    symbol: "ITC",
    name: "ITC Ltd",
    exchange: "NSE",
    basePricePaise: 49210,
    lotSize: 1,
    dayChangePercent: 0.6,
    high52WPaise: 52855,
    low52WPaise: 39930,
    segment: "EQUITY",
  },
  TATAMOTORS: {
    symbol: "TATAMOTORS",
    name: "Tata Motors Ltd",
    exchange: "NSE",
    basePricePaise: 30005,
    lotSize: 1,
    dayChangePercent: -0.53,
    high52WPaise: 38500,
    low52WPaise: 24000,
    segment: "EQUITY",
  },
  BHARTIARTL: {
    symbol: "BHARTIARTL",
    name: "Bharti Airtel Ltd",
    exchange: "NSE",
    basePricePaise: 156400,
    lotSize: 1,
    dayChangePercent: 0.45,
    high52WPaise: 168000,
    low52WPaise: 89000,
    segment: "EQUITY",
  },
  SUPREMEIND: {
    symbol: "SUPREMEIND",
    name: "Supreme Industries Ltd",
    exchange: "NSE",
    basePricePaise: 358030,
    lotSize: 1,
    dayChangePercent: 7.05,
    high52WPaise: 411735,
    low52WPaise: 279263,
    segment: "EQUITY",
  },
  UNOMINDA: {
    symbol: "UNOMINDA",
    name: "UNO Minda Ltd",
    exchange: "NSE",
    basePricePaise: 128400,
    lotSize: 1,
    dayChangePercent: 6.56,
    high52WPaise: 145000,
    low52WPaise: 62000,
    segment: "EQUITY",
  },
  RVNL: {
    symbol: "RVNL",
    name: "Rail Vikas Nigam Ltd",
    exchange: "NSE",
    basePricePaise: 21429,
    lotSize: 1,
    dayChangePercent: 6.24,
    high52WPaise: 34500,
    low52WPaise: 13000,
    segment: "EQUITY",
  },
  ATHER: {
    symbol: "ATHER",
    name: "Ather Energy Ltd",
    exchange: "NSE",
    basePricePaise: 164000,
    lotSize: 1,
    dayChangePercent: 5.81,
    high52WPaise: 195000,
    low52WPaise: 110000,
    segment: "EQUITY",
  },
  APLAPOLLO: {
    symbol: "APLAPOLLO",
    name: "APL Apollo Tubes Ltd",
    exchange: "NSE",
    basePricePaise: 227010,
    lotSize: 1,
    dayChangePercent: 5.66,
    high52WPaise: 260000,
    low52WPaise: 145000,
    segment: "EQUITY",
  },
  TATAPOWER: {
    symbol: "TATAPOWER",
    name: "Tata Power Co Ltd",
    exchange: "NSE",
    basePricePaise: 44210,
    lotSize: 1,
    dayChangePercent: 3.56,
    high52WPaise: 49500,
    low52WPaise: 23500,
    segment: "EQUITY",
  },
  TRENT: {
    symbol: "TRENT",
    name: "Trent Ltd (Westside & Zudio)",
    exchange: "NSE",
    basePricePaise: 714000,
    lotSize: 1,
    dayChangePercent: 4.82,
    high52WPaise: 785000,
    low52WPaise: 280000,
    segment: "EQUITY",
  },
  SUZLON: {
    symbol: "SUZLON",
    name: "Suzlon Energy Ltd",
    exchange: "NSE",
    basePricePaise: 7450,
    lotSize: 1,
    dayChangePercent: 4.2,
    high52WPaise: 8600,
    low52WPaise: 2400,
    segment: "EQUITY",
  },
  ZOMATO: {
    symbol: "ZOMATO",
    name: "Zomato Ltd (Eternal)",
    exchange: "NSE",
    basePricePaise: 27850,
    lotSize: 1,
    dayChangePercent: 1.85,
    high52WPaise: 30400,
    low52WPaise: 12500,
    segment: "EQUITY",
  },
  ETERNAL: {
    symbol: "ETERNAL",
    name: "Eternal Ltd (Zomato)",
    exchange: "NSE",
    basePricePaise: 27850,
    lotSize: 1,
    dayChangePercent: 1.85,
    high52WPaise: 30400,
    low52WPaise: 12500,
    segment: "EQUITY",
  },
  POONAWALLA: {
    symbol: "POONAWALLA",
    name: "Poonawalla Fincorp Ltd",
    exchange: "NSE",
    basePricePaise: 47940,
    lotSize: 1,
    dayChangePercent: 10.77,
    high52WPaise: 54000,
    low52WPaise: 32000,
    segment: "EQUITY",
  },
  ATGL: {
    symbol: "ATGL",
    name: "Adani Total Gas Ltd",
    exchange: "NSE",
    basePricePaise: 66070,
    lotSize: 1,
    dayChangePercent: 12.56,
    high52WPaise: 110000,
    low52WPaise: 55000,
    segment: "EQUITY",
  },
  EMCURE: {
    symbol: "EMCURE",
    name: "Emcure Pharmaceuticals Ltd",
    exchange: "NSE",
    basePricePaise: 200380,
    lotSize: 1,
    dayChangePercent: 4.92,
    high52WPaise: 225000,
    low52WPaise: 140000,
    segment: "EQUITY",
  },
  WELCORP: {
    symbol: "WELCORP",
    name: "Welspun Corp Ltd",
    exchange: "NSE",
    basePricePaise: 266010,
    lotSize: 1,
    dayChangePercent: 8.12,
    high52WPaise: 295000,
    low52WPaise: 160000,
    segment: "EQUITY",
  },
  BBTC: {
    symbol: "BBTC",
    name: "Bombay Burmah Trading Corp",
    exchange: "NSE",
    basePricePaise: 151210,
    lotSize: 1,
    dayChangePercent: 8.05,
    high52WPaise: 180000,
    low52WPaise: 105000,
    segment: "EQUITY",
  },
  JYOTICNC: {
    symbol: "JYOTICNC",
    name: "Jyoti CNC Automation Ltd",
    exchange: "NSE",
    basePricePaise: 104970,
    lotSize: 1,
    dayChangePercent: 7.02,
    high52WPaise: 125000,
    low52WPaise: 65000,
    segment: "EQUITY",
  },
  SPLPETRO: {
    symbol: "SPLPETRO",
    name: "Supreme Petrochem Ltd",
    exchange: "NSE",
    basePricePaise: 86570,
    lotSize: 1,
    dayChangePercent: 7.27,
    high52WPaise: 98000,
    low52WPaise: 52000,
    segment: "EQUITY",
  },
  TATACHEM: {
    symbol: "TATACHEM",
    name: "Tata Chemicals Ltd",
    exchange: "NSE",
    basePricePaise: 69325,
    lotSize: 1,
    dayChangePercent: -11.04,
    high52WPaise: 134000,
    low52WPaise: 68000,
    segment: "EQUITY",
  },
  GODIGIT: {
    symbol: "GODIGIT",
    name: "Go Digit General Insurance Ltd",
    exchange: "NSE",
    basePricePaise: 23900,
    lotSize: 1,
    dayChangePercent: -6.46,
    high52WPaise: 38500,
    low52WPaise: 21500,
    segment: "EQUITY",
  },
  TATATECH: {
    symbol: "TATATECH",
    name: "Tata Technologies Ltd",
    exchange: "NSE",
    basePricePaise: 72245,
    lotSize: 1,
    dayChangePercent: -4.78,
    high52WPaise: 140000,
    low52WPaise: 69000,
    segment: "EQUITY",
  },
  NIACL: {
    symbol: "NIACL",
    name: "New India Assurance Co Ltd",
    exchange: "NSE",
    basePricePaise: 18766,
    lotSize: 1,
    dayChangePercent: -4.77,
    high52WPaise: 32000,
    low52WPaise: 16500,
    segment: "EQUITY",
  },
  KPITTECH: {
    symbol: "KPITTECH",
    name: "KPIT Technologies Ltd",
    exchange: "NSE",
    basePricePaise: 164000,
    lotSize: 1,
    dayChangePercent: -1.44,
    high52WPaise: 195000,
    low52WPaise: 120000,
    segment: "EQUITY",
  },
  SUNTV: {
    symbol: "SUNTV",
    name: "Sun TV Network Ltd",
    exchange: "NSE",
    basePricePaise: 45170,
    lotSize: 1,
    dayChangePercent: -3.57,
    high52WPaise: 92000,
    low52WPaise: 43000,
    segment: "EQUITY",
  },
  GILLETTE: {
    symbol: "GILLETTE",
    name: "Gillette India Ltd",
    exchange: "NSE",
    basePricePaise: 707300,
    lotSize: 1,
    dayChangePercent: -3.2,
    high52WPaise: 950000,
    low52WPaise: 610000,
    segment: "EQUITY",
  },
  BEL: {
    symbol: "BEL",
    name: "Bharat Electronics Ltd",
    exchange: "NSE",
    basePricePaise: 31240,
    lotSize: 1,
    dayChangePercent: 3.75,
    high52WPaise: 34000,
    low52WPaise: 13000,
    segment: "EQUITY",
  },
  ADANIENT: {
    symbol: "ADANIENT",
    name: "Adani Enterprises Ltd",
    exchange: "NSE",
    basePricePaise: 314000,
    lotSize: 1,
    dayChangePercent: 2.1,
    high52WPaise: 375000,
    low52WPaise: 215000,
    segment: "EQUITY",
  },
  YESBANK: {
    symbol: "YESBANK",
    name: "YES Bank Ltd",
    exchange: "NSE",
    basePricePaise: 2415,
    lotSize: 1,
    dayChangePercent: 3.1,
    high52WPaise: 3250,
    low52WPaise: 1650,
    segment: "EQUITY",
  },
  DLF: {
    symbol: "DLF",
    name: "DLF Ltd",
    exchange: "NSE",
    basePricePaise: 87500,
    lotSize: 1,
    dayChangePercent: 2.1,
    high52WPaise: 98000,
    low52WPaise: 52000,
    segment: "EQUITY",
  },
  SUNPHARMA: {
    symbol: "SUNPHARMA",
    name: "Sun Pharmaceutical Industries",
    exchange: "NSE",
    basePricePaise: 182000,
    lotSize: 1,
    dayChangePercent: 0.9,
    high52WPaise: 195000,
    low52WPaise: 115000,
    segment: "EQUITY",
  },
  TATASTEEL: {
    symbol: "TATASTEEL",
    name: "Tata Steel Ltd",
    exchange: "NSE",
    basePricePaise: 15850,
    lotSize: 1,
    dayChangePercent: 1.45,
    high52WPaise: 18500,
    low52WPaise: 12000,
    segment: "EQUITY",
  },
  APARINDS: {
    symbol: "APARINDS",
    name: "Apar Industries Ltd",
    exchange: "NSE",
    basePricePaise: 1823300,
    lotSize: 1,
    dayChangePercent: -3.76,
    high52WPaise: 2150000,
    low52WPaise: 750000,
    segment: "EQUITY",
  },
  PRAJIND: {
    symbol: "PRAJIND",
    name: "Praj Industries Ltd",
    exchange: "NSE",
    basePricePaise: 31755,
    lotSize: 1,
    dayChangePercent: 1.73,
    high52WPaise: 42800,
    low52WPaise: 27300,
    segment: "EQUITY",
  },
  BAJFINANCE: {
    symbol: "BAJFINANCE",
    name: "Bajaj Finance Ltd",
    exchange: "NSE",
    basePricePaise: 100880,
    lotSize: 1,
    dayChangePercent: -1.22,
    high52WPaise: 112000,
    low52WPaise: 75000,
    segment: "EQUITY",
  },
  AXISBANK: {
    symbol: "AXISBANK",
    name: "Axis Bank Ltd",
    exchange: "NSE",
    basePricePaise: 124270,
    lotSize: 1,
    dayChangePercent: -0.58,
    high52WPaise: 134000,
    low52WPaise: 98000,
    segment: "EQUITY",
  },
  KOTAKBANK: {
    symbol: "KOTAKBANK",
    name: "Kotak Mahindra Bank",
    exchange: "NSE",
    basePricePaise: 41265,
    lotSize: 1,
    dayChangePercent: -0.52,
    high52WPaise: 49000,
    low52WPaise: 36000,
    segment: "EQUITY",
  },

  // =========================================================================
  // 3. F&O FUTURES CONTRACTS (INDEX & STOCK FUTURES)
  // =========================================================================
  TCS_FUT: {
    symbol: "TCS SEP FUT",
    name: "TCS 29 Sep 2026 Future",
    exchange: "NSE",
    basePricePaise: 413850,
    lotSize: 175,
    dayChangePercent: -0.75,
    high52WPaise: 462000,
    low52WPaise: 334000,
    segment: "FUTURES",
    underlying: "TCS",
    expiry: "29-Sep-2026",
  },
  RELIANCE_FUT: {
    symbol: "RELIANCE SEP FUT",
    name: "Reliance 29 Sep 2026 Future",
    exchange: "NSE",
    basePricePaise: 299200,
    lotSize: 250,
    dayChangePercent: 0.92,
    high52WPaise: 323000,
    low52WPaise: 223000,
    segment: "FUTURES",
    underlying: "RELIANCE",
    expiry: "29-Sep-2026",
  },
  INFY_FUT: {
    symbol: "INFY SEP FUT",
    name: "Infosys 29 Sep 2026 Future",
    exchange: "NSE",
    basePricePaise: 179200,
    lotSize: 400,
    dayChangePercent: -0.62,
    high52WPaise: 200500,
    low52WPaise: 136500,
    segment: "FUTURES",
    underlying: "INFY",
    expiry: "29-Sep-2026",
  },
  HDFCBANK_FUT: {
    symbol: "HDFCBANK SEP FUT",
    name: "HDFC Bank 29 Sep 2026 Future",
    exchange: "NSE",
    basePricePaise: 164800,
    lotSize: 550,
    dayChangePercent: 1.05,
    high52WPaise: 180500,
    low52WPaise: 137000,
    segment: "FUTURES",
    underlying: "HDFCBANK",
    expiry: "29-Sep-2026",
  },
  TATAMOTORS_FUT: {
    symbol: "TATAMOTORS SEP FUT",
    name: "Tata Motors 29 Sep 2026 Future",
    exchange: "NSE",
    basePricePaise: 97200,
    lotSize: 500,
    dayChangePercent: 2.05,
    high52WPaise: 118500,
    low52WPaise: 60500,
    segment: "FUTURES",
    underlying: "TATAMOTORS",
    expiry: "29-Sep-2026",
  },
  SUPREMEIND_FUT: {
    symbol: "SUPREMEIND SEP FUT",
    name: "Supreme Industries 29 Sep 2026 Future",
    exchange: "NSE",
    basePricePaise: 359500,
    lotSize: 150,
    dayChangePercent: 7.25,
    high52WPaise: 413000,
    low52WPaise: 280000,
    segment: "FUTURES",
    underlying: "SUPREMEIND",
    expiry: "29-Sep-2026",
  },
  UNOMINDA_FUT: {
    symbol: "UNOMINDA SEP FUT",
    name: "UNO Minda 29 Sep 2026 Future",
    exchange: "NSE",
    basePricePaise: 129200,
    lotSize: 400,
    dayChangePercent: 6.75,
    high52WPaise: 146000,
    low52WPaise: 62500,
    segment: "FUTURES",
    underlying: "UNOMINDA",
    expiry: "29-Sep-2026",
  },
  RVNL_FUT: {
    symbol: "RVNL SEP FUT",
    name: "Rail Vikas Nigam 29 Sep 2026 Future",
    exchange: "NSE",
    basePricePaise: 21550,
    lotSize: 1250,
    dayChangePercent: 6.45,
    high52WPaise: 34800,
    low52WPaise: 13100,
    segment: "FUTURES",
    underlying: "RVNL",
    expiry: "29-Sep-2026",
  },
  TATAPOWER_FUT: {
    symbol: "TATAPOWER SEP FUT",
    name: "Tata Power 29 Sep 2026 Future",
    exchange: "NSE",
    basePricePaise: 44450,
    lotSize: 1350,
    dayChangePercent: 3.75,
    high52WPaise: 49800,
    low52WPaise: 23600,
    segment: "FUTURES",
    underlying: "TATAPOWER",
    expiry: "29-Sep-2026",
  },
  NIFTY_FUT: {
    symbol: "NIFTY SEP FUT",
    name: "Nifty 50 29 Sep 2026 Future",
    exchange: "NSE",
    basePricePaise: 2537800,
    lotSize: 25,
    dayChangePercent: 0.58,
    high52WPaise: 2635000,
    low52WPaise: 1970000,
    segment: "FUTURES",
    underlying: "NIFTY",
    expiry: "29-Sep-2026",
  },
  BANKNIFTY_FUT: {
    symbol: "BANKNIFTY SEP FUT",
    name: "Bank Nifty 29 Sep 2026 Future",
    exchange: "NSE",
    basePricePaise: 5228000,
    lotSize: 15,
    dayChangePercent: 0.98,
    high52WPaise: 5460000,
    low52WPaise: 4335000,
    segment: "FUTURES",
    underlying: "BANKNIFTY",
    expiry: "29-Sep-2026",
  },
  FINNIFTY_FUT: {
    symbol: "FINNIFTY SEP FUT",
    name: "Fin Nifty 29 Sep 2026 Future",
    exchange: "NSE",
    basePricePaise: 2556000,
    lotSize: 25,
    dayChangePercent: 0.22,
    high52WPaise: 2615000,
    low52WPaise: 2020000,
    segment: "FUTURES",
    underlying: "FINNIFTY",
    expiry: "29-Sep-2026",
  },
  MIDCPNIFTY_FUT: {
    symbol: "MIDCPNIFTY SEP FUT",
    name: "Midcap Nifty 29 Sep 2026 Future",
    exchange: "NSE",
    basePricePaise: 1453500,
    lotSize: 50,
    dayChangePercent: 0.62,
    high52WPaise: 1525000,
    low52WPaise: 1055000,
    segment: "FUTURES",
    underlying: "MIDCPNIFTY",
    expiry: "29-Sep-2026",
  },

  // =========================================================================
  // 4. F&O OPTIONS CONTRACTS (CALLS CE & PUTS PE)
  // =========================================================================
  // --- TCS Options ---
  TCS_4100_CE: {
    symbol: "TCS 4100 CE",
    name: "TCS 29 Sep 4100 Call Option",
    exchange: "NSE",
    basePricePaise: 6850,
    lotSize: 175,
    dayChangePercent: 8.4,
    high52WPaise: 18000,
    low52WPaise: 1200,
    segment: "OPTIONS",
    underlying: "TCS",
    strikePrice: 4100,
    optionType: "CE",
    expiry: "29-Sep-2026",
  },
  TCS_4100_PE: {
    symbol: "TCS 4100 PE",
    name: "TCS 29 Sep 4100 Put Option",
    exchange: "NSE",
    basePricePaise: 3820,
    lotSize: 175,
    dayChangePercent: -12.5,
    high52WPaise: 15000,
    low52WPaise: 800,
    segment: "OPTIONS",
    underlying: "TCS",
    strikePrice: 4100,
    optionType: "PE",
    expiry: "29-Sep-2026",
  },
  TCS_4150_CE: {
    symbol: "TCS 4150 CE",
    name: "TCS 29 Sep 4150 Call Option",
    exchange: "NSE",
    basePricePaise: 4620,
    lotSize: 175,
    dayChangePercent: 5.2,
    high52WPaise: 16000,
    low52WPaise: 900,
    segment: "OPTIONS",
    underlying: "TCS",
    strikePrice: 4150,
    optionType: "CE",
    expiry: "29-Sep-2026",
  },
  TCS_4150_PE: {
    symbol: "TCS 4150 PE",
    name: "TCS 29 Sep 4150 Put Option",
    exchange: "NSE",
    basePricePaise: 5410,
    lotSize: 175,
    dayChangePercent: -8.1,
    high52WPaise: 17000,
    low52WPaise: 1100,
    segment: "OPTIONS",
    underlying: "TCS",
    strikePrice: 4150,
    optionType: "PE",
    expiry: "29-Sep-2026",
  },
  TCS_4200_CE: {
    symbol: "TCS 4200 CE",
    name: "TCS 29 Sep 4200 Call Option",
    exchange: "NSE",
    basePricePaise: 2940,
    lotSize: 175,
    dayChangePercent: 3.1,
    high52WPaise: 14000,
    low52WPaise: 600,
    segment: "OPTIONS",
    underlying: "TCS",
    strikePrice: 4200,
    optionType: "CE",
    expiry: "29-Sep-2026",
  },
  TCS_4200_PE: {
    symbol: "TCS 4200 PE",
    name: "TCS 29 Sep 4200 Put Option",
    exchange: "NSE",
    basePricePaise: 7650,
    lotSize: 175,
    dayChangePercent: -4.8,
    high52WPaise: 19500,
    low52WPaise: 1500,
    segment: "OPTIONS",
    underlying: "TCS",
    strikePrice: 4200,
    optionType: "PE",
    expiry: "29-Sep-2026",
  },

  // --- RELIANCE Options ---
  RELIANCE_2980_CE: {
    symbol: "RELIANCE 2980 CE",
    name: "Reliance 29 Sep 2980 Call Option",
    exchange: "NSE",
    basePricePaise: 4250,
    lotSize: 250,
    dayChangePercent: 9.5,
    high52WPaise: 12000,
    low52WPaise: 800,
    segment: "OPTIONS",
    underlying: "RELIANCE",
    strikePrice: 2980,
    optionType: "CE",
    expiry: "29-Sep-2026",
  },
  RELIANCE_2980_PE: {
    symbol: "RELIANCE 2980 PE",
    name: "Reliance 29 Sep 2980 Put Option",
    exchange: "NSE",
    basePricePaise: 3850,
    lotSize: 250,
    dayChangePercent: -11.2,
    high52WPaise: 11000,
    low52WPaise: 700,
    segment: "OPTIONS",
    underlying: "RELIANCE",
    strikePrice: 2980,
    optionType: "PE",
    expiry: "29-Sep-2026",
  },
  RELIANCE_3000_CE: {
    symbol: "RELIANCE 3000 CE",
    name: "Reliance 29 Sep 3000 Call Option",
    exchange: "NSE",
    basePricePaise: 3120,
    lotSize: 250,
    dayChangePercent: 6.8,
    high52WPaise: 9800,
    low52WPaise: 500,
    segment: "OPTIONS",
    underlying: "RELIANCE",
    strikePrice: 3000,
    optionType: "CE",
    expiry: "29-Sep-2026",
  },
  RELIANCE_3000_PE: {
    symbol: "RELIANCE 3000 PE",
    name: "Reliance 29 Sep 3000 Put Option",
    exchange: "NSE",
    basePricePaise: 5210,
    lotSize: 250,
    dayChangePercent: -7.5,
    high52WPaise: 13500,
    low52WPaise: 900,
    segment: "OPTIONS",
    underlying: "RELIANCE",
    strikePrice: 3000,
    optionType: "PE",
    expiry: "29-Sep-2026",
  },

  // --- INFY Options ---
  INFY_1880_CE: {
    symbol: "INFY 1880 CE",
    name: "Infosys 29 Sep 1880 Call Option",
    exchange: "NSE",
    basePricePaise: 2840,
    lotSize: 400,
    dayChangePercent: -4.5,
    high52WPaise: 8200,
    low52WPaise: 400,
    segment: "OPTIONS",
    underlying: "INFY",
    strikePrice: 1880,
    optionType: "CE",
    expiry: "29-Sep-2026",
  },
  INFY_1880_PE: {
    symbol: "INFY 1880 PE",
    name: "Infosys 29 Sep 1880 Put Option",
    exchange: "NSE",
    basePricePaise: 3450,
    lotSize: 400,
    dayChangePercent: 6.2,
    high52WPaise: 9500,
    low52WPaise: 550,
    segment: "OPTIONS",
    underlying: "INFY",
    strikePrice: 1880,
    optionType: "PE",
    expiry: "29-Sep-2026",
  },

  // --- HDFCBANK Options ---
  HDFCBANK_1640_CE: {
    symbol: "HDFCBANK 1640 CE",
    name: "HDFC Bank 29 Sep 1640 Call Option",
    exchange: "NSE",
    basePricePaise: 3120,
    lotSize: 550,
    dayChangePercent: 7.8,
    high52WPaise: 8500,
    low52WPaise: 450,
    segment: "OPTIONS",
    underlying: "HDFCBANK",
    strikePrice: 1640,
    optionType: "CE",
    expiry: "29-Sep-2026",
  },
  HDFCBANK_1640_PE: {
    symbol: "HDFCBANK 1640 PE",
    name: "HDFC Bank 29 Sep 1640 Put Option",
    exchange: "NSE",
    basePricePaise: 2650,
    lotSize: 550,
    dayChangePercent: -9.4,
    high52WPaise: 7800,
    low52WPaise: 350,
    segment: "OPTIONS",
    underlying: "HDFCBANK",
    strikePrice: 1640,
    optionType: "PE",
    expiry: "29-Sep-2026",
  },

  // --- NIFTY Options ---
  NIFTY_25300_CE: {
    symbol: "NIFTY 25300 CE",
    name: "Nifty 24 Sep 25300 Call Option",
    exchange: "NSE",
    basePricePaise: 23649,
    lotSize: 25,
    dayChangePercent: 12.5,
    high52WPaise: 45000,
    low52WPaise: 1500,
    segment: "OPTIONS",
    underlying: "NIFTY",
    strikePrice: 25300,
    optionType: "CE",
    expiry: "24-Sep-2026",
  },
  NIFTY_25300_PE: {
    symbol: "NIFTY 25300 PE",
    name: "Nifty 24 Sep 25300 Put Option",
    exchange: "NSE",
    basePricePaise: 18497,
    lotSize: 25,
    dayChangePercent: -14.2,
    high52WPaise: 42000,
    low52WPaise: 1200,
    segment: "OPTIONS",
    underlying: "NIFTY",
    strikePrice: 25300,
    optionType: "PE",
    expiry: "24-Sep-2026",
  },
  NIFTY_25350_CE: {
    symbol: "NIFTY 25350 CE",
    name: "Nifty 24 Sep 25350 Call Option",
    exchange: "NSE",
    basePricePaise: 19850,
    lotSize: 25,
    dayChangePercent: 8.9,
    high52WPaise: 41000,
    low52WPaise: 1000,
    segment: "OPTIONS",
    underlying: "NIFTY",
    strikePrice: 25350,
    optionType: "CE",
    expiry: "24-Sep-2026",
  },
  NIFTY_25350_PE: {
    symbol: "NIFTY 25350 PE",
    name: "Nifty 24 Sep 25350 Put Option",
    exchange: "NSE",
    basePricePaise: 22400,
    lotSize: 25,
    dayChangePercent: -10.5,
    high52WPaise: 44000,
    low52WPaise: 1400,
    segment: "OPTIONS",
    underlying: "NIFTY",
    strikePrice: 25350,
    optionType: "PE",
    expiry: "24-Sep-2026",
  },

  // --- BANKNIFTY Options ---
  BANKNIFTY_52100_CE: {
    symbol: "BANKNIFTY 52100 CE",
    name: "Bank Nifty 24 Sep 52100 Call Option",
    exchange: "NSE",
    basePricePaise: 38450,
    lotSize: 15,
    dayChangePercent: 14.2,
    high52WPaise: 82000,
    low52WPaise: 2500,
    segment: "OPTIONS",
    underlying: "BANKNIFTY",
    strikePrice: 52100,
    optionType: "CE",
    expiry: "24-Sep-2026",
  },
  BANKNIFTY_52100_PE: {
    symbol: "BANKNIFTY 52100 PE",
    name: "Bank Nifty 24 Sep 52100 Put Option",
    exchange: "NSE",
    basePricePaise: 31200,
    lotSize: 15,
    dayChangePercent: -16.8,
    high52WPaise: 79000,
    low52WPaise: 2100,
    segment: "OPTIONS",
    underlying: "BANKNIFTY",
    strikePrice: 52100,
    optionType: "PE",
    expiry: "24-Sep-2026",
  },

  // --- SUPREMEIND Options ---
  SUPREMEIND_3600_CE: {
    symbol: "SUPREMEIND 3600 CE",
    name: "Supreme Ind 29 Sep 3600 Call Option",
    exchange: "NSE",
    basePricePaise: 9500,
    lotSize: 150,
    dayChangePercent: 32.5,
    high52WPaise: 24000,
    low52WPaise: 1500,
    segment: "OPTIONS",
    underlying: "SUPREMEIND",
    strikePrice: 3600,
    optionType: "CE",
    expiry: "29-Sep-2026",
  },
  SUPREMEIND_3600_PE: {
    symbol: "SUPREMEIND 3600 PE",
    name: "Supreme Ind 29 Sep 3600 Put Option",
    exchange: "NSE",
    basePricePaise: 6200,
    lotSize: 150,
    dayChangePercent: -28.4,
    high52WPaise: 21000,
    low52WPaise: 1100,
    segment: "OPTIONS",
    underlying: "SUPREMEIND",
    strikePrice: 3600,
    optionType: "PE",
    expiry: "29-Sep-2026",
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
