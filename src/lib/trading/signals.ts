// IntelliTrade Quant Engine — probability-based signal engine.
//
// Design principles:
//  1. Structure first: swing HH/HL determines bias before any indicator runs.
//  2. Weighted probability, not confirmation counting. Indicators trim or add
//     probability; they never veto a setup on their own.
//  3. Setup recognition: pattern must be named (Trend Pullback, Breakout,
//     Retest, Failed Breakout, Range Bounce, etc.) — no name, no A-grade.
//  4. Only hard rejects are: spread eats stop, or probability < gradeC AND no
//     recognizable setup. Everything else is graded C / B / A / A+.
//  5. Cached indicator pass — analyzeMarket + generateSignal share one compute.

import {
  atr,
  ema,
  findSupportResistance,
  macd,
  rsi,
  vwap,
  type Candle,
  type Symbol,
  type Timeframe,
  SYMBOLS,
} from "./market-data";
import {
  adx,
  bollinger,
  normalizedSlope,
  percentileRank,
  relativeVolume,
  rsiDivergence,
} from "./indicators";
import {
  CONFIG,
  QUALITY_SIGNALS,
  SIGNAL_LABELS,
  gradeFor,
  type Grade,
  type SetupType,
  type SignalKey,
} from "./config";

export type Side = "BUY" | "SELL" | "NONE";

export interface ScoreContribution {
  key: SignalKey;
  label: string;
  score: number;
  weight: number;
  side: "bull" | "bear" | "neutral";
  detail: string;
}

export interface FilterCheck {
  key: string;
  label: string;
  pass: boolean;
  actual: number;
  required: number;
  unit?: string;
  progress: number;
  detail: string;
}

export interface SignalDiagnostics {
  currentConfidence: number;
  requiredConfidence: number;
  bullScore: number;
  bearScore: number;
  qualityScore: number;
  edge: number;
  requiredEdge: number;
  adxValue: number;
  requiredAdx: number;
  riskRewardEstimate: number;
  qualityMultiplier: number;
  dominantSide: "BUY" | "SELL";
  filters: FilterCheck[];
  blockingFilter: FilterCheck | null;
  closestToPassing: FilterCheck[];
  rejectionReason: string;
  // NEW — probability engine additions.
  probability: number;
  bullProbability: number;
  bearProbability: number;
  grade: Grade;
  setup: SetupType;
  topBoosters: { label: string; delta: number }[];
  topReducers: { label: string; delta: number }[];
  needToPass: string;
}

export interface Signal {
  id: string;
  symbol: Symbol;
  timeframe: Timeframe;
  side: Side;
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  riskReward: number;
  confidence: number;
  bullScore: number;
  bearScore: number;
  qualityScore: number;
  trend: "Bullish" | "Bearish" | "Sideways";
  strength: "Weak" | "Moderate" | "Strong";
  reasons: string[];
  explanation: string;
  aiSummary: string;
  scoreBreakdown: ScoreContribution[];
  diagnostics: SignalDiagnostics;
  checks: { label: string; pass: boolean }[];
  createdAt: number;
  atr: number;
  rsi: number;
  spread: number;
  // NEW — probability outputs.
  probability: number;
  grade: Grade;
  setup: SetupType;
  expectedMove: number;
  expectedHoldingBars: number;
  expectedHoldingLabel: string;
  expectedTrendStrength: "Weak" | "Moderate" | "Strong" | "Very Strong";
  expectedRiskReward: number;
}

export interface MarketAnalysis {
  trend: "Bullish" | "Bearish" | "Sideways";
  trendScore: number;
  momentum: "Strong" | "Building" | "Weak" | "Fading";
  volatility: "Low" | "Normal" | "High";
  atr: number;
  rsi: number;
  adx: number;
  macdState: "Bullish Cross" | "Bearish Cross" | "Bullish" | "Bearish" | "Flat";
  support: number;
  resistance: number;
  status: "Trending" | "Consolidating" | "Breakout" | "Reversal Watch";
  spread: number;
  sessionTag: "Asia" | "London" | "New York" | "Overlap" | "After Hours";
  signalStrength: number;
  structure: "HH-HL" | "LH-LL" | "Choppy";
}

// ---- Shared indicator cache ------------------------------------------------
// Recomputes are keyed on last-candle time so back-to-back calls (analyze +
// signal) share one pass instead of running EMA/RSI/MACD/ADX/BB twice.

interface IndicatorPack {
  closes: number[];
  e20: number[];
  e50: number[];
  e200: number[];
  r: number[];
  m: ReturnType<typeof macd>;
  a: number[];
  v: number[];
  bb: ReturnType<typeof bollinger>;
  adxRes: ReturnType<typeof adx>;
  sr: { support: number; resistance: number };
  swings: { highs: number[]; lows: number[] };
}

const indicatorCache = new Map<string, { key: string; pack: IndicatorPack }>();

function computeIndicators(c: Candle[], symbol: Symbol, tf: Timeframe): IndicatorPack {
  const cfg = CONFIG.indicators;
  const cacheKey = `${symbol}:${tf}`;
  const version = `${c.length}:${c[c.length - 1].time}:${c[c.length - 1].close}`;
  const hit = indicatorCache.get(cacheKey);
  if (hit && hit.key === version) return hit.pack;

  const closes = c.map((k) => k.close);
  const pack: IndicatorPack = {
    closes,
    e20: ema(closes, cfg.emaFast),
    e50: ema(closes, cfg.emaMid),
    e200: ema(closes, cfg.emaSlow),
    r: rsi(closes, cfg.rsiPeriod),
    m: macd(closes),
    a: atr(c, cfg.atrPeriod),
    v: vwap(c),
    bb: bollinger(closes, cfg.bbPeriod, cfg.bbStdDev),
    adxRes: adx(c, cfg.adxPeriod),
    sr: findSupportResistance(c),
    swings: findSwings(c, cfg.swingLookback),
  };
  indicatorCache.set(cacheKey, { key: version, pack });
  return pack;
}

