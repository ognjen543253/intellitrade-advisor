import { useMemo, useState } from "react";
import { dailyPnl, type Trade } from "@/lib/trading/journal";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  trades: Trade[];
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["M", "T", "W", "T", "F", "S", "S"];

export function YearCalendar({ trades }: Props) {
  const [year, setYear] = useState(new Date().getFullYear());
  const map = useMemo(() => dailyPnl(trades), [trades]);
  const [hover, setHover] = useState<{ key: string; x: number; y: number } | null>(null);

  const yearStats = useMemo(() => {
    let pnl = 0, wins = 0, losses = 0, days = 0;
    for (const [k, v] of Object.entries(map)) {
      if (!k.startsWith(String(year))) continue;
      pnl += v.pnl; wins += v.wins; losses += v.losses;
      if (v.count > 0) days += 1;
    }
    return { pnl, wins, losses, days };
  }, [map, year]);

  return (
    <div className="rounded-xl border border-border/60 bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <button onClick={() => setYear(y => y - 1)} className="rounded-md border border-border p-1 text-muted-foreground hover:text-foreground">
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <h3 className="font-mono-tab text-sm font-semibold tracking-tight">{year}</h3>
            <button onClick={() => setYear(y => y + 1)} className="rounded-md border border-border p-1 text-muted-foreground hover:text-foreground">
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Trading calendar · green = profit, red = loss</p>
        </div>
        <div className="flex items-center gap-3 text-right">
          <Metric label="Year P&L" value={`${yearStats.pnl >= 0 ? "+" : ""}$${yearStats.pnl.toFixed(0)}`} tone={yearStats.pnl >= 0 ? "bull" : "bear"} />
          <Metric label="Active Days" value={String(yearStats.days)} />
          <Metric label="W / L" value={`${yearStats.wins}/${yearStats.losses}`} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {MONTH_NAMES.map((m, mi) => (
          <MonthGrid key={m} year={year} month={mi} label={m} map={map} onHover={setHover} />
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3 text-[10px] text-muted-foreground">
        <span>Less</span>
        <div className="flex items-center gap-1">
          <Swatch className="bg-bear/80" />
          <Swatch className="bg-bear/50" />
          <Swatch className="bg-muted" />
          <Swatch className="bg-bull/50" />
          <Swatch className="bg-bull/80" />
        </div>
        <span>More</span>
        <span className="ml-auto">Hover a day for details</span>
      </div>

      {hover && (
        <DayTooltip data={map[hover.key]} dateKey={hover.key} />
      )}
    </div>
  );
}

function MonthGrid({ year, month, label, map, onHover }: {
  year: number; month: number; label: string;
  map: Record<string, { pnl: number; count: number; wins: number; losses: number }>;
  onHover: (h: { key: string; x: number; y: number } | null) => void;
}) {
  const first = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0).getDate();
  // Monday-first offset
  const offset = (first.getDay() + 6) % 7;
  const cells: { key: string; day: number | null }[] = [];
  for (let i = 0; i < offset; i++) cells.push({ key: `pad-${i}`, day: null });
  for (let d = 1; d <= lastDay; d++) {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ key, day: d });
  }
  while (cells.length % 7 !== 0) cells.push({ key: `end-${cells.length}`, day: null });

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-foreground">{label}</span>
      </div>
      <div className="grid grid-cols-7 gap-[3px]">
        {DOW.map((d, i) => (
          <span key={i} className="text-center text-[8px] text-muted-foreground/60">{d}</span>
        ))}
        {cells.map((c) => {
          if (c.day == null) return <span key={c.key} className="aspect-square" />;
          const data = map[c.key];
          return (
            <button
              key={c.key}
              onMouseEnter={(e) => onHover({ key: c.key, x: e.clientX, y: e.clientY })}
              onMouseLeave={() => onHover(null)}
              className={cn(
                "group relative aspect-square rounded-[3px] border border-transparent text-[8px] font-mono-tab transition",
                dayClass(data?.pnl),
                data && data.count > 0 && "hover:border-foreground/50",
              )}
              aria-label={`${c.key} P&L ${data ? data.pnl : 0}`}
            >
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-90">
                {c.day}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function dayClass(pnl?: number) {
  if (pnl == null) return "bg-background/60";
  if (pnl >= 200) return "bg-bull text-bull-foreground";
  if (pnl > 0) return "bg-bull/55 text-bull-foreground";
  if (pnl === 0) return "bg-muted";
  if (pnl > -200) return "bg-bear/55 text-bear-foreground";
  return "bg-bear text-bear-foreground";
}

function Metric({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "bull" | "bear" }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("font-mono-tab text-sm font-semibold",
        tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-foreground")}>
        {value}
      </div>
    </div>
  );
}

function Swatch({ className }: { className: string }) {
  return <span className={cn("h-2.5 w-2.5 rounded-[2px]", className)} />;
}

function DayTooltip({ data, dateKey }: { data?: { pnl: number; count: number; wins: number; losses: number }; dateKey: string }) {
  if (!data) return null;
  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-40 rounded-lg border border-border bg-popover px-3 py-2 shadow-xl">
      <div className="font-mono-tab text-[11px] text-muted-foreground">{dateKey}</div>
      <div className={cn("font-mono-tab text-sm font-semibold", data.pnl >= 0 ? "text-bull" : "text-bear")}>
        {data.pnl >= 0 ? "+" : ""}${data.pnl.toFixed(2)}
      </div>
      <div className="text-[11px] text-muted-foreground">
        {data.count} trades · {data.wins}W / {data.losses}L
      </div>
    </div>
  );
}
