import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { TradingChart } from "@/components/trading/TradingChart";
import { SignalCard } from "@/components/trading/SignalCard";
import { Pill, Stat } from "@/components/trading/Stat";
import { YearCalendar } from "@/components/trading/YearCalendar";
import { LearningPanel } from "@/components/trading/LearningPanel";
import { TradeLog } from "@/components/trading/TradeLog";
import {
  SYMBOLS, TIMEFRAMES, generateCandles, tickCandle,
  type Symbol, type Timeframe, type Candle,
} from "@/lib/trading/market-data";
import { analyzeMarket, generateSignal, positionSize, type Signal } from "@/lib/trading/signals";
import {
  getTrades, logTradeFromSignal, seedIfEmpty, subscribeTrades, performanceStats,
} from "@/lib/trading/journal";
import { Activity, Bell, BellOff, Bot, CalendarDays, ChevronDown, Radio, Shield, TrendingUp, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sentinel AI — Forex, SPX500 & NAS100 Trading Assistant" },
      { name: "description", content: "AI-powered trading assistant that watches Forex, SPX500 and NAS100 in real time and only signals high-probability, 1:2+ R:R setups." },
      { property: "og:title", content: "Sentinel AI — High-Probability Trading Signals" },
      { property: "og:description", content: "Real-time AI market analysis across Forex, SPX500 and NAS100. Quality over quantity." },
    ],
  }),
  component: TradingDashboard,
});

