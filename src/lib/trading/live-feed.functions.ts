import { createServerFn } from "@tanstack/react-start";

// ---------- Twelve Data (primary) ----------

const TD_SYMBOL: Record<string, string> = {
  EURUSD: "EUR/USD",
  GBPUSD: "GBP/USD",
  USDJPY: "USD/JPY",
  AUDUSD: "AUD/USD",
  USDCAD: "USD/CAD",
  USDCHF: "USD/CHF",
  NZDUSD: "NZD/USD",
  SPX500: "SPX",
  NAS100: "NDX",
};

const TD_INTERVAL: Record<string, string> = {
  "1m": "1min",
  "5m": "5min",
  "15m": "15min",
  "1h": "1h",
  "4h": "4h",
};

// ---------- Yahoo (fallback) ----------

const YAHOO_TICKER: Record<string, string> = {
  EURUSD: "EURUSD=X",
  GBPUSD: "GBPUSD=X",
  USDJPY: "USDJPY=X",
  AUDUSD: "AUDUSD=X",
  USDCAD: "USDCAD=X",
  USDCHF: "USDCHF=X",
  NZDUSD: "NZDUSD=X",
  SPX500: "%5EGSPC",
  NAS100: "%5ENDX",
};

const YAHOO_TF: Record<string, { interval: string; range: string; aggregate?: number }> = {
  "1m":  { interval: "1m",  range: "1d" },
  "5m":  { interval: "5m",  range: "5d" },
  "15m": { interval: "15m", range: "5d" },
  "1h":  { interval: "60m", range: "1mo" },
  "4h":  { interval: "60m", range: "3mo", aggregate: 4 },
};

export interface LiveCandle {
  time: number; open: number; high: number; low: number; close: number; volume: number;
}

type LiveFeedResult = { candles: LiveCandle[]; source: string; error?: string };

const SCAN_TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h"] as const;

export const fetchLiveCandles = createServerFn({ method: "GET" })
  .validator((data: { symbol: string; timeframe: string }) => data)
  .handler(async ({ data }): Promise<LiveFeedResult> => {
    return loadLiveCandles(data.symbol, data.timeframe);
  });

export const fetchLivePrice = createServerFn({ method: "GET" })
  .validator((data: { symbol: string }) => data)
  .handler(async ({ data }): Promise<{ price: number | null; source: string; error?: string }> => {
    const apiKey = process.env.TWELVE_DATA_API_KEY;
    if (apiKey) {
      const tdSym = TD_SYMBOL[data.symbol];
      if (tdSym) {
        try {
          const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(tdSym)}&apikey=${apiKey}`;
          const res = await fetch(url, { headers: { Accept: "application/json" } });
          if (res.ok) {
            const j: any = await res.json();
            const p = parseFloat(j?.price);
            if (isFinite(p)) return { price: p, source: "twelvedata" };
          }
        } catch {}
      }
    }
    const ticker = YAHOO_TICKER[data.symbol];
    if (ticker) {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1m&range=1d`;
        const res = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; SentinelAI/1.0)", "Accept": "application/json" },
        });
        if (res.ok) {
          const j: any = await res.json();
          const meta = j?.chart?.result?.[0]?.meta;
          const p = meta?.regularMarketPrice;
          if (typeof p === "number" && isFinite(p)) return { price: p, source: "yahoo" };
        }
      } catch {}
    }
    return { price: null, source: "unknown", error: "No live price" };
  });

export const fetchLiveScan = createServerFn({ method: "GET" })
  .validator((data: { symbol: string }) => data)
  .handler(async ({ data }): Promise<{ rows: Array<LiveFeedResult & { timeframe: string }> }> => {
    const rows = [];
    for (const timeframe of SCAN_TIMEFRAMES) {
      rows.push({ timeframe, ...(await loadLiveCandles(data.symbol, timeframe)) });
    }
    return { rows };
  });

async function loadLiveCandles(symbol: string, timeframe: string): Promise<LiveFeedResult> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;

  // Try Twelve Data first.
  if (apiKey) {
    const td = await fromTwelveData(symbol, timeframe, apiKey);
    if (td.candles.length > 0) return td;
    // Fall through to Yahoo on provider errors, unsupported symbols, or quota limits.
    const yh = await fromYahoo(symbol, timeframe);
    if (yh.candles.length > 0) return { ...yh, source: "yahoo (fallback)" };
    return td;
  }

  return fromYahoo(symbol, timeframe);
}

async function fromTwelveData(symbol: string, timeframe: string, apiKey: string): Promise<LiveFeedResult> {
  const tdSym = TD_SYMBOL[symbol];
  const tdInt = TD_INTERVAL[timeframe];
  if (!tdSym || !tdInt) {
    return { candles: [], source: "twelvedata", error: `Unsupported ${symbol}/${timeframe}` };
  }

  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(tdSym)}&interval=${tdInt}&outputsize=400&order=ASC&apikey=${apiKey}`;

  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return { candles: [], source: "twelvedata", error: `HTTP ${res.status}` };
    const json: any = await res.json();
    if (json?.status === "error" || !Array.isArray(json?.values)) {
      return { candles: [], source: "twelvedata", error: json?.message ?? "No data" };
    }
    const candles: LiveCandle[] = json.values.map((v: any) => ({
      time: Math.floor(new Date(v.datetime.replace(" ", "T") + "Z").getTime() / 1000),
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
      volume: v.volume ? parseFloat(v.volume) : 0,
    })).filter((c: LiveCandle) => isFinite(c.open) && isFinite(c.close));
    return { candles, source: "twelvedata" };
  } catch (e: any) {
    return { candles: [], source: "twelvedata", error: e?.message ?? "Fetch failed" };
  }
}

async function fromYahoo(symbol: string, timeframe: string): Promise<LiveFeedResult> {
  const ticker = YAHOO_TICKER[symbol];
  const cfg = YAHOO_TF[timeframe];
  if (!ticker || !cfg) {
    return { candles: [], source: "yahoo", error: `Unsupported ${symbol}/${timeframe}` };
  }

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=${cfg.interval}&range=${cfg.range}&includePrePost=false`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SentinelAI/1.0)",
        "Accept": "application/json",
      },
    });
    if (!res.ok) return { candles: [], source: "yahoo", error: `HTTP ${res.status}` };
    const json: any = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return { candles: [], source: "yahoo", error: json?.chart?.error?.description ?? "No data" };

    const ts: number[] = result.timestamp ?? [];
    const q = result.indicators?.quote?.[0] ?? {};
    const raw: LiveCandle[] = [];
    for (let i = 0; i < ts.length; i++) {
      const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
      if (o == null || h == null || l == null || c == null) continue;
      raw.push({ time: ts[i], open: o, high: h, low: l, close: c, volume: q.volume?.[i] ?? 0 });
    }
    const candles = cfg.aggregate ? aggregate(raw, cfg.aggregate) : raw;
    return { candles: candles.slice(-400), source: "yahoo" };
  } catch (e: any) {
    return { candles: [], source: "yahoo", error: e?.message ?? "Fetch failed" };
  }
}

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
