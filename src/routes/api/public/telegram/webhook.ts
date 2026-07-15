import { createFileRoute } from "@tanstack/react-router";

const HELP = [
  "<b>IntelliTrade Bot</b>",
  "",
  "/start — Welcome & setup",
  "/status — Bot & feed status",
  "/signals — Latest signal snapshot",
  "/positions — Open positions",
  "/history — Recent closed trades",
  "/performance — Win rate & P&L",
  "/stats — Detailed statistics",
  "/markets — Watched markets",
  "/watchlist — Symbols scanned",
  "/risk — Risk configuration",
  "/settings — Notification settings",
  "/help — This menu",
].join("\n");

const MARKETS = "Forex: EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD, USDCHF, NZDUSD\nIndices: SPX500, NAS100";
const TIMEFRAMES = "1m · 5m · 15m · 1H · 4H";

async function reply(token: string, chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  }).catch(() => {});
}

function handleCommand(cmd: string): string {
  const c = cmd.split(/\s+/)[0].toLowerCase();
  switch (c) {
    case "/start":
      return `👋 <b>Welcome to IntelliTrade</b>\n\nYou'll receive high-probability BUY/SELL signals for Forex, SPX500 and NAS100 across ${TIMEFRAMES}.\n\nType /help to see all commands.`;
    case "/help":
      return HELP;
    case "/status":
      return `✅ <b>Status: Online</b>\nSignal engine: active\nMarket feed: live (Twelve Data + Yahoo backup)\nScan cadence: 20s`;
    case "/markets":
    case "/watchlist":
      return `📊 <b>Markets Scanned</b>\n\n${MARKETS}\n\nTimeframes: ${TIMEFRAMES}`;
    case "/risk":
      return `🛡️ <b>Risk Rules</b>\n\n• Min R:R 1:2\n• Position size 1–2% risk per trade\n• Entry/TP frozen after execution\n• SL can advance to break-even only`;
    case "/settings":
      return `⚙️ Open the IntelliTrade dashboard → <b>Notification Settings</b> panel to toggle events, set daily target/loss limits and run a test.`;
    case "/signals":
    case "/positions":
    case "/history":
    case "/performance":
    case "/stats":
      return `📈 <b>${c.slice(1)}</b>\n\nLive ${c.slice(1)} data lives in your browser session. Open the IntelliTrade dashboard to view the full breakdown — the bot will push every new signal and trade update here automatically.`;
    default:
      return `Unknown command. Send /help for the full list.`;
  }
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) return new Response("Bot not configured", { status: 503 });

        // Optional shared-secret verification (set via setWebhook secret_token).
        const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
        if (configuredSecret) {
          const header = request.headers.get("x-telegram-bot-api-secret-token");
          if (header !== configuredSecret) return new Response("Unauthorized", { status: 401 });
        }

        let update: any;
        try { update = await request.json(); } catch { return Response.json({ ok: true }); }
        const msg = update?.message ?? update?.edited_message;
        const text: string | undefined = msg?.text;
        const chatId: number | undefined = msg?.chat?.id;
        if (!chatId || !text) return Response.json({ ok: true });

        if (text.startsWith("/")) {
          const reply$ = handleCommand(text);
          // Fire-and-forget so we ACK Telegram quickly.
          reply(token, chatId, reply$);
        }
        return Response.json({ ok: true });
      },
    },
  },
});