function TradingDashboard() {
  const [symbol, setSymbol] = useState<Symbol>("NAS100");
  const [timeframe, setTimeframe] = useState<Timeframe>("15m");
  const [accountBalance] = useState(10000);
  const [riskPct, setRiskPct] = useState<1 | 2>(1);
  const [alertsOn, setAlertsOn] = useState(true);

  const meta = SYMBOLS.find(s => s.id === symbol)!;
  const [candles, setCandles] = useState<Candle[]>(() => generateCandles(symbol, timeframe));

  // Regenerate on symbol / timeframe change
  useEffect(() => {
    setCandles(generateCandles(symbol, timeframe));
  }, [symbol, timeframe]);

  // Live tick simulation
  useEffect(() => {
    const id = setInterval(() => {
      setCandles(prev => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        const updated = tickCandle(last, symbol);
        return [...prev.slice(0, -1), updated];
      });
    }, 1500);
    return () => clearInterval(id);
  }, [symbol]);

  const analysis = useMemo(() => analyzeMarket(candles, symbol), [candles, symbol]);
  const signal = useMemo(() => generateSignal(candles, symbol, timeframe), [candles, symbol, timeframe]);
  const sizing = useMemo(
    () => positionSize(accountBalance, riskPct, signal.entry, signal.stopLoss, meta.group === "Forex" ? 10 : 1),
    [accountBalance, riskPct, signal, meta.group],
  );

  const lastPrice = candles[candles.length - 1]?.close ?? 0;
  const prevPrice = candles[candles.length - 2]?.close ?? lastPrice;
  const priceUp = lastPrice >= prevPrice;
  const change = lastPrice - candles[Math.max(0, candles.length - 96)].close;
  const changePct = (change / lastPrice) * 100;

  // Trade journal (persistent, powers learning + calendar)
  useEffect(() => { seedIfEmpty(); }, []);
  const trades = useSyncExternalStore(subscribeTrades, getTrades, () => []);
  const stats = useMemo(() => performanceStats(trades), [trades]);
  const symbolTrades = useMemo(() => trades.filter(t => t.symbol === symbol), [trades, symbol]);
  const symbolStats = useMemo(() => performanceStats(symbolTrades), [symbolTrades]);

  const handleLogTrade = (sig: Signal) => {
    if (sig.side === "NONE") return;
    logTradeFromSignal(sig, sizing.riskAmount || 100);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header alertsOn={alertsOn} onToggleAlerts={() => setAlertsOn(v => !v)} />

      <div className="mx-auto max-w-[1600px] px-4 py-4 lg:px-6">
        {/* Top bar: symbol + timeframe + price */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-surface px-4 py-3">
          <SymbolPicker value={symbol} onChange={setSymbol} />
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right">
              <div className="font-mono-tab text-2xl font-bold tracking-tight">
                {lastPrice.toFixed(meta.digits)}
              </div>
              <div className={cn("font-mono-tab text-xs", priceUp ? "text-bull" : "text-bear")}>
                {change >= 0 ? "+" : ""}{change.toFixed(meta.digits)} ({changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%)
              </div>
            </div>
            <div className="flex h-2 w-2 items-center justify-center">
              <span className={cn("h-2 w-2 rounded-full ticker-pulse", priceUp ? "bg-bull" : "bg-bear")} />
            </div>
          </div>
          <div className="basis-full" />
          <TimeframePicker value={timeframe} onChange={setTimeframe} />
          <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
            <Wifi className="h-3 w-3 text-bull" /> Live simulated feed · {analysis.sessionTag} session
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
          {/* Left: chart + dashboard */}
          <div className="flex min-w-0 flex-col gap-4">
            <div className="relative h-[460px] overflow-hidden rounded-xl border border-border/60 bg-surface p-2 lg:h-[560px]">
              <ChartLegend symbol={symbol} timeframe={timeframe} />
              <TradingChart
                candles={candles}
                digits={meta.digits}
                support={analysis.support}
                resistance={analysis.resistance}
                entry={signal.side !== "NONE" ? signal.entry : undefined}
                stopLoss={signal.side !== "NONE" ? signal.stopLoss : undefined}
                takeProfit1={signal.side !== "NONE" ? signal.takeProfit1 : undefined}
                takeProfit2={signal.side !== "NONE" ? signal.takeProfit2 : undefined}
              />
            </div>

            {/* Market dashboard */}
            <section>
              <SectionHeader icon={<Activity className="h-4 w-4" />} title="Market Analysis" sub="Live read across structure, momentum and volatility" />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                <Stat label="Trend" value={analysis.trend} tone={analysis.trend === "Bullish" ? "bull" : analysis.trend === "Bearish" ? "bear" : "default"} />
                <Stat label="Status" value={analysis.status} tone={analysis.status === "Breakout" ? "warning" : "info"} />
                <Stat label="Momentum" value={analysis.momentum} />
                <Stat label="Volatility" value={analysis.volatility} tone={analysis.volatility === "High" ? "warning" : analysis.volatility === "Low" ? "muted" as never : "default"} />
                <Stat label="ATR" value={analysis.atr.toFixed(meta.digits)} />
                <Stat label="Spread" value={analysis.spread.toFixed(meta.digits)} />
                <Stat label="RSI (14)" value={analysis.rsi.toFixed(0)} tone={analysis.rsi > 70 || analysis.rsi < 30 ? "warning" : "default"} />
                <Stat label="MACD" value={analysis.macdState} tone={analysis.macdState.includes("Bullish") ? "bull" : analysis.macdState.includes("Bearish") ? "bear" : "default"} />
                <Stat label="Support" value={analysis.support.toFixed(meta.digits)} tone="info" />
                <Stat label="Resistance" value={analysis.resistance.toFixed(meta.digits)} tone="warning" />
                <Stat label="Signal Strength" value={`${Math.round(analysis.signalStrength)}%`} tone={analysis.signalStrength > 65 ? "bull" : "default"} />
                <Stat label="Session" value={analysis.sessionTag} />
              </div>
            </section>

            {/* Risk management */}
            <section>
              <SectionHeader icon={<Shield className="h-4 w-4" />} title="Risk Management" sub="Position sizing, stop distance and 1:2 minimum R:R enforced" />
              <div className="rounded-xl border border-border/60 bg-surface p-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Account</div>
                    <div className="font-mono-tab text-lg font-semibold">${accountBalance.toLocaleString()}</div>
                  </div>
                  <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-1">
                    {[1, 2].map(v => (
                      <button key={v}
                        onClick={() => setRiskPct(v as 1 | 2)}
                        className={cn("rounded-md px-3 py-1 text-xs font-medium",
                          riskPct === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                        {v}% Risk
                      </button>
                    ))}
                  </div>
                  <div className="ml-auto grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Stat label="Risk $" value={`$${sizing.riskAmount.toFixed(2)}`} />
                    <Stat label="Lot Size" value={sizing.lots.toFixed(2)} />
                    <Stat label="Stop Distance" value={Math.abs(signal.entry - signal.stopLoss).toFixed(meta.digits)} tone="bear" />
                    <Stat label="Reward (TP2)" value={`$${(sizing.riskAmount * 3.2).toFixed(2)}`} tone="bull" />
                  </div>
                </div>
              </div>
            </section>

            {/* Performance for current instrument */}
            <section>
              <SectionHeader icon={<TrendingUp className="h-4 w-4" />} title="Performance" sub={`Closed trades on ${meta.label}`} />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                <Stat label="Win Rate" value={`${symbolStats.winRate}%`} tone={symbolStats.winRate > 55 ? "bull" : "default"} />
                <Stat label="Profit Factor" value={symbolStats.profitFactor.toFixed(2)} tone={symbolStats.profitFactor >= 1.5 ? "bull" : "default"} />
                <Stat label="Trades" value={String(symbolStats.total)} />
                <Stat label="Avg Win" value={`+$${symbolStats.avgWin}`} tone="bull" />
                <Stat label="Avg Loss" value={`-$${symbolStats.avgLoss}`} tone="bear" />
                <Stat label="Expectancy" value={`${symbolStats.expectancyR >= 0 ? "+" : ""}${symbolStats.expectancyR}R`} tone={symbolStats.expectancyR >= 0 ? "bull" : "bear"} />
              </div>
            </section>

            {/* Trading calendar */}
            <section>
              <SectionHeader icon={<CalendarDays className="h-4 w-4" />} title="Trading Calendar" sub="All logged trades — green = profitable day, red = losing day" />
              <YearCalendar trades={trades} />
            </section>

            {/* Trade log */}
            <section>
              <TradeLog trades={trades} onChange={() => { /* store publishes */ }} />
            </section>
          </div>

          {/* Right column */}
          <aside className="flex flex-col gap-4">
            <div>
              <SectionHeader icon={<Bot className="h-4 w-4" />} title="AI Signal" sub={`${meta.label} · ${timeframe} · Quality over quantity`} />
              <SignalCard signal={signal} digits={meta.digits} onLogTrade={handleLogTrade} />
            </div>

            <LearningPanel trades={trades} />

            <div className="rounded-xl border border-border/60 bg-surface p-4">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">All-Time P&L</div>
              <div className={cn("mt-1 font-mono-tab text-2xl font-bold",
                stats.totalPnl >= 0 ? "text-bull" : "text-bear")}>
                {stats.totalPnl >= 0 ? "+" : ""}${stats.totalPnl.toFixed(0)}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {stats.wins}W · {stats.losses}L · {stats.total} closed · {stats.open} open
              </div>
            </div>


            <div className="rounded-xl border border-border/60 bg-surface p-4">
              <div className="flex items-center gap-2">
                <Radio className="h-4 w-4 text-info" />
                <h3 className="text-sm font-semibold">Alert Channels</h3>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                The AI will only fire when all confluence rules align and R:R ≥ 1:2.
              </p>
              <div className="mt-3 space-y-2">
                {[
                  { id: "push", label: "Push notification", enabled: alertsOn },
                  { id: "email", label: "Email", enabled: alertsOn },
                  { id: "telegram", label: "Telegram", enabled: false },
                ].map(c => (
                  <div key={c.id} className="flex items-center justify-between rounded-lg border border-border/50 bg-background/40 px-3 py-2">
                    <span className="text-xs">{c.label}</span>
                    <Pill tone={c.enabled ? "bull" : "muted"}>{c.enabled ? "Active" : "Off"}</Pill>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
                Connect email & Telegram delivery in the next phase.
              </p>
            </div>

            <div className="rounded-xl border border-border/60 bg-surface p-4">
              <h3 className="text-sm font-semibold">AI Avoids Trading During</h3>
              <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                <li>· Low volatility / dead tape</li>
                <li>· Sideways consolidation</li>
                <li>· High-impact news windows</li>
                <li>· Weak momentum readings</li>
                <li>· Setups under 1:2 R:R</li>
              </ul>
            </div>
          </aside>
        </div>

        <footer className="mt-8 border-t border-border/60 pt-4 pb-8 text-[11px] text-muted-foreground">
          Sentinel AI runs on a high-fidelity simulated feed for demonstration. Plug in a live data provider to trade real markets.
        </footer>
      </div>
    </div>
  );
}

function Header({ alertsOn, onToggleAlerts }: { alertsOn: boolean; onToggleAlerts: () => void }) {
  return (
    <header className="sticky top-0 z-20 border-b border-border/60 bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] items-center gap-4 px-4 py-3 lg:px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight">SENTINEL AI</h1>
            <p className="text-[10px] text-muted-foreground">Forex · SPX500 · NAS100</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Pill tone="bull"><span className="h-1.5 w-1.5 rounded-full bg-bull ticker-pulse" /> Live</Pill>
          <button
            onClick={onToggleAlerts}
            className={cn("flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium",
              alertsOn ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-surface text-muted-foreground")}>
            {alertsOn ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
            Alerts {alertsOn ? "On" : "Off"}
          </button>
        </div>
      </div>
    </header>
  );
}

function SymbolPicker({ value, onChange }: { value: Symbol; onChange: (s: Symbol) => void }) {
  const [open, setOpen] = useState(false);
  const meta = SYMBOLS.find(s => s.id === value)!;
  const groups = ["Forex", "Index"];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
        <span className="font-mono-tab text-sm font-bold">{meta.label}</span>
        <Pill tone="muted">{meta.group}</Pill>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-64 rounded-lg border border-border bg-popover p-2 shadow-xl">
          {groups.map(g => (
            <div key={g} className="mb-1">
              <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">{g}</div>
              {SYMBOLS.filter(s => s.group === g).map(s => (
                <button key={s.id}
                  onClick={() => { onChange(s.id); setOpen(false); }}
                  className={cn("flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
                    s.id === value && "bg-accent")}>
                  <span className="font-mono-tab font-medium">{s.label}</span>
                  <span className="font-mono-tab text-xs text-muted-foreground">{s.basePrice.toFixed(s.digits)}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TimeframePicker({ value, onChange }: { value: Timeframe; onChange: (t: Timeframe) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-1">
      {TIMEFRAMES.map(tf => (
        <button key={tf.id}
          onClick={() => onChange(tf.id)}
          className={cn("rounded-md px-3 py-1 text-xs font-semibold transition",
            value === tf.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
          {tf.label}
        </button>
      ))}
    </div>
  );
}

function ChartLegend({ symbol, timeframe }: { symbol: Symbol; timeframe: Timeframe }) {
  return (
    <div className="pointer-events-none absolute left-4 top-3 z-10 flex items-center gap-3 text-[10px] font-medium">
      <span className="font-mono-tab text-foreground/80">{symbol} · {timeframe}</span>
      <span className="text-[#60a5fa]">EMA20</span>
      <span className="text-[#f59e0b]">EMA50</span>
      <span className="text-[#a78bfa]">EMA200</span>
      <span className="text-foreground/60">VWAP</span>
    </div>
  );
}

function SectionHeader({ icon, title, sub }: { icon: React.ReactNode; title: string; sub?: string }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="text-primary">{icon}</span>
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      {sub && <span className="text-[11px] text-muted-foreground">· {sub}</span>}
    </div>
  );
}

function mockStats(symbol: Symbol) {
  const seed = symbol.length * 7;
  const winRate = 54 + ((seed * 13) % 18);
  const profitFactor = 1.4 + ((seed % 9) / 10);
  return {
    winRate,
    profitFactor,
    trades: 120 + ((seed * 11) % 80),
    avgWin: (1.8 + (seed % 5) / 10).toFixed(2),
    avgLoss: (0.9 + (seed % 4) / 10).toFixed(2),
    bestSetup: "Trend pullback",
  };
}
