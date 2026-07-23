import type { Grade } from "./config";

export type QualityMode = "aplus" | "a" | "b" | "all";

export interface QualityOption {
  id: QualityMode;
  label: string;
  description: string;
  /** Minimum grade the engine will alert / recommend. "None" = analysis only. */
  minGrade: Grade;
  /** When true, the bot does NOT auto-alert or recommend logging — display only. */
  analysisOnly: boolean;
}

export const QUALITY_OPTIONS: QualityOption[] = [
  { id: "aplus", label: "A+ Only", description: "Only the very best setups (prob ≥ 80% & quality ≥ 0.80).", minGrade: "A+", analysisOnly: false },
  { id: "a",    label: "A and A+", description: "High-quality trades (prob ≥ 72% & quality ≥ 0.70).", minGrade: "A",  analysisOnly: false },
  { id: "b",    label: "B, A and A+", description: "Includes B-grade opportunities (prob ≥ 65% & quality ≥ 0.60).", minGrade: "B",  analysisOnly: false },
  { id: "all",  label: "All Signals (analysis only)", description: "Show every C-grade+ signal for study. No alerts, no auto-recommend.", minGrade: "C", analysisOnly: true },
];

const KEY = "sentinel:quality-mode:v1";
const listeners = new Set<() => void>();
let cache: QualityMode | null = null;

export function getQualityMode(): QualityMode {
  if (cache) return cache;
  if (typeof window === "undefined") return "a";
  try {
    const raw = window.localStorage.getItem(KEY) as QualityMode | null;
    cache = raw && QUALITY_OPTIONS.some(o => o.id === raw) ? raw : "a";
  } catch {
    cache = "a";
  }
  return cache!;
}

export function setQualityMode(mode: QualityMode) {
  cache = mode;
  if (typeof window !== "undefined") window.localStorage.setItem(KEY, mode);
  listeners.forEach(l => l());
}

export function subscribeQuality(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function currentQualityOption(): QualityOption {
  const id = getQualityMode();
  return QUALITY_OPTIONS.find(o => o.id === id) ?? QUALITY_OPTIONS[1];
}

const RANK: Record<Grade, number> = { "None": 0, "C": 1, "B": 2, "A": 3, "A+": 4 };

/** Is a given signal grade tradeable under the current setting? */
export function isTradeableGrade(grade: Grade, mode: QualityMode = getQualityMode()): boolean {
  const opt = QUALITY_OPTIONS.find(o => o.id === mode) ?? QUALITY_OPTIONS[1];
  if (opt.analysisOnly) return false;
  return RANK[grade] >= RANK[opt.minGrade];
}
