import { useSyncExternalStore } from "react";
import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  QUALITY_OPTIONS,
  getQualityMode,
  setQualityMode,
  subscribeQuality,
  type QualityMode,
} from "@/lib/trading/quality-settings";

export function QualitySettings() {
  const mode = useSyncExternalStore(subscribeQuality, getQualityMode, getQualityMode);
  return (
    <div className="rounded-xl border border-border/60 bg-surface p-4">
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Trading Quality</h3>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Choose which grades the bot should alert on and recommend for execution.
        The engine still evaluates every setup — this only controls what you get
        pinged about and what shows a “Log Trade” button.
      </p>
      <div className="mt-3 space-y-1.5">
        {QUALITY_OPTIONS.map((opt) => {
          const active = mode === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => setQualityMode(opt.id as QualityMode)}
              className={cn(
                "flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left transition",
                active
                  ? "border-primary/50 bg-primary/10"
                  : "border-border/50 bg-background/40 hover:bg-background",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                  active ? "border-primary bg-primary" : "border-border",
                )}
              >
                {active && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
              </span>
              <span className="flex-1">
                <span className="text-[12px] font-semibold text-foreground">{opt.label}</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">{opt.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
