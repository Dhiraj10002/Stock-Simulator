import { getApiUrl } from "@/lib/config";
import type { Instrument } from "@/types";

// In-memory cache for canonical instruments
let cachedInstruments: Instrument[] | null = null;
let cachePromise: Promise<Instrument[]> | null = null;

export interface FetchInstrumentsParams {
  q?: string;
  exchange?: string;
  instrument_type?: string;
  underlying?: string;
  active?: boolean;
  limit?: number;
}

/**
 * Fetch authoritative canonical instruments from the backend instrument master.
 */
export async function fetchInstruments(params?: FetchInstrumentsParams): Promise<Instrument[]> {
  const apiUrl = getApiUrl();
  const searchParams = new URLSearchParams();

  if (params?.q) searchParams.set("q", params.q);
  if (params?.exchange) searchParams.set("exchange", params.exchange);
  if (params?.instrument_type) searchParams.set("instrument_type", params.instrument_type);
  if (params?.underlying) searchParams.set("underlying", params.underlying);
  if (params?.active !== undefined) searchParams.set("active", String(params.active));
  if (params?.limit) searchParams.set("limit", String(params.limit));

  const queryString = searchParams.toString();
  const url = `${apiUrl}/instruments${queryString ? `?${queryString}` : ""}`;

  // If fetching full unfiltered active list, reuse in-memory promise/cache
  const isFullList = !params || (Object.keys(params).length === 0 || (Object.keys(params).length === 1 && params.active === true));

  if (isFullList && cachedInstruments) {
    return cachedInstruments;
  }
  if (isFullList && cachePromise) {
    return cachePromise;
  }

  const doFetch = async (): Promise<Instrument[]> => {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to fetch instruments: ${res.statusText}`);
      }
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const list: Instrument[] = json.data.map(normalizeInstrument);
        if (isFullList && list.length > 0) {
          cachedInstruments = list;
        }
        return list;
      }
      return [];
    } catch (err) {
      console.warn("fetchInstruments error:", err);
      return cachedInstruments || [];
    } finally {
      if (isFullList) {
        cachePromise = null;
      }
    }
  };

  if (isFullList) {
    cachePromise = doFetch();
    return cachePromise;
  }

  return doFetch();
}

/**
 * Fetch a single canonical instrument by its symbol.
 */
export async function fetchInstrumentBySymbol(symbol: string): Promise<Instrument | null> {
  const clean = symbol.trim().toUpperCase();
  if (cachedInstruments) {
    const found = cachedInstruments.find(
      (i) => i.symbol.toUpperCase() === clean || i.symbol.toUpperCase() === `${clean}-EQ`
    );
    if (found) return found;
  }

  const apiUrl = getApiUrl();
  try {
    const res = await fetch(`${apiUrl}/instruments/${encodeURIComponent(clean)}`);
    if (!res.ok) return null;
    const json = await res.json();
    if (json.success && json.data) {
      return normalizeInstrument(json.data);
    }
  } catch {
    // Graceful fallback
  }
  return null;
}

/**
 * Normalizes raw backend payload into the strict canonical Instrument model.
 */
export function normalizeInstrument(raw: any): Instrument {
  const lotSize = Number(raw.lot_size ?? raw.lotSize ?? (raw.segment === "OPTIONS" || raw.segment === "FUTURES" ? 25 : 1));
  const tickSize = Number(raw.tick_size ?? raw.tickSize ?? 0.05);
  const strike = Number(raw.strike ?? raw.strikePrice ?? 0);
  const dispSymbol = String(raw.display_symbol || raw.displayName || raw.symbol || "");

  let seg: "EQUITY" | "INDEX" | "FUTURES" | "OPTIONS" = "EQUITY";
  const it = String(raw.instrument_type || raw.segment || "").toUpperCase();
  if (it.includes("OPT")) seg = "OPTIONS";
  else if (it.includes("FUT")) seg = "FUTURES";
  else if (it.includes("INDEX")) seg = "INDEX";

  return {
    id: raw.id ?? raw.token ?? raw.symbol,
    symbol: String(raw.symbol || "").toUpperCase(),
    display_symbol: dispSymbol,
    exchange: String(raw.exchange || (seg === "FUTURES" || seg === "OPTIONS" ? "NFO" : "NSE")).toUpperCase(),
    token: String(raw.token || ""),
    instrument_type: String(raw.instrument_type || (seg === "OPTIONS" ? "OPTIDX" : seg === "FUTURES" ? "FUTIDX" : "EQUITY")).toUpperCase(),
    underlying: String(raw.underlying || raw.name || raw.symbol || "").toUpperCase(),
    expiry: String(raw.expiry || ""),
    strike: isNaN(strike) ? 0 : strike,
    option_type: String(raw.option_type || raw.optionType || "").toUpperCase(),
    lot_size: lotSize > 0 ? lotSize : 1,
    tick_size: tickSize > 0 ? tickSize : 0.05,
    active: Boolean(raw.active ?? true),

    // Attached live market quote values if present
    name: raw.name || dispSymbol,
    price_paise: raw.price_paise ?? raw.basePricePaise,
    change_percent: raw.change_percent ?? raw.dayChangePercent,

    // Aliases for compatibility
    displayName: dispSymbol,
    lotSize: lotSize > 0 ? lotSize : 1,
    basePricePaise: raw.price_paise ?? raw.basePricePaise,
    dayChangePercent: raw.change_percent ?? raw.dayChangePercent,
    segment: seg,
    strikePrice: isNaN(strike) ? 0 : strike,
    optionType: String(raw.option_type || raw.optionType || "").toUpperCase() as "CE" | "PE" | "",
  };
}
