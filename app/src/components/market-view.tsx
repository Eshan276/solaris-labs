"use client";

import Link from "next/link";
import { Eyebrow } from "@/components/inst";
import { Skeleton } from "@/components/ui/skeleton";
import { useMarketOverview, useProjects } from "@/hooks/use-solaris";
import { formatPercent, formatUsdc } from "@/lib/format";

const USDC = 1_000_000;
const fmtPrice = (base: number) => (base / USDC).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });

/** Every offering's secondary market at a glance. */
export function MarketView() {
  const projects = useProjects();
  const overview = useMarketOverview();
  const ready = projects.data && overview.data;

  return (
    <div className="mx-auto max-w-6xl px-6 pt-14 pb-20 lg:px-12">
      <Eyebrow>Secondary market</Eyebrow>
      <h1 className="mt-3 font-serif text-[44px] leading-[1.05] tracking-[-0.02em] sm:text-[56px]">Trade ownership shares</h1>
      <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
        Holders can sell their shares to other investors at any time, at a price they choose. Trades settle on Solana in
        seconds, and the shares carry their future distributions with them.
      </p>

      <div className="mt-10 overflow-x-auto">
        {!ready ? (
          <Skeleton className="h-40 w-full rounded-none" />
        ) : (
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="border-b border-foreground text-left text-[11px] tracking-[0.06em] text-muted-foreground uppercase">
                <th className="py-2.5 font-medium">Offering</th>
                <th className="py-2.5 text-right font-medium">Last price</th>
                <th className="py-2.5 text-right font-medium">vs offering</th>
                <th className="py-2.5 text-right font-medium">Best offer</th>
                <th className="py-2.5 text-right font-medium">Shares offered</th>
                <th className="py-2.5 text-right font-medium">Volume</th>
                <th className="py-2.5" />
              </tr>
            </thead>
            <tbody>
              {projects.data!.map((p) => {
                const market = overview.data!.markets.find((m) => m.project.toBase58() === p.address);
                const asks = overview.data!.listings.filter((l) => l.project.toBase58() === p.address);
                const offered = asks.reduce((s, l) => s + l.amount, 0);
                const last = market?.tradeCount ? market.lastPrice : null;
                const sharePrice = overview.data!.sharePrices.get(p.address);
                const change = last !== null && sharePrice ? last / sharePrice - 1 : null;
                return (
                  <tr key={p.id} className="border-b">
                    <td className="py-4">
                      <Link href={`/projects/${p.id}/trade`} className="font-serif text-[18px] hover:underline underline-offset-4">
                        {p.name}
                      </Link>
                      <div className="text-[12px] text-muted-foreground">{p.location}</div>
                    </td>
                    <td className="py-4 text-right font-mono tabular-nums">{last === null ? "—" : fmtPrice(last)}</td>
                    <td
                      className={`py-4 text-right font-mono tabular-nums ${change === null ? "text-muted-foreground" : change >= 0 ? "text-positive" : "text-destructive"}`}
                    >
                      {change === null ? "—" : `${change >= 0 ? "+" : ""}${formatPercent(change)}`}
                    </td>
                    <td className="py-4 text-right font-mono tabular-nums">{asks[0] ? fmtPrice(asks[0].price) : "—"}</td>
                    <td className="py-4 text-right font-mono tabular-nums">{offered.toLocaleString()}</td>
                    <td className="py-4 text-right font-mono tabular-nums">
                      {market ? formatUsdc(market.volumeStablecoin) : "—"}
                    </td>
                    <td className="py-4 text-right">
                      <Link href={`/projects/${p.id}/trade`} className="text-[13px] underline-offset-4 hover:underline">
                        Trade ›
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
