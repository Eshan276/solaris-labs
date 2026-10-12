"use client";

import { ArrowLeft, Download, ExternalLink, Loader2, RotateCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { btnOutline, Eyebrow, KeyTerms, SectionTitle } from "@/components/inst";
import { LineChart } from "@/components/line-chart";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjects, useSettlements } from "@/hooks/use-solaris";
import { api } from "@/lib/api";
import { formatEnergy, formatUsdc } from "@/lib/format";
import { projectWatts, verifyProof, type Check, type ProofFile } from "@/lib/proof";
import { explorerAddress, explorerTx, getProgram, PublicKey, settlementPda } from "@/lib/solana";
import { cn } from "@/lib/utils";

type Result = {
  checks: Check[];
  file: ProofFile | null;
  settlementAddress: string;
  totalShares: number;
  amount: number;
  energyWh: number;
  bytes: Uint8Array;
};

/** Fetches the on-chain record and the readings file, then re-checks the payout from scratch. */
async function checkPayout(projectAddress: string, projectId: number, index: number): Promise<Result> {
  const project = new PublicKey(projectAddress);
  const address = settlementPda(project, index);
  const program = getProgram();
  // Everything the check relies on comes from the chain, except the readings file itself.
  const [s, p, bytes] = await Promise.all([
    program.account.settlement.fetch(address),
    program.account.project.fetch(project),
    api.proofBytes(projectId, index),
  ]);
  const checks = verifyProof(
    bytes,
    {
      project: project.toBase58(),
      index,
      amount: s.amount.toNumber(),
      energyWh: s.energyWh.toNumber(),
      proofHash: Uint8Array.from(s.proofHash),
      readingsCount: s.readingsCount,
      periodStart: s.periodStart.toNumber(),
      periodEnd: s.periodEnd.toNumber(),
    },
    { bytes: p.meter.toBytes(), base58: p.meter.toBase58() },
  );
  let file: ProofFile | null = null;
  try {
    file = JSON.parse(new TextDecoder().decode(bytes));
  } catch {}
  return {
    checks,
    file,
    settlementAddress: address.toBase58(),
    totalShares: s.totalShares.toNumber(),
    amount: s.amount.toNumber(),
    energyWh: s.energyWh.toNumber(),
    bytes,
  };
}

