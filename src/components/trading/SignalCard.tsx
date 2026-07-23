import { Signal } from "@/lib/trading/signals";
import { Pill } from "./Stat";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, Check, X, Clock, Plus, Eye } from "lucide-react";
import { useSyncExternalStore } from "react";
import {
  getQualityMode,
  subscribeQuality,
  isTradeableGrade,
  currentQualityOption,
} from "@/lib/trading/quality-settings";

interface Props {
  signal: Signal;
  digits: number;
  onLogTrade?: (signal: Signal) => void;
}

const gradeTone = (g: Signal["grade"]) =>
  g === "A+" ? "bull" : g === "A" ? "bull" : g === "B" ? "info" : g === "C" ? "warning" : "muted";

export function SignalCard({ signal, digits, onLogTrade }: Props) {
  const mode = useSyncExternalStore(subscribeQuality, getQualityMode, getQualityMode);
  const opt = currentQualityOption();
  const tradeable = signal.side !== "NONE" && isTradeableGrade(signal.grade, mode);
  if (signal.side === "NONE") {
    return (
      <div className="rounded-xl border border-border/60 bg-surface p-5">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold tracking-tight">No Trade Setup</h3>
          <Pill tone="muted">Patience</Pill>
          <Pill tone={gradeTone(signal.grade)}>{signal.grade}</Pill>
          <span className="ml-auto font-mono-tab text-xs text-muted-foreground">
            {signal.probability}% prob
          </span>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Setup: <span className="text-foreground/80 font-medium">{signal.setup}</span>
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{signal.explanation}</p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {signal.checks.slice(0, 9).map((c) => (
            <div key={c.label} className="flex items-center gap-1.5 text-[11px]">
              {c.pass ? <Check className="h-3 w-3 text-bull" /> : <X className="h-3 w-3 text-muted-foreground/60" />}
              <span className={c.pass ? "text-foreground" : "text-muted-foreground"}>{c.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const isBuy = signal.side === "BUY";
  const fmt = (n: number) => n.toFixed(digits);

  return (
    <div className={cn(
      "relative overflow-hidden rounded-xl border bg-surface p-5",
      isBuy ? "border-bull/40 glow-bull" : "border-bear/40 glow-bear",
    )}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px scan-line" />

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className={cn(
              "flex h-9 items-center gap-2 rounded-md px-3 text-sm font-bold tracking-wide",
              isBuy ? "bg-bull text-bull-foreground" : "bg-bear text-bear-foreground",
            )}>
              {isBuy ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
              {signal.side} NOW
            </div>
            <span className="font-mono-tab text-sm font-semibold">{signal.symbol}</span>
            <Pill tone="muted">{signal.timeframe}</Pill>
            <Pill tone={gradeTone(signal.grade)}>Grade {signal.grade}</Pill>
            <Pill tone={signal.strength === "Strong" ? "bull" : signal.strength === "Moderate" ? "warning" : "muted"}>
              {signal.strength}
            </Pill>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Setup: <span className="text-foreground/80 font-medium">{signal.setup}</span>
          </p>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Probability</div>
          <div className={cn("font-mono-tab text-2xl font-bold", isBuy ? "text-bull" : "text-bear")}>
            {signal.probability}%
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Level label="Entry" value={fmt(signal.entry)} />
        <Level label="Stop Loss" value={fmt(signal.stopLoss)} tone="bear" />
        <Level label="TP 1" value={fmt(signal.takeProfit1)} tone="bull" />
        <Level label="TP 2" value={fmt(signal.takeProfit2)} tone="bull" />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 text-[10px]">
        <ExpMetric label="Expected Move" value={fmt(signal.expectedMove)} />
        <ExpMetric label="Trend Strength" value={signal.expectedTrendStrength} />
        <ExpMetric label="Hold ~" value={signal.expectedHoldingLabel} />
        <ExpMetric label="R:R" value={`1:${signal.expectedRiskReward}`} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Pill tone="info">R:R 1:{signal.riskReward}</Pill>
        <Pill tone="muted">ATR {signal.atr.toFixed(digits)}</Pill>
        <Pill tone="muted">RSI {signal.rsi.toFixed(0)}</Pill>
        <Pill tone={isBuy ? "bull" : "bear"}>{signal.trend}</Pill>
        {onLogTrade && tradeable && (
          <button
            onClick={() => onLogTrade(signal)}
            className={cn(
              "ml-auto inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition",
              isBuy ? "bg-bull text-bull-foreground hover:opacity-90" : "bg-bear text-bear-foreground hover:opacity-90",
            )}>
            <Plus className="h-3 w-3" /> Log Trade
          </button>
        )}
        {!tradeable && (
          <Pill tone="muted">
            <Eye className="h-3 w-3" /> Analysis only · {opt.label}
          </Pill>
        )}
      </div>


      <p className="mt-4 rounded-lg border border-border/50 bg-background/40 p-3 text-sm leading-relaxed text-foreground/90">
        {signal.explanation}
      </p>

      <div className="mt-3 rounded-lg border border-info/30 bg-info/5 p-3">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-info">
          AI Summary
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-foreground/90">{signal.aiSummary}</p>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <MiniScore label="Bull" value={signal.bullScore} tone="bull" />
        <MiniScore label="Bear" value={signal.bearScore} tone="bear" />
        <MiniScore label="Quality" value={signal.qualityScore} tone="info" />
      </div>

      <div className="mt-4">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Weighted score breakdown
        </div>
        <div className="mt-2 space-y-1">
          {signal.scoreBreakdown.map((ctr) => (
            <ScoreRow key={ctr.key} ctr={ctr} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Level({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "bull" | "bear" }) {
  return (
    <div className="rounded-lg border border-border/50 bg-background/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("font-mono-tab text-sm font-semibold",
        tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-foreground")}>
        {value}
      </div>
    </div>
  );
}

function ExpMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/40 bg-background/30 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono-tab text-[11px] font-semibold text-foreground/90">{value}</div>
    </div>
  );
}

function MiniScore({ label, value, tone }: { label: string; value: number; tone: "bull" | "bear" | "info" }) {
  const bar = Math.max(0, Math.min(100, value));
  const toneClass = tone === "bull" ? "bg-bull" : tone === "bear" ? "bg-bear" : "bg-info";
  const textTone = tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-info";
  return (
    <div className="rounded-lg border border-border/50 bg-background/40 px-2 py-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className={cn("font-mono-tab text-sm font-semibold", textTone)}>{Math.round(value)}</span>
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-border/60">
        <div className={cn("h-full rounded-full transition-all", toneClass)} style={{ width: `${bar}%` }} />
      </div>
    </div>
  );
}

function ScoreRow({
  ctr,
}: {
  ctr: import("@/lib/trading/signals").ScoreContribution;
}) {
  const pct = ctr.weight ? (ctr.score / ctr.weight) * 100 : 0;
  const magnitude = Math.min(100, Math.abs(pct));
  const isBull = ctr.side === "bull";
  const isBear = ctr.side === "bear";
  const barColor = isBull ? "bg-bull" : isBear ? "bg-bear" : "bg-info";
  const textColor = isBull ? "text-bull" : isBear ? "text-bear" : "text-info";
  return (
    <div className="grid grid-cols-[130px_1fr_auto] items-center gap-2 text-[11px]">
      <span className="truncate text-foreground/90" title={ctr.label}>
        {ctr.label}
      </span>
      <div className="relative h-1.5 w-full rounded-full bg-border/40">
        <div
          className={cn("absolute top-0 h-full rounded-full", barColor, pct < 0 ? "right-1/2" : "left-1/2")}
          style={{ width: `${magnitude / 2}%` }}
        />
        <div className="absolute left-1/2 top-1/2 h-2.5 w-px -translate-y-1/2 bg-border" />
      </div>
      <span className={cn("font-mono-tab tabular-nums", textColor)}>
        {ctr.score >= 0 ? "+" : ""}
        {ctr.score.toFixed(1)}
      </span>
    </div>
  );
}

