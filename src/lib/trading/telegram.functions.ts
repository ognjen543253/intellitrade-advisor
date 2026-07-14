import { createServerFn } from "@tanstack/react-start";

const GATEWAY = "https://connector-gateway.lovable.dev/telegram";

function authHeaders() {
  const lk = process.env.LOVABLE_API_KEY;
  const tk = process.env.TELEGRAM_API_KEY;
  if (!lk || !tk) throw new Error("Telegram connector not configured");
  return {
    Authorization: `Bearer ${lk}`,
    "X-Connection-Api-Key": tk,
    "Content-Type": "application/json",
  };
}

export const sendTelegramMessage = createServerFn({ method: "POST" })
  .inputValidator((d: { chatId: string; text: string }) => d)
  .handler(async ({ data }) => {
    const res = await fetch(`${GATEWAY}/sendMessage`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        chat_id: data.chatId,
        text: data.text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || (body && body.ok === false)) {
      return { ok: false as const, error: body?.description ?? `HTTP ${res.status}` };
    }
    return { ok: true as const };
  });

/** Fetch recent updates so users can discover their chat_id after messaging the bot. */
export const listRecentChats = createServerFn({ method: "GET" }).handler(async () => {
  const res = await fetch(`${GATEWAY}/getUpdates`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ limit: 20, allowed_updates: ["message"] }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.ok) {
    return { ok: false as const, error: body?.description ?? `HTTP ${res.status}`, chats: [] };
  }
  const seen = new Map<string, { id: string; name: string; last: string }>();
  for (const upd of body.result ?? []) {
    const msg = upd.message ?? upd.edited_message;
    if (!msg?.chat?.id) continue;
    const id = String(msg.chat.id);
    const name =
      msg.chat.title ??
      [msg.chat.first_name, msg.chat.last_name].filter(Boolean).join(" ") ??
      msg.chat.username ??
      id;
    seen.set(id, { id, name, last: msg.text ?? "" });
  }
  return { ok: true as const, chats: Array.from(seen.values()) };
});

export const BOT_USERNAME = "myapp_notify_sms_bot";
