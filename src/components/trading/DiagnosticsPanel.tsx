import { useSyncExternalStore } from "react";
import type { Signal } from "@/lib/trading/signals";
import type { Symbol, Timeframe } from "@/lib/trading/market-data";
import {
  subscribeDiagnostics, getDiagnosticsVersion, getBucket, getAllRejections, formatTimeAgo,
} from "@/lib/trading/diagnostics-store";
import { Pill } from "./Stat";
import { cn } from "@/lib/utils";
import { AlertTriangle, Check, X, Clock, Activity } from "lucide-react";

export function DiagnosticsPanel({
  signal, symbol, timeframe,
}: {
  signal: Signal;
  symbol: Symbol;
  timeframe: Timeframe;
}) {
  // Re-render when diagnostics store changes.
  useSyncExternalStore(subscribeDiagnostics, getDiagnosticsVersion, () => 0);
  const bucket = getBucket(symbol, timeframe);
  const rejections = getAllRejections();
  const d = signal.diagnostics;
  const fired = signal.side !== "NONE";

  return (
    <div className="rounded-xl border border-border/60 bg-surface p-4">
      <div className="flex items-center gap-2 flex-wrap">
        <AlertTriangle className={cn("h-4 w-4", fired ? "text-bull" : "text-warning")} />
        <h3 className="text-sm font-semibold">Why {fired ? "This Trade" : "No Trade"}?</h3>
        <Pill tone={fired ? "bull" : "muted"}>{symbol} · {timeframe}</Pill>
        <Pill tone={d.grade === "A+" || d.grade === "A" ? "bull" : d.grade === "B" ? "info" : d.grade === "C" ? "warning" : "muted"}>
          Grade {d.grade}
        </Pill>
        <Pill tone="muted">{d.setup}</Pill>
        <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
          <Clock className="h-3 w-3" /> last valid {formatTimeAgo(bucket.lastValidAt)}
        </span>
      </div>

      <p className="mt-2 text-[12px] leading-relaxed text-foreground/90">
        {fired
          ? `${d.grade}-grade ${d.dominantSide} setup — ${d.setup}. Probability ${d.probability}% (grade C floor ${d.requiredConfidence}%).`
          : d.rejectionReason}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-info">
        → {d.needToPass}
      </p>

      <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
        <Metric label="Probability" value={`${d.probability}%`} sub={`grade ${d.grade}`} good={d.probability >= d.requiredConfidence} />
        <Metric label="Bull Prob" value={`${d.bullProbability}%`} sub="setup-adj" tone="bull" />
        <Metric label="Bear Prob" value={`${d.bearProbability}%`} sub="setup-adj" tone="bear" />
        <Metric label="Bull Raw" value={d.bullScore.toFixed(0)} sub="score" tone="bull" />
        <Metric label="Bear Raw" value={d.bearScore.toFixed(0)} sub="score" tone="bear" />
        <Metric label="Quality" value={`${d.qualityScore.toFixed(0)}%`} sub={`R:R 1:${d.riskRewardEstimate}`} tone="info" />
      </div>

      {(d.topBoosters.length > 0 || d.topReducers.length > 0) && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
          <div className="rounded-md border border-bull/25 bg-bull/5 p-2">
            <div className="uppercase tracking-wider text-bull">Top boosters</div>
            <ul className="mt-1 space-y-0.5">
              {d.topBoosters.map((b) => (
                <li key={b.label} className="flex items-center gap-1.5">
                  <span className="truncate text-foreground/90">{b.label}</span>
                  <span className="ml-auto font-mono-tab text-bull">+{b.delta}</span>
                </li>
              ))}
              {d.topBoosters.length === 0 && <li className="text-muted-foreground">None</li>}
            </ul>
          </div>
          <div className="rounded-md border border-bear/25 bg-bear/5 p-2">
            <div className="uppercase tracking-wider text-bear">Top reducers</div>
            <ul className="mt-1 space-y-0.5">
              {d.topReducers.map((b) => (
                <li key={b.label} className="flex items-center gap-1.5">
                  <span className="truncate text-foreground/90">{b.label}</span>
                  <span className="ml-auto font-mono-tab text-bear">{b.delta}</span>
                </li>
              ))}
              {d.topReducers.length === 0 && <li className="text-muted-foreground">None</li>}
            </ul>
          </div>
        </div>
      )}

      <div className="mt-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Filter status</div>
        <div className="mt-1.5 space-y-1">
          {d.filters.map((f) => {
            const isBlocker = !fired && d.blockingFilter?.key === f.key;
            return (
              <div
                key={f.key}
                className={cn(
                  "grid grid-cols-[16px_1fr_auto] items-center gap-2 rounded-md border px-2 py-1.5 text-[11px]",
                  f.pass
                    ? "border-bull/25 bg-bull/5"
                    : isBlocker
                      ? "border-bear/40 bg-bear/5"
                      : "border-border/50 bg-background/40",
                )}
                title={f.detail}
              >
                {f.pass ? <Check className="h-3 w-3 text-bull" /> : <X className="h-3 w-3 text-bear" />}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-medium text-foreground/90">{f.label}</span>
                    {isBlocker && <Pill tone="bear">Blocker</Pill>}
                  </div>
                  <div className="mt-0.5 h-1 w-full rounded-full bg-border/40">
                    <div
                      className={cn("h-full rounded-full", f.pass ? "bg-bull" : "bg-warning")}
                      style={{ width: `${Math.round(f.progress * 100)}%` }}
                    />
                  </div>
                </div>
                <span className="font-mono-tab tabular-nums text-muted-foreground">
                  {f.actual}{f.unit ?? ""} / {f.required}{f.unit ?? ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {!fired && d.closestToPassing.length > 0 && (
        <div className="mt-3 rounded-lg border border-info/25 bg-info/5 p-2">
          <div className="text-[10px] uppercase tracking-wider text-info">Closest to passing</div>
          <ul className="mt-1 space-y-0.5 text-[11px]">
            {d.closestToPassing.map((f) => (
              <li key={f.key} className="flex items-center gap-2">
                <span className="text-foreground/90">{f.label}</span>
                <span className="ml-auto font-mono-tab text-muted-foreground">
                  {Math.round(f.progress * 100)}% there
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ConfidenceSpark history={bucket.history} required={d.requiredConfidence} />

      {rejections.length > 0 && (
        <div className="mt-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Activity className="h-3 w-3" /> Recent rejected setups
          </div>
          <div className="mt-1.5 max-h-40 space-y-1 overflow-y-auto pr-1">
            {rejections.slice(0, 10).map((r) => (
              <div key={r.id} className="rounded-md border border-border/50 bg-background/40 px-2 py-1 text-[10px]">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono-tab font-semibold">{r.symbol}</span>
                  <Pill tone="muted">{r.timeframe}</Pill>
                  <span className={cn("font-semibold", r.dominant === "BUY" ? "text-bull" : "text-bear")}>{r.dominant}</span>
                  <span className="ml-auto text-muted-foreground">{formatTimeAgo(r.t)}</span>
                </div>
                <div className="mt-0.5 truncate text-muted-foreground" title={r.reason}>
                  {r.blockingFilter ?? "Blocked"} · conf {r.confidence}/{r.requiredConfidence}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({
  label, value, sub, good, tone,
}: {
  label: string;
  value: string;
  sub?: string;
  good?: boolean;
  tone?: "bull" | "bear" | "info";
}) {
  const color =
    tone === "bull" ? "text-bull"
      : tone === "bear" ? "text-bear"
      : tone === "info" ? "text-info"
      : good === true ? "text-bull"
      : good === false ? "text-bear"
      : "text-foreground";
  return (
    <div className="rounded-md border border-border/50 bg-background/40 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("font-mono-tab text-sm font-semibold", color)}>{value}</div>
      {sub && <div className="text-[9px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function ConfidenceSpark({
  history, required,
}: {
  history: { t: number; confidence: number }[];
  required: number;
}) {
  if (history.length < 2) {
    return (
      <div className="mt-3 rounded-md border border-border/50 bg-background/40 px-2 py-2 text-[10px] text-muted-foreground">
        Confidence history builds up as the bot scans. Come back in a few minutes.
      </div>
    );
  }
  const w = 320;
  const h = 48;
  const now = Date.now();
  const start = now - 24 * 60 * 60 * 1000;
  const points = history.filter((p) => p.t >= start);
  const xs = (t: number) => ((t - start) / (now - start)) * w;
  const ys = (c: number) => h - (Math.max(0, Math.min(100, c)) / 100) * h;
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${xs(p.t).toFixed(1)},${ys(p.confidence).toFixed(1)}`).join(" ");
  const reqY = ys(required);
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>Confidence · last 24h</span>
        <span className="font-mono-tab">{points.length} samples</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="mt-1 h-12 w-full">
        <line x1={0} x2={w} y1={reqY} y2={reqY} stroke="hsl(var(--warning))" strokeDasharray="3 3" strokeOpacity={0.6} />
        <path d={path} fill="none" stroke="hsl(var(--info))" strokeWidth={1.5} />
      </svg>
    </div>
  );
}
