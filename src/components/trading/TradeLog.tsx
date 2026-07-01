import type { Trade } from "@/lib/trading/journal";
import { resolveTrade, deleteTrade } from "@/lib/trading/journal";
import { Pill } from "./Stat";
import { cn } from "@/lib/utils";
import { Check, Minus, Trash2, X } from "lucide-react";

interface Props { trades: Trade[]; onChange: () => void; }

export function TradeLog({ trades, onChange }: Props) {
  const recent = trades.slice(0, 12);
  return (
    <div className="rounded-xl border border-border/60 bg-surface">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">Recent Trades</h3>
          <p className="text-[11px] text-muted-foreground">Manually resolve open trades to feed the learning engine.</p>
        </div>
        <span className="font-mono-tab text-[11px] text-muted-foreground">{trades.length} total</span>
      </div>
      {recent.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">No trades yet — log one from the AI signal panel.</p>
      ) : (
        <ul className="divide-y divide-border/50">
          {recent.map(t => (
            <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className={cn("h-2 w-2 shrink-0 rounded-full",
                t.status === "win" ? "bg-bull" : t.status === "loss" ? "bg-bear" : t.status === "breakeven" ? "bg-muted-foreground" : "bg-warning ticker-pulse")} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono-tab text-xs font-semibold">{t.symbol}</span>
                  <Pill tone={t.side === "BUY" ? "bull" : "bear"}>{t.side}</Pill>
                  <span className="text-[10px] text-muted-foreground">{t.timeframe}</span>
                  <span className="ml-auto font-mono-tab text-[10px] text-muted-foreground">
                    {new Date(t.openedAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>Conf {t.confidence}%</span>
                  {t.status !== "open" && (
                    <span className={cn("font-mono-tab", t.pnl >= 0 ? "text-bull" : t.pnl < 0 ? "text-bear" : "")}>
                      {t.pnl >= 0 ? "+" : ""}${t.pnl.toFixed(0)} ({t.rMultiple >= 0 ? "+" : ""}{t.rMultiple}R)
                    </span>
                  )}
                </div>
              </div>
              {t.status === "open" ? (
                <div className="flex items-center gap-1">
                  <IconBtn tone="bull" onClick={() => { resolveTrade(t.id, "win"); onChange(); }} title="Mark win"><Check className="h-3 w-3" /></IconBtn>
                  <IconBtn tone="bear" onClick={() => { resolveTrade(t.id, "loss"); onChange(); }} title="Mark loss"><X className="h-3 w-3" /></IconBtn>
                  <IconBtn onClick={() => { resolveTrade(t.id, "breakeven"); onChange(); }} title="Break even"><Minus className="h-3 w-3" /></IconBtn>
                </div>
              ) : (
                <button onClick={() => { deleteTrade(t.id); onChange(); }}
                  className="rounded-md p-1 text-muted-foreground/60 hover:text-bear" title="Delete">
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function IconBtn({ children, onClick, tone, title }: { children: React.ReactNode; onClick: () => void; tone?: "bull" | "bear"; title: string }) {
  return (
    <button onClick={onClick} title={title}
      className={cn("rounded-md border border-border p-1 transition",
        tone === "bull" ? "hover:border-bull hover:bg-bull/10 hover:text-bull" :
        tone === "bear" ? "hover:border-bear hover:bg-bear/10 hover:text-bear" :
        "hover:border-muted-foreground hover:text-foreground")}>
      {children}
    </button>
  );
}
