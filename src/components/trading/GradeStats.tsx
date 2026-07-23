import { useMemo } from "react";
import { Award } from "lucide-react";
import { statsByGrade, type Trade } from "@/lib/trading/journal";
import { cn } from "@/lib/utils";

export function GradeStats({ trades }: { trades: Trade[] }) {
  const rows = useMemo(() => statsByGrade(trades), [trades]);
  return (
    <div className="rounded-xl border border-border/60 bg-surface p-4">
      <div className="flex items-center gap-2">
        <Award className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Performance by Grade</h3>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Historical results grouped by the grade of the signal at entry — use this to decide which tiers are worth trading.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr className="border-b border-border/50">
              <th className="py-1.5 text-left font-medium">Grade</th>
              <th className="py-1.5 text-right font-medium">Trades</th>
              <th className="py-1.5 text-right font-medium">Win %</th>
              <th className="py-1.5 text-right font-medium">PF</th>
              <th className="py-1.5 text-right font-medium">Avg R</th>
              <th className="py-1.5 text-right font-medium">P&L</th>
              <th className="py-1.5 text-right font-medium">Max DD</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const tone =
                r.grade === "A+" || r.grade === "A" ? "text-bull"
                : r.grade === "B" ? "text-info"
                : "text-muted-foreground";
              return (
                <tr key={r.grade} className="border-b border-border/30 last:border-0">
                  <td className={cn("py-1.5 font-mono-tab font-bold", tone)}>{r.grade}</td>
                  <td className="py-1.5 text-right font-mono-tab">{r.total}</td>
                  <td className="py-1.5 text-right font-mono-tab">{r.total ? `${r.winRate}%` : "—"}</td>
                  <td className="py-1.5 text-right font-mono-tab">{r.total ? r.profitFactor.toFixed(2) : "—"}</td>
                  <td className={cn("py-1.5 text-right font-mono-tab", r.avgR >= 0 ? "text-bull" : "text-bear")}>
                    {r.total ? `${r.avgR >= 0 ? "+" : ""}${r.avgR}R` : "—"}
                  </td>
                  <td className={cn("py-1.5 text-right font-mono-tab", r.totalPnl >= 0 ? "text-bull" : "text-bear")}>
                    {r.total ? `${r.totalPnl >= 0 ? "+" : ""}$${r.totalPnl.toFixed(0)}` : "—"}
                  </td>
                  <td className="py-1.5 text-right font-mono-tab text-bear">
                    {r.total ? `-$${r.maxDrawdown.toFixed(0)}` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
