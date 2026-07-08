// IntelliTrade Quant Engine — central configuration.
// Every threshold, indicator period, and signal weight lives here.
// v1 covers Phase 1 (weighted scoring) + Phase 6 (AI explanation).
// Later phases (regime, adaptive risk, MTF gate) will read from the same file.

export type SignalKey =
  | "trendAlignment"
  | "emaSlope"
  | "emaStack"
  | "rsiState"
  | "rsiDivergence"
  | "macdHist"
  | "macdCross"
  | "adxStrength"
  | "atrVolatility"
  | "vwapLocation"
  | "volumeExpansion"
  | "relativeVolume"
  | "bollingerSqueeze"
  | "srProximity"
  | "breakoutQuality"
  | "pullbackQuality"
  | "sessionStrength";

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
  };
  // Per-signal weight. Directional signals score −weight (bear) to +weight (bull).
  // Neutral quality signals (volatility, session, squeeze) score 0..weight and
  // scale the directional total via `qualityFloor`.
  weights: Record<SignalKey, number>;
  thresholds: {
    // Minimum normalized confidence to fire a directional signal (0..100).
    minConfidence: number;
    // Minimum |bullScore − bearScore| as a % of the max possible directional
    // score. Below this, the sides are too balanced → NONE.
    minEdgePct: number;
    // Quality signals scale directional score. `qualityFloor` is the minimum
    // multiplier (e.g. 0.5 = a poor session still lets a great setup through
    // at half strength).
    qualityFloor: number;
    // Risk/reward baseline (SL and TP are ATR-scaled; TP1 = 2R by default).
    slAtrMult: number;
    tp1RMult: number;
    tp2RMult: number;
    // Reject setups whose est. spread exceeds this fraction of the SL distance.
    maxSpreadOverSlPct: number;
    // ADX below this = no real trend; trend-alignment signals get halved.
    adxTrendMin: number;
    // Bollinger bandwidth percentile (0..1) below which we tag "Squeeze".
    squeezeBandwidthPct: number;
  };
  sessions: {
    // Session multiplier applied to quality (0..1). Overlap = best liquidity.
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
  },
  weights: {
    trendAlignment: 12,
    emaSlope: 6,
    emaStack: 8,
    rsiState: 6,
    rsiDivergence: 8,
    macdHist: 6,
    macdCross: 8,
    adxStrength: 8,
    atrVolatility: 5,
    vwapLocation: 5,
    volumeExpansion: 5,
    relativeVolume: 5,
    bollingerSqueeze: 4,
    srProximity: 7,
    breakoutQuality: 8,
    pullbackQuality: 8,
    sessionStrength: 4,
  },
  thresholds: {
    minConfidence: 62,
    minEdgePct: 18,
    qualityFloor: 0.55,
    slAtrMult: 1.5,
    tp1RMult: 2,
    tp2RMult: 3.2,
    maxSpreadOverSlPct: 25,
    adxTrendMin: 20,
    squeezeBandwidthPct: 0.2,
  },
  sessions: {
    Asia: 0.75,
    London: 0.95,
    Overlap: 1.0,
    "New York": 0.9,
    "After Hours": 0.5,
  },
  risk: {
    defaultRiskPct: 1,
    minRiskReward: 2,
  },
};

// Human-readable labels for the AI explanation UI.
export const SIGNAL_LABELS: Record<SignalKey, string> = {
  trendAlignment: "HTF trend alignment",
  emaSlope: "EMA slope",
  emaStack: "EMA stacking (20/50/200)",
  rsiState: "RSI momentum state",
  rsiDivergence: "RSI divergence",
  macdHist: "MACD histogram",
  macdCross: "MACD zero-line cross",
  adxStrength: "ADX trend strength",
  atrVolatility: "ATR volatility regime",
  vwapLocation: "Price vs VWAP",
  volumeExpansion: "Volume expansion",
  relativeVolume: "Relative volume (RVOL)",
  bollingerSqueeze: "Bollinger squeeze",
  srProximity: "Support / resistance proximity",
  breakoutQuality: "Breakout quality",
  pullbackQuality: "Pullback quality",
  sessionStrength: "Session liquidity",
};

// Which signals are neutral quality gates (0..w) vs directional (-w..+w).
export const QUALITY_SIGNALS: ReadonlySet<SignalKey> = new Set([
  "atrVolatility",
  "bollingerSqueeze",
  "sessionStrength",
]);
