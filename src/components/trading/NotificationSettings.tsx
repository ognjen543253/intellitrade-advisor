import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Settings, Check } from "lucide-react";
import {
  EVENT_LABELS, getSettings, saveSettings, subscribeSettings,
  type NotifyEvent, type NotifySettings,
} from "@/lib/trading/notification-settings";
import { sendTelegramMessage, setTelegramWebhook } from "@/lib/trading/telegram.functions";
import { loadChatIds } from "@/components/trading/TelegramAlerts";
import { cn } from "@/lib/utils";

export function NotificationSettings() {
  const [s, setS] = useState<NotifySettings>(() => getSettings());
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const send = useServerFn(sendTelegramMessage);

  useEffect(() => subscribeSettings(() => setS(getSettings())), []);

  const update = (patch: Partial<NotifySettings>) => {
    const next = { ...s, ...patch };
    saveSettings(next);
    setS(next);
  };
  const toggleEvent = (ev: NotifyEvent) =>
    update({ events: { ...s.events, [ev]: !s.events[ev] } });

  const test = async () => {
    setBusy(true); setStatus(null);
    const chatIds = loadChatIds();
    if (chatIds.length === 0) { setStatus("Add a Chat ID in Telegram Alerts first."); setBusy(false); return; }
    const text = `🔔 <b>IntelliTrade Test</b>\n\nNotifications are connected and working.\n────────────`;
    const results = await Promise.all(chatIds.map((id: string) => send({ data: { chatId: id, text } })));
    const failed = results.filter((r) => !r.ok);
    setStatus(failed.length === 0 ? `Sent to ${chatIds.length} chat(s).` : `Failed: ${failed.map((f: any) => f.error).join(", ")}`);
    setBusy(false);
  };

  return (
    <div className="rounded-xl border border-border/60 bg-surface p-4">
      <div className="flex items-center gap-2">
        <Settings className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Notification Settings</h3>
        <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={s.enabled}
            onChange={(e) => update({ enabled: e.target.checked })}
            className="h-3.5 w-3.5 accent-primary"
          />
          {s.enabled ? "Enabled" : "Disabled"}
        </label>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-1.5">
        {(Object.keys(EVENT_LABELS) as NotifyEvent[]).map((ev) => (
          <label key={ev} className={cn(
            "flex items-center justify-between rounded-md border border-border/50 bg-background/40 px-2.5 py-1.5 text-xs",
            !s.enabled && "opacity-50",
          )}>
            <span>{EVENT_LABELS[ev]}</span>
            <input
              type="checkbox"
              checked={s.events[ev]}
              disabled={!s.enabled}
              onChange={() => toggleEvent(ev)}
              className="h-3.5 w-3.5 accent-primary"
            />
          </label>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-[11px] text-muted-foreground">
          Daily Target ($)
          <input
            type="number"
            value={s.dailyTarget}
            onChange={(e) => update({ dailyTarget: Number(e.target.value) || 0 })}
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
          />
        </label>
        <label className="text-[11px] text-muted-foreground">
          Daily Loss Limit ($)
          <input
            type="number"
            value={s.dailyLossLimit}
            onChange={(e) => update({ dailyLossLimit: Number(e.target.value) || 0 })}
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
          />
        </label>
      </div>

      <button
        onClick={test}
        disabled={busy}
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-surface disabled:opacity-50"
      >
        <Check className="h-3.5 w-3.5" /> Test connection
      </button>
      {status && <div className="mt-2 text-[11px] text-muted-foreground">{status}</div>}
    </div>
  );
}
