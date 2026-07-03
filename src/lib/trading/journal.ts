import type { Signal } from "./signals";
import type { Symbol, Timeframe } from "./market-data";

export type TradeStatus = "open" | "win" | "loss" | "breakeven";

export interface Trade {
  id: string;
  symbol: Symbol;
  timeframe: Timeframe;
  side: "BUY" | "SELL";
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  confidence: number;
  reasons: string[];
  openedAt: number; // ms
  closedAt?: number; // ms
  status: TradeStatus;
  rMultiple: number; // e.g. +2 for TP1, -1 for SL
  pnl: number; // in $ terms based on 1% risk / $10k
}

const KEY = "sentinel:trades:v1";
const listeners = new Set<() => void>();
let cache: Trade[] | null = null;

function read(): Trade[] {
  if (cache) return cache;
  if (typeof window === "undefined") { cache = []; return cache; }
  try { cache = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { cache = []; }
  return cache!;
}
function write(t: Trade[]) {
  cache = t;
  if (typeof window !== "undefined") localStorage.setItem(KEY, JSON.stringify(t));
  listeners.forEach(l => l());
}
export function subscribeTrades(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
export function getTrades(): Trade[] { return read(); }

/** Freeze entry & TP; only allow SL to trail to break-even once >= 1R in favor. */
export function manageOpenTrades(symbol: Symbol, price: number): boolean {
  const trades = read();
  let mutated = false;
  const next = trades.map(t => {
    if (t.status !== "open" || t.symbol !== symbol) return t;
    const risk = Math.abs(t.entry - t.stopLoss);
    if (risk <= 0) return t;
    if (t.side === "BUY") {
      const rInProfit = (price - t.entry) / risk;
      if (rInProfit >= 1 && t.stopLoss < t.entry) { mutated = true; return { ...t, stopLoss: t.entry }; }
    } else {
      const rInProfit = (t.entry - price) / risk;
      if (rInProfit >= 1 && t.stopLoss > t.entry) { mutated = true; return { ...t, stopLoss: t.entry }; }
    }
    return t;
  });
  if (mutated) write(next);
  return mutated;
}

export function logTradeFromSignal(sig: Signal, riskAmount = 100): Trade {
  const trades = read();
  const t: Trade = {
    id: `${sig.symbol}-${sig.timeframe}-${Date.now()}`,
    symbol: sig.symbol,
    timeframe: sig.timeframe,
    side: sig.side as "BUY" | "SELL",
    entry: sig.entry,
    stopLoss: sig.stopLoss,
    takeProfit1: sig.takeProfit1,
    takeProfit2: sig.takeProfit2,
    confidence: sig.confidence,
    reasons: sig.reasons,
    openedAt: Date.now(),
    status: "open",
    rMultiple: 0,
    pnl: 0,
    // stash risk amount for pnl calc
    ...({} as object),
  };
  (t as Trade & { riskAmount: number }).riskAmount = riskAmount;
  trades.unshift(t);
  write(trades);
  return t;
}

export function resolveTrade(id: string, outcome: "win" | "loss" | "breakeven") {
  const trades = read();
  const t = trades.find(x => x.id === id);
  if (!t || t.status !== "open") return;
  const risk = (t as Trade & { riskAmount?: number }).riskAmount ?? 100;
  t.status = outcome;
  t.closedAt = Date.now();
  t.rMultiple = outcome === "win" ? 2 : outcome === "loss" ? -1 : 0;
  t.pnl = risk * t.rMultiple;
  write(trades);
}

export function deleteTrade(id: string) {
  write(read().filter(t => t.id !== id));
}

export function clearAllTrades() { write([]); }

/** Seed a year of realistic trades if journal is empty — makes calendar meaningful on first load. */
export function seedIfEmpty() {
  const cur = read();
  if (cur.length > 0) return;
  const now = new Date();
  const symbols: Symbol[] = ["EURUSD", "GBPUSD", "USDJPY", "NAS100", "SPX500", "AUDUSD"];
  const trades: Trade[] = [];
  // Distribute ~140 trades over the last ~11 months
  for (let i = 0; i < 140; i++) {
    const daysAgo = Math.floor(Math.random() * 330) + 3;
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    d.setHours(8 + Math.floor(Math.random() * 10), Math.floor(Math.random() * 60), 0, 0);
    // Skip weekends for realism
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const win = Math.random() < 0.58;
    const be = !win && Math.random() < 0.1;
    const sym = symbols[Math.floor(Math.random() * symbols.length)];
    const rMult = be ? 0 : win ? 2 : -1;
    trades.push({
      id: `seed-${i}-${d.getTime()}`,
      symbol: sym,
      timeframe: (["15m", "1h", "4h"] as Timeframe[])[Math.floor(Math.random() * 3)],
      side: Math.random() < 0.55 ? "BUY" : "SELL",
      entry: 0, stopLoss: 0, takeProfit1: 0, takeProfit2: 0,
      confidence: 65 + Math.floor(Math.random() * 30),
      reasons: [],
      openedAt: d.getTime(),
      closedAt: d.getTime() + 3600 * 1000,
      status: be ? "breakeven" : win ? "win" : "loss",
      rMultiple: rMult,
      pnl: rMult * 100,
    });
  }
  write(trades);
}

// -------- Aggregations --------

export function performanceStats(trades: Trade[]) {
  const closed = trades.filter(t => t.status !== "open");
  const wins = closed.filter(t => t.status === "win");
  const losses = closed.filter(t => t.status === "loss");
  const totalPnl = closed.reduce((s, t) => s + t.pnl, 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  return {
    total: closed.length,
    open: trades.filter(t => t.status === "open").length,
    wins: wins.length,
    losses: losses.length,
    winRate: closed.length ? Math.round((wins.length / closed.length) * 100) : 0,
    profitFactor: grossLoss ? +(grossWin / grossLoss).toFixed(2) : grossWin > 0 ? 99 : 0,
    avgWin: wins.length ? +(grossWin / wins.length).toFixed(2) : 0,
    avgLoss: losses.length ? +(grossLoss / losses.length).toFixed(2) : 0,
    totalPnl: +totalPnl.toFixed(2),
    expectancyR: closed.length ? +(closed.reduce((s, t) => s + t.rMultiple, 0) / closed.length).toFixed(2) : 0,
  };
}

/** Daily P&L map keyed by YYYY-MM-DD */
export function dailyPnl(trades: Trade[]): Record<string, { pnl: number; count: number; wins: number; losses: number }> {
  const map: Record<string, { pnl: number; count: number; wins: number; losses: number }> = {};
  for (const t of trades) {
    if (t.status === "open") continue;
    const d = new Date(t.closedAt ?? t.openedAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const b = map[key] ??= { pnl: 0, count: 0, wins: 0, losses: 0 };
    b.pnl += t.pnl;
    b.count += 1;
    if (t.status === "win") b.wins += 1;
    if (t.status === "loss") b.losses += 1;
  }
  return map;
}

/** AI learning: derive weight bias per symbol + per confidence bucket. */
export function learningInsights(trades: Trade[]) {
  const bySymbol: Record<string, { total: number; wins: number; pnl: number }> = {};
  const byConfidenceBucket: Record<string, { total: number; wins: number }> = {
    "60-70": { total: 0, wins: 0 },
    "70-80": { total: 0, wins: 0 },
    "80-90": { total: 0, wins: 0 },
    "90+":   { total: 0, wins: 0 },
  };
  const bySide: Record<"BUY" | "SELL", { total: number; wins: number }> = {
    BUY: { total: 0, wins: 0 }, SELL: { total: 0, wins: 0 },
  };

  for (const t of trades) {
    if (t.status === "open" || t.status === "breakeven") continue;
    const s = bySymbol[t.symbol] ??= { total: 0, wins: 0, pnl: 0 };
    s.total += 1; s.pnl += t.pnl; if (t.status === "win") s.wins += 1;

    const b = t.confidence >= 90 ? "90+" : t.confidence >= 80 ? "80-90" : t.confidence >= 70 ? "70-80" : "60-70";
    byConfidenceBucket[b].total += 1;
    if (t.status === "win") byConfidenceBucket[b].wins += 1;

    bySide[t.side].total += 1;
    if (t.status === "win") bySide[t.side].wins += 1;
  }

  const bestSymbol = Object.entries(bySymbol).sort((a, b) => b[1].pnl - a[1].pnl)[0];
  const worstSymbol = Object.entries(bySymbol).sort((a, b) => a[1].pnl - b[1].pnl)[0];

  return { bySymbol, byConfidenceBucket, bySide, bestSymbol, worstSymbol };
}
