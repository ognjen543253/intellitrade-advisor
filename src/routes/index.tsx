import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useServerFn } from "@tanstack/react-start";
import { TradingViewWidget } from "@/components/trading/TradingViewWidget";
import { SignalCard } from "@/components/trading/SignalCard";
import { Pill, Stat } from "@/components/trading/Stat";
import { YearCalendar } from "@/components/trading/YearCalendar";
import { LearningPanel } from "@/components/trading/LearningPanel";
import { TradeLog } from "@/components/trading/TradeLog";
import { DiagnosticsPanel } from "@/components/trading/DiagnosticsPanel";
import { TelegramAlerts, loadChatIds } from "@/components/trading/TelegramAlerts";
import { sendTelegramMessage } from "@/lib/trading/telegram.functions";
import { recordSignal } from "@/lib/trading/diagnostics-store";
import {
  SYMBOLS, TIMEFRAMES,
  type Symbol, type Timeframe, type Candle,
} from "@/lib/trading/market-data";
import { analyzeMarket, generateSignal, positionSize, type Signal } from "@/lib/trading/signals";
import { fetchLiveCandles, fetchLiveScan, fetchLivePrice } from "@/lib/trading/live-feed.functions";
import {
  getTrades, logTradeFromSignal, seedIfEmpty, subscribeTrades, performanceStats,
  type Trade,
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
  const [candles, setCandles] = useState<Candle[]>([]);
  const [feedStatus, setFeedStatus] = useState<"loading" | "live" | "error">("loading");
  const [feedError, setFeedError] = useState<string | null>(null);
  const [feedSource, setFeedSource] = useState("market data");
  const fetchCandles = useServerFn(fetchLiveCandles);
  const fetchScan = useServerFn(fetchLiveScan);
  const fetchPrice = useServerFn(fetchLivePrice);
  const reqIdRef = useRef(0);

  // Multi-timeframe scan: signals across every TF for the current symbol.
  type TfScan = { timeframe: Timeframe; signal: Signal | null; error?: string };
  const [scan, setScan] = useState<TfScan[]>([]);

  // Fetch real market data. Twelve Data free tier allows ~8 calls/min and
  // 800/day, so poll conservatively: full multi-TF scan on symbol change,
  // then only the active timeframe every 30s.
  useEffect(() => {
    let cancelled = false;
    const myReq = ++reqIdRef.current;
    setFeedStatus("loading");
    setFeedError(null);

    const fetchOne = async (tf: Timeframe) => {
      try {
        const res = await fetchCandles({ data: { symbol, timeframe: tf } });
        return { tf, res };
      } catch (e: any) {
        return { tf, res: { candles: [], source: "unknown", error: e?.message ?? "Fetch failed" } as any };
      }
    };

    const applyActive = (res: any) => {
      if (res.error || res.candles.length === 0) {
        setFeedStatus("error");
        setFeedError(res.error ?? "No candles returned");
      } else {
        setCandles(res.candles as Candle[]);
        setFeedStatus("live");
        setFeedError(null);
        setFeedSource(res.source ?? "market data");
      }
    };

    const buildScanRow = (tf: Timeframe, res: any, htfBias?: { trend: "Bullish" | "Bearish" | "Sideways"; strength: number }): TfScan => {
      if (res.error || res.candles.length < 30) {
        return { timeframe: tf, signal: null, error: res.error ?? "Not enough data" };
      }
      try {
        return { timeframe: tf, signal: generateSignal(res.candles as Candle[], symbol, tf, { htfBias }) };
      } catch (e: any) {
        return { timeframe: tf, signal: null, error: e?.message ?? "Analysis failed" };
      }
    };

    // Higher-timeframe map for MTF continuation logic.
    const HTF: Record<Timeframe, Timeframe | null> = {
      "1m": "15m", "5m": "1h", "15m": "4h", "1h": "4h", "4h": null,
    };

    // Initial full scan across all timeframes using one server request.
    const initialLoad = async () => {
      let results: Array<{ tf: Timeframe; res: any }>;
      try {
        const scanRes = await fetchScan({ data: { symbol } });
        results = scanRes.rows.map((row: any) => ({ tf: row.timeframe as Timeframe, res: row }));
      } catch (e: any) {
        results = [{ tf: timeframe, res: { candles: [], source: "unknown", error: e?.message ?? "Fetch failed" } }];
      }
      if (cancelled || myReq !== reqIdRef.current) return;
      const active = results.find(r => r.tf === timeframe) ?? results[0];
      applyActive(active.res);
      // First pass — HTF-less. Then second pass with HTF bias from the higher TF's signal.
      const firstPass = new Map(results.map(({ tf, res }) => [tf, buildScanRow(tf, res)]));
      const finalRows: TfScan[] = results.map(({ tf, res }) => {
        const htfTf = HTF[tf];
        const htfRow = htfTf ? firstPass.get(htfTf) : undefined;
        const htfBias = htfRow?.signal
          ? { trend: htfRow.signal.trend, strength: htfRow.signal.probability }
          : undefined;
        return buildScanRow(tf, res, htfBias);
      });
      setScan(finalRows);
    };

    // Refresh only the active timeframe (1 API credit).
    const refreshActive = async () => {
      const { res } = await fetchOne(timeframe);
      if (cancelled || myReq !== reqIdRef.current) return;
      applyActive(res);
      setScan(prev => {
        const row = buildScanRow(timeframe, res);
        const next = prev.filter(r => r.timeframe !== timeframe);
        next.push(row);
        return next;
      });
    };

    initialLoad();
    const candleId = setInterval(refreshActive, 20000);

    // Fast price ticker: patches the last candle's close/high/low so the
    // chart moves in near real-time between full candle refreshes.
    const tickPrice = async () => {
      try {
        const { price } = await fetchPrice({ data: { symbol } });
        if (cancelled || myReq !== reqIdRef.current || price == null) return;
        setCandles(prev => {
          if (prev.length === 0) return prev;
          const last = prev[prev.length - 1];
          if (!isFinite(price) || price === last.close) return prev;
          const patched = {
            ...last,
            close: price,
            high: Math.max(last.high, price),
            low: Math.min(last.low, price),
          };
          return [...prev.slice(0, -1), patched];
        });
      } catch {}
    };
    const priceId = setInterval(tickPrice, 6000);
    return () => { cancelled = true; clearInterval(candleId); clearInterval(priceId); };
  }, [symbol, timeframe]);







  // Trade journal (persistent, powers learning + calendar)
  useEffect(() => { seedIfEmpty(); }, []);
  const trades = useSyncExternalStore(subscribeTrades, getTrades, getTrades);
  const stats = useMemo(() => performanceStats(trades), [trades]);
  const symbolTrades = useMemo(() => trades.filter(t => t.symbol === symbol), [trades, symbol]);
  const symbolStats = useMemo(() => performanceStats(symbolTrades), [symbolTrades]);

  const activeTrade: Trade | undefined = useMemo(
    () => trades.find(t => t.status === "open" && t.symbol === symbol && t.timeframe === timeframe),
    [trades, symbol, timeframe],
  );

  const ready = candles.length >= 30;

  // Record every evaluation (fired or rejected) into the diagnostics store.
  // Must run before any early return to keep hook order stable.
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (ready) {
        const sig = generateSignal(candles, symbol, timeframe);
        recordSignal(sig);
      }
      for (const row of scan) if (row.signal) recordSignal(row.signal);
    }, 0);
    return () => window.clearTimeout(id);
  }, [ready, candles, symbol, timeframe, scan]);

  if (!ready) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Header alertsOn={alertsOn} onToggleAlerts={() => setAlertsOn(v => !v)} />
        <div className="mx-auto max-w-[1600px] px-4 py-16 text-center lg:px-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-surface px-4 py-2">
            <span className={cn("h-2 w-2 rounded-full ticker-pulse", feedStatus === "error" ? "bg-bear" : "bg-info")} />
            <span className="text-sm">
              {feedStatus === "error"
                ? `Live feed error: ${feedError}`
                : `Loading real ${meta.label} ${timeframe} candles…`}
            </span>
          </div>
        </div>
      </div>
    );
  }

  const analysis = analyzeMarket(candles, symbol);
  const signal = generateSignal(candles, symbol, timeframe);
  const sizing = positionSize(accountBalance, riskPct, signal.entry, signal.stopLoss, meta.group === "Forex" ? 10 : 1);

  const lastPrice = candles[candles.length - 1].close;
  const prevPrice = candles[candles.length - 2]?.close ?? lastPrice;
  const priceUp = lastPrice >= prevPrice;
  const baseIdx = Math.max(0, candles.length - 96);
  const change = lastPrice - candles[baseIdx].close;
  const changePct = lastPrice ? (change / lastPrice) * 100 : 0;

  const handleLogTrade = (sig: Signal) => {
    if (sig.side === "NONE") return;
    if (activeTrade) return; // one open trade per symbol/timeframe — entry can't move
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
            <Wifi className={cn("h-3 w-3", feedStatus === "live" ? "text-bull" : feedStatus === "error" ? "text-bear" : "text-muted-foreground")} />
            {feedStatus === "error" ? `Feed error: ${feedError}` : `Live ${feedSource} feed · ${analysis.sessionTag} session`}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
          {/* Left: chart + dashboard */}
          <div className="flex min-w-0 flex-col gap-4">
            <div className="relative h-[460px] overflow-hidden rounded-xl border border-border/60 bg-surface lg:h-[560px]">
              <div className="absolute left-3 top-3 z-10 rounded-md border border-border/60 bg-background/85 px-2 py-1 text-[10px] font-medium backdrop-blur">
                TradingView live chart · Sentinel signals below
              </div>
              <TradingViewWidget symbol={symbol} timeframe={timeframe} />
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
            {activeTrade && (
              <ActivePositionCard trade={activeTrade} price={lastPrice} digits={meta.digits} />
            )}
            <div>
              <SectionHeader icon={<Bot className="h-4 w-4" />} title="AI Signal" sub={`${meta.label} · ${timeframe} · Quality over quantity`} />
              <SignalCard
                signal={signal}
                digits={meta.digits}
                onLogTrade={activeTrade ? undefined : handleLogTrade}
              />
            </div>

            <DiagnosticsPanel signal={signal} symbol={symbol} timeframe={timeframe} />

            <BestSetupCard
              scan={scan}
              activeTf={timeframe}
              digits={meta.digits}
              onJump={setTimeframe}
            />

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
          Chart powered by TradingView. Sentinel AI uses Twelve Data first, then Yahoo Finance as backup for signal calculations when a symbol or quota is unavailable.
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

function ActivePositionCard({ trade, price, digits }: { trade: Trade; price: number; digits: number }) {
  const isBuy = trade.side === "BUY";
  const risk = Math.abs(trade.entry - trade.stopLoss);
  const rNow = risk > 0
    ? (isBuy ? (price - trade.entry) / risk : (trade.entry - price) / risk)
    : 0;
  const atBreakeven = trade.stopLoss === trade.entry;
  const fmt = (n: number) => n.toFixed(digits);
  return (
    <div className={cn(
      "rounded-xl border bg-surface p-4",
      isBuy ? "border-bull/40" : "border-bear/40",
    )}>
      <div className="flex items-center gap-2">
        <span className={cn(
          "rounded-md px-2 py-0.5 text-[11px] font-bold",
          isBuy ? "bg-bull text-bull-foreground" : "bg-bear text-bear-foreground",
        )}>{trade.side} · OPEN</span>
        <span className="font-mono-tab text-xs font-semibold">{trade.symbol}</span>
        <Pill tone="muted">{trade.timeframe}</Pill>
        {atBreakeven && <Pill tone="info">SL @ Break-even</Pill>}
        <span className={cn("ml-auto font-mono-tab text-sm font-bold", rNow >= 0 ? "text-bull" : "text-bear")}>
          {rNow >= 0 ? "+" : ""}{rNow.toFixed(2)}R
        </span>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        <MiniLevel label="Entry 🔒" value={fmt(trade.entry)} />
        <MiniLevel label={atBreakeven ? "SL → BE" : "Stop Loss"} value={fmt(trade.stopLoss)} tone="bear" />
        <MiniLevel label="TP 1 🔒" value={fmt(trade.takeProfit1)} tone="bull" />
        <MiniLevel label="TP 2 🔒" value={fmt(trade.takeProfit2)} tone="bull" />
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Entry & take-profits are locked after execution. Stop-loss can only advance to your entry (break-even) once the trade is 1R in profit — never past it, and never against you.
      </p>
    </div>
  );
}

function MiniLevel({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "bull" | "bear" }) {
  return (
    <div className="rounded-lg border border-border/50 bg-background/40 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("font-mono-tab text-xs font-semibold",
        tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-foreground")}>
        {value}
      </div>
    </div>
  );
}

type BestScanRow = { timeframe: Timeframe; signal: Signal | null; error?: string };

function BestSetupCard({
  scan, activeTf, digits, onJump,
}: {
  scan: BestScanRow[];
  activeTf: Timeframe;
  digits: number;
  onJump: (tf: Timeframe) => void;
}) {
  const ranked = [...scan].sort((a, b) => {
    const av = a.signal && a.signal.side !== "NONE" ? a.signal.confidence : -1;
    const bv = b.signal && b.signal.side !== "NONE" ? b.signal.confidence : -1;
    return bv - av;
  });
  const best = ranked.find(r => r.signal && r.signal.side !== "NONE") ?? null;

  return (
    <div className="rounded-xl border border-border/60 bg-surface p-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Best Setup · All Timeframes</h3>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        The AI scans 1m, 5m, 15m, 1H and 4H, then highlights the highest-confidence trade.
      </p>

      {best && best.signal ? (
        <div className={cn(
          "mt-3 rounded-lg border p-3",
          best.signal.side === "BUY" ? "border-bull/40 bg-bull/5" : "border-bear/40 bg-bear/5",
        )}>
          <div className="flex items-center gap-2">
            <span className={cn(
              "rounded-md px-2 py-0.5 text-[11px] font-bold",
              best.signal.side === "BUY" ? "bg-bull text-bull-foreground" : "bg-bear text-bear-foreground",
            )}>
              {best.signal.side}
            </span>
            <Pill tone="muted">{best.timeframe}</Pill>
            <span className="ml-auto font-mono-tab text-xs font-semibold">
              {best.signal.confidence}% · {best.signal.strength}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
            <div>
              <div className="uppercase tracking-wider text-muted-foreground">Entry</div>
              <div className="font-mono-tab text-xs font-semibold">{best.signal.entry.toFixed(digits)}</div>
            </div>
            <div>
              <div className="uppercase tracking-wider text-muted-foreground">SL</div>
              <div className="font-mono-tab text-xs font-semibold text-bear">{best.signal.stopLoss.toFixed(digits)}</div>
            </div>
            <div>
              <div className="uppercase tracking-wider text-muted-foreground">TP2</div>
              <div className="font-mono-tab text-xs font-semibold text-bull">{best.signal.takeProfit2.toFixed(digits)}</div>
            </div>
          </div>
          {best.timeframe !== activeTf && (
            <button
              onClick={() => onJump(best.timeframe)}
              className="mt-3 w-full rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20"
            >
              Jump to {best.timeframe} chart
            </button>
          )}
        </div>
      ) : (
        <p className="mt-3 rounded-lg border border-border/50 bg-background/40 p-3 text-[11px] text-muted-foreground">
          No high-probability setup on any timeframe right now. The AI is waiting for confirmation.
        </p>
      )}

      <div className="mt-3 space-y-1">
        {ranked.map(row => {
          const isActive = row.timeframe === activeTf;
          const side = row.signal?.side ?? "NONE";
          const conf = row.signal?.confidence ?? 0;
          return (
            <button
              key={row.timeframe}
              onClick={() => onJump(row.timeframe)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-[11px] transition",
                isActive ? "border-primary/40 bg-primary/5" : "border-border/50 bg-background/40 hover:bg-background",
              )}
            >
              <span className="font-mono-tab w-8 font-semibold">{row.timeframe}</span>
              <span className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-bold",
                side === "BUY" ? "bg-bull/20 text-bull"
                  : side === "SELL" ? "bg-bear/20 text-bear"
                  : "bg-muted text-muted-foreground",
              )}>
                {side}
              </span>
              <span className="ml-auto font-mono-tab text-muted-foreground">
                {row.error ? row.error : `${conf}%`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}


