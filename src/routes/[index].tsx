import { createFileRoute } from "@tanstack/react-router";

import { TradingDashboard } from "./index";

export const Route = createFileRoute("/index")({
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