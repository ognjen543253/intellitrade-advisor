import { Signal } from "@/lib/trading/signals";
import { Pill } from "./Stat";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, Check, X, Clock } from "lucide-react";

interface Props {
  signal: Signal;
  digits: number;
}

export function SignalCard({ signal, digits }: Props) {
  if (signal.side === "NONE") {
    return (
      <div className="rounded-xl border border-border/60 bg-surface p-5">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold tracking-tight">No Trade Setup</h3>
          <Pill tone="muted">Patience</Pill>
        </div>
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
            <Pill tone={signal.strength === "Strong" ? "bull" : signal.strength === "Moderate" ? "warning" : "muted"}>
              {signal.strength}
            </Pill>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Confidence</div>
          <div className={cn("font-mono-tab text-2xl font-bold", isBuy ? "text-bull" : "text-bear")}>
            {signal.confidence}%
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Level label="Entry" value={fmt(signal.entry)} />
        <Level label="Stop Loss" value={fmt(signal.stopLoss)} tone="bear" />
        <Level label="TP 1" value={fmt(signal.takeProfit1)} tone="bull" />
        <Level label="TP 2" value={fmt(signal.takeProfit2)} tone="bull" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Pill tone="info">R:R 1:{signal.riskReward}</Pill>
        <Pill tone="muted">ATR {signal.atr.toFixed(digits)}</Pill>
        <Pill tone="muted">RSI {signal.rsi.toFixed(0)}</Pill>
        <Pill tone={isBuy ? "bull" : "bear"}>{signal.trend}</Pill>
      </div>

      <p className="mt-4 rounded-lg border border-border/50 bg-background/40 p-3 text-sm leading-relaxed text-foreground/90">
        {signal.explanation}
      </p>

      <div className="mt-4">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Confluence checklist</div>
        <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-3">
          {signal.checks.map((c) => (
            <div key={c.label} className="flex items-center gap-1.5 text-[11px]">
              {c.pass
                ? <Check className={cn("h-3 w-3", isBuy ? "text-bull" : "text-bear")} />
                : <X className="h-3 w-3 text-muted-foreground/50" />}
              <span className={c.pass ? "text-foreground" : "text-muted-foreground/60"}>{c.label}</span>
            </div>
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
