// Extra indicators used by the weighted scoring engine.
// Kept separate from market-data.ts so Phase 3+ can extend it freely.

import type { Candle } from "./market-data";
import { ema } from "./market-data";

export function sma(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function stdev(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  const m = sma(values, period);
  for (let i = period - 1; i < values.length; i++) {
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const d = values[j] - m[i];
      s += d * d;
    }
    out[i] = Math.sqrt(s / period);
  }
  return out;
}

export interface Bollinger {
  mid: number[];
  upper: number[];
  lower: number[];
  bandwidth: number[]; // (upper - lower) / mid
}

export function bollinger(values: number[], period = 20, stdMult = 2): Bollinger {
  const mid = sma(values, period);
  const sd = stdev(values, period);
  const upper = mid.map((m, i) => m + sd[i] * stdMult);
  const lower = mid.map((m, i) => m - sd[i] * stdMult);
  const bandwidth = mid.map((m, i) =>
    !isFinite(m) || m === 0 ? NaN : (upper[i] - lower[i]) / m,
  );
  return { mid, upper, lower, bandwidth };
}

// Wilder's ADX + directional indicators.
export interface Adx {
  adx: number[];
  plusDi: number[];
  minusDi: number[];
}

export function adx(c: Candle[], period = 14): Adx {
  const n = c.length;
  const plusDm: number[] = [0];
  const minusDm: number[] = [0];
  const tr: number[] = [c[0].high - c[0].low];
  for (let i = 1; i < n; i++) {
    const upMove = c[i].high - c[i - 1].high;
    const downMove = c[i - 1].low - c[i].low;
    plusDm.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDm.push(downMove > upMove && downMove > 0 ? downMove : 0);
    tr.push(
      Math.max(
        c[i].high - c[i].low,
        Math.abs(c[i].high - c[i - 1].close),
        Math.abs(c[i].low - c[i - 1].close),
      ),
    );
  }
  // Wilder smoothing via EMA-equivalent with alpha = 1/period.
  const smooth = (arr: number[]) => {
    const out: number[] = new Array(arr.length).fill(0);
    let acc = 0;
    for (let i = 0; i < arr.length; i++) {
      acc = i === 0 ? arr[i] : acc - acc / period + arr[i];
      out[i] = acc;
    }
    return out;
  };
  const sTr = smooth(tr);
  const sPlus = smooth(plusDm);
  const sMinus = smooth(minusDm);
  const plusDi = sPlus.map((v, i) => (sTr[i] ? (100 * v) / sTr[i] : 0));
  const minusDi = sMinus.map((v, i) => (sTr[i] ? (100 * v) / sTr[i] : 0));
  const dx = plusDi.map((p, i) => {
    const denom = p + minusDi[i];
    return denom ? (100 * Math.abs(p - minusDi[i])) / denom : 0;
  });
  const adxSeries = ema(dx, period);
  return { adx: adxSeries, plusDi, minusDi };
}

// Percentile rank of the last value inside its trailing window (0..1).
export function percentileRank(values: number[], window: number): number {
  const slice = values.slice(-window).filter((v) => isFinite(v));
  if (slice.length === 0) return 0.5;
  const last = slice[slice.length - 1];
  const rank = slice.filter((v) => v <= last).length;
  return rank / slice.length;
}

// Relative volume: current volume / avg of previous `window` bars.
export function relativeVolume(c: Candle[], window = 20): number {
  if (c.length < window + 1) return 1;
  const cur = c[c.length - 1].volume;
  let s = 0;
  for (let i = c.length - 1 - window; i < c.length - 1; i++) s += c[i].volume;
  const avg = s / window;
  return avg ? cur / avg : 1;
}

// Regular RSI divergence over `lookback` bars, on the last bar.
// Returns "bullish", "bearish" or "none".
export function rsiDivergence(
  closes: number[],
  rsi: number[],
  lookback = 14,
): "bullish" | "bearish" | "none" {
  const n = closes.length;
  if (n < lookback + 2) return "none";
  const start = n - lookback;
  const end = n - 1;
  let lowIdx = start;
  let highIdx = start;
  for (let i = start; i <= end; i++) {
    if (closes[i] < closes[lowIdx]) lowIdx = i;
    if (closes[i] > closes[highIdx]) highIdx = i;
  }
  // Bullish: price makes lower low, RSI makes higher low vs earlier trough.
  const priorLowIdx = argMin(closes.slice(start, lowIdx).concat([Infinity])) + start;
  const priorHighIdx = argMax(closes.slice(start, highIdx).concat([-Infinity])) + start;
  if (
    lowIdx > priorLowIdx &&
    closes[lowIdx] < closes[priorLowIdx] &&
    rsi[lowIdx] > rsi[priorLowIdx] + 2
  ) {
    return "bullish";
  }
  if (
    highIdx > priorHighIdx &&
    closes[highIdx] > closes[priorHighIdx] &&
    rsi[highIdx] < rsi[priorHighIdx] - 2
  ) {
    return "bearish";
  }
  return "none";
}

function argMin(arr: number[]): number {
  let m = 0;
  for (let i = 1; i < arr.length; i++) if (arr[i] < arr[m]) m = i;
  return m;
}
function argMax(arr: number[]): number {
  let m = 0;
  for (let i = 1; i < arr.length; i++) if (arr[i] > arr[m]) m = i;
  return m;
}

// Slope of a series over the last N bars, normalized by price so it's
// comparable across instruments (returns approx. % per bar).
export function normalizedSlope(series: number[], n = 10, refPrice = 1): number {
  const len = series.length;
  if (len < n + 1 || refPrice === 0) return 0;
  const first = series[len - 1 - n];
  const last = series[len - 1];
  return ((last - first) / n / refPrice) * 100;
}
