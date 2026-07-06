import { useMemo } from "react";
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
  const src = useMemo(() => {
    const params = new URLSearchParams({
      frameElementId: `sentinel_tv_${symbol}_${timeframe}`,
      symbol: TV_SYMBOL[symbol],
      interval: TV_INTERVAL[timeframe],
      hidesidetoolbar: "0",
      symboledit: "0",
      saveimage: "0",
      toolbarbg: "131722",
      theme: "dark",
      style: "1",
      timezone: "Etc/UTC",
      withdateranges: "1",
      hideideas: "1",
      locale: "en",
    });
    return `https://www.tradingview.com/widgetembed/?${params.toString()}`;
  }, [symbol, timeframe]);

  return (
    <iframe
      key={`${symbol}-${timeframe}`}
      title={`${symbol} live TradingView chart`}
      src={src}
      className="h-full w-full border-0"
      allow="fullscreen"
    />
  );
}