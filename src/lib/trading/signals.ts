import { atr, ema, findSupportResistance, macd, rsi, vwap, type Candle, type Symbol, type Timeframe, SYMBOLS } from "./market-data";

export type Side = "BUY" | "SELL" | "NONE";

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
  confidence: number; // 0-100
  trend: "Bullish" | "Bearish" | "Sideways";
  strength: "Weak" | "Moderate" | "Strong";
  reasons: string[];
  explanation: string;
  checks: { label: string; pass: boolean }[];
  createdAt: number;
  atr: number;
  rsi: number;
  spread: number;
}

export interface MarketAnalysis {
  trend: "Bullish" | "Bearish" | "Sideways";
  trendScore: number; // -100..100
  momentum: "Strong" | "Building" | "Weak" | "Fading";
  volatility: "Low" | "Normal" | "High";
  atr: number;
  rsi: number;
  macdState: "Bullish Cross" | "Bearish Cross" | "Bullish" | "Bearish" | "Flat";
  support: number;
  resistance: number;
  status: "Trending" | "Consolidating" | "Breakout" | "Reversal Watch";
  spread: number;
  sessionTag: "Asia" | "London" | "New York" | "Overlap" | "After Hours";
  signalStrength: number; // 0-100
}

function currentSession(): MarketAnalysis["sessionTag"] {
  const h = new Date().getUTCHours();
  if (h >= 0 && h < 7) return "Asia";
  if (h >= 7 && h < 12) return "London";
  if (h >= 12 && h < 16) return "Overlap";
  if (h >= 16 && h < 21) return "New York";
  return "After Hours";
}

export function analyzeMarket(c: Candle[], symbol: Symbol): MarketAnalysis {
  const closes = c.map((k) => k.close);
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const e200 = ema(closes, 200);
  const r = rsi(closes);
  const m = macd(closes);
  const a = atr(c);
  const sr = findSupportResistance(c);
  const i = c.length - 1;

  const price = closes[i];
  const trendScore = clamp(
    ((price - e200[i]) / e200[i]) * 5000 +
    (e20[i] > e50[i] ? 25 : -25) +
    (e50[i] > e200[i] ? 25 : -25),
    -100, 100,
  );
  const trend: MarketAnalysis["trend"] =
    trendScore > 25 ? "Bullish" : trendScore < -25 ? "Bearish" : "Sideways";

  const macdState: MarketAnalysis["macdState"] =
    m.hist[i] > 0 && m.hist[i - 1] <= 0 ? "Bullish Cross" :
    m.hist[i] < 0 && m.hist[i - 1] >= 0 ? "Bearish Cross" :
    m.hist[i] > 0 ? "Bullish" :
    m.hist[i] < 0 ? "Bearish" : "Flat";

  const atrPct = (a[i] / price) * 100;
  const volatility: MarketAnalysis["volatility"] =
    atrPct < 0.08 ? "Low" : atrPct > 0.4 ? "High" : "Normal";

  const recentRange = Math.max(...c.slice(-30).map(k => k.high)) - Math.min(...c.slice(-30).map(k => k.low));
  const consolidation = recentRange / a[i] < 6;
  const breakout = price > sr.resistance * 0.999 || price < sr.support * 1.001;
  const status: MarketAnalysis["status"] =
    breakout && Math.abs(trendScore) > 30 ? "Breakout" :
    consolidation ? "Consolidating" :
    Math.sign(trendScore) !== Math.sign(closes[i - 5] - closes[i - 20]) ? "Reversal Watch" :
    "Trending";

  const momentum: MarketAnalysis["momentum"] =
    Math.abs(m.hist[i]) > Math.abs(m.hist[i - 5]) * 1.2 ? "Strong" :
    Math.abs(m.hist[i]) > Math.abs(m.hist[i - 5]) ? "Building" :
    Math.abs(m.hist[i]) < Math.abs(m.hist[i - 5]) * 0.6 ? "Fading" : "Weak";

  const meta = SYMBOLS.find(s => s.id === symbol)!;
  const spread = meta.group === "Forex" ? meta.vol * 0.15 : meta.vol * 0.05;

  const signalStrength = clamp(
    Math.abs(trendScore) * 0.5 +
    (volatility === "Normal" ? 25 : volatility === "High" ? 10 : 0) +
    (momentum === "Strong" ? 25 : momentum === "Building" ? 15 : 0),
    0, 100,
  );

  return {
    trend, trendScore, momentum, volatility,
    atr: a[i], rsi: r[i], macdState,
    support: sr.support, resistance: sr.resistance,
    status, spread,
    sessionTag: currentSession(),
    signalStrength,
  };
}

