import { Candle } from "@/types";

export interface FormattedCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorPoint {
  time: number;
  value: number;
}

/**
 * Normalizes, deduplicates, and sorts raw historical candles strictly ascending in time.
 * Handles both millisecond and second timestamps.
 */
export function formatHistoricalCandles(candles?: Candle[]): FormattedCandle[] {
  if (!candles || candles.length === 0) return [];

  const map = new Map<number, FormattedCandle>();

  for (const c of candles) {
    if (!c || c.timestamp === undefined) continue;
    // Normalize milliseconds (> 1e11) to UTC unix seconds
    const sec = c.timestamp > 1e11 ? Math.floor(c.timestamp / 1000) : c.timestamp;

    map.set(sec, {
      time: sec,
      open: Number((c.open_paise / 100).toFixed(2)),
      high: Number((c.high_paise / 100).toFixed(2)),
      low: Number((c.low_paise / 100).toFixed(2)),
      close: Number((c.close_paise / 100).toFixed(2)),
      volume: c.volume || 0,
    });
  }

  // Strictly ascending sort by time required by lightweight-charts
  return Array.from(map.values()).sort((a, b) => a.time - b.time);
}

/**
 * Calculates Volume Weighted Average Price (VWAP) for intraday candles.
 */
export function calculateVWAP(candles: FormattedCandle[]): IndicatorPoint[] {
  if (!candles || candles.length === 0) return [];

  const vwapData: IndicatorPoint[] = [];
  let cumTypicalVol = 0;
  let cumVol = 0;

  for (const d of candles) {
    const typical = (d.high + d.low + d.close) / 3;
    const vol = d.volume > 0 ? d.volume : 1;
    cumTypicalVol += typical * vol;
    cumVol += vol;

    vwapData.push({
      time: d.time,
      value: Number((cumTypicalVol / cumVol).toFixed(2)),
    });
  }

  return vwapData;
}

/**
 * Calculates Exponential Moving Average (EMA) for specified period.
 */
export function calculateEMA(candles: FormattedCandle[], period: number): IndicatorPoint[] {
  const res: IndicatorPoint[] = [];
  if (!candles || candles.length < period || period <= 0) return res;

  const k = 2 / (period + 1);
  let ema = 0;

  // Initialize with Simple Moving Average of first 'period' elements
  for (let i = 0; i < period; i++) {
    ema += candles[i].close;
  }
  ema = ema / period;
  res.push({ time: candles[period - 1].time, value: Number(ema.toFixed(2)) });

  for (let i = period; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k);
    res.push({ time: candles[i].time, value: Number(ema.toFixed(2)) });
  }

  return res;
}

/**
 * Calculates Simple Moving Average (SMA) for specified period.
 */
export function calculateSMA(candles: FormattedCandle[], period: number): IndicatorPoint[] {
  const res: IndicatorPoint[] = [];
  if (!candles || candles.length < period || period <= 0) return res;

  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += candles[i - j].close;
    }
    res.push({ time: candles[i].time, value: Number((sum / period).toFixed(2)) });
  }

  return res;
}

/**
 * Streams a live price tick into the current open 1-minute candle bucket.
 * Returns either an updated existing candle or a newly created open candle.
 */
export function applyLiveTick(
  lastCandle: FormattedCandle | null,
  livePricePaise: number,
  nowSec: number = Math.floor(Date.now() / 1000)
): { candle: FormattedCandle; isNewBar: boolean } {
  const livePrice = Number((livePricePaise / 100).toFixed(2));
  const currentBucket = Math.floor(nowSec / 60) * 60;

  if (lastCandle && lastCandle.time === currentBucket) {
    // Tick belongs to the active open 1-minute candle
    return {
      candle: {
        time: lastCandle.time,
        open: lastCandle.open,
        high: Math.max(lastCandle.high, livePrice),
        low: Math.min(lastCandle.low, livePrice),
        close: livePrice,
        volume: (lastCandle.volume || 0) + 1,
      },
      isNewBar: false,
    };
  }

  // A new 1-minute candle bucket has started
  return {
    candle: {
      time: currentBucket,
      open: lastCandle ? lastCandle.close : livePrice,
      high: livePrice,
      low: livePrice,
      close: livePrice,
      volume: 1,
    },
    isNewBar: true,
  };
}
