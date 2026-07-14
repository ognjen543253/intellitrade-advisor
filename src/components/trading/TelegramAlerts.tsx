import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Send, RefreshCw, Check, X, ExternalLink } from "lucide-react";
import { sendTelegramMessage, listRecentChats, BOT_USERNAME } from "@/lib/trading/telegram.functions";
import { Pill } from "@/components/trading/Stat";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "sentinel.telegram.chatIds";

export function loadChatIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function saveChatIds(ids: string[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

export function TelegramAlerts() {
  const send = useServerFn(sendTelegramMessage);
  const listChats = useServerFn(listRecentChats);
  const [ids, setIds] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => { setIds(loadChatIds()); }, []);

  const commit = (next: string[]) => {
    setIds(next);
    saveChatIds(next);
  };

  const addId = (val: string) => {
    const clean = val.trim().replace(/[^\d-]/g, "");
    if (!clean) return;
    if (ids.includes(clean)) return;
    commit([...ids, clean]);
  };

  const remove = (id: string) => commit(ids.filter((x) => x !== id));

  const discover = async () => {
    setBusy(true); setStatus(null);
    try {
      const res = await listChats();
      if (!res.ok) { setStatus(`Error: ${res.error}`); setFound([]); }
      else {
        setFound(res.chats);
        if (res.chats.length === 0) setStatus("No messages yet. Open the bot and send /start.");
      }
    } finally { setBusy(false); }
  };

  const test = async () => {
    if (ids.length === 0) return;
    setBusy(true); setStatus(null);
    const results = await Promise.all(
      ids.map((id) =>
        send({ data: { chatId: id, text: "✅ <b>Sentinel AI</b> test alert — Telegram notifications are working." } })
      )
    );
    const failed = results.filter((r) => !r.ok);
    setStatus(failed.length === 0 ? `Sent to ${ids.length} chat${ids.length > 1 ? "s" : ""}.` : `Failed: ${failed.map((f: any) => f.error).join(", ")}`);
    setBusy(false);
  };

  return (
    <div className="rounded-xl border border-border/60 bg-surface p-4">
      <div className="flex items-center gap-2">
        <Send className="h-4 w-4 text-info" />
        <h3 className="text-sm font-semibold">Telegram Alerts</h3>
        <span className="ml-auto"><Pill tone={ids.length ? "bull" : "muted"}>{ids.length ? `${ids.length} active` : "Off"}</Pill></span>
      </div>

      <ol className="mt-3 space-y-1.5 text-[11px] text-muted-foreground">
        <li>
          1. Open{" "}
          <a
            href={`https://t.me/${BOT_USERNAME}`}
            target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-0.5 font-medium text-info hover:underline"
          >@{BOT_USERNAME}<ExternalLink className="h-3 w-3" /></a>{" "}and press <b>Start</b>.
        </li>
        <li>2. Tap <b>Find my Chat ID</b> below, then add it.</li>
        <li>3. Alerts fire once per new qualifying signal (grade C+).</li>
      </ol>

      <div className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { addId(input); setInput(""); } }}
          placeholder="Chat ID e.g. 123456789"
          inputMode="numeric"
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary"
        />
        <button
          onClick={() => { addId(input); setInput(""); }}
          className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
        >Add</button>
      </div>

      {ids.length > 0 && (
        <div className="mt-2 space-y-1">
          {ids.map((id) => (
            <div key={id} className="flex items-center justify-between rounded-md border border-border/50 bg-background/40 px-2.5 py-1.5">
              <span className="font-mono-tab text-xs">{id}</span>
              <button onClick={() => remove(id)} className="text-muted-foreground hover:text-bear"><X className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <button
          onClick={discover}
          disabled={busy}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-surface disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
          Find my Chat ID
        </button>
        <button
          onClick={test}
          disabled={busy || ids.length === 0}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-surface disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" /> Send test
        </button>
      </div>

      {found.length > 0 && (
        <div className="mt-2 space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Recent chats</div>
          {found.map((c) => (
            <button
              key={c.id}
              onClick={() => addId(c.id)}
              className="flex w-full items-center justify-between rounded-md border border-border/50 bg-background/40 px-2.5 py-1.5 text-left hover:border-primary/60"
            >
              <span className="text-xs">{c.name}</span>
              <span className="font-mono-tab text-[11px] text-muted-foreground">{c.id}</span>
            </button>
          ))}
        </div>
      )}

      {status && <div className="mt-2 text-[11px] text-muted-foreground">{status}</div>}
    </div>
  );
}
