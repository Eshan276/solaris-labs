// Shared building blocks for the institutional layout: ruled stat strips, key-terms tables, buttons.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const btnPrimary =
  "inline-flex h-11 items-center justify-center gap-2 border border-primary bg-primary px-5 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40";
export const btnOutline =
  "inline-flex h-11 items-center justify-center gap-2 border border-input bg-background px-5 text-[13px] font-medium transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40";

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-[11px] tracking-[0.12em] text-muted-foreground uppercase", className)}>{children}</p>;
}

export function SectionTitle({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-4">
      <h2 className="text-[13px] font-semibold tracking-[0.02em]">{children}</h2>
      {note && <span className="text-[12px] text-muted-foreground">{note}</span>}
    </div>
  );
}

export type Stat = { label: string; value: ReactNode; unit?: string; hint?: string };

/** Fact-sheet strip: a heavy top rule, hairline dividers, serif figures. */
export function StatStrip({ stats }: { stats: Stat[] }) {
  return (
    <dl className="grid grid-cols-2 border-t border-foreground border-b sm:grid-cols-3 lg:grid-cols-5">
      {stats.map((s, i) => (
        <div
          key={s.label}
          title={s.hint}
          className={cn("py-4 pr-4", i > 0 && "lg:border-l lg:pl-5", i % 2 === 1 && "border-l pl-5 sm:border-l-0 sm:pl-0 lg:pl-5")}
        >
          <dt className="text-[12px] text-muted-foreground">{s.label}</dt>
          <dd className="mt-1.5 font-serif text-[30px] leading-none tracking-tight tabular-nums">
            {s.value}
            {s.unit && <small className="ml-1 font-sans text-[13px] text-muted-foreground">{s.unit}</small>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Two-column key/value table with hairline rules. */
export function KeyTerms({ terms }: { terms: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid gap-x-10 sm:grid-cols-2">
      {terms.map((t) => (
        <div key={t.label} className="flex items-center justify-between gap-4 border-b py-2.5 text-[13px]">
          <dt className="text-muted-foreground">{t.label}</dt>
          <dd className="min-w-0 text-right">{t.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function LiveStatus({ online, label }: { online: boolean; label: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[12px]", online ? "text-positive" : "text-muted-foreground")}>
      <span className={cn("size-1.5 rounded-full", online ? "bg-positive motion-safe:animate-pulse" : "bg-muted-foreground")} aria-hidden />
      {label}
    </span>
  );
}
