export type NotifyEvent =
  | "signal"
  | "tradeOpen"
  | "tradeClose"
  | "tpHit"
  | "slHit"
  | "breakEven"
  | "trailUpdate"
  | "dailyTarget"
  | "dailyLoss"
  | "error";

export interface NotifySettings {
  enabled: boolean;
  dailyTarget: number; // $
  dailyLossLimit: number; // $ positive
  events: Record<NotifyEvent, boolean>;
}

export const EVENT_LABELS: Record<NotifyEvent, string> = {
  signal: "New BUY/SELL Signal",
  tradeOpen: "Trade Opened",
  tradeClose: "Trade Closed",
  tpHit: "Take Profit Hit",
  slHit: "Stop Loss Hit",
  breakEven: "Break-Even Activated",
  trailUpdate: "Trailing Stop Updated",
  dailyTarget: "Daily Profit Target Hit",
  dailyLoss: "Daily Loss Limit Hit",
  error: "Critical Errors",
};

const KEY = "sentinel:notify:v1";

export const DEFAULTS: NotifySettings = {
  enabled: true,
  dailyTarget: 300,
  dailyLossLimit: 200,
  events: {
    signal: true,
    tradeOpen: true,
    tradeClose: true,
    tpHit: true,
    slHit: true,
    breakEven: true,
    trailUpdate: true,
    dailyTarget: true,
    dailyLoss: true,
    error: true,
  },
};

const listeners = new Set<() => void>();
let cache: NotifySettings | null = null;

export function getSettings(): NotifySettings {
  if (cache) return cache;
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(KEY);
    cache = raw ? { ...DEFAULTS, ...JSON.parse(raw), events: { ...DEFAULTS.events, ...(JSON.parse(raw).events ?? {}) } } : { ...DEFAULTS };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache!;
}

export function saveSettings(next: NotifySettings) {
  cache = next;
  if (typeof window !== "undefined") window.localStorage.setItem(KEY, JSON.stringify(next));
  listeners.forEach((l) => l());
}

export function subscribeSettings(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function shouldSend(event: NotifyEvent): boolean {
  const s = getSettings();
  return s.enabled && s.events[event];
}