// ---- Structure primitives --------------------------------------------------

function findSwings(c: Candle[], k = 5): { highs: number[]; lows: number[] } {
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = k; i < c.length - k; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= k; j++) {
      if (c[i - j].high >= c[i].high || c[i + j].high >= c[i].high) isHigh = false;
      if (c[i - j].low <= c[i].low || c[i + j].low <= c[i].low) isLow = false;
    }
    if (isHigh) highs.push(i);
    if (isLow) lows.push(i);
  }
  return { highs, lows };
}

function classifyStructure(
  c: Candle[],
  swings: { highs: number[]; lows: number[] },
): "HH-HL" | "LH-LL" | "Choppy" {
  const hi = swings.highs.slice(-2);
  const lo = swings.lows.slice(-2);
  if (hi.length < 2 || lo.length < 2) return "Choppy";
  const hhh = c[hi[1]].high > c[hi[0]].high;
  const hhl = c[lo[1]].low > c[lo[0]].low;
  const lhh = c[hi[1]].high < c[hi[0]].high;
  const lll = c[lo[1]].low < c[lo[0]].low;
  if (hhh && hhl) return "HH-HL";
  if (lhh && lll) return "LH-LL";
  return "Choppy";
}

// ---- Session ---------------------------------------------------------------

function currentSession(): MarketAnalysis["sessionTag"] {
  const h = new Date().getUTCHours();
  if (h >= 0 && h < 7) return "Asia";
  if (h >= 7 && h < 12) return "London";
  if (h >= 12 && h < 16) return "Overlap";
  if (h >= 16 && h < 21) return "New York";
  return "After Hours";
}

// ---- Utilities -------------------------------------------------------------

function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }
function round(n: number, d: number) { const p = Math.pow(10, d); return Math.round(n * p) / p; }
function fmt(n: number, d: number) { return n.toFixed(d); }

// ---- Market analysis -------------------------------------------------------

export function analyzeMarket(c: Candle[], symbol: Symbol, tf: Timeframe = "15m"): MarketAnalysis {
  const p = computeIndicators(c, symbol, tf);
  const i = c.length - 1;
  const price = p.closes[i];

  const trendScore = clamp(
    ((price - p.e200[i]) / p.e200[i]) * 5000 +
      (p.e20[i] > p.e50[i] ? 25 : -25) +
      (p.e50[i] > p.e200[i] ? 25 : -25),
    -100, 100,
  );
  const structure = classifyStructure(c, p.swings);
  const trend: MarketAnalysis["trend"] =
    structure === "HH-HL" || trendScore > 25 ? "Bullish"
      : structure === "LH-LL" || trendScore < -25 ? "Bearish"
        : "Sideways";

  const macdState: MarketAnalysis["macdState"] =
    p.m.hist[i] > 0 && p.m.hist[i - 1] <= 0 ? "Bullish Cross"
      : p.m.hist[i] < 0 && p.m.hist[i - 1] >= 0 ? "Bearish Cross"
        : p.m.hist[i] > 0 ? "Bullish"
          : p.m.hist[i] < 0 ? "Bearish" : "Flat";

  const atrPct = (p.a[i] / price) * 100;
  const volatility: MarketAnalysis["volatility"] =
    atrPct < 0.08 ? "Low" : atrPct > 0.4 ? "High" : "Normal";

  const recentRange = Math.max(...c.slice(-30).map((k) => k.high)) - Math.min(...c.slice(-30).map((k) => k.low));
  const consolidation = recentRange / p.a[i] < 6;
  const breakout = price > p.sr.resistance * 0.999 || price < p.sr.support * 1.001;
  const status: MarketAnalysis["status"] =
    breakout && Math.abs(trendScore) > 30 ? "Breakout"
      : consolidation ? "Consolidating"
        : Math.sign(trendScore) !== Math.sign(p.closes[i - 5] - p.closes[i - 20]) ? "Reversal Watch"
          : "Trending";

  const momentum: MarketAnalysis["momentum"] =
    Math.abs(p.m.hist[i]) > Math.abs(p.m.hist[i - 5]) * 1.2 ? "Strong"
      : Math.abs(p.m.hist[i]) > Math.abs(p.m.hist[i - 5]) ? "Building"
        : Math.abs(p.m.hist[i]) < Math.abs(p.m.hist[i - 5]) * 0.6 ? "Fading" : "Weak";

  const meta = SYMBOLS.find((s) => s.id === symbol)!;
  const spread = meta.group === "Forex" ? meta.vol * 0.15 : meta.vol * 0.05;

  const signalStrength = clamp(
    Math.abs(trendScore) * 0.5 +
      (volatility === "Normal" ? 25 : volatility === "High" ? 10 : 0) +
      (momentum === "Strong" ? 25 : momentum === "Building" ? 15 : 0),
    0, 100,
  );

  return {
    trend, trendScore, momentum, volatility,
    atr: p.a[i], rsi: p.r[i], adx: p.adxRes.adx[i],
    macdState, support: p.sr.support, resistance: p.sr.resistance,
    status, spread, sessionTag: currentSession(), signalStrength, structure,
  };
}

// ---- Setup recognition -----------------------------------------------------

