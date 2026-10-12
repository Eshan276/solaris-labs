"use client";

import { Loader2 } from "lucide-react";
import { btnOutline } from "@/components/inst";
import { Skeleton } from "@/components/ui/skeleton";
import { useCollect } from "@/hooks/use-collect";
import { formatPercent, formatUsdc } from "@/lib/format";
import type { ChainProject } from "@/lib/solana";

/** Sidebar block: the connected wallet's holding and its available distributions. */
export function HoldingPanel({ project, onDone }: { project: ChainProject; onDone?: () => void }) {
  const { connected, position, collect, pending } = useCollect(project, onDone);
  if (!connected) return null;
  if (position.loading && position.data === undefined) return <Skeleton className="h-36 w-full rounded-none" />;
  const pos = position.data;
  if (!pos || pos.shares === 0) {
    return (
      <div className="border-b pb-5 text-[13px] text-muted-foreground">
        <p className="text-[12px]">Your holding</p>
        <p className="mt-1">No shares yet. Shares earn from the first distribution after you subscribe.</p>
      </div>
    );
  }
  return (
    <div className="border-b pb-6">
      <p className="text-[12px] text-muted-foreground">Your holding</p>
      <p className="mt-1 font-serif text-[34px] leading-none tabular-nums">
        {pos.shares.toLocaleString()}
        <span className="ml-2 font-sans text-[13px] text-muted-foreground">
          shares · {formatUsdc(pos.shares * project.sharePrice)}
        </span>
      </p>
      <dl className="mt-4 text-[13px]">
        <Row label="Ownership" value={formatPercent(project.totalShares ? pos.shares / project.totalShares : 0)} />
        <Row label="Available to collect" value={formatUsdc(pos.claimable)} />
        <Row label="Collected to date" value={formatUsdc(pos.claimed)} />
      </dl>
      <button type="button" className={`${btnOutline} mt-4 w-full`} disabled={pos.claimable === 0 || pending} onClick={collect}>
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {pending ? "Collecting…" : pos.claimable === 0 ? "Nothing to collect yet" : "Collect distribution"}
      </button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono tabular-nums">{value}</dd>
    </div>
  );
}
