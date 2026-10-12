"use client";

import { LiveStatus, SectionTitle } from "@/components/inst";
import { LineChart } from "@/components/line-chart";
import { Skeleton } from "@/components/ui/skeleton";
import { useLive } from "@/hooks/use-solaris";
import { timeAgo, timeUntil } from "@/lib/format";

/** Output over the last 15 minutes, straight from the signed meter readings. */
export function OutputPanel({ projectId }: { projectId: number }) {
  const { data: live, error, loading } = useLive(projectId);
  const status = !live ? null : live.online ? "Meter live · signed" : live.last ? `Meter offline · ${timeAgo(live.last.t)}` : "Waiting for meter";
  return (
    <section aria-labelledby="output-title">
      <SectionTitle note={status && <LiveStatus online={!!live?.online} label={status} />}>
        <span id="output-title">Output, last 15 minutes</span>
      </SectionTitle>
      {loading && !live ? (
        <Skeleton className="h-[220px] w-full rounded-none" />
      ) : error && !live ? (
        <p className="flex h-[220px] items-center justify-center border-y text-[13px] text-muted-foreground">
          Live data is unavailable right now. Retrying…
        </p>
      ) : (
        <LineChart points={live?.series ?? []} />
      )}
      {live?.nextSettlementAt && (
        <p className="mt-2 text-right font-mono text-[12px] text-muted-foreground tabular-nums">
          Next distribution in {timeUntil(live.nextSettlementAt)}
        </p>
      )}
    </section>
  );
}
