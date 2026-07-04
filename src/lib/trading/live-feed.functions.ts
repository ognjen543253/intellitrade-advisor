import { createServerFn } from "@tanstack/react-start";

// Maps our internal symbol IDs to Yahoo Finance tickers.
const YAHOO_TICKER: Record<string, string> = {
  EURUSD: "EURUSD=X",
  GBPUSD: "GBPUSD=X",
  USDJPY: "USDJPY=X",
  AUDUSD: "AUDUSD=X",
  USDCAD: "USDCAD=X",
  USDCHF: "USDCHF=X",
  NZDUSD: "NZDUSD=X",
  SPX500: "%5EGSPC", // ^GSPC
  NAS100: "%5ENDX",  // ^NDX
};

// Yahoo native intervals + a reasonable range per timeframe.
const TF_CONFIG: Record<string, { interval: string; range: string; aggregate?: number }> = {
  "1m":  { interval: "1m",  range: "1d" },
  "5m":  { interval: "5m",  range: "5d" },
  "15m": { interval: "15m", range: "5d" },
  "1h":  { interval: "60m", range: "1mo" },
  // Yahoo has no native 4h — pull 1h and aggregate 4:1.
  "4h":  { interval: "60m", range: "3mo", aggregate: 4 },
};

export interface LiveCandle {
  time: number; open: number; high: number; low: number; close: number; volume: number;
}

export const fetchLiveCandles = createServerFn({ method: "GET" })
  .inputValidator((data: { symbol: string; timeframe: string }) => data)
  .handler(async ({ data }): Promise<{ candles: LiveCandle[]; source: string; error?: string }> => {
    const ticker = YAHOO_TICKER[data.symbol];
    const cfg = TF_CONFIG[data.timeframe];
    if (!ticker || !cfg) {
      return { candles: [], source: "yahoo", error: `Unsupported symbol/timeframe: ${data.symbol}/${data.timeframe}` };
    }

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=${cfg.interval}&range=${cfg.range}&includePrePost=false`;

    try {
      const res = await fetch(url, {
        headers: {
          // Yahoo blocks empty UAs.
          "User-Agent": "Mozilla/5.0 (compatible; SentinelAI/1.0)",
          "Accept": "application/json",
        },
      });
      if (!res.ok) {
        return { candles: [], source: "yahoo", error: `Yahoo HTTP ${res.status}` };
      }
      const json: any = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result) {
        const msg = json?.chart?.error?.description ?? "No data";
        return { candles: [], source: "yahoo", error: msg };
      }

      const ts: number[] = result.timestamp ?? [];
      const q = result.indicators?.quote?.[0] ?? {};
      const opens: (number | null)[] = q.open ?? [];
      const highs: (number | null)[] = q.high ?? [];
      const lows: (number | null)[] = q.low ?? [];
      const closes: (number | null)[] = q.close ?? [];
      const vols: (number | null)[] = q.volume ?? [];

      const raw: LiveCandle[] = [];
      for (let i = 0; i < ts.length; i++) {
        const o = opens[i], h = highs[i], l = lows[i], c = closes[i];
        if (o == null || h == null || l == null || c == null) continue;
        raw.push({
          time: ts[i],
          open: o, high: h, low: l, close: c,
          volume: vols[i] ?? 0,
        });
      }

      const candles = cfg.aggregate ? aggregate(raw, cfg.aggregate) : raw;
      // Keep response size reasonable for the browser.
      const trimmed = candles.slice(-400);
      return { candles: trimmed, source: "yahoo" };
    } catch (e: any) {
      return { candles: [], source: "yahoo", error: e?.message ?? "Fetch failed" };
    }
  });

function aggregate(candles: LiveCandle[], factor: number): LiveCandle[] {
  const out: LiveCandle[] = [];
  for (let i = 0; i < candles.length; i += factor) {
    const chunk = candles.slice(i, i + factor);
    if (chunk.length === 0) continue;
    out.push({
      time: chunk[0].time,
      open: chunk[0].open,
      high: Math.max(...chunk.map(c => c.high)),
      low: Math.min(...chunk.map(c => c.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((s, c) => s + c.volume, 0),
    });
  }
  return out;
}
