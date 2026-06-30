import { cn } from "@/lib/utils";

export function Stat({ label, value, sub, tone = "default", className }: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "default" | "bull" | "bear" | "warning" | "info";
  className?: string;
}) {
  const toneClass = {
    default: "text-foreground",
    bull: "text-bull",
    bear: "text-bear",
    warning: "text-warning",
    info: "text-info",
  }[tone];
  return (
    <div className={cn("rounded-lg border border-border/60 bg-surface px-3 py-2.5", className)}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-1 font-mono-tab text-sm font-semibold", toneClass)}>{value}</div>
      {sub && <div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function Pill({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "bull" | "bear" | "warning" | "info" | "muted" }) {
  const toneClass = {
    default: "bg-surface-elevated text-foreground border-border",
    bull: "bg-bull/10 text-bull border-bull/30",
    bear: "bg-bear/10 text-bear border-bear/30",
    warning: "bg-warning/10 text-warning border-warning/30",
    info: "bg-info/10 text-info border-info/30",
    muted: "bg-muted text-muted-foreground border-border",
  }[tone];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium", toneClass)}>
      {children}
    </span>
  );
}