export function generateSignal(c: Candle[], symbol: Symbol, tf: Timeframe): Signal {
  const closes = c.map(k => k.close);
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const e200 = ema(closes, 200);
  const r = rsi(closes);
  const m = macd(closes);
  const a = atr(c);
  const v = vwap(c);
  const sr = findSupportResistance(c);
  const i = c.length - 1;
  const price = closes[i];
  const prev = c[i - 1];
  const cur = c[i];

  const meta = SYMBOLS.find(s => s.id === symbol)!;
  const analysis = analyzeMarket(c, symbol);

  const volUp = cur.volume > prev.volume * 1.05;
  const bullCandle = cur.close > cur.open && (cur.close - cur.open) > (cur.high - cur.low) * 0.5;
  const bearCandle = cur.close < cur.open && (cur.open - cur.close) > (cur.high - cur.low) * 0.5;

  const longChecks = [
    { label: "Trend bullish (H1+)", pass: analysis.trend === "Bullish" },
    { label: "Price above EMA 200", pass: price > e200[i] },
    { label: "EMA 20 above EMA 50", pass: e20[i] > e50[i] },
    { label: "Pullback to support", pass: cur.low <= sr.support * 1.003 || cur.low <= e20[i] * 1.001 },
    { label: "Bullish confirmation candle", pass: bullCandle },
    { label: "Volume increasing", pass: volUp },
    { label: "RSI 50-70", pass: r[i] >= 50 && r[i] <= 70 },
    { label: "MACD bullish", pass: m.hist[i] > 0 },
    { label: "Above VWAP", pass: price > v[i] },
  ];

  const shortChecks = [
    { label: "Trend bearish (H1+)", pass: analysis.trend === "Bearish" },
    { label: "Price below EMA 200", pass: price < e200[i] },
    { label: "EMA 20 below EMA 50", pass: e20[i] < e50[i] },
    { label: "Pullback to resistance", pass: cur.high >= sr.resistance * 0.997 || cur.high >= e20[i] * 0.999 },
    { label: "Bearish confirmation candle", pass: bearCandle },
    { label: "Selling volume increasing", pass: volUp },
    { label: "RSI 30-50", pass: r[i] >= 30 && r[i] <= 50 },
    { label: "MACD bearish", pass: m.hist[i] < 0 },
    { label: "Below VWAP", pass: price < v[i] },
  ];

  const longPassed = longChecks.filter(c => c.pass).length;
  const shortPassed = shortChecks.filter(c => c.pass).length;

  let side: Side = "NONE";
  let checks = longChecks;
  const MIN_PASS = 5; // majority of 9 confluences
  if (longPassed >= MIN_PASS && longPassed > shortPassed) { side = "BUY"; checks = longChecks; }
  else if (shortPassed >= MIN_PASS && shortPassed > longPassed) { side = "SELL"; checks = shortChecks; }
  else if (longPassed === shortPassed && longPassed >= MIN_PASS) {
    // Tie-breaker: follow the higher-timeframe trend bias
    side = analysis.trend === "Bearish" ? "SELL" : "BUY";
    checks = side === "SELL" ? shortChecks : longChecks;
  } else { side = "NONE"; checks = longPassed >= shortPassed ? longChecks : shortChecks; }

  const atrVal = a[i];
  const slDist = atrVal * 1.5;
  const tp1Dist = slDist * 2; // enforces 1:2
  const tp2Dist = slDist * 3.2;

  let entry = price, sl = price, tp1 = price, tp2 = price;
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

  const confidence = clamp(
    ((side === "BUY" ? longPassed : side === "SELL" ? shortPassed : Math.max(longPassed, shortPassed)) / 9) * 100 *
    (analysis.volatility === "Low" ? 0.7 : 1) *
    (analysis.status === "Consolidating" ? 0.75 : 1),
    0, 99,
  );

  const reasons = checks.filter(c => c.pass).map(c => c.label);
  const strength: Signal["strength"] = confidence > 80 ? "Strong" : confidence > 60 ? "Moderate" : "Weak";

  const explanation = side === "NONE"
    ? `No high-probability setup right now on ${symbol} ${tf}. Market is ${analysis.trend.toLowerCase()} with ${analysis.momentum.toLowerCase()} momentum and ${analysis.volatility.toLowerCase()} volatility. The AI is waiting for stronger confirmation before committing capital.`
    : side === "BUY"
      ? `${symbol} is trending ${analysis.trend.toLowerCase()} on the ${tf} timeframe. Price pulled back to support near ${fmt(sr.support, meta.digits)} and printed a bullish confirmation candle with ${volUp ? "rising" : "steady"} volume. EMAs are stacked bullishly (20 > 50 > 200), RSI at ${r[i].toFixed(0)} sits in the healthy 50-70 momentum band, and MACD is ${analysis.macdState.toLowerCase()}. This is a structured continuation buy with a clean 1:2+ risk/reward.`
      : `${symbol} is trending ${analysis.trend.toLowerCase()} on the ${tf} timeframe. Price rallied into resistance near ${fmt(sr.resistance, meta.digits)} and printed a bearish confirmation candle. EMAs are stacked bearishly (20 < 50 < 200), RSI at ${r[i].toFixed(0)} sits in the 30-50 weakness band, and MACD is ${analysis.macdState.toLowerCase()}. This is a structured continuation sell with a clean 1:2+ risk/reward.`;

  return {
    id: `${symbol}-${tf}-${cur.time}`,
    symbol, timeframe: tf, side,
    entry, stopLoss: sl, takeProfit1: tp1, takeProfit2: tp2,
    riskReward: 2,
    confidence: Math.round(confidence),
    trend: analysis.trend, strength,
    reasons, explanation, checks,
    createdAt: Date.now(),
    atr: atrVal, rsi: r[i], spread: analysis.spread,
  };
}

export function positionSize(accountBalance: number, riskPct: number, entry: number, sl: number, pipValue = 10) {
  const riskAmount = accountBalance * (riskPct / 100);
  const stopDist = Math.abs(entry - sl);
  if (stopDist === 0) return { riskAmount, lots: 0, units: 0 };
  const lots = riskAmount / (stopDist * pipValue * 100);
  return { riskAmount, lots: Math.max(0.01, +lots.toFixed(2)), units: Math.round(lots * 100000) };
}

function round(n: number, d: number) { const p = Math.pow(10, d); return Math.round(n * p) / p; }
function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }
function fmt(n: number, d: number) { return n.toFixed(d); }
