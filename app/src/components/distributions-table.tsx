"use client";

import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { useSettlements } from "@/hooks/use-solaris";
import { formatEnergy, formatUsdc } from "@/lib/format";
import { explorerTx } from "@/lib/solana";

const fmtPeriod = (start: number, end: number) => {
  const d = new Date(start * 1000);
  const day = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const t = (s: number) => new Date(s * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `${day}, ${t(start)}–${t(end)}`;
};

/** Distribution history, each row linking to its verification report. */
export function DistributionsTable({ projectId, limit }: { projectId: number; limit?: number }) {
  const { data, error, loading } = useSettlements(projectId);
  if (loading && !data) return <Skeleton className="h-48 w-full rounded-none" />;
  if (error && !data) return <p className="border-y py-8 text-center text-[13px] text-muted-foreground">Distributions are unavailable right now. Retrying…</p>;
  if (!data?.length) {
    return (
      <p className="border-y py-8 text-center text-[13px] text-muted-foreground">
        No distributions yet. The first is made once the array has produced and at least one share is held.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-[13px]">
        <thead>
          <tr className="border-b border-foreground text-left text-[11px] tracking-[0.06em] text-muted-foreground uppercase">
            <th className="py-2.5 font-medium">Distribution</th>
            <th className="py-2.5 font-medium">Period</th>
            <th className="py-2.5 text-right font-medium">Energy</th>
            <th className="py-2.5 text-right font-medium">Amount</th>
            <th className="py-2.5 text-right font-medium">Verification</th>
          </tr>
        </thead>
        <tbody>
          {data.slice(0, limit).map((s) => (
            <tr key={s.idx} className="border-b">
              <td className="py-3">No. {s.idx + 1}</td>
              <td className="py-3 font-mono text-[12.5px] text-muted-foreground tabular-nums">{fmtPeriod(s.period_start, s.period_end)}</td>
              <td className="py-3 text-right font-mono tabular-nums">{formatEnergy(s.energy_wh)}</td>
              <td className="py-3 text-right font-mono tabular-nums">{formatUsdc(s.amount)}</td>
              <td className="py-3 text-right">
                <span className="inline-flex items-center gap-3">
                  <Link
                    href={`/projects/${projectId}/payouts/${s.idx}`}
                    className="text-positive underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    Verify ›
                  </Link>
                  {s.tx && (
                    <a
                      href={explorerTx(s.tx)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Distribution ${s.idx + 1} transaction on Solana Explorer`}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                  )}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
