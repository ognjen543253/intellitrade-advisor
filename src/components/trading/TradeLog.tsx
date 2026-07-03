import { useState } from "react";
import type { Trade } from "@/lib/trading/journal";
import { resolveTrade, deleteTrade } from "@/lib/trading/journal";
import { Pill } from "./Stat";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, Minus, Trash2, X } from "lucide-react";

interface Props { trades: Trade[]; onChange: () => void; }

export function TradeLog({ trades, onChange }: Props) {
  const recent = trades.slice(0, 12);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-border/60 bg-surface">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">Recent Trades</h3>
          <p className="text-[11px] text-muted-foreground">Resolve open trades with your actual win/loss amount.</p>
        </div>
        <span className="font-mono-tab text-[11px] text-muted-foreground">{trades.length} total</span>
      </div>
      {recent.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">No trades yet — log one from the AI signal panel.</p>
      ) : (
        <ul className="divide-y divide-border/50">
          {recent.map(t => {
            const isOpen = openId === t.id;
            return (
              <li key={t.id} className="px-4 py-2.5">
                <div className="flex items-center gap-3">
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
                          {t.pnl >= 0 ? "+" : ""}${t.pnl.toFixed(2)} ({t.rMultiple >= 0 ? "+" : ""}{t.rMultiple}R)
                        </span>
                      )}
                    </div>
                  </div>
                  {t.status === "open" ? (
                    <button
                      onClick={() => setOpenId(isOpen ? null : t.id)}
                      className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground hover:text-foreground">
                      Resolve <ChevronDown className={cn("h-3 w-3 transition", isOpen && "rotate-180")} />
                    </button>
                  ) : (
                    <button onClick={() => { deleteTrade(t.id); onChange(); }}
                      className="rounded-md p-1 text-muted-foreground/60 hover:text-bear" title="Delete">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
                {isOpen && t.status === "open" && (
                  <ResolveForm
                    onSubmit={(outcome, amount) => {
                      resolveTrade(t.id, outcome, amount);
                      setOpenId(null);
                      onChange();
                    }}
                    onCancel={() => setOpenId(null)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ResolveForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (outcome: "win" | "loss" | "breakeven", amount?: number) => void;
  onCancel: () => void;
}) {
  const [outcome, setOutcome] = useState<"win" | "loss" | "breakeven">("win");
  const [amount, setAmount] = useState("");

  const submit = () => {
    const parsed = parseFloat(amount);
    const amt = outcome === "breakeven" ? 0 : Number.isFinite(parsed) ? parsed : undefined;
    onSubmit(outcome, amt);
  };

  return (
    <div className="mt-2 rounded-lg border border-border/60 bg-background/60 p-2">
      <div className="flex items-center gap-1">
        <OutcomeBtn active={outcome === "win"} tone="bull" onClick={() => setOutcome("win")}>
          <Check className="h-3 w-3" /> Won
        </OutcomeBtn>
        <OutcomeBtn active={outcome === "loss"} tone="bear" onClick={() => setOutcome("loss")}>
          <X className="h-3 w-3" /> Lost
        </OutcomeBtn>
        <OutcomeBtn active={outcome === "breakeven"} onClick={() => setOutcome("breakeven")}>
          <Minus className="h-3 w-3" /> B/E
        </OutcomeBtn>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="flex flex-1 items-center gap-1 rounded-md border border-border bg-background px-2">
          <span className="text-[11px] text-muted-foreground">$</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            disabled={outcome === "breakeven"}
            value={outcome === "breakeven" ? "" : amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={outcome === "breakeven" ? "0.00" : "Amount"}
            className="w-full bg-transparent py-1 font-mono-tab text-xs outline-none placeholder:text-muted-foreground/50 disabled:opacity-40"
          />
        </div>
        <button
          onClick={submit}
          className="rounded-md bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground hover:opacity-90">
          Save
        </button>
        <button
          onClick={onCancel}
          className="rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground">
          Cancel
        </button>
      </div>
    </div>
  );
}

function OutcomeBtn({
  children, active, onClick, tone,
}: { children: React.ReactNode; active: boolean; onClick: () => void; tone?: "bull" | "bear" }) {
  return (
    <button
      onClick={onClick}
      className={cn("flex flex-1 items-center justify-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition",
        active
          ? tone === "bull" ? "border-bull bg-bull/15 text-bull"
            : tone === "bear" ? "border-bear bg-bear/15 text-bear"
            : "border-foreground/40 bg-foreground/10 text-foreground"
          : "border-border text-muted-foreground hover:text-foreground")}>
      {children}
    </button>
  );
}
