"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Address } from "@/components/address";
import { DistributionsTable } from "@/components/distributions-table";
import { HoldingPanel } from "@/components/holding-panel";
import { Eyebrow, KeyTerms, SectionTitle, StatStrip } from "@/components/inst";
import { InvestPanel } from "@/components/invest-panel";
import { OutputPanel } from "@/components/output-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { useChainProject, useLive, useProjects, useSettlements } from "@/hooks/use-solaris";
import { trailingYield } from "@/lib/api";
import { formatUsdc } from "@/lib/format";
import { PROGRAM_ID, PublicKey, revenueVaultPda } from "@/lib/solana";

export function ProjectView({ id }: { id: number }) {
  const projects = useProjects();
  const info = projects.data?.find((p) => p.id === id);
  const chain = useChainProject(info?.address);
  const settlements = useSettlements(info ? id : null);
  const live = useLive(info ? id : null);
  const p = chain.data;

  if (projects.data && !info) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-24 lg:px-12">
        <h1 className="font-serif text-[36px]">Offering not found</h1>
        <Link href="/#offerings" className="mt-4 inline-block text-[13px] underline underline-offset-4">
          View all offerings
        </Link>
      </div>
    );
  }
  if (!info) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 px-6 py-14 lg:px-12">
        <Skeleton className="h-14 w-96 rounded-none" />
        <Skeleton className="h-24 w-full rounded-none" />
      </div>
    );
  }

  const yieldPct = p && settlements.data ? trailingYield(settlements.data, p.totalShares, p.sharePrice) : null;
  const watts = live.data?.last?.projectWatts ?? info.live.last?.projectWatts ?? 0;
  const refresh = () => {
    chain.refresh();
    settlements.refresh();
  };
  const tariff = info.tariffUsdcPerKwh;
  const periodMin = Math.round((live.data?.settlementPeriodSec ?? 300) / 60);

  return (
    <div className="mx-auto max-w-6xl px-6 pt-8 pb-20 lg:px-12">
      <Link href="/#offerings" className="inline-flex h-9 items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden /> Offerings
      </Link>

      <header className="mt-6">
        <Eyebrow>
          Solar infrastructure · distribution every {periodMin} minutes
        </Eyebrow>
        <h1 className="mt-3 font-serif text-[44px] leading-[1.05] tracking-[-0.02em] sm:text-[56px]">{info.name}</h1>
        <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">{info.description}</p>
      </header>

      <div className="mt-10">
        <StatStrip
          stats={[
            {
              label: "Estimated yield",
              value: yieldPct === null ? "—" : (yieldPct * 100).toLocaleString("en-US", { maximumFractionDigits: 2 }),
              unit: yieldPct === null ? undefined : "% p.a.",
              hint: "Annualized from the last 24 hours of distributions, relative to capital subscribed",
            },
            { label: "Share price", value: p ? formatUsdc(p.sharePrice, { symbol: false }) : "—", unit: "USDC" },
            {
              label: "Capital subscribed",
              value: p ? ((100 * p.totalShares) / p.maxShares).toLocaleString("en-US", { maximumFractionDigits: 1 }) : "—",
              unit: "%",
            },
            { label: "Distributed to date", value: p ? formatUsdc(p.totalFunded, { symbol: false }) : "—", unit: "USDC" },
            {
              label: "Output now",
              value: watts >= 1000 ? (watts / 1000).toLocaleString("en-US", { maximumFractionDigits: 2 }) : Math.round(watts).toLocaleString(),
              unit: watts >= 1000 ? "kW" : "W",
            },
          ]}
        />
      </div>

      <div className="mt-12 grid gap-14 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-12">
          <OutputPanel projectId={id} />

          <section aria-labelledby="terms-title">
            <SectionTitle>
              <span id="terms-title">Key terms</span>
            </SectionTitle>
            <KeyTerms
              terms={[
                { label: "Asset", value: `Solar PV, ${info.capacityKw} kW` },
                { label: "Location", value: info.location },
                { label: "Offtake tariff", value: <span className="font-mono">{tariff.toFixed(2)} USDC / kWh</span> },
                { label: "Distribution", value: `Every ${periodMin} minutes` },
                { label: "Total shares", value: <span className="font-mono">{p ? p.maxShares.toLocaleString() : "—"}</span> },
                { label: "Settlement asset", value: "USDC (test)" },
                { label: "Meter key", value: <Address value={info.meter} label="Meter key" /> },
                { label: "Offering account", value: <Address value={info.address} label="Offering account" /> },
                {
                  label: "Distribution vault",
                  value: <Address value={revenueVaultPda(new PublicKey(info.address)).toBase58()} label="Distribution vault" />,
                },
                { label: "Program", value: <Address value={PROGRAM_ID.toBase58()} label="Program" /> },
              ]}
            />
          </section>

          <section aria-labelledby="dist-title">
            <SectionTitle note={p ? `${p.settlementCount.toLocaleString()} total` : undefined}>
              <span id="dist-title">Distribution history</span>
            </SectionTitle>
            <DistributionsTable projectId={id} limit={12} />
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="space-y-6 border p-6">
            {p ? (
              <>
                <HoldingPanel project={p} onDone={refresh} />
                <InvestPanel project={p} onDone={refresh} yieldPct={yieldPct} />
              </>
            ) : (
              <Skeleton className="h-80 w-full rounded-none" />
            )}
            <Link
              href={`/projects/${id}/trade`}
              className="flex items-center justify-between border-t pt-4 text-[13px] underline-offset-4 hover:underline"
            >
              Buy from or sell to other holders <span aria-hidden>›</span>
            </Link>
            <p className="text-[11.5px] leading-relaxed text-muted-foreground">
              Test assets on Solana devnet. Shares earn from the first distribution after subscription. Yield is an
              estimate from recent distributions and is not guaranteed.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
