// IntelliTrade Quant Engine — Phase 1 (weighted scoring) + Phase 6 (AI summary).
// Each contributor scores independently, is weighted per CONFIG, and normalized
// into a single 0-100 confidence with a per-signal breakdown for the UI.

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
import { CONFIG, QUALITY_SIGNALS, SIGNAL_LABELS, type SignalKey } from "./config";

export type Side = "BUY" | "SELL" | "NONE";

export interface ScoreContribution {
  key: SignalKey;
  label: string;
  score: number; // signed for directional signals, positive for quality
  weight: number; // max magnitude
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
  /** 0..1 — how close to passing (1 = passing, 0 = far). */
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
  /** First filter (in eval order) that failed. */
  blockingFilter: FilterCheck | null;
  /** Failed filters ranked by proximity to passing. */
  closestToPassing: FilterCheck[];
  /** Plain-English reason. Empty when the signal fires. */
  rejectionReason: string;
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
  confidence: number; // 0..100
  bullScore: number; // 0..100 normalized
  bearScore: number; // 0..100 normalized
  qualityScore: number; // 0..100 normalized
  trend: "Bullish" | "Bearish" | "Sideways";
  strength: "Weak" | "Moderate" | "Strong";
  reasons: string[];
  explanation: string;
  aiSummary: string;
  scoreBreakdown: ScoreContribution[];
  diagnostics: SignalDiagnostics;
  // Legacy — kept so SignalCard's checklist still renders.
  checks: { label: string; pass: boolean }[];
  createdAt: number;
  atr: number;
  rsi: number;
  spread: number;
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
}

