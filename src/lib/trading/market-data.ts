// Realistic simulated OHLCV + indicator engine for the trading UI.
// All prices are mock and labeled clearly in the UI.

export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h";
export type Symbol =
  | "EURUSD"
  | "GBPUSD"
  | "USDJPY"
  | "AUDUSD"
  | "USDCAD"
  | "USDCHF"
  | "NZDUSD"
  | "SPX500"
  | "NAS100";

export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export const SYMBOLS: { id: Symbol; label: string; group: string; basePrice: number; vol: number; digits: number }[] = [
  { id: "EURUSD", label: "EUR/USD", group: "Forex", basePrice: 1.0850, vol: 0.0006, digits: 5 },
  { id: "GBPUSD", label: "GBP/USD", group: "Forex", basePrice: 1.2720, vol: 0.0008, digits: 5 },
  { id: "USDJPY", label: "USD/JPY", group: "Forex", basePrice: 156.40, vol: 0.12, digits: 3 },
  { id: "AUDUSD", label: "AUD/USD", group: "Forex", basePrice: 0.6620, vol: 0.0005, digits: 5 },
  { id: "USDCAD", label: "USD/CAD", group: "Forex", basePrice: 1.3640, vol: 0.0006, digits: 5 },
  { id: "USDCHF", label: "USD/CHF", group: "Forex", basePrice: 0.8810, vol: 0.0005, digits: 5 },
  { id: "NZDUSD", label: "NZD/USD", group: "Forex", basePrice: 0.6080, vol: 0.0005, digits: 5 },
  { id: "SPX500", label: "SPX500", group: "Index", basePrice: 5870, vol: 4.5, digits: 2 },
  { id: "NAS100", label: "NAS100", group: "Index", basePrice: 21450, vol: 18, digits: 2 },
];

export const TIMEFRAMES: { id: Timeframe; label: string; seconds: number }[] = [
  { id: "1m", label: "1m", seconds: 60 },
  { id: "5m", label: "5m", seconds: 300 },
  { id: "15m", label: "15m", seconds: 900 },
  { id: "1h", label: "1H", seconds: 3600 },
  { id: "4h", label: "4H", seconds: 14400 },
];

// Mulberry32 PRNG for reproducible candles per (symbol, tf)
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function generateCandles(symbol: Symbol, tf: Timeframe, count = 300): Candle[] {
  const meta = SYMBOLS.find((s) => s.id === symbol)!;
  const tfMeta = TIMEFRAMES.find((t) => t.id === tf)!;
  const rand = mulberry32(hash(symbol + tf));

  const now = Math.floor(Date.now() / 1000);
  const start = now - count * tfMeta.seconds;
  const candles: Candle[] = [];

  let price = meta.basePrice;
  // Slow trend drift
  let trend = (rand() - 0.5) * meta.vol * 0.15;

  for (let i = 0; i < count; i++) {
    // Occasionally flip trend regime
    if (rand() < 0.02) trend = (rand() - 0.5) * meta.vol * 0.25;

    const drift = trend;
    const noise = (rand() - 0.5) * meta.vol * 2;
    const open = price;
    const close = open + drift + noise;
    const wick = Math.abs(noise) * (0.5 + rand());
    const high = Math.max(open, close) + wick * rand();
    const low = Math.min(open, close) - wick * rand();
    const volume = Math.round(800 + rand() * 4200 + Math.abs(noise / meta.vol) * 600);

    candles.push({
      time: start + i * tfMeta.seconds,
      open: round(open, meta.digits),
      high: round(high, meta.digits),
      low: round(low, meta.digits),
      close: round(close, meta.digits),
      volume,
    });

    price = close;
  }

  return candles;
}

export function tickCandle(prev: Candle, symbol: Symbol): Candle {
  const meta = SYMBOLS.find((s) => s.id === symbol)!;
  const delta = (Math.random() - 0.5) * meta.vol * 0.6;
  const close = round(prev.close + delta, meta.digits);
  return {
    ...prev,
    close,
    high: round(Math.max(prev.high, close), meta.digits),
    low: round(Math.min(prev.low, close), meta.digits),
    volume: prev.volume + Math.round(20 + Math.random() * 80),
  };
}

function round(n: number, digits: number) {
  const p = Math.pow(10, digits);
  return Math.round(n * p) / p;
}

// -------- Indicators --------

export function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values[0];
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[0] : values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function rsi(values: number[], period = 14): number[] {
  const out: number[] = [];
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  gain /= period; loss /= period;
  out[period] = 100 - 100 / (1 + gain / (loss || 1e-9));
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    gain = (gain * (period - 1) + g) / period;
    loss = (loss * (period - 1) + l) / period;
    out[i] = 100 - 100 / (1 + gain / (loss || 1e-9));
  }
  for (let i = 0; i < period; i++) out[i] = 50;
  return out;
}

export function macd(values: number[]) {
  const e12 = ema(values, 12);
  const e26 = ema(values, 26);
  const line = values.map((_, i) => e12[i] - e26[i]);
  const signal = ema(line, 9);
  const hist = line.map((v, i) => v - signal[i]);
  return { line, signal, hist };
}

export function atr(c: Candle[], period = 14): number[] {
  const tr: number[] = [];
  for (let i = 0; i < c.length; i++) {
    if (i === 0) { tr.push(c[i].high - c[i].low); continue; }
    tr.push(Math.max(
      c[i].high - c[i].low,
      Math.abs(c[i].high - c[i - 1].close),
      Math.abs(c[i].low - c[i - 1].close),
    ));
  }
  return ema(tr, period);
}

export function vwap(c: Candle[]): number[] {
  let pv = 0, v = 0;
  return c.map((k) => {
    const typical = (k.high + k.low + k.close) / 3;
    pv += typical * k.volume;
    v += k.volume;
    return pv / v;
  });
}

export function findSupportResistance(c: Candle[]): { support: number; resistance: number } {
  const recent = c.slice(-80);
  const lows = recent.map((k) => k.low).sort((a, b) => a - b);
  const highs = recent.map((k) => k.high).sort((a, b) => b - a);
  return {
    support: lows[Math.floor(lows.length * 0.15)],
    resistance: highs[Math.floor(highs.length * 0.15)],
  };
}
