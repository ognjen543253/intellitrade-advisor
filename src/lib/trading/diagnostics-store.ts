// Persistent per-(symbol,timeframe) telemetry: confidence history, last valid
// signal time, and the rejection log. All client-side (localStorage) — this is
// diagnostic data, not authoritative trade state.

import type { Signal, SignalDiagnostics } from "./signals";
import type { Symbol, Timeframe } from "./market-data";

export interface ConfidencePoint {
  t: number;
  confidence: number;
  required: number;
  side: "BUY" | "SELL" | "NONE";
}

export interface RejectionEntry {
  id: string;
  t: number;
  symbol: Symbol;
  timeframe: Timeframe;
  dominant: "BUY" | "SELL";
  confidence: number;
  requiredConfidence: number;
  bull: number;
  bear: number;
  quality: number;
  blockingFilter: string | null;
  reason: string;
}

interface Bucket {
  history: ConfidencePoint[]; // last 24h
  lastValidAt: number | null;
  rejections: RejectionEntry[]; // capped
}

type Store = Record<string, Bucket>; // key = `${symbol}:${timeframe}`

const KEY = "sentinel:diagnostics:v1";
const HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_HISTORY = 500;
const MAX_REJECTIONS = 200;
const listeners = new Set<() => void>();

let cache: Store | null = null;

function read(): Store {
  if (cache) return cache;
  if (typeof window === "undefined") { cache = {}; return cache; }
  try { cache = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { cache = {}; }
  return cache!;
}
function write(s: Store) {
  cache = s;
  if (typeof window !== "undefined") localStorage.setItem(KEY, JSON.stringify(s));
  listeners.forEach((l) => l());
}
function bucketKey(symbol: Symbol, tf: Timeframe) { return `${symbol}:${tf}`; }
function ensureBucket(store: Store, key: string): Bucket {
  return (store[key] ??= { history: [], lastValidAt: null, rejections: [] });
}

export function subscribeDiagnostics(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function recordSignal(sig: Signal) {
  const store = read();
  const b = ensureBucket(store, bucketKey(sig.symbol, sig.timeframe));
  const now = Date.now();
  const cutoff = now - HISTORY_WINDOW_MS;
  b.history.push({
    t: now,
    confidence: sig.diagnostics.currentConfidence,
    required: sig.diagnostics.requiredConfidence,
    side: sig.side,
  });
  b.history = b.history.filter((p) => p.t >= cutoff).slice(-MAX_HISTORY);
  if (sig.side !== "NONE") b.lastValidAt = now;
  else if (sig.diagnostics.rejectionReason) {
    b.rejections.unshift({
      id: `${sig.symbol}-${sig.timeframe}-${now}`,
      t: now,
      symbol: sig.symbol,
      timeframe: sig.timeframe,
      dominant: sig.diagnostics.dominantSide,
      confidence: sig.diagnostics.currentConfidence,
      requiredConfidence: sig.diagnostics.requiredConfidence,
      bull: sig.diagnostics.bullScore,
      bear: sig.diagnostics.bearScore,
      quality: sig.diagnostics.qualityScore,
      blockingFilter: sig.diagnostics.blockingFilter?.label ?? null,
      reason: sig.diagnostics.rejectionReason,
    });
    // Only keep the most recent rejection per minute per bucket to avoid spam.
    const seenMinute = new Set<number>();
    b.rejections = b.rejections.filter((r) => {
      const m = Math.floor(r.t / 60_000);
      if (seenMinute.has(m)) return false;
      seenMinute.add(m);
      return true;
    }).slice(0, MAX_REJECTIONS);
  }
  write(store);
}

export function getBucket(symbol: Symbol, tf: Timeframe): Bucket {
  const store = read();
  return store[bucketKey(symbol, tf)] ?? { history: [], lastValidAt: null, rejections: [] };
}

export function getAllRejections(): RejectionEntry[] {
  const store = read();
  return Object.values(store).flatMap((b) => b.rejections).sort((a, b) => b.t - a.t).slice(0, MAX_REJECTIONS);
}

export function clearDiagnostics() { write({}); }

export function formatTimeAgo(ts: number | null): string {
  if (!ts) return "never";
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export type { SignalDiagnostics };