function currentSession(): MarketAnalysis["sessionTag"] {
  const h = new Date().getUTCHours();
  if (h >= 0 && h < 7) return "Asia";
  if (h >= 7 && h < 12) return "London";
  if (h >= 12 && h < 16) return "Overlap";
  if (h >= 16 && h < 21) return "New York";
  return "After Hours";
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
function round(n: number, d: number) {
  const p = Math.pow(10, d);
  return Math.round(n * p) / p;
}
function fmt(n: number, d: number) {
  return n.toFixed(d);
}

export function analyzeMarket(c: Candle[], symbol: Symbol): MarketAnalysis {
  const cfg = CONFIG.indicators;
  const closes = c.map((k) => k.close);
  const e20 = ema(closes, cfg.emaFast);
  const e50 = ema(closes, cfg.emaMid);
  const e200 = ema(closes, cfg.emaSlow);
  const r = rsi(closes, cfg.rsiPeriod);
  const m = macd(closes);
  const a = atr(c, cfg.atrPeriod);
  const adxRes = adx(c, cfg.adxPeriod);
  const sr = findSupportResistance(c);
  const i = c.length - 1;
  const price = closes[i];

  const trendScore = clamp(
    ((price - e200[i]) / e200[i]) * 5000 +
      (e20[i] > e50[i] ? 25 : -25) +
      (e50[i] > e200[i] ? 25 : -25),
    -100,
    100,
  );
  const trend: MarketAnalysis["trend"] =
    trendScore > 25 ? "Bullish" : trendScore < -25 ? "Bearish" : "Sideways";

  const macdState: MarketAnalysis["macdState"] =
    m.hist[i] > 0 && m.hist[i - 1] <= 0
      ? "Bullish Cross"
      : m.hist[i] < 0 && m.hist[i - 1] >= 0
        ? "Bearish Cross"
        : m.hist[i] > 0
          ? "Bullish"
          : m.hist[i] < 0
            ? "Bearish"
            : "Flat";

  const atrPct = (a[i] / price) * 100;
  const volatility: MarketAnalysis["volatility"] =
    atrPct < 0.08 ? "Low" : atrPct > 0.4 ? "High" : "Normal";

  const recentRange =
    Math.max(...c.slice(-30).map((k) => k.high)) -
    Math.min(...c.slice(-30).map((k) => k.low));
  const consolidation = recentRange / a[i] < 6;
  const breakout = price > sr.resistance * 0.999 || price < sr.support * 1.001;
  const status: MarketAnalysis["status"] =
    breakout && Math.abs(trendScore) > 30
      ? "Breakout"
      : consolidation
        ? "Consolidating"
        : Math.sign(trendScore) !== Math.sign(closes[i - 5] - closes[i - 20])
          ? "Reversal Watch"
          : "Trending";

  const momentum: MarketAnalysis["momentum"] =
    Math.abs(m.hist[i]) > Math.abs(m.hist[i - 5]) * 1.2
      ? "Strong"
      : Math.abs(m.hist[i]) > Math.abs(m.hist[i - 5])
        ? "Building"
        : Math.abs(m.hist[i]) < Math.abs(m.hist[i - 5]) * 0.6
          ? "Fading"
          : "Weak";

  const meta = SYMBOLS.find((s) => s.id === symbol)!;
  const spread = meta.group === "Forex" ? meta.vol * 0.15 : meta.vol * 0.05;

  const signalStrength = clamp(
    Math.abs(trendScore) * 0.5 +
      (volatility === "Normal" ? 25 : volatility === "High" ? 10 : 0) +
      (momentum === "Strong" ? 25 : momentum === "Building" ? 15 : 0),
    0,
    100,
  );

  return {
    trend,
    trendScore,
    momentum,
    volatility,
    atr: a[i],
    rsi: r[i],
    adx: adxRes.adx[i],
    macdState,
    support: sr.support,
    resistance: sr.resistance,
    status,
    spread,
    sessionTag: currentSession(),
    signalStrength,
  };
}

// --- Contributor helpers -----------------------------------------------------

// Directional contributor: returns a signed score in [-w, +w] and a detail string.
function directional(
  key: SignalKey,
  bullStrength: number, // -1..+1 (positive = bullish, negative = bearish)
  detail: string,
): ScoreContribution {
  const w = CONFIG.weights[key];
  const score = clamp(bullStrength, -1, 1) * w;
  return {
    key,
    label: SIGNAL_LABELS[key],
    score,
    weight: w,
    side: score > 0.05 ? "bull" : score < -0.05 ? "bear" : "neutral",
    detail,
  };
}

// Quality contributor: returns 0..w. Used only to scale the directional total.
function quality(key: SignalKey, strength: number, detail: string): ScoreContribution {
  const w = CONFIG.weights[key];
  const score = clamp(strength, 0, 1) * w;
  return {
    key,
    label: SIGNAL_LABELS[key],
    score,
    weight: w,
    side: "neutral",
    detail,
  };
}

// --- Signal generator --------------------------------------------------------

export function generateSignal(c: Candle[], symbol: Symbol, tf: Timeframe): Signal {
  const cfg = CONFIG.indicators;
  const th = CONFIG.thresholds;
  const closes = c.map((k) => k.close);
  const e20 = ema(closes, cfg.emaFast);
  const e50 = ema(closes, cfg.emaMid);
  const e200 = ema(closes, cfg.emaSlow);
  const r = rsi(closes, cfg.rsiPeriod);
  const m = macd(closes);
  const a = atr(c, cfg.atrPeriod);
  const v = vwap(c);
  const bb = bollinger(closes, cfg.bbPeriod, cfg.bbStdDev);
  const adxRes = adx(c, cfg.adxPeriod);
  const sr = findSupportResistance(c);
  const i = c.length - 1;
  const price = closes[i];
  const cur = c[i];
  const meta = SYMBOLS.find((s) => s.id === symbol)!;
  const analysis = analyzeMarket(c, symbol);

  const contribs: ScoreContribution[] = [];

  // 1. Trend alignment (price vs EMA200).
  const trendBias =
    price > e200[i]
      ? clamp((price - e200[i]) / e200[i] / 0.01, 0, 1)
      : -clamp((e200[i] - price) / e200[i] / 0.01, 0, 1);
  contribs.push(
    directional(
      "trendAlignment",
      trendBias,
      `Price ${price > e200[i] ? "above" : "below"} EMA${cfg.emaSlow} by ${(
        ((price - e200[i]) / e200[i]) *
        100
      ).toFixed(2)}%`,
    ),
  );

  // 2. EMA slope (fast EMA rate of change).
  const slope = normalizedSlope(e20, 10, price);
  contribs.push(
    directional(
      "emaSlope",
      clamp(slope / 0.05, -1, 1),
      `EMA${cfg.emaFast} slope ${slope >= 0 ? "+" : ""}${slope.toFixed(3)}%/bar`,
    ),
  );

  // 3. EMA stacking.
  const stackBull = e20[i] > e50[i] && e50[i] > e200[i];
  const stackBear = e20[i] < e50[i] && e50[i] < e200[i];
  contribs.push(
    directional(
      "emaStack",
      stackBull ? 1 : stackBear ? -1 : e20[i] > e50[i] ? 0.35 : -0.35,
      stackBull
        ? "Bullish stack: 20 > 50 > 200"
        : stackBear
          ? "Bearish stack: 20 < 50 < 200"
          : "EMAs not fully aligned",
    ),
  );

  // 4. RSI state (favor 50-70 for longs, 30-50 for shorts).
  const rv = r[i];
  const rsiBias =
    rv > 70
      ? -0.3
      : rv > 55
        ? clamp((rv - 55) / 15, 0, 1)
        : rv < 30
          ? 0.3
          : rv < 45
            ? -clamp((45 - rv) / 15, 0, 1)
            : 0;
  contribs.push(
    directional(
      "rsiState",
      rsiBias,
      `RSI ${rv.toFixed(0)} (${rv > 70 ? "overbought" : rv < 30 ? "oversold" : rv > 50 ? "bullish zone" : "bearish zone"})`,
    ),
  );

  // 5. RSI divergence.
  const div = rsiDivergence(closes, r, cfg.divergenceLookback);
  contribs.push(
    directional(
      "rsiDivergence",
      div === "bullish" ? 1 : div === "bearish" ? -1 : 0,
      div === "none" ? "No divergence detected" : `${div} divergence over last ${cfg.divergenceLookback} bars`,
    ),
  );

  // 6. MACD histogram magnitude.
  const histRefWindow = m.hist.slice(-50).map(Math.abs);
  const histRef = Math.max(1e-9, Math.max(...histRefWindow));
  contribs.push(
    directional(
      "macdHist",
      clamp(m.hist[i] / histRef, -1, 1),
      `MACD hist ${m.hist[i].toFixed(5)} (${m.hist[i] > 0 ? "bullish" : "bearish"})`,
    ),
  );

  // 7. MACD zero-line cross (fresh).
  const cross =
    m.hist[i] > 0 && m.hist[i - 1] <= 0
      ? 1
      : m.hist[i] < 0 && m.hist[i - 1] >= 0
        ? -1
        : 0;
  contribs.push(
    directional(
      "macdCross",
      cross,
      cross === 0
        ? "No fresh MACD cross"
        : cross > 0
          ? "Fresh bullish MACD cross"
          : "Fresh bearish MACD cross",
    ),
  );

  // 8. ADX trend strength — scales *with* trend direction, penalizes weak trends.
  const adxVal = adxRes.adx[i];
  const diBias = adxRes.plusDi[i] - adxRes.minusDi[i];
  const adxNorm = clamp((adxVal - 15) / 25, -0.4, 1); // <15 = drag, 40+ = full
  contribs.push(
    directional(
      "adxStrength",
      Math.sign(diBias || 0) * adxNorm,
      `ADX ${adxVal.toFixed(0)} · +DI ${adxRes.plusDi[i].toFixed(0)} / -DI ${adxRes.minusDi[i].toFixed(0)}`,
    ),
  );

  // 9. ATR volatility regime (quality — normal is best).
  const atrPct = (a[i] / price) * 100;
  const volQuality =
    atrPct < 0.05 ? 0.2 : atrPct < 0.08 ? 0.5 : atrPct < 0.4 ? 1.0 : atrPct < 0.7 ? 0.6 : 0.3;
  contribs.push(
    quality("atrVolatility", volQuality, `ATR ${atrPct.toFixed(2)}% of price · ${analysis.volatility}`),
  );

  // 10. VWAP location.
  const vwapDiff = (price - v[i]) / v[i];
  contribs.push(
    directional(
      "vwapLocation",
      clamp(vwapDiff / 0.003, -1, 1),
      `Price ${price > v[i] ? "above" : "below"} session VWAP`,
    ),
  );

  // 11. Volume expansion (current vs previous).
  const volExp = c[i - 1].volume ? cur.volume / c[i - 1].volume - 1 : 0;
  const bullCandle = cur.close > cur.open;
  contribs.push(
    directional(
      "volumeExpansion",
      clamp(volExp, -1, 1) * (bullCandle ? 1 : -1),
      `Volume ${volExp >= 0 ? "+" : ""}${(volExp * 100).toFixed(0)}% vs previous bar`,
    ),
  );

  // 12. Relative volume (RVOL vs 20-bar avg).
  const rvol = relativeVolume(c, cfg.relVolLookback);
  contribs.push(
    directional(
      "relativeVolume",
      clamp((rvol - 1) / 1.5, -1, 1) * (bullCandle ? 1 : -1),
      `RVOL ${rvol.toFixed(2)}x average`,
    ),
  );

  // 13. Bollinger squeeze (quality — squeeze = potential energy).
  const bwPct = percentileRank(bb.bandwidth, 100);
  const squeezing = bwPct < th.squeezeBandwidthPct;
  contribs.push(
    quality(
      "bollingerSqueeze",
      squeezing ? 1 : 1 - Math.min(1, bwPct),
      squeezing
        ? `Squeeze: bandwidth in bottom ${(bwPct * 100).toFixed(0)}%`
        : `Bandwidth in ${(bwPct * 100).toFixed(0)}th percentile`,
    ),
  );

  // 14. Support/resistance proximity.
  const distToSup = Math.abs(price - sr.support) / price;
  const distToRes = Math.abs(price - sr.resistance) / price;
  const nearSup = distToSup < 0.003;
  const nearRes = distToRes < 0.003;
  contribs.push(
    directional(
      "srProximity",
      nearSup ? 0.8 : nearRes ? -0.8 : 0,
      nearSup
        ? `Near support ${fmt(sr.support, meta.digits)}`
        : nearRes
          ? `Near resistance ${fmt(sr.resistance, meta.digits)}`
          : "Mid-range, no key level in play",
    ),
  );

  // 15. Breakout quality (close beyond level with volume).
  const brokeUp = price > sr.resistance && cur.close > cur.open && rvol > 1.1;
  const brokeDown = price < sr.support && cur.close < cur.open && rvol > 1.1;
  contribs.push(
    directional(
      "breakoutQuality",
      brokeUp ? 1 : brokeDown ? -1 : 0,
      brokeUp
        ? "Bullish breakout with above-avg volume"
        : brokeDown
          ? "Bearish breakdown with above-avg volume"
          : "No qualified breakout",
    ),
  );

  // 16. Pullback quality (touched EMA20 then rejected in trend direction).
  const touchedFast = cur.low <= e20[i] * 1.001 && cur.close > e20[i];
  const touchedFastBear = cur.high >= e20[i] * 0.999 && cur.close < e20[i];
  const pullbackBull = analysis.trend === "Bullish" && touchedFast;
  const pullbackBear = analysis.trend === "Bearish" && touchedFastBear;
  contribs.push(
    directional(
      "pullbackQuality",
      pullbackBull ? 1 : pullbackBear ? -1 : 0,
      pullbackBull
        ? `Bullish pullback rejected at EMA${cfg.emaFast}`
        : pullbackBear
          ? `Bearish pullback rejected at EMA${cfg.emaFast}`
          : "No clean pullback",
    ),
  );

  // 17. Session strength (quality).
  const sessMult = CONFIG.sessions[analysis.sessionTag] ?? 0.5;
  contribs.push(
    quality("sessionStrength", sessMult, `${analysis.sessionTag} session · liquidity ${(sessMult * 100).toFixed(0)}%`),
  );

  // --- Aggregate ------------------------------------------------------------

  let bullRaw = 0;
  let bearRaw = 0;
  let dirMax = 0;
  let qualRaw = 0;
  let qualMax = 0;

  for (const ctr of contribs) {
    if (QUALITY_SIGNALS.has(ctr.key)) {
      qualRaw += ctr.score;
      qualMax += ctr.weight;
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

  const edge = Math.abs(bullScore - bearScore);
  const dominant = bullScore >= bearScore ? "BUY" : "SELL";
  const dominantScore = Math.max(bullScore, bearScore);
  const rawConf = dominantScore * qualityMult;
  const confidence = Math.round(clamp(rawConf, 0, 99));

  let side: Side = "NONE";
  if (
    confidence >= th.minConfidence &&
    edge >= th.minEdgePct &&
    adxVal >= th.adxTrendMin * 0.75 // soft floor — allow slightly weaker trend if other signals align
  ) {
    side = dominant as Side;
  }

  // --- Levels ---------------------------------------------------------------
  const atrVal = a[i];
  const slDist = atrVal * th.slAtrMult;
  const tp1Dist = slDist * th.tp1RMult;
  const tp2Dist = slDist * th.tp2RMult;

  let entry = price,
    sl = price,
    tp1 = price,
    tp2 = price;
  if (side === "BUY") {
    entry = price;
    sl = round(price - slDist, meta.digits);
    tp1 = round(price + tp1Dist, meta.digits);
    tp2 = round(price + tp2Dist, meta.digits);
  } else if (side === "SELL") {
    entry = price;
    sl = round(price + slDist, meta.digits);
    tp1 = round(price - tp1Dist, meta.digits);
    tp2 = round(price - tp2Dist, meta.digits);
  }

  // Spread quality gate: if spread eats too much of the SL, reject.
  let spreadPct = 0;
  if (slDist > 0) spreadPct = (analysis.spread / slDist) * 100;
  const spreadPass = slDist > 0 ? spreadPct <= th.maxSpreadOverSlPct : true;
  if (side !== "NONE" && !spreadPass) side = "NONE";

  // --- Diagnostic filter evaluation ----------------------------------------
  // Evaluated for EVERY tick, whether or not the signal fires, so the UI can
  // show exactly what's blocking a trade and how close each gate is.
  const requiredAdxSoft = th.adxTrendMin * 0.75;
  const filters: FilterCheck[] = [
    {
      key: "confidence",
      label: "Confidence ≥ threshold",
      pass: confidence >= th.minConfidence,
      actual: confidence,
      required: th.minConfidence,
      unit: "%",
      progress: clamp(confidence / th.minConfidence, 0, 1),
      detail: `Weighted confidence ${confidence}% vs required ${th.minConfidence}%.`,
    },
    {
      key: "edge",
      label: "Directional edge ≥ minimum",
      pass: edge >= th.minEdgePct,
      actual: +edge.toFixed(1),
      required: th.minEdgePct,
      unit: "%",
      progress: clamp(edge / th.minEdgePct, 0, 1),
      detail: `Bull ${bullScore.toFixed(0)} vs Bear ${bearScore.toFixed(0)} → edge ${edge.toFixed(0)}% (need ${th.minEdgePct}%).`,
    },
    {
      key: "adx",
      label: "Trend strength (ADX)",
      pass: adxVal >= requiredAdxSoft,
      actual: +adxVal.toFixed(1),
      required: +requiredAdxSoft.toFixed(1),
      progress: clamp(adxVal / requiredAdxSoft, 0, 1),
      detail: `ADX ${adxVal.toFixed(0)} vs soft floor ${requiredAdxSoft.toFixed(0)} (hard trend ≥ ${th.adxTrendMin}).`,
    },
    {
      key: "spread",
      label: "Spread cost vs SL",
      pass: spreadPass,
      actual: +spreadPct.toFixed(1),
      required: th.maxSpreadOverSlPct,
      unit: "%",
      progress: spreadPct <= th.maxSpreadOverSlPct ? 1 : clamp(th.maxSpreadOverSlPct / Math.max(spreadPct, 0.01), 0, 1),
      detail: `Spread is ${spreadPct.toFixed(1)}% of the ${th.slAtrMult}×ATR stop (max allowed ${th.maxSpreadOverSlPct}%).`,
    },
    {
      key: "quality",
      label: "Setup quality floor",
      pass: qualityScore >= th.qualityFloor * 100,
      actual: +qualityScore.toFixed(0),
      required: +(th.qualityFloor * 100).toFixed(0),
      unit: "%",
      progress: clamp(qualityScore / (th.qualityFloor * 100), 0, 1),
      detail: `Session/volatility/squeeze quality ${qualityScore.toFixed(0)}% (floor ${(th.qualityFloor * 100).toFixed(0)}%).`,
    },
  ];

  const failed = filters.filter((f) => !f.pass);
  const blockingFilter = failed[0] ?? null;
  const closestToPassing = [...failed].sort((a, b) => b.progress - a.progress).slice(0, 3);

  const rejectionReason = side !== "NONE"
    ? ""
    : failed.length === 0
      ? `Setup is technically valid but was suppressed after level checks — verify entry, SL and spread.`
      : `Blocked by ${blockingFilter!.label}: ${blockingFilter!.detail}` +
        (failed.length > 1
          ? ` Also failing: ${failed.slice(1).map((f) => f.label).join(", ")}.`
          : "");

  const diagnostics: SignalDiagnostics = {
    currentConfidence: confidence,
    requiredConfidence: th.minConfidence,
    bullScore: +bullScore.toFixed(1),
    bearScore: +bearScore.toFixed(1),
    qualityScore: +qualityScore.toFixed(1),
    edge: +edge.toFixed(1),
    requiredEdge: th.minEdgePct,
    adxValue: +adxVal.toFixed(1),
    requiredAdx: +requiredAdxSoft.toFixed(1),
    riskRewardEstimate: th.tp1RMult,
    qualityMultiplier: +qualityMult.toFixed(3),
    dominantSide: dominant as "BUY" | "SELL",
    filters,
    blockingFilter,
    closestToPassing,
    rejectionReason,
  };

  // --- Explanation ----------------------------------------------------------
  const reasonsList = contribs
    .filter((ctr) => (side === "BUY" ? ctr.score > 0 : side === "SELL" ? ctr.score < 0 : Math.abs(ctr.score) > 0))
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .slice(0, 6)
    .map((ctr) => ctr.label);

  const disagreements = contribs
    .filter((ctr) =>
      side === "BUY" ? ctr.score < -0.5 : side === "SELL" ? ctr.score > 0.5 : false,
    )
    .map((ctr) => `${ctr.label} (${ctr.detail})`);

  const strength: Signal["strength"] =
    confidence > 82 ? "Strong" : confidence > 68 ? "Moderate" : "Weak";

  const explanation =
    side === "NONE"
      ? `No high-quality setup on ${symbol} ${tf}. ${rejectionReason}`
      : `${symbol} ${tf}: ${dominant} bias at ${confidence}% confidence. Bull ${bullScore.toFixed(
          0,
        )} / Bear ${bearScore.toFixed(0)}, quality ${qualityScore.toFixed(
          0,
        )}%, ADX ${adxVal.toFixed(0)}. Structured ${dominant === "BUY" ? "long" : "short"} with ${th.tp1RMult}R first target and ${th.tp2RMult}R runner.`;


  const aiSummary =
    side === "NONE"
      ? `Stand aside. Market is ${analysis.trend.toLowerCase()} with ${analysis.momentum.toLowerCase()} momentum in a ${analysis.status.toLowerCase()} state. Neither side has an edge worth committing capital to right now.`
      : `${dominant === "BUY" ? "Long" : "Short"} setup driven by ${reasonsList.slice(0, 3).join(", ")}. Regime: ${analysis.trend.toLowerCase()} / ${analysis.status.toLowerCase()}. ${
          disagreements.length
            ? `Watch outs: ${disagreements.slice(0, 2).join("; ")}.`
            : "No major indicator disagreements."
        } Risk ${th.slAtrMult}×ATR to stop, target 1:${th.tp1RMult} first / 1:${th.tp2RMult} runner.`;

  // Legacy checklist: repurpose top 9 contributors as pass/fail chips.
  const checks = contribs.slice(0, 9).map((ctr) => ({
    label: ctr.label,
    pass: side === "BUY" ? ctr.score > 0 : side === "SELL" ? ctr.score < 0 : ctr.score !== 0,
  }));

  return {
    id: `${symbol}-${tf}-${cur.time}`,
    symbol,
    timeframe: tf,
    side,
    entry,
    stopLoss: sl,
    takeProfit1: tp1,
    takeProfit2: tp2,
    riskReward: th.tp1RMult,
    confidence,
    bullScore: Math.round(bullScore),
    bearScore: Math.round(bearScore),
    qualityScore: Math.round(qualityScore),
    trend: analysis.trend,
    strength,
    reasons: reasonsList,
    explanation,
    aiSummary,
    scoreBreakdown: contribs,
    checks,
    createdAt: Date.now(),
    atr: atrVal,
    rsi: r[i],
    spread: analysis.spread,
  };
}

export function positionSize(
  accountBalance: number,
  riskPct: number,
  entry: number,
  sl: number,
  pipValue = 10,
) {
  const riskAmount = accountBalance * (riskPct / 100);
  const stopDist = Math.abs(entry - sl);
  if (stopDist === 0) return { riskAmount, lots: 0, units: 0 };
  const lots = riskAmount / (stopDist * pipValue * 100);
  return { riskAmount, lots: Math.max(0.01, +lots.toFixed(2)), units: Math.round(lots * 100000) };
}
