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
    const chart = createChart(containerRef.current, {
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
      timeScale: { borderColor: "rgba(120,130,150,0.15)", timeVisible: true, secondsVisible: false },
      crosshair: { mode: 1 },
      autoSize: true,
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

    return () => { chart.remove(); chartRef.current = null; };
  }, [digits]);

  useEffect(() => {
    if (!candleRef.current || candles.length === 0) return;
    const candleData = candles.map(c => ({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close }));
    candleRef.current.setData(candleData);

    const closes = candles.map(c => c.close);
    const e20 = ema(closes, 20);
    const e50 = ema(closes, 50);
    const e200 = ema(closes, 200);
    const vw = vwap(candles);
    ema20Ref.current?.setData(candles.map((c, i) => ({ time: c.time as Time, value: e20[i] })));
    ema50Ref.current?.setData(candles.map((c, i) => ({ time: c.time as Time, value: e50[i] })));
    ema200Ref.current?.setData(candles.map((c, i) => ({ time: c.time as Time, value: e200[i] })));
    vwapRef.current?.setData(candles.map((c, i) => ({ time: c.time as Time, value: vw[i] })));
    volRef.current?.setData(candles.map(c => ({
      time: c.time as Time,
      value: c.volume,
      color: c.close >= c.open ? "rgba(34,197,94,0.45)" : "rgba(239,68,68,0.45)",
    })));
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