function detectSetup(
  c: Candle[], p: IndicatorPack, structure: "HH-HL" | "LH-LL" | "Choppy",
): { setup: SetupType; bias: "bull" | "bear" | "neutral"; confidence: number; detail: string } {
  const i = c.length - 1;
  const cur = c[i];
  const price = p.closes[i];
  const e20 = p.e20[i];
  const e50 = p.e50[i];
  const sr = p.sr;
  const rvol = relativeVolume(c, CONFIG.indicators.relVolLookback);
  const atrNow = p.a[i];
  const prev = c[i - 1];
  const prev2 = c[i - 2];

  // Failed breakout: prior bar broke a level, current bar closed back inside.
  if (prev.high > sr.resistance && cur.close < sr.resistance) {
    return { setup: "Failed Breakout", bias: "bear", confidence: 0.85,
      detail: `Prior bar tagged ${fmt(sr.resistance, 4)}, current closed back below — sellers reclaimed.` };
  }
  if (prev.low < sr.support && cur.close > sr.support) {
    return { setup: "Failed Breakout", bias: "bull", confidence: 0.85,
      detail: `Prior bar swept ${fmt(sr.support, 4)}, current reclaimed — buyers absorbed.` };
  }

  // Breakout: fresh close beyond level with rvol.
  if (cur.close > sr.resistance && prev.close <= sr.resistance && rvol > 1.15) {
    return { setup: "Breakout", bias: "bull", confidence: 0.9,
      detail: `Close ${fmt(cur.close, 4)} above ${fmt(sr.resistance, 4)} on ${rvol.toFixed(2)}x RVOL.` };
  }
  if (cur.close < sr.support && prev.close >= sr.support && rvol > 1.15) {
    return { setup: "Breakout", bias: "bear", confidence: 0.9,
      detail: `Close ${fmt(cur.close, 4)} below ${fmt(sr.support, 4)} on ${rvol.toFixed(2)}x RVOL.` };
  }

  // Retest: price near recently broken level, small-range bar.
  const brokeUpRecently = c.slice(-10, -1).some((k) => k.close > sr.resistance);
  const brokeDnRecently = c.slice(-10, -1).some((k) => k.close < sr.support);
  const nearRes = Math.abs(price - sr.resistance) / price < 0.0025;
  const nearSup = Math.abs(price - sr.support) / price < 0.0025;
  if (brokeUpRecently && nearRes && cur.close > sr.resistance * 0.999) {
    return { setup: "Retest", bias: "bull", confidence: 0.8, detail: `Retesting broken resistance ${fmt(sr.resistance, 4)} from above.` };
  }
  if (brokeDnRecently && nearSup && cur.close < sr.support * 1.001) {
    return { setup: "Retest", bias: "bear", confidence: 0.8, detail: `Retesting broken support ${fmt(sr.support, 4)} from below.` };
  }

  // Trend Pullback: uptrend + wick into EMA20 + reclaim close.
  if (structure === "HH-HL" && cur.low <= e20 * 1.0015 && cur.close > e20) {
    return { setup: "Trend Pullback", bias: "bull", confidence: 0.85,
      detail: `Pullback into EMA20 in HH-HL structure, reclaimed on close.` };
  }
  if (structure === "LH-LL" && cur.high >= e20 * 0.9985 && cur.close < e20) {
    return { setup: "Trend Pullback", bias: "bear", confidence: 0.85,
      detail: `Rally into EMA20 in LH-LL structure, rejected on close.` };
  }

  // Trend Continuation: fresh minor swing high/low broken in trend direction.
  const swingHi = p.swings.highs.length ? c[p.swings.highs[p.swings.highs.length - 1]].high : Infinity;
  const swingLo = p.swings.lows.length ? c[p.swings.lows[p.swings.lows.length - 1]].low : -Infinity;
  if (structure === "HH-HL" && cur.close > swingHi && price > e50) {
    return { setup: "Trend Continuation", bias: "bull", confidence: 0.8, detail: `Cleared prior swing high ${fmt(swingHi, 4)} in uptrend.` };
  }
  if (structure === "LH-LL" && cur.close < swingLo && price < e50) {
    return { setup: "Trend Continuation", bias: "bear", confidence: 0.8, detail: `Broke prior swing low ${fmt(swingLo, 4)} in downtrend.` };
  }

  // Momentum Expansion: expanding ATR bar + volume + directional close.
  const bodyPct = Math.abs(cur.close - cur.open) / Math.max(atrNow, 1e-9);
  if (bodyPct > 0.8 && rvol > 1.2) {
    const bias = cur.close > cur.open ? "bull" : "bear";
    return { setup: "Momentum Expansion", bias, confidence: 0.75,
      detail: `Expansion bar ${(bodyPct * 100).toFixed(0)}% of ATR on ${rvol.toFixed(2)}x volume.` };
  }

  // Range: 30-bar range < 6 ATR AND at extreme.
  const rng = Math.max(...c.slice(-30).map(k => k.high)) - Math.min(...c.slice(-30).map(k => k.low));
  const inRange = atrNow > 0 && rng / atrNow < 6;
  if (inRange && nearSup) {
    // Range Reversal if divergence, else Range Bounce.
    const div = rsiDivergence(p.closes, p.r, CONFIG.indicators.divergenceLookback);
    if (div === "bullish") return { setup: "Range Reversal", bias: "bull", confidence: 0.75, detail: `Range low + bullish RSI divergence.` };
    return { setup: "Range Bounce", bias: "bull", confidence: 0.65, detail: `Price at range low ${fmt(sr.support, 4)}.` };
  }
  if (inRange && nearRes) {
    const div = rsiDivergence(p.closes, p.r, CONFIG.indicators.divergenceLookback);
    if (div === "bearish") return { setup: "Range Reversal", bias: "bear", confidence: 0.75, detail: `Range high + bearish RSI divergence.` };
    return { setup: "Range Bounce", bias: "bear", confidence: 0.65, detail: `Price at range high ${fmt(sr.resistance, 4)}.` };
  }

  // Mean Reversion: 2 std devs from BB middle + counter-move candle.
  if (price > p.bb.upper[i] && cur.close < prev.close && cur.close < prev2.close) {
    return { setup: "Mean Reversion", bias: "bear", confidence: 0.6, detail: `Rejected above upper Bollinger band.` };
  }
  if (price < p.bb.lower[i] && cur.close > prev.close && cur.close > prev2.close) {
    return { setup: "Mean Reversion", bias: "bull", confidence: 0.6, detail: `Reclaimed above lower Bollinger band.` };
  }

  return { setup: "No Setup", bias: "neutral", confidence: 0, detail: "No named pattern detected on current bar." };
}

