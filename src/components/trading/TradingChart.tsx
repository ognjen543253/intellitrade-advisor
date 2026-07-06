import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import type { Candle } from "@/lib/trading/market-data";
import { ema, vwap } from "@/lib/trading/market-data";

interface Props {
  candles: Candle[];
  support?: number;
  resistance?: number;
  entry?: number;
  stopLoss?: number;
  takeProfit1?: number;
  takeProfit2?: number;
  digits: number;
}

export function TradingChart({ candles, support, resistance, entry, stopLoss, takeProfit1, takeProfit2, digits }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const ema20Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema50Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema200Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const vwapRef = useRef<ISeriesApi<"Line"> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const { width, height } = containerRef.current.getBoundingClientRect();
    const chart = createChart(containerRef.current, {
      width: Math.max(1, Math.floor(width)),
      height: Math.max(1, Math.floor(height)),
      layout: {
        background: { color: "transparent" },
        textColor: "#9ca3b3",
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(120,130,150,0.06)" },
        horzLines: { color: "rgba(120,130,150,0.06)" },
      },
      rightPriceScale: { borderColor: "rgba(120,130,150,0.15)" },
      timeScale: {
        borderColor: "rgba(120,130,150,0.15)",
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: Time) => formatChartTime(Number(time)),
      },
      localization: {
        locale: "en-US",
        timeFormatter: (time: Time) => formatChartTime(Number(time)),
      },
      crosshair: { mode: 1 },
    });
    chartRef.current = chart;

    candleRef.current = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
      priceFormat: { type: "price", precision: digits, minMove: 1 / Math.pow(10, digits) },
    });
    ema20Ref.current = chart.addSeries(LineSeries, { color: "#60a5fa", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    ema50Ref.current = chart.addSeries(LineSeries, { color: "#f59e0b", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    ema200Ref.current = chart.addSeries(LineSeries, { color: "#a78bfa", lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
    vwapRef.current = chart.addSeries(LineSeries, { color: "#e5e7eb", lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false });
    volRef.current = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
      color: "rgba(120,130,150,0.4)",
    });
    chart.priceScale("").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    const resizeObserver = new ResizeObserver(([entry]) => {
      const nextWidth = Math.max(1, Math.floor(entry.contentRect.width));
      const nextHeight = Math.max(1, Math.floor(entry.contentRect.height));
      chart.applyOptions({ width: nextWidth, height: nextHeight });
      chart.timeScale().fitContent();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [digits]);

  useEffect(() => {
    if (!candleRef.current || candles.length === 0) return;
    const cleanCandles = dedupeCandles(candles);
    if (cleanCandles.length === 0) return;
    const candleData = cleanCandles.map(c => ({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close }));
    candleRef.current.setData(candleData);

    const closes = cleanCandles.map(c => c.close);
    const e20 = ema(closes, 20);
    const e50 = ema(closes, 50);
    const e200 = ema(closes, 200);
    const vw = vwap(cleanCandles);
    ema20Ref.current?.setData(cleanCandles.map((c, i) => ({ time: c.time as Time, value: e20[i] })).filter(isFinitePoint));
    ema50Ref.current?.setData(cleanCandles.map((c, i) => ({ time: c.time as Time, value: e50[i] })).filter(isFinitePoint));
    ema200Ref.current?.setData(cleanCandles.map((c, i) => ({ time: c.time as Time, value: e200[i] })).filter(isFinitePoint));
    vwapRef.current?.setData(cleanCandles.map((c, i) => ({ time: c.time as Time, value: vw[i] })).filter(isFinitePoint));
    volRef.current?.setData(cleanCandles.map(c => ({
      time: c.time as Time,
      value: c.volume,
      color: c.close >= c.open ? "rgba(34,197,94,0.45)" : "rgba(239,68,68,0.45)",
    })));
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  // Price lines for SR + trade levels
  useEffect(() => {
    if (!candleRef.current) return;
    const series = candleRef.current;
    const lines: ReturnType<typeof series.createPriceLine>[] = [];
    const add = (price: number | undefined, color: string, title: string, style = 2) => {
      if (price == null || !isFinite(price)) return;
      lines.push(series.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title }));
    };
    add(support, "rgba(96,165,250,0.7)", "S");
    add(resistance, "rgba(245,158,11,0.7)", "R");
    add(entry, "#e5e7eb", "Entry", 0);
    add(stopLoss, "#ef4444", "SL", 0);
    add(takeProfit1, "#22c55e", "TP1", 0);
    add(takeProfit2, "#22c55e", "TP2", 0);
    return () => { lines.forEach(l => series.removePriceLine(l)); };
  }, [support, resistance, entry, stopLoss, takeProfit1, takeProfit2]);

  return <div ref={containerRef} className="h-full w-full" />;
}

function dedupeCandles(candles: Candle[]) {
  const byTime = new Map<number, Candle>();
  for (const c of candles) {
    if (
      Number.isFinite(c.time) &&
      Number.isFinite(c.open) &&
      Number.isFinite(c.high) &&
      Number.isFinite(c.low) &&
      Number.isFinite(c.close)
    ) {
      byTime.set(c.time, c);
    }
  }
  return Array.from(byTime.values()).sort((a, b) => a.time - b.time);
}

function isFinitePoint(point: { value: number }) {
  return Number.isFinite(point.value);
}

function formatChartTime(time: number) {
  if (!Number.isFinite(time)) return "";
  const date = new Date(time * 1000);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${month}/${day} ${hour}:${minute}`;
}
