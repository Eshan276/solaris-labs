"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LiveStatus, StatStrip } from "@/components/inst";
import { Skeleton } from "@/components/ui/skeleton";
import { usePoll } from "@/hooks/use-poll";
import { useChainProject, useProjects, useSettlements } from "@/hooks/use-solaris";
import { trailingYield, type ProjectInfo } from "@/lib/api";
import { formatPercent, formatPower, formatUsdc } from "@/lib/format";
import { fetchProject, PublicKey } from "@/lib/solana";

/** Platform totals across all offerings. */
export function PlatformStats() {
  const projects = useProjects();
  const list = projects.data ?? [];
  const chain = usePoll(
    list.length ? `platform:${list.map((p) => p.address).join(",")}` : null,
    () => Promise.all(list.map((p) => fetchProject(new PublicKey(p.address)))),
    15_000,
  );
  const sum = (f: (p: ProjectInfo) => number) => list.reduce((a, p) => a + f(p), 0);
  const ready = !!projects.data;
  return (
    <StatStrip
      stats={[
        { label: "Offerings live", value: ready ? list.length : "—" },
        { label: "Installed capacity", value: ready ? sum((p) => p.capacityKw) : "—", unit: "kW" },
        {
          label: "Output now",
          value: ready ? (sum((p) => p.live.last?.projectWatts ?? 0) / 1000).toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—",
          unit: "kW",
        },
        {
          label: "Distributed to date",
          value: chain.data ? formatUsdc(chain.data.reduce((a, p) => a + p.totalFunded, 0), { symbol: false }) : "—",
          unit: "USDC",
        },
        { label: "Distributions verified", value: ready ? sum((p) => p.settlements).toLocaleString() : "—" },
      ]}
    />
  );
}

export function OfferingsTable() {
  const { data, error, loading, refresh } = useProjects();
  if (loading && !data) {
    return (
      <div className="space-y-2">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-none" />
        ))}
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="border-y py-10 text-center text-[13px] text-muted-foreground">
        Offerings are unavailable right now.{" "}
        <button onClick={refresh} className="underline underline-offset-4 hover:text-foreground">
          Retry
        </button>
      </div>
    );
  }
  if (!data?.length) return <p className="border-y py-10 text-center text-[13px] text-muted-foreground">No offerings are open.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-[13px]">
        <thead>
          <tr className="border-b border-foreground text-left text-[11px] tracking-[0.06em] text-muted-foreground uppercase">
            <th className="py-2.5 font-medium">Offering</th>
            <th className="py-2.5 text-right font-medium">Capacity</th>
            <th className="py-2.5 text-right font-medium">Output now</th>
            <th className="py-2.5 text-right font-medium">Est. yield</th>
            <th className="py-2.5 text-right font-medium">Share price</th>
            <th className="py-2.5 pl-8 font-medium">Subscribed</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {data.map((p) => (
            <OfferingRow key={p.id} info={p} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OfferingRow({ info }: { info: ProjectInfo }) {
  const router = useRouter();
  const chain = useChainProject(info.address);
  const settlements = useSettlements(info.id);
  const p = chain.data;
  const y = p && settlements.data ? trailingYield(settlements.data, p.totalShares, p.sharePrice) : null;
  const href = `/projects/${info.id}`;
  const pct = p ? p.totalShares / p.maxShares : 0;
  return (
    <tr onClick={() => router.push(href)} className="group cursor-pointer border-b transition-colors hover:bg-muted/60">
      <td className="py-4 pr-4">
        <Link href={href} className="font-serif text-[19px] tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          {info.name}
        </Link>
        <div className="mt-0.5 flex items-center gap-3 text-[12px] text-muted-foreground">
          <span>{info.location}</span>
          <LiveStatus online={info.live.online} label={info.live.online ? "Meter live" : "Meter offline"} />
        </div>
      </td>
      <td className="py-4 text-right font-mono tabular-nums">{info.capacityKw} kW</td>
      <td className="py-4 text-right font-mono tabular-nums">{formatPower(info.live.last?.projectWatts ?? 0)}</td>
      <td className="py-4 text-right font-mono tabular-nums">{p ? (y === null ? "—" : formatPercent(y)) : "…"}</td>
      <td className="py-4 text-right font-mono tabular-nums">{p ? formatUsdc(p.sharePrice) : "…"}</td>
      <td className="py-4 pl-8">
        <div className="flex items-center gap-3">
          <div className="h-1 w-24 bg-border" aria-hidden>
            <div className="h-1 bg-foreground" style={{ width: `${pct * 100}%` }} />
          </div>
          <span className="font-mono text-[12px] tabular-nums text-muted-foreground">{p ? formatPercent(pct) : "…"}</span>
        </div>
      </td>
      <td className="py-4 text-right text-muted-foreground group-hover:text-foreground">
        <ArrowRight className="ml-auto size-4" aria-hidden />
      </td>
    </tr>
  );
}