// ---- Contributor helpers ---------------------------------------------------

function directional(key: SignalKey, bullStrength: number, detail: string): ScoreContribution {
  const w = CONFIG.weights[key];
  const score = clamp(bullStrength, -1, 1) * w;
  return {
    key, label: SIGNAL_LABELS[key], score, weight: w,
    side: score > 0.05 ? "bull" : score < -0.05 ? "bear" : "neutral", detail,
  };
}
function quality(key: SignalKey, strength: number, detail: string): ScoreContribution {
  const w = CONFIG.weights[key];
  return {
    key, label: SIGNAL_LABELS[key], score: clamp(strength, 0, 1) * w,
    weight: w, side: "neutral", detail,
  };
}

// ---- Signal generator ------------------------------------------------------

export interface GenerateOptions {
  /** Higher-timeframe bias, if the caller already computed one. */
  htfBias?: { trend: "Bullish" | "Bearish" | "Sideways"; strength: number };
}

export function generateSignal(
  c: Candle[], symbol: Symbol, tf: Timeframe, opts: GenerateOptions = {},
): Signal {
  const th = CONFIG.thresholds;
  const p = computeIndicators(c, symbol, tf);
  const i = c.length - 1;
  const price = p.closes[i];
  const cur = c[i];
  const meta = SYMBOLS.find((s) => s.id === symbol)!;
  const analysis = analyzeMarket(c, symbol, tf);
  const structure = analysis.structure;

  // ---- 0. Setup recognition (drives structural bias) ----------------------
  const setupInfo = detectSetup(c, p, structure);

  const contribs: ScoreContribution[] = [];

  // 1. Market structure (HH-HL / LH-LL).
  contribs.push(
    directional("marketStructure",
      structure === "HH-HL" ? 1 : structure === "LH-LL" ? -1 : 0,
      `Structure: ${structure}`),
  );

  // 2. Trend alignment (price vs EMA200).
  const trendBias = price > p.e200[i]
    ? clamp((price - p.e200[i]) / p.e200[i] / 0.01, 0, 1)
    : -clamp((p.e200[i] - price) / p.e200[i] / 0.01, 0, 1);
  contribs.push(directional("trendAlignment", trendBias,
    `Price ${price > p.e200[i] ? "above" : "below"} EMA200 by ${(((price - p.e200[i]) / p.e200[i]) * 100).toFixed(2)}%`));

  // 3. EMA slope.
  const slope = normalizedSlope(p.e20, 10, price);
  contribs.push(directional("emaSlope", clamp(slope / 0.05, -1, 1),
    `EMA20 slope ${slope >= 0 ? "+" : ""}${slope.toFixed(3)}%/bar`));

  // 4. EMA stacking.
  const stackBull = p.e20[i] > p.e50[i] && p.e50[i] > p.e200[i];
  const stackBear = p.e20[i] < p.e50[i] && p.e50[i] < p.e200[i];
  contribs.push(directional("emaStack",
    stackBull ? 1 : stackBear ? -1 : p.e20[i] > p.e50[i] ? 0.35 : -0.35,
    stackBull ? "Bullish stack" : stackBear ? "Bearish stack" : "EMAs mixed"));

  // 5. RSI state.
  const rv = p.r[i];
  const rsiBias = rv > 70 ? -0.3 : rv > 55 ? clamp((rv - 55) / 15, 0, 1)
    : rv < 30 ? 0.3 : rv < 45 ? -clamp((45 - rv) / 15, 0, 1) : 0;
  contribs.push(directional("rsiState", rsiBias, `RSI ${rv.toFixed(0)}`));

  // 6. RSI divergence.
  const div = rsiDivergence(p.closes, p.r, CONFIG.indicators.divergenceLookback);
  contribs.push(directional("rsiDivergence",
    div === "bullish" ? 1 : div === "bearish" ? -1 : 0,
    div === "none" ? "No divergence" : `${div} divergence`));

  // 7. MACD histogram magnitude.
  const histRef = Math.max(1e-9, Math.max(...p.m.hist.slice(-50).map(Math.abs)));
  contribs.push(directional("macdHist", clamp(p.m.hist[i] / histRef, -1, 1),
    `MACD hist ${p.m.hist[i].toFixed(5)}`));

  // 8. MACD zero-line cross (fresh).
  const cross = p.m.hist[i] > 0 && p.m.hist[i - 1] <= 0 ? 1
    : p.m.hist[i] < 0 && p.m.hist[i - 1] >= 0 ? -1 : 0;
  contribs.push(directional("macdCross", cross,
    cross === 0 ? "No fresh cross" : cross > 0 ? "Fresh bull cross" : "Fresh bear cross"));

  // 9. ADX trend strength (modifier, no longer a hard gate).
  const adxVal = p.adxRes.adx[i];
  const diBias = p.adxRes.plusDi[i] - p.adxRes.minusDi[i];
  const adxNorm = clamp((adxVal - 12) / 25, -0.3, 1);
  contribs.push(directional("adxStrength", Math.sign(diBias || 0) * adxNorm,
    `ADX ${adxVal.toFixed(0)} · +DI ${p.adxRes.plusDi[i].toFixed(0)}/-DI ${p.adxRes.minusDi[i].toFixed(0)}`));

  // 10. ATR volatility regime (quality).
  const atrPct = (p.a[i] / price) * 100;
  const volQuality = atrPct < 0.05 ? 0.25 : atrPct < 0.08 ? 0.55 : atrPct < 0.5 ? 1.0 : atrPct < 0.8 ? 0.7 : 0.4;
  contribs.push(quality("atrVolatility", volQuality, `ATR ${atrPct.toFixed(2)}% · ${analysis.volatility}`));

  // 11. VWAP location.
  const vwapDiff = (price - p.v[i]) / p.v[i];
  contribs.push(directional("vwapLocation", clamp(vwapDiff / 0.003, -1, 1),
    `Price ${price > p.v[i] ? "above" : "below"} VWAP`));

  // 12. Volume expansion.
  const volExp = c[i - 1].volume ? cur.volume / c[i - 1].volume - 1 : 0;
  const bullCandle = cur.close > cur.open;
  contribs.push(directional("volumeExpansion", clamp(volExp, -1, 1) * (bullCandle ? 1 : -1),
    `Volume ${volExp >= 0 ? "+" : ""}${(volExp * 100).toFixed(0)}%`));

  // 13. Relative volume.
  const rvol = relativeVolume(c, CONFIG.indicators.relVolLookback);
  contribs.push(directional("relativeVolume", clamp((rvol - 1) / 1.5, -1, 1) * (bullCandle ? 1 : -1),
    `RVOL ${rvol.toFixed(2)}x`));

  // 14. Bollinger squeeze (quality).
  const bwPct = percentileRank(p.bb.bandwidth, 100);
  const squeezing = bwPct < th.squeezeBandwidthPct;
  contribs.push(quality("bollingerSqueeze",
    squeezing ? 1 : 1 - Math.min(1, bwPct),
    squeezing ? `Squeeze (${(bwPct * 100).toFixed(0)}%ile)` : `Bandwidth ${(bwPct * 100).toFixed(0)}%ile`));

  // 15. S/R proximity (widened from 0.3% → 0.6% so it actually triggers).
  const distSup = Math.abs(price - p.sr.support) / price;
  const distRes = Math.abs(price - p.sr.resistance) / price;
  const nearSup = distSup < 0.006;
  const nearRes = distRes < 0.006;
  contribs.push(directional("srProximity",
    nearSup ? clamp(1 - distSup / 0.006, 0.3, 1) : nearRes ? -clamp(1 - distRes / 0.006, 0.3, 1) : 0,
    nearSup ? `Near support ${fmt(p.sr.support, meta.digits)}`
      : nearRes ? `Near resistance ${fmt(p.sr.resistance, meta.digits)}` : "Mid-range"));

  // 16. Breakout quality (uses setup detection instead of same-bar-only).
  const bqBull = setupInfo.setup === "Breakout" && setupInfo.bias === "bull";
  const bqBear = setupInfo.setup === "Breakout" && setupInfo.bias === "bear";
  contribs.push(directional("breakoutQuality",
    bqBull ? 1 : bqBear ? -1 : 0,
    bqBull ? "Bull breakout confirmed" : bqBear ? "Bear breakdown confirmed" : "No breakout"));

  // 17. Pullback quality (Trend Pullback setup).
  const pbBull = setupInfo.setup === "Trend Pullback" && setupInfo.bias === "bull";
  const pbBear = setupInfo.setup === "Trend Pullback" && setupInfo.bias === "bear";
  contribs.push(directional("pullbackQuality",
    pbBull ? 1 : pbBear ? -1 : 0,
    pbBull ? "Clean pullback in uptrend" : pbBear ? "Clean pullback in downtrend" : "No clean pullback"));

  // 18. Setup recognition (large weight — this is the pattern kernel).
  contribs.push(directional("setupRecognition",
    setupInfo.bias === "bull" ? setupInfo.confidence : setupInfo.bias === "bear" ? -setupInfo.confidence : 0,
    `${setupInfo.setup}${setupInfo.setup !== "No Setup" ? " — " + setupInfo.detail : ""}`));

  // 19. Session strength (quality).
  const sessMult = CONFIG.sessions[analysis.sessionTag] ?? 0.5;
  contribs.push(quality("sessionStrength", sessMult, `${analysis.sessionTag} session`));

  // 20. Higher-timeframe alignment.
  let htfContribValue = 0;
  let htfDetail = "No HTF context";
  if (opts.htfBias) {
    const b = opts.htfBias;
    const s = clamp(b.strength / 100, 0, 1);
    htfContribValue = b.trend === "Bullish" ? s : b.trend === "Bearish" ? -s : 0;
    htfDetail = `HTF ${b.trend.toLowerCase()} @ ${b.strength.toFixed(0)}% strength`;
  }
  contribs.push(directional("htfAlignment", htfContribValue, htfDetail));

  // ---- Aggregate to probability ------------------------------------------
  let bullRaw = 0, bearRaw = 0, dirMax = 0, qualRaw = 0, qualMax = 0;
  for (const ctr of contribs) {
    if (QUALITY_SIGNALS.has(ctr.key)) {
      qualRaw += ctr.score; qualMax += ctr.weight;
    } else {
      dirMax += ctr.weight;
      if (ctr.score > 0) bullRaw += ctr.score;
      else if (ctr.score < 0) bearRaw += -ctr.score;
    }
  }
  const bullScore = dirMax ? (bullRaw / dirMax) * 100 : 0;
  const bearScore = dirMax ? (bearRaw / dirMax) * 100 : 0;
  const qualityScore = qualMax ? (qualRaw / qualMax) * 100 : 50;
  const qualityMult = th.qualityFloor + (1 - th.qualityFloor) * (qualityScore / 100);

  // Probability model:
  //   - Use majority-of-active-evidence first: if most weighted steps point in
  //     one direction, the bot can trade even when every possible indicator is
  //     not firing.
  //   - Require at least 60% directional confluence and enough active evidence
  //     so a single tiny signal cannot create a trade by itself.
  //   - Keep the old raw-score model as a floor for very clean high-weight setups.
  const dominant: "BUY" | "SELL" = bullScore >= bearScore ? "BUY" : "SELL";
  const dominantRaw = Math.max(bullScore, bearScore);
  const opposingRaw = Math.min(bullScore, bearScore);
  const dominantEvidence = Math.max(bullRaw, bearRaw);
  const directionalEvidence = bullRaw + bearRaw;
  const evidenceCoverage = dirMax ? (directionalEvidence / dirMax) * 100 : 0;
  const alignmentPct = directionalEvidence ? (dominantEvidence / directionalEvidence) * 100 : 0;
  const minConfluencePct = 60;
  const minEvidenceCoveragePct = 22;
  const majorityPass = alignmentPct >= minConfluencePct && evidenceCoverage >= minEvidenceCoveragePct;
  const evidencePenalty = evidenceCoverage < minEvidenceCoveragePct
    ? clamp(evidenceCoverage / minEvidenceCoveragePct, 0, 1)
    : 1;
  const majorityProb = (alignmentPct * 0.76 + evidenceCoverage * 0.24) * qualityMult * evidencePenalty;
  const opposingDrag = clamp(opposingRaw / 100, 0, 1) * 25;
  const rawScoreProb = Math.max(0, dominantRaw - opposingDrag) * qualityMult;
  // Small boost when named setup aligns with dominant bias.
  const setupAligned = setupInfo.setup !== "No Setup"
    && ((dominant === "BUY" && setupInfo.bias === "bull") || (dominant === "SELL" && setupInfo.bias === "bear"));
  const setupBoost = setupAligned ? 6 * setupInfo.confidence : 0;
  const rawProb = Math.max(rawScoreProb, majorityProb);
  const probability = Math.round(clamp(rawProb + setupBoost, 0, 99));

  const sideProbability = (sideScore: number, otherScore: number, sideEvidence: number, otherEvidence: number, setupBias: boolean) => {
    const active = sideEvidence + otherEvidence;
    const sideAlignment = active ? (sideEvidence / active) * 100 : 0;
    const sideCoverage = dirMax ? (active / dirMax) * 100 : 0;
    const sidePenalty = sideCoverage < minEvidenceCoveragePct
      ? clamp(sideCoverage / minEvidenceCoveragePct, 0, 1)
      : 1;
    const sideMajorityProb = (sideAlignment * 0.76 + sideCoverage * 0.24) * qualityMult * sidePenalty;
    const sideRawProb = Math.max(0, sideScore - clamp(otherScore / 100, 0, 1) * 25) * qualityMult;
    return Math.round(clamp(
      Math.max(sideRawProb, sideMajorityProb) + (setupBias ? 6 * setupInfo.confidence : 0),
      0,
      99,
    ));
  };
  const bullProbability = sideProbability(bullScore, bearScore, bullRaw, bearRaw, setupInfo.bias === "bull");
  const bearProbability = sideProbability(bearScore, bullScore, bearRaw, bullRaw, setupInfo.bias === "bear");

  const grade = gradeFor(probability);
  const edge = Math.abs(bullScore - bearScore);
  const confidence = probability; // legacy alias

  // ---- Levels ------------------------------------------------------------
  const atrVal = p.a[i];
  const slDist = atrVal * th.slAtrMult;
  const tp1Dist = slDist * th.tp1RMult;
  const tp2Dist = slDist * th.tp2RMult;
  let entry = price, sl = price, tp1 = price, tp2 = price;

  // Grade C or better + 60% weighted confluence = tradeable side; otherwise flat.
  let side: Side = grade === "None" || !majorityPass ? "NONE" : dominant;

  if (side === "BUY") {
    entry = price; sl = round(price - slDist, meta.digits);
    tp1 = round(price + tp1Dist, meta.digits); tp2 = round(price + tp2Dist, meta.digits);
  } else if (side === "SELL") {
    entry = price; sl = round(price + slDist, meta.digits);
    tp1 = round(price - tp1Dist, meta.digits); tp2 = round(price - tp2Dist, meta.digits);
  }

  // Hard risk gate: spread eating stop.
  const spreadPct = slDist > 0 ? (analysis.spread / slDist) * 100 : 0;
  const spreadPass = slDist > 0 ? spreadPct <= th.maxSpreadOverSlPct : true;
  if (side !== "NONE" && !spreadPass) side = "NONE";

  // Session gate: only trade during London / London-NY overlap / New York.
  const sessionPass = analysis.sessionTag === "London"
    || analysis.sessionTag === "Overlap"
    || analysis.sessionTag === "New York";
  if (side !== "NONE" && !sessionPass) side = "NONE";

  // ---- Diagnostics -------------------------------------------------------
  const filters: FilterCheck[] = [
    {
      key: "probability", label: "Probability ≥ grade C floor",
      pass: probability >= th.gradeC, actual: probability, required: th.gradeC, unit: "%",
      progress: clamp(probability / th.gradeC, 0, 1),
      detail: `Weighted probability ${probability}% vs C-grade floor ${th.gradeC}%.`,
    },
    {
      key: "confluence", label: "60% weighted confluence",
      pass: majorityPass,
      actual: +alignmentPct.toFixed(0), required: minConfluencePct, unit: "%",
      progress: Math.min(
        clamp(alignmentPct / minConfluencePct, 0, 1),
        clamp(evidenceCoverage / minEvidenceCoveragePct, 0, 1),
      ),
      detail: `${alignmentPct.toFixed(0)}% of active weighted evidence supports ${dominant}; active evidence coverage ${evidenceCoverage.toFixed(0)}% (min ${minEvidenceCoveragePct}%).`,
    },
    {
      key: "setup", label: "Named setup detected",
      pass: setupInfo.setup !== "No Setup",
      actual: setupInfo.setup !== "No Setup" ? 1 : 0, required: 1,
      progress: setupInfo.setup !== "No Setup" ? 1 : 0.2,
      detail: setupInfo.setup === "No Setup"
        ? "No pattern recognized — waiting for pullback/breakout/retest/reversal."
        : `${setupInfo.setup}: ${setupInfo.detail}`,
    },
    {
      key: "spread", label: "Spread cost vs SL",
      pass: spreadPass, actual: +spreadPct.toFixed(1), required: th.maxSpreadOverSlPct, unit: "%",
      progress: spreadPct <= th.maxSpreadOverSlPct ? 1 : clamp(th.maxSpreadOverSlPct / Math.max(spreadPct, 0.01), 0, 1),
      detail: `Spread ${spreadPct.toFixed(1)}% of ${th.slAtrMult}×ATR stop (max ${th.maxSpreadOverSlPct}%).`,
    },
    {
      key: "adx", label: "Trend strength (soft)",
      pass: adxVal >= th.adxTrendMin, actual: +adxVal.toFixed(1), required: th.adxTrendMin,
      progress: clamp(adxVal / th.adxTrendMin, 0, 1),
      detail: `ADX ${adxVal.toFixed(0)} (${adxVal >= th.adxTrendMin ? "trending" : "weak — trims probability, does not veto"}).`,
    },
    {
      key: "quality", label: "Quality (session / vol / squeeze)",
      pass: qualityScore >= th.qualityFloor * 100, actual: +qualityScore.toFixed(0),
      required: +(th.qualityFloor * 100).toFixed(0), unit: "%",
      progress: clamp(qualityScore / (th.qualityFloor * 100), 0, 1),
      detail: `Quality ${qualityScore.toFixed(0)}% (floor ${(th.qualityFloor * 100).toFixed(0)}% — modifier only).`,
    },
    {
      key: "session", label: "Session (London / Overlap / New York)",
      pass: sessionPass, actual: analysis.sessionTag as unknown as number, required: 1,
      progress: sessionPass ? 1 : 0,
      detail: sessionPass
        ? `${analysis.sessionTag} session — trading allowed.`
        : `${analysis.sessionTag} session — bot only trades London, Overlap, or New York.`,
    },
  ];

  const failed = filters.filter((f) => !f.pass);
  const blockingFilter = failed[0] ?? null;
  const closestToPassing = [...failed].sort((a, b) => b.progress - a.progress).slice(0, 3);

  // Top boosters/reducers — biggest signed contributors to dominant side.
  const signed = contribs.map((c) => ({
    label: c.label,
    delta: dominant === "BUY" ? c.score : -c.score,
  }));
  const topBoosters = [...signed].filter((x) => x.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 3)
    .map(x => ({ label: x.label, delta: +x.delta.toFixed(1) }));
  const topReducers = [...signed].filter((x) => x.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 3)
    .map(x => ({ label: x.label, delta: +x.delta.toFixed(1) }));

  let rejectionReason = "";
  if (side === "NONE") {
    if (!spreadPass) rejectionReason = `Spread ${spreadPct.toFixed(1)}% of stop — trading cost too high.`;
    else if (!sessionPass) rejectionReason = `${analysis.sessionTag} session — bot only trades during London, London-NY Overlap, and New York.`;
    else if (!majorityPass) {
      rejectionReason = `Weighted evidence is not strong enough yet: ${alignmentPct.toFixed(0)}% supports ${dominant} with ${evidenceCoverage.toFixed(0)}% active coverage. Need 60% confluence and ${minEvidenceCoveragePct}% coverage.`;
    }
    else if (setupInfo.setup === "No Setup" && probability < th.gradeC) {
      rejectionReason = `No named setup and probability ${probability}% is below C-grade floor (${th.gradeC}%). Structure ${structure}, ADX ${adxVal.toFixed(0)}.`;
    } else if (probability < th.gradeC) {
      rejectionReason = `${setupInfo.setup} detected but bull ${bullScore.toFixed(0)}% vs bear ${bearScore.toFixed(0)}% keeps probability at ${probability}% (need ${th.gradeC}%).`;
    } else {
      rejectionReason = `Blocked by ${blockingFilter?.label ?? "risk gate"}.`;
    }
  }

  const gap = Math.max(0, th.gradeC - probability);
  const needToPass = side !== "NONE"
    ? `Already tradeable at grade ${grade}. Next tier at ${grade === "C" ? th.gradeB : grade === "B" ? th.gradeA : th.gradeAPlus}%.`
    : !majorityPass
      ? `Need 60% weighted confluence and ${minEvidenceCoveragePct}% active evidence. Current: ${alignmentPct.toFixed(0)}% confluence / ${evidenceCoverage.toFixed(0)}% coverage.`
    : gap === 0
      ? `Fix the blocking gate: ${blockingFilter?.label ?? "spread/data"}.`
      : `Need +${gap}% probability. Biggest reducer: ${topReducers[0]?.label ?? "opposing pressure"}.`;

  const diagnostics: SignalDiagnostics = {
    currentConfidence: confidence,
    requiredConfidence: th.gradeC,
    bullScore: +bullScore.toFixed(1),
    bearScore: +bearScore.toFixed(1),
    qualityScore: +qualityScore.toFixed(1),
    edge: +edge.toFixed(1),
    requiredEdge: 0, // no longer a gate
    adxValue: +adxVal.toFixed(1),
    requiredAdx: th.adxTrendMin,
    riskRewardEstimate: th.tp1RMult,
    qualityMultiplier: +qualityMult.toFixed(3),
    dominantSide: dominant,
    filters, blockingFilter, closestToPassing, rejectionReason,
    probability, bullProbability, bearProbability, grade,
    setup: setupInfo.setup, topBoosters, topReducers, needToPass,
  };

  // ---- Expected metrics --------------------------------------------------
  const barSecondsMap: Record<Timeframe, number> = { "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14400 };
  const expectedHoldingBars = Math.round(th.tp1RMult * 4);
  const holdSecs = expectedHoldingBars * barSecondsMap[tf];
  const expectedHoldingLabel = holdSecs < 3600 ? `${Math.round(holdSecs / 60)} min`
    : holdSecs < 86400 ? `${(holdSecs / 3600).toFixed(1)} h` : `${(holdSecs / 86400).toFixed(1)} d`;
  const expectedTrendStrength: Signal["expectedTrendStrength"] =
    adxVal < 15 ? "Weak" : adxVal < 22 ? "Moderate" : adxVal < 35 ? "Strong" : "Very Strong";

  // ---- Narratives --------------------------------------------------------
  const reasonsList = contribs
    .filter((ctr) => (dominant === "BUY" ? ctr.score > 0 : ctr.score < 0))
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .slice(0, 6).map((ctr) => ctr.label);

  const strength: Signal["strength"] = probability > 78 ? "Strong" : probability > 65 ? "Moderate" : "Weak";

  const explanation = side === "NONE"
    ? `No tradeable setup on ${symbol} ${tf} (grade ${grade}). ${rejectionReason}`
    : `${symbol} ${tf} · ${grade} ${dominant} · ${probability}% probability. Setup: ${setupInfo.setup}. Structure ${structure}, ADX ${adxVal.toFixed(0)}. Target 1:${th.tp1RMult}R first, 1:${th.tp2RMult}R runner.`;

  const aiSummary = side === "NONE"
    ? `Stand aside. ${setupInfo.setup === "No Setup" ? "No pattern present." : setupInfo.setup + " forming but probability " + probability + "% below C-grade floor."} Structure ${structure}, trend ${analysis.trend.toLowerCase()}, momentum ${analysis.momentum.toLowerCase()}.`
    : `${grade}-grade ${dominant === "BUY" ? "long" : "short"}: ${setupInfo.setup} in ${structure} structure. Driven by ${reasonsList.slice(0, 3).join(", ")}. ${topReducers.length ? "Watch: " + topReducers.slice(0, 2).map(r => r.label).join(", ") + "." : "No major disagreement."} Risk ${th.slAtrMult}×ATR, targets 1:${th.tp1RMult}/1:${th.tp2RMult}.`;

  const checks = contribs.slice(0, 9).map((ctr) => ({
    label: ctr.label,
    pass: dominant === "BUY" ? ctr.score > 0 : ctr.score < 0,
  }));

  return {
    id: `${symbol}-${tf}-${cur.time}`,
    symbol, timeframe: tf, side,
    entry, stopLoss: sl, takeProfit1: tp1, takeProfit2: tp2,
    riskReward: th.tp1RMult,
    confidence, bullScore: Math.round(bullScore), bearScore: Math.round(bearScore),
    qualityScore: Math.round(qualityScore),
    trend: analysis.trend, strength,
    reasons: reasonsList, explanation, aiSummary,
    scoreBreakdown: contribs, diagnostics, checks,
    createdAt: Date.now(), atr: atrVal, rsi: p.r[i], spread: analysis.spread,
    probability, grade, setup: setupInfo.setup,
    expectedMove: +(tp1Dist).toFixed(meta.digits),
    expectedHoldingBars, expectedHoldingLabel, expectedTrendStrength,
    expectedRiskReward: th.tp1RMult,
  };
}

export function positionSize(
  accountBalance: number, riskPct: number, entry: number, sl: number, pipValue = 10,
) {
  const riskAmount = accountBalance * (riskPct / 100);
  const stopDist = Math.abs(entry - sl);
  if (stopDist === 0) return { riskAmount, lots: 0, units: 0 };
  const lots = riskAmount / (stopDist * pipValue * 100);
  return { riskAmount, lots: Math.max(0.01, +lots.toFixed(2)), units: Math.round(lots * 100000) };
}