export function ProofView({ projectId, index }: { projectId: number; index: number }) {
  const projects = useProjects();
  const info = projects.data?.find((p) => p.id === projectId);
  const settlements = useSettlements(info ? projectId : null);
  const tx = settlements.data?.find((s) => s.idx === index)?.tx ?? null;
  // Each press of "Run again" bumps the attempt; the effect re-runs the check for it.
  const [attempt, setAttempt] = useState(0);
  const [outcome, setOutcome] = useState<{ attempt: number; result?: Result; error?: string } | null>(null);
  const running = outcome?.attempt !== attempt;
  const result = outcome?.result ?? null;
  const error = running ? null : outcome?.error ?? null;
  const run = () => setAttempt((a) => a + 1);
  const address = info?.address;

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    checkPayout(address, projectId, index).then(
      (r) => !cancelled && setOutcome({ attempt, result: r }),
      (e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        if (!cancelled) setOutcome({ attempt, error: /does not exist/i.test(msg) ? "This payout doesn't exist on-chain." : msg });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [address, projectId, index, attempt]);

  const passed = result?.checks.every((c) => c.ok) ?? false;
  const series: [number, number][] =
    result?.file?.readings.map((r) => [r.t, projectWatts(r, result.file!.params)]) ?? [];

  function download() {
    if (!result) return;
    const blob = new Blob([result.bytes.slice().buffer], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `solaris-project-${projectId}-payout-${index + 1}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const fmtTime = (s: number) => new Date(s * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className="mx-auto max-w-4xl px-6 pt-8 pb-20 lg:px-12">
      <Link href={`/projects/${projectId}`} className="inline-flex h-9 items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden /> {info?.name ?? "Offering"}
      </Link>
      <Eyebrow className="mt-6">Verification report</Eyebrow>
      <h1 className="mt-3 font-serif text-[44px] leading-tight tracking-[-0.02em]">Distribution No. {index + 1}</h1>
      <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
        This check runs in your browser. It uses the record stored on Solana and the meter&apos;s signed readings, and
        does not rely on Solaris.
      </p>

      <div aria-live="polite" className="mt-10">
        {error ? (
          <div className="border-y border-destructive py-6">
            <p className="text-[14px] font-medium">The check could not be completed.</p>
            <p className="mt-1 text-[13px] text-muted-foreground">{error}</p>
            <button type="button" className={`${btnOutline} mt-4`} onClick={run}>
              <RotateCw className="size-4" aria-hidden /> Try again
            </button>
          </div>
        ) : !result ? (
          <div className="space-y-4">
            <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Fetching the on-chain record and readings…
            </p>
            <Skeleton className="h-24 w-full rounded-none" />
            <Skeleton className="h-64 w-full rounded-none" />
          </div>
        ) : (
          <>
            <div className={cn("border-t-2 border-b py-6", passed ? "border-t-positive" : "border-t-destructive")}>
              <p className={cn("text-[11px] font-semibold tracking-[0.12em] uppercase", passed ? "text-positive" : "text-destructive")}>
                {passed ? `Verified · ${result.checks.length} of ${result.checks.length} checks passed` : `Failed · ${result.checks.filter((c) => !c.ok).length} check(s) did not pass`}
              </p>
              <p className="mt-2 font-serif text-[26px] leading-snug">
                {passed
                  ? `${formatUsdc(result.amount)} was distributed for ${formatEnergy(result.energyWh)}, backed by ${(result.file?.readings.length ?? 0).toLocaleString()} readings signed by the offering's meter.`
                  : "This distribution does not match its evidence. The failing checks are listed below."}
              </p>
            </div>

            <div className="mt-10">
              <KeyTerms
                terms={[
                  { label: "Amount distributed", value: <span className="font-mono">{formatUsdc(result.amount)}</span> },
                  { label: "Energy", value: <span className="font-mono">{formatEnergy(result.energyWh)}</span> },
                  {
                    label: "Per share",
                    value: <span className="font-mono">{result.totalShares ? formatUsdc(Math.floor(result.amount / result.totalShares)) : "—"}</span>,
                  },
                  { label: "Shares outstanding", value: <span className="font-mono">{result.totalShares.toLocaleString()}</span> },
                  { label: "Period start", value: <span className="font-mono text-[12.5px]">{result.file ? fmtTime(result.file.period_start) : "—"}</span> },
                  { label: "Period end", value: <span className="font-mono text-[12.5px]">{result.file ? fmtTime(result.file.period_end) : "—"}</span> },
                ]}
              />
            </div>

            {series.length > 1 && (
              <section className="mt-12">
                <SectionTitle note="One point per signed reading">Output during this period</SectionTitle>
                <LineChart points={series} height={200} />
              </section>
            )}

            <section className="mt-12">
              <SectionTitle
                note={
                  <button type="button" onClick={run} disabled={running} className="inline-flex items-center gap-1.5 hover:text-foreground disabled:opacity-50">
                    <RotateCw className={cn("size-3.5", running && "animate-spin")} aria-hidden /> Run again
                  </button>
                }
              >
                Checks performed
              </SectionTitle>
              <ol className="border-t border-foreground">
                {result.checks.map((c, i) => (
                  <li key={c.label} className="grid grid-cols-[32px_1fr_auto] items-baseline gap-3 border-b py-3.5">
                    <span className="font-mono text-[12px] text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                    <div className="min-w-0">
                      <p className="text-[14px]">{c.label}</p>
                      <p className="mt-0.5 font-mono text-[11.5px] break-all text-muted-foreground">{c.detail}</p>
                    </div>
                    <span className={cn("text-[11px] font-semibold tracking-[0.1em]", c.ok ? "text-positive" : "text-destructive")}>
                      {c.ok ? "PASS" : "FAIL"}
                    </span>
                  </li>
                ))}
              </ol>
            </section>

            <section className="mt-12">
              <SectionTitle>Documents</SectionTitle>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={btnOutline} onClick={download}>
                  <Download className="size-4" aria-hidden /> Signed readings (JSON)
                </button>
                {tx && (
                  <a href={explorerTx(tx)} target="_blank" rel="noreferrer" className={btnOutline}>
                    <ExternalLink className="size-4" aria-hidden /> Distribution transaction
                  </a>
                )}
                <a href={explorerAddress(result.settlementAddress)} target="_blank" rel="noreferrer" className={btnOutline}>
                  <ExternalLink className="size-4" aria-hidden /> On-chain record
                </a>
              </div>
            </section>

            <section className="mt-14 grid gap-6 border-t pt-8 text-[13px] leading-relaxed text-muted-foreground sm:grid-cols-[180px_1fr]">
              <h2 className="text-[13px] font-semibold text-foreground">Methodology</h2>
              <div className="space-y-3">
                <p>
                  The meter at the array holds its own private key and signs every reading. Its public key is stored with
                  the offering on Solana, so only that meter can produce valid readings.
                </p>
                <p>
                  At each distribution, a SHA-256 fingerprint of the period&apos;s readings is recorded on Solana with the
                  energy and the amount. This check downloads the readings, confirms the fingerprint and every signature,
                  and recalculates the energy and amount from scratch.
                </p>
                <p>
                  Limitation: the meter signs the values and their order; the time of each reading is recorded when it
                  reaches the operator.
                </p>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
