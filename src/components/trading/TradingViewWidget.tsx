import { useEffect, useRef } from "react";
import type { Symbol, Timeframe } from "@/lib/trading/market-data";

const TV_SYMBOL: Record<Symbol, string> = {
  EURUSD: "OANDA:EURUSD",
  GBPUSD: "OANDA:GBPUSD",
  USDJPY: "OANDA:USDJPY",
  AUDUSD: "OANDA:AUDUSD",
  USDCAD: "OANDA:USDCAD",
  USDCHF: "OANDA:USDCHF",
  NZDUSD: "OANDA:NZDUSD",
  SPX500: "OANDA:SPX500USD",
  NAS100: "OANDA:NAS100USD",
};

const TV_INTERVAL: Record<Timeframe, string> = {
  "1m": "1",
  "5m": "5",
  "15m": "15",
  "1h": "60",
  "4h": "240",
};

interface TradingViewWidgetProps {
  symbol: Symbol;
  timeframe: Timeframe;
}

export function TradingViewWidget({ symbol, timeframe }: TradingViewWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const config = {
      autosize: true,
      symbol: TV_SYMBOL[symbol],
      interval: TV_INTERVAL[timeframe],
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "en",
      enable_publishing: false,
      hide_top_toolbar: false,
      hide_legend: false,
      hide_side_toolbar: false,
      allow_symbol_change: false,
      save_image: false,
      calendar: false,
      support_host: "https://www.tradingview.com",
    };

    const configKey = JSON.stringify(config);
    if (container.dataset.tvConfig === configKey) return;

    container.dataset.tvConfig = configKey;
    container.replaceChildren();

    const widgetSlot = document.createElement("div");
    widgetSlot.className = "tradingview-widget-container__widget h-full w-full";
    container.appendChild(widgetSlot);

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.type = "text/javascript";
    script.text = configKey;
    container.appendChild(script);
  }, [symbol, timeframe]);

  return (
    <div
      ref={containerRef}
      className="tradingview-widget-container h-full w-full"
      aria-label={`${symbol} live TradingView chart`}
    />
  );
}