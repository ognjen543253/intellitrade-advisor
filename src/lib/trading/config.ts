// IntelliTrade Quant Engine — probability-based configuration.
// The engine outputs a probability (0..100) and a grade (A+..C / None).
// There are NO correlated hard gates on confidence — indicators reduce
// probability, they do not veto trades. Only genuine risk gates (spread,
// data sufficiency, absent setup at very low probability) are hard.

export type SignalKey =
  // Structure & trend (evaluated FIRST)
  | "marketStructure"
  | "trendAlignment"
  | "emaSlope"
  | "emaStack"
  // Momentum
  | "rsiState"
  | "rsiDivergence"
  | "macdHist"
  | "macdCross"
  // Trend strength / directional pressure
  | "adxStrength"
  // Liquidity
  | "vwapLocation"
  | "volumeExpansion"
  | "relativeVolume"
  // Volatility regime (quality)
  | "atrVolatility"
  | "bollingerSqueeze"
  // Location & setup quality
  | "srProximity"
  | "breakoutQuality"
  | "pullbackQuality"
  | "setupRecognition"
  // Context
  | "sessionStrength"
  | "htfAlignment";

export type SetupType =
  | "Trend Pullback"
  | "Trend Continuation"
  | "Breakout"
  | "Retest"
  | "Failed Breakout"
  | "Momentum Expansion"
  | "Range Reversal"
  | "Range Bounce"
  | "Mean Reversion"
  | "No Setup";

export type Grade = "A+" | "A" | "B" | "C" | "None";

export interface QuantConfig {
  indicators: {
    emaFast: number;
    emaMid: number;
    emaSlow: number;
    rsiPeriod: number;
    atrPeriod: number;
    adxPeriod: number;
    bbPeriod: number;
    bbStdDev: number;
    macdFast: number;
    macdSlow: number;
    macdSignal: number;
    relVolLookback: number;
    divergenceLookback: number;
    swingLookback: number;
  };
  weights: Record<SignalKey, number>;
  thresholds: {
    // Probability -> grade thresholds. Each tier also has a minimum quality
    // score (0..1) — a great probability with poor quality drops one tier.
    gradeAPlus: number;
    gradeA: number;
    gradeB: number;
    gradeC: number;
    gradeAPlusQuality: number;
    gradeAQuality: number;
    gradeBQuality: number;
    // Legacy scalar quality floor (used to soft-scale probability).
    qualityFloor: number;
    // Risk model.
    slAtrMult: number;
    tp1RMult: number;
    tp2RMult: number;
    // Only hard risk gate on spread.
    maxSpreadOverSlPct: number;
    // ADX is a modifier now, not a filter. Below this it merely trims prob.
    adxTrendMin: number;
    // Squeeze detection.
    squeezeBandwidthPct: number;
    // Structure — swing break detection.
    structureLookback: number;
  };
  sessions: {
    Asia: number;
    London: number;
    Overlap: number;
    "New York": number;
    "After Hours": number;
  };
  risk: {
    defaultRiskPct: 1 | 2;
    minRiskReward: number;
  };
  // Higher-timeframe map used by MTF continuation logic.
  htfMap: Record<string, string | null>;
}

export const CONFIG: QuantConfig = {
  indicators: {
    emaFast: 20,
    emaMid: 50,
    emaSlow: 200,
    rsiPeriod: 14,
    atrPeriod: 14,
    adxPeriod: 14,
    bbPeriod: 20,
    bbStdDev: 2,
    macdFast: 12,
    macdSlow: 26,
    macdSignal: 9,
    relVolLookback: 20,
    divergenceLookback: 14,
    swingLookback: 5,
  },
  // STRUCTURE-FIRST weighting: structure/trend outweigh momentum outweigh
  // liquidity outweigh indicator confirmations. Setup recognition is the
  // single largest contributor when a valid pattern is present.
  weights: {
    marketStructure: 14,
    trendAlignment: 10,
    emaSlope: 5,
    emaStack: 6,
    rsiState: 5,
    rsiDivergence: 7,
    macdHist: 5,
    macdCross: 6,
    adxStrength: 7,
    atrVolatility: 5,
    vwapLocation: 4,
    volumeExpansion: 4,
    relativeVolume: 5,
    bollingerSqueeze: 3,
    srProximity: 6,
    breakoutQuality: 7,
    pullbackQuality: 7,
    setupRecognition: 15,
    sessionStrength: 3,
    htfAlignment: 8,
  },
  thresholds: {
    // Tiered grading — each tier requires both a probability AND a quality floor.
    // Anything below gradeB probability defaults to C. The signal engine still
    // requires majority confluence + named setup + session + spread gates for
    // side to be BUY/SELL; the tiers below are what the UI/alerts filter on.
    gradeAPlus: 80,
    gradeA: 72,
    gradeB: 65,
    gradeC: 1,
    gradeAPlusQuality: 0.8,
    gradeAQuality: 0.7,
    gradeBQuality: 0.6,
    qualityFloor: 0.6,
    slAtrMult: 1.5,
    tp1RMult: 2,
    tp2RMult: 3.2,
    maxSpreadOverSlPct: 30,
    adxTrendMin: 20,
    squeezeBandwidthPct: 0.2,
    structureLookback: 20,
  },

  sessions: {
    Asia: 0.8,
    London: 0.95,
    Overlap: 1.0,
    "New York": 0.95,
    "After Hours": 0.6,
  },
  risk: {
    defaultRiskPct: 1,
    minRiskReward: 2,
  },
  htfMap: {
    "1m": "15m",
    "5m": "1h",
    "15m": "4h",
    "1h": "4h",
    "4h": null,
  },
};

export const SIGNAL_LABELS: Record<SignalKey, string> = {
  marketStructure: "Market structure (swing HH/HL)",
  trendAlignment: "Trend alignment (price vs EMA200)",
  emaSlope: "EMA slope",
  emaStack: "EMA stack 20/50/200",
  rsiState: "RSI state",
  rsiDivergence: "RSI divergence",
  macdHist: "MACD histogram",
  macdCross: "MACD zero-line cross",
  adxStrength: "ADX trend strength",
  atrVolatility: "ATR volatility regime",
  vwapLocation: "Price vs VWAP",
  volumeExpansion: "Volume expansion",
  relativeVolume: "Relative volume (RVOL)",
  bollingerSqueeze: "Bollinger squeeze",
  srProximity: "S/R proximity",
  breakoutQuality: "Breakout quality",
  pullbackQuality: "Pullback quality",
  setupRecognition: "Setup pattern",
  sessionStrength: "Session liquidity",
  htfAlignment: "Higher-timeframe alignment",
};

export const QUALITY_SIGNALS: ReadonlySet<SignalKey> = new Set([
  "atrVolatility",
  "bollingerSqueeze",
  "sessionStrength",
]);

export function gradeFor(probability: number, qualityScore = 100): Grade {
  const t = CONFIG.thresholds;
  const q = qualityScore; // 0..100
  if (probability >= t.gradeAPlus && q >= t.gradeAPlusQuality * 100) return "A+";
  if (probability >= t.gradeA && q >= t.gradeAQuality * 100) return "A";
  if (probability >= t.gradeB && q >= t.gradeBQuality * 100) return "B";
  if (probability >= t.gradeC) return "C";
  return "None";
}

export const GRADE_ORDER: Grade[] = ["None", "C", "B", "A", "A+"];
export function gradeAtLeast(g: Grade, min: Grade): boolean {
  return GRADE_ORDER.indexOf(g) >= GRADE_ORDER.indexOf(min);
}
