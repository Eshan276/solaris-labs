"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { btnOutline, btnPrimary, Eyebrow, StatStrip } from "@/components/inst";
import { Skeleton } from "@/components/ui/skeleton";
import { useCollect } from "@/hooks/use-collect";
import { useBalances, useChainProject, useDeployment, useProjects } from "@/hooks/use-solaris";
import type { ProjectInfo } from "@/lib/api";
import { formatPercent, formatUsdc } from "@/lib/format";

type Totals = { value: number; claimable: number; claimed: number; shares: number };

export function PortfolioView() {
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const projects = useProjects();
  const deployment = useDeployment();
  const balances = useBalances(publicKey, deployment.data?.usdcMint);
  const [rows, setRows] = useState<Record<number, Totals>>({});
  const report = useCallback((id: number, t: Totals) => {
    setRows((r) => (JSON.stringify(r[id]) === JSON.stringify(t) ? r : { ...r, [id]: t }));
  }, []);

  if (!publicKey) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-24 lg:px-12">
        <Eyebrow>Portfolio</Eyebrow>
        <h1 className="mt-3 font-serif text-[44px] tracking-tight">Your holdings</h1>
        <p className="mt-3 max-w-md text-[14px] text-muted-foreground">
          Connect a wallet to see your holdings and collect distributions.
        </p>
        <button type="button" className={`${btnPrimary} mt-8`} onClick={() => setVisible(true)}>
          Connect wallet
        </button>
      </div>
    );
  }

  const all = Object.values(rows);
  const sum = (f: (t: Totals) => number) => all.reduce((a, t) => a + f(t), 0);
  const held = (projects.data ?? []).filter((p) => (rows[p.id]?.shares ?? 0) > 0);
  // Every offering must report before totals are shown or "no holdings" is claimed.
  const ready = !!projects.data && projects.data.every((p) => rows[p.id] !== undefined);
  const total = (f: (t: Totals) => number) => (ready ? formatUsdc(sum(f), { symbol: false }) : "—");

  return (
    <div className="mx-auto max-w-6xl px-6 pt-14 pb-20 lg:px-12">
      <Eyebrow>Portfolio</Eyebrow>
      <h1 className="mt-3 font-serif text-[44px] tracking-tight">Your holdings</h1>

      <div className="mt-10">
        <StatStrip
          stats={[
            { label: "Holdings value", value: total((t) => t.value), unit: "USDC", hint: "Shares at their subscription price" },
            { label: "Available to collect", value: total((t) => t.claimable), unit: "USDC" },
            { label: "Collected to date", value: total((t) => t.claimed), unit: "USDC" },
            { label: "Offerings held", value: ready ? held.length : "—" },
            { label: "Wallet balance", value: balances.data ? formatUsdc(balances.data.usdc ?? 0, { symbol: false }) : "—", unit: "USDC" },
          ]}
        />
      </div>

      <section className="mt-12">
        {projects.loading && !projects.data ? (
          <Skeleton className="h-40 w-full rounded-none" />
        ) : projects.error && !projects.data ? (
          <p className="border-y py-8 text-center text-[13px] text-muted-foreground">Holdings are unavailable right now. Retrying…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead>
                <tr className="border-b border-foreground text-left text-[11px] tracking-[0.06em] text-muted-foreground uppercase">
                  <th className="py-2.5 font-medium">Offering</th>
                  <th className="py-2.5 text-right font-medium">Shares</th>
                  <th className="py-2.5 text-right font-medium">Ownership</th>
                  <th className="py-2.5 text-right font-medium">Value</th>
                  <th className="py-2.5 text-right font-medium">Collected</th>
                  <th className="py-2.5 text-right font-medium">Available</th>
                  <th className="py-2.5" />
                </tr>
              </thead>
              <tbody>
                {projects.data?.map((p) => <HoldingRow key={p.id} info={p} report={report} />)}
              </tbody>
            </table>
            {!ready && held.length === 0 && <Skeleton className="mt-2 h-16 w-full rounded-none" />}
            {ready && held.length === 0 && (
              <div className="border-b py-10 text-center">
                <p className="text-[14px]">You don&apos;t hold any shares yet.</p>
                <Link href="/#offerings" className={`${btnOutline} mt-4`}>
                  View offerings
                </Link>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function HoldingRow({ info, report }: { info: ProjectInfo; report: (id: number, t: Totals) => void }) {
  const chain = useChainProject(info.address);
  const { position, collect, pending } = useCollect(chain.data, chain.refresh);
  const p = chain.data;
  const pos = position.data;

  useEffect(() => {
    if (!p || position.data === undefined) return;
    report(info.id, {
      shares: pos?.shares ?? 0,
      value: (pos?.shares ?? 0) * p.sharePrice,
      claimable: pos?.claimable ?? 0,
      claimed: pos?.claimed ?? 0,
    });
  }, [p, pos, position.data, info.id, report]);

  if (!p || !pos || pos.shares === 0) return null;
  return (
    <tr className="border-b">
      <td className="py-4">
        <Link href={`/projects/${info.id}`} className="font-serif text-[18px] tracking-tight hover:underline underline-offset-4">
          {info.name}
        </Link>
        <p className="text-[12px] text-muted-foreground">{info.location}</p>
      </td>
      <td className="py-4 text-right font-mono tabular-nums">{pos.shares.toLocaleString()}</td>
      <td className="py-4 text-right font-mono tabular-nums">{formatPercent(p.totalShares ? pos.shares / p.totalShares : 0)}</td>
      <td className="py-4 text-right font-mono tabular-nums">{formatUsdc(pos.shares * p.sharePrice)}</td>
      <td className="py-4 text-right font-mono tabular-nums">{formatUsdc(pos.claimed)}</td>
      <td className="py-4 text-right font-mono tabular-nums">{formatUsdc(pos.claimable)}</td>
      <td className="py-4 pl-6 text-right">
        <button type="button" className={`${btnOutline} h-9 px-4`} disabled={pos.claimable === 0 || pending} onClick={collect}>
          {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          {pending ? "Collecting…" : "Collect"}
        </button>
      </td>
    </tr>
  );
}
