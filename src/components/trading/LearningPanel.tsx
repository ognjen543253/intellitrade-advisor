import { useMemo, useState, useEffect } from "react";
import type { Trade } from "@/lib/trading/journal";
import { learningInsights, performanceStats } from "@/lib/trading/journal";
import { Brain, Globe, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Pill } from "./Stat";

interface Props { trades: Trade[]; }

const KNOWLEDGE_FEED: { time: string; source: string; headline: string; tone: "bull" | "bear" | "info" | "warning" }[] = [
  { time: "just now", source: "Fed Watch", headline: "Rate expectations steady; USD momentum cools into London open.", tone: "info" },
  { time: "5m", source: "NAS100 Flow", headline: "Mega-cap tech leading; breadth improving above prior session VWAP.", tone: "bull" },
  { time: "12m", source: "SPX500 Options", headline: "Gamma flip near 5,860 — chop expected below, trend above.", tone: "warning" },
  { time: "24m", source: "EURUSD News", headline: "ECB speaker leans dovish; watch 1.0820 support on pullback.", tone: "bear" },
  { time: "41m", source: "Risk Sentiment", headline: "VIX easing, DXY rangebound — risk-on tilt intraday.", tone: "bull" },
  { time: "1h", source: "Economic Calendar", headline: "US CPI in 2 days — AI will suppress signals 30 min pre-release.", tone: "warning" },
];

export function LearningPanel({ trades }: Props) {
  const insights = useMemo(() => learningInsights(trades), [trades]);
  const stats = useMemo(() => performanceStats(trades), [trades]);
  const [tab, setTab] = useState<"learning" | "feed">("learning");
  const [pulse, setPulse] = useState(0);

  // Simulate periodic "internet learning" refresh
  useEffect(() => {
    const id = setInterval(() => setPulse(p => p + 1), 12000);
    return () => clearInterval(id);
  }, []);

  const buckets = Object.entries(insights.byConfidenceBucket)
    .map(([k, v]) => ({ bucket: k, ...v, winRate: v.total ? Math.round((v.wins / v.total) * 100) : 0 }));

  return (
    <div className="rounded-xl border border-border/60 bg-surface p-4">
      <div className="flex items-center gap-2">
        <Brain className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold tracking-tight">AI Learning Engine</h3>
        <Pill tone="bull"><span className="h-1.5 w-1.5 rounded-full bg-bull ticker-pulse" /> Adapting</Pill>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        The AI recalibrates confidence weights from every closed trade and cross-references live market context.
      </p>

      <div className="mt-3 flex items-center gap-1 rounded-lg border border-border bg-background/40 p-1">
        <TabBtn active={tab === "learning"} onClick={() => setTab("learning")} icon={<Sparkles className="h-3 w-3" />}>From Your Trades</TabBtn>
        <TabBtn active={tab === "feed"} onClick={() => setTab("feed")} icon={<Globe className="h-3 w-3" />}>From the Internet</TabBtn>
      </div>

      {tab === "learning" ? (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <Kpi label="Expectancy" value={`${stats.expectancyR >= 0 ? "+" : ""}${stats.expectancyR}R`} tone={stats.expectancyR >= 0 ? "bull" : "bear"} />
            <Kpi label="Total P&L" value={`${stats.totalPnl >= 0 ? "+" : ""}$${stats.totalPnl}`} tone={stats.totalPnl >= 0 ? "bull" : "bear"} />
            <Kpi label="Sample" value={`${stats.total}`} />
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Win rate by confidence bucket</div>
            <div className="mt-1.5 space-y-1.5">
              {buckets.map(b => (
                <div key={b.bucket} className="flex items-center gap-2">
                  <span className="w-14 font-mono-tab text-[11px] text-muted-foreground">{b.bucket}%</span>
                  <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-background/60">
                    <div
                      className={cn("h-full rounded-full",
                        b.winRate >= 60 ? "bg-bull" : b.winRate >= 45 ? "bg-warning" : "bg-bear")}
                      style={{ width: `${Math.min(100, b.winRate)}%` }}
                    />
                  </div>
                  <span className="w-14 text-right font-mono-tab text-[11px]">
                    {b.total ? `${b.winRate}%` : "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Instrument bias</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {insights.bestSymbol && (
                <Pill tone="bull">↑ {insights.bestSymbol[0]} +${insights.bestSymbol[1].pnl.toFixed(0)}</Pill>
              )}
              {insights.worstSymbol && insights.worstSymbol[0] !== insights.bestSymbol?.[0] && (
                <Pill tone="bear">↓ {insights.worstSymbol[0]} ${insights.worstSymbol[1].pnl.toFixed(0)}</Pill>
              )}
              <Pill tone={insights.bySide.BUY.wins > insights.bySide.SELL.wins ? "bull" : "bear"}>
                Longs {insights.bySide.BUY.wins}W · Shorts {insights.bySide.SELL.wins}W
              </Pill>
            </div>
          </div>

          <p className="rounded-lg border border-border/50 bg-background/40 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
            Adaptive rule: setups matching your <span className="text-bull">best-performing bucket</span> get a
            confidence boost; setups in your losing bucket are suppressed until fresh data proves otherwise.
          </p>
        </div>
      ) : (
        <div className="mt-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Live knowledge feed</span>
            <span key={pulse} className="text-[10px] text-bull">● syncing…</span>
          </div>
          <ul className="space-y-2">
            {KNOWLEDGE_FEED.map((f, i) => (
              <li key={i} className="rounded-lg border border-border/50 bg-background/40 p-2.5">
                <div className="flex items-center gap-2">
                  <Pill tone={f.tone}>{f.source}</Pill>
                  <span className="ml-auto font-mono-tab text-[10px] text-muted-foreground">{f.time}</span>
                </div>
                <p className="mt-1 text-[12px] leading-snug text-foreground/90">{f.headline}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
            To pull real headlines, sentiment and economic-calendar data, enable Lovable Cloud and connect a news
            provider — the AI will then weight signals against live macro context.
          </p>
        </div>
      )}
    </div>
  );
}

function TabBtn({ active, onClick, children, icon }: { active: boolean; onClick: () => void; children: React.ReactNode; icon: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium transition",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
      {icon}{children}
    </button>
  );
}

function Kpi({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "bull" | "bear" }) {
  return (
    <div className="rounded-lg border border-border/50 bg-background/40 px-2.5 py-2">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("font-mono-tab text-sm font-semibold",
        tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-foreground")}>
        {value}
      </div>
    </div>
  );
}
