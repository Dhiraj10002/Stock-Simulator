import test from "node:test";
import assert from "node:assert/strict";
import {
  formatHistoricalCandles,
  calculateVWAP,
  calculateEMA,
  calculateSMA,
  applyLiveTick,
} from "./chartUtils";
import { Candle } from "@/types";

test("formatHistoricalCandles: handles empty or null input gracefully", () => {
  assert.deepEqual(formatHistoricalCandles([]), []);
  assert.deepEqual(formatHistoricalCandles(undefined), []);
});

test("formatHistoricalCandles: normalizes millisecond timestamps to seconds", () => {
  const candles: Candle[] = [
    { timestamp: 1711440000000, open_paise: 250000, high_paise: 255000, low_paise: 249000, close_paise: 253000, volume: 1500 },
    { timestamp: 1711440060000, open_paise: 253000, high_paise: 256000, low_paise: 252000, close_paise: 254000, volume: 1800 },
  ];

  const formatted = formatHistoricalCandles(candles);
  assert.equal(formatted.length, 2);
  assert.equal(formatted[0].time, 1711440000);
  assert.equal(formatted[0].open, 2500.0);
  assert.equal(formatted[0].high, 2550.0);
  assert.equal(formatted[0].low, 2490.0);
  assert.equal(formatted[0].close, 2530.0);
  assert.equal(formatted[0].volume, 1500);

  assert.equal(formatted[1].time, 1711440060);
});

test("formatHistoricalCandles: deduplicates identical timestamps and preserves sorted order", () => {
  const unorderedAndDuped: Candle[] = [
    { timestamp: 1711440120, open_paise: 10000, high_paise: 10500, low_paise: 9900, close_paise: 10200, volume: 50 },
    { timestamp: 1711440000, open_paise: 10000, high_paise: 10500, low_paise: 9900, close_paise: 10100, volume: 40 },
    { timestamp: 1711440000, open_paise: 10000, high_paise: 10500, low_paise: 9900, close_paise: 10150, volume: 60 }, // Duplicate
    { timestamp: 1711440060, open_paise: 10100, high_paise: 10300, low_paise: 10000, close_paise: 10250, volume: 80 },
  ];

  const formatted = formatHistoricalCandles(unorderedAndDuped);
  assert.equal(formatted.length, 3);
  assert.equal(formatted[0].time, 1711440000);
  assert.equal(formatted[1].time, 1711440060);
  assert.equal(formatted[2].time, 1711440120);
});

test("applyLiveTick: updates existing open 1-minute candle bucket", () => {
  const now = 1711440045; // 45 seconds into the 1711440000 bucket
  const initial = {
    time: 1711440000,
    open: 500.0,
    high: 505.0,
    low: 498.0,
    close: 502.0,
    volume: 10,
  };

  // Higher tick (510.00 => 51000 paise)
  const resultHigh = applyLiveTick(initial, 51000, now);
  assert.equal(resultHigh.isNewBar, false);
  assert.equal(resultHigh.candle.time, 1711440000);
  assert.equal(resultHigh.candle.open, 500.0);
  assert.equal(resultHigh.candle.high, 510.0);
  assert.equal(resultHigh.candle.low, 498.0);
  assert.equal(resultHigh.candle.close, 510.0);
  assert.equal(resultHigh.candle.volume, 11);

  // Lower tick (490.00 => 49000 paise)
  const resultLow = applyLiveTick(resultHigh.candle, 49000, now + 5);
  assert.equal(resultLow.isNewBar, false);
  assert.equal(resultLow.candle.high, 510.0);
  assert.equal(resultLow.candle.low, 490.0);
  assert.equal(resultLow.candle.close, 490.0);
  assert.equal(resultLow.candle.volume, 12);
});

test("applyLiveTick: rolls over to a new bar when the minute advances", () => {
  const previousBar = {
    time: 1711440000,
    open: 500.0,
    high: 510.0,
    low: 495.0,
    close: 508.0,
    volume: 25,
  };

  const nextMinute = 1711440065; // 65 seconds later -> bucket 1711440060
  const tickResult = applyLiveTick(previousBar, 50950, nextMinute);

  assert.equal(tickResult.isNewBar, true);
  assert.equal(tickResult.candle.time, 1711440060);
  assert.equal(tickResult.candle.open, 508.0); // Opens at previous close
  assert.equal(tickResult.candle.high, 509.5);
  assert.equal(tickResult.candle.low, 509.5);
  assert.equal(tickResult.candle.close, 509.5);
  assert.equal(tickResult.candle.volume, 1);
});

test("applyLiveTick: handles null previous candle gracefully", () => {
  const now = 1711440020;
  const tickResult = applyLiveTick(null, 250000, now);

  assert.equal(tickResult.isNewBar, true);
  assert.equal(tickResult.candle.time, 1711440000);
  assert.equal(tickResult.candle.open, 2500.0);
  assert.equal(tickResult.candle.high, 2500.0);
  assert.equal(tickResult.candle.low, 2500.0);
  assert.equal(tickResult.candle.close, 2500.0);
  assert.equal(tickResult.candle.volume, 1);
});

test("calculateVWAP: accurately computes volume-weighted typical price", () => {
  const data = [
    { time: 100, open: 100, high: 110, low: 90, close: 100, volume: 100 }, // typical: 100, cum: 10000 / 100 = 100
    { time: 200, open: 100, high: 130, low: 110, close: 120, volume: 200 }, // typical: 120, cum: 10000 + 24000 = 34000 / 300 = 113.33
  ];

  const vwap = calculateVWAP(data);
  assert.equal(vwap.length, 2);
  assert.equal(vwap[0].value, 100.0);
  assert.equal(vwap[1].value, 113.33);
});

test("calculateSMA & calculateEMA: return expected moving average series", () => {
  const candles = [
    { time: 1, open: 10, high: 10, low: 10, close: 10, volume: 1 },
    { time: 2, open: 20, high: 20, low: 20, close: 20, volume: 1 },
    { time: 3, open: 30, high: 30, low: 30, close: 30, volume: 1 },
  ];

  const sma2 = calculateSMA(candles, 2);
  assert.equal(sma2.length, 2);
  assert.equal(sma2[0].value, 15.0); // (10+20)/2
  assert.equal(sma2[1].value, 25.0); // (20+30)/2

  const ema2 = calculateEMA(candles, 2);
  assert.equal(ema2.length, 2);
  assert.equal(ema2[0].value, 15.0);
  // k = 2/(2+1) = 2/3. ema = 30 * (2/3) + 15 * (1/3) = 20 + 5 = 25
  assert.equal(ema2[1].value, 25.0);
});
