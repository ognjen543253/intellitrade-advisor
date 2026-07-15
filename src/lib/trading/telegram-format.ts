import type { Signal } from "./signals";
import type { Trade } from "./journal";
import { SYMBOLS } from "./market-data";

function digitsFor(sym: string): number {
  return SYMBOLS.find((s) => s.id === sym)?.digits ?? 2;
}

function trendLabel(sig: Signal): string {
  const strong = sig.strength === "Strong";
  if (sig.trend === "Bullish") return strong ? "Strong Bull" : "Bull";
  if (sig.trend === "Bearish") return strong ? "Strong Bear" : "Bear";
  return "Neutral";
}

const RULE = "────────────";

export function formatSignalMessage(sig: Signal): string {
  const d = digitsFor(sig.symbol);
  const rr = sig.entry !== sig.stopLoss
    ? Math.abs((sig.takeProfit2 - sig.entry) / (sig.entry - sig.stopLoss))
    : 0;
  const reason = sig.aiSummary?.trim() || sig.reasons.slice(0, 3).join("; ") || "Weighted confluence across trend, momentum and structure.";
  return (
    `🚨 <b>IntelliTrade Signal</b>\n\n` +
    `Market: <b>${sig.symbol}</b>\n` +
    `Signal: <b>${sig.side}</b>\n` +
    `Confidence: <b>${sig.probability}%</b>\n` +
    `Entry: <code>${sig.entry.toFixed(d)}</code>\n` +
    `Stop Loss: <code>${sig.stopLoss.toFixed(d)}</code>\n` +
    `Take Profit: <code>${sig.takeProfit1.toFixed(d)}</code> → <code>${sig.takeProfit2.toFixed(d)}</code>\n` +
    `Risk Reward: 1:${rr.toFixed(2)}\n` +
    `Trend: ${trendLabel(sig)}\n` +
    `Timeframe: ${sig.timeframe}\n\n` +
    `<b>Reason:</b>\n${reason}\n` +
    RULE
  );
}

export function formatTradeOpened(t: Trade): string {
  const d = digitsFor(t.symbol);
  return (
    `📥 <b>Trade Opened</b>\n\n` +
    `${t.side} ${t.symbol} · ${t.timeframe}\n` +
    `Entry: <code>${t.entry.toFixed(d)}</code>\n` +
    `SL: <code>${t.stopLoss.toFixed(d)}</code>  ·  TP1: <code>${t.takeProfit1.toFixed(d)}</code>  ·  TP2: <code>${t.takeProfit2.toFixed(d)}</code>\n` +
    `Confidence: ${t.confidence}%\n` +
    RULE
  );
}

export function formatTradeClosed(t: Trade): string {
  const win = t.status === "win";
  const be = t.status === "breakeven";
  const emoji = be ? "⚪" : win ? "✅" : "❌";
  const label = be ? "Break-even" : win ? "TP Hit" : "SL Hit";
  return (
    `${emoji} <b>Trade Closed · ${label}</b>\n\n` +
    `${t.side} ${t.symbol} · ${t.timeframe}\n` +
    `P&L: <b>${t.pnl >= 0 ? "+" : ""}$${t.pnl.toFixed(2)}</b>  (${t.rMultiple >= 0 ? "+" : ""}${t.rMultiple}R)\n` +
    RULE
  );
}

export function formatBreakEven(t: Trade): string {
  const d = digitsFor(t.symbol);
  return (
    `🛡️ <b>Break-Even Activated</b>\n\n` +
    `${t.side} ${t.symbol} · ${t.timeframe}\n` +
    `Stop moved to entry: <code>${t.entry.toFixed(d)}</code>\n` +
    RULE
  );
}

export function formatTrailUpdate(t: Trade, newSL: number): string {
  const d = digitsFor(t.symbol);
  return (
    `🔧 <b>Trailing Stop Updated</b>\n\n` +
    `${t.side} ${t.symbol} · ${t.timeframe}\n` +
    `New SL: <code>${newSL.toFixed(d)}</code>\n` +
    RULE
  );
}

export function formatDailyTarget(pnl: number): string {
  return `🎯 <b>Daily Profit Target Hit</b>\n\nToday's P&L: <b>+$${pnl.toFixed(2)}</b>\n${RULE}`;
}

export function formatDailyLoss(pnl: number): string {
  return `🛑 <b>Daily Loss Limit Hit</b>\n\nToday's P&L: <b>-$${Math.abs(pnl).toFixed(2)}</b>\nTrading paused for the day.\n${RULE}`;
}

export function formatError(msg: string): string {
  return `⚠️ <b>IntelliTrade Error</b>\n\n${msg}\n${RULE}`;
}
