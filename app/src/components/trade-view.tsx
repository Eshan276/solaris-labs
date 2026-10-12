"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { Eyebrow, SectionTitle, StatStrip } from "@/components/inst";
import { LineChart } from "@/components/line-chart";
import { TradePanel } from "@/components/trade-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { useNow } from "@/hooks/use-now";
import { useChainProject, useListings, useProjects, useSettlements, useTrades } from "@/hooks/use-solaris";
import { trailingYield, type TradeInfo } from "@/lib/api";
import { formatPercent, formatUsdc, shortAddress, timeAgo } from "@/lib/format";
import { explorerTx, type ChainListing } from "@/lib/solana";
import { cn } from "@/lib/utils";

const USDC = 1_000_000;
const fmtPrice = (base: number) => (base / USDC).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });

export function TradeView({ id }: { id: number }) {
  const { publicKey } = useWallet();
  const projects = useProjects();
  const info = projects.data?.find((p) => p.id === id);
  const chain = useChainProject(info?.address);
  const listings = useListings(info?.address);
  const trades = useTrades(info ? id : null);
  const settlements = useSettlements(info ? id : null);
  const now = useNow(5_000);
  const p = chain.data;

  if (projects.data && !info) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-24 lg:px-12">
        <h1 className="font-serif text-[36px]">Offering not found</h1>
        <Link href="/market" className="mt-4 inline-block text-[13px] underline underline-offset-4">
          View the market
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

  const asks = listings.data ?? [];
  const history = trades.data ?? [];
  const last = history[0]?.price ?? null;
  const best = asks[0]?.price ?? null;
  const dayAgo = now - 86_400_000;
  const dayVolume = history.filter((t) => t.t > dayAgo).reduce((s, t) => s + t.shares * t.price, 0);
  const yieldPct = p && settlements.data ? trailingYield(settlements.data, p.totalShares, p.sharePrice) : null;
  // A buyer at the market price earns the same distributions on a different outlay.
  const marketPrice = last ?? best;
  const marketYield = yieldPct !== null && p && marketPrice ? (yieldPct * p.sharePrice) / marketPrice : null;
  const vsOffering = p && last ? last / p.sharePrice - 1 : null;
  const refresh = () => {
    listings.refresh();
    chain.refresh();
    // The operator indexes new trades within a few seconds.
    setTimeout(() => trades.refresh(), 4000);
  };

  return (
    <div className="mx-auto max-w-6xl px-6 pt-8 pb-20 lg:px-12">
      <Link href={`/projects/${id}`} className="inline-flex h-9 items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden /> {info.name}
      </Link>

      <header className="mt-6">
        <Eyebrow>Secondary market · shares settle instantly on Solana</Eyebrow>
        <h1 className="mt-3 font-serif text-[44px] leading-[1.05] tracking-[-0.02em] sm:text-[56px]">Trade {info.name}</h1>
        <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
          Buy shares from other holders, or offer yours for sale. A share carries its distribution rights with it: the
          buyer earns from the next distribution, and the seller keeps everything earned before the sale.
        </p>
      </header>

      <div className="mt-10">
        <StatStrip
          stats={[
            {
              label: "Last price",
              value: last === null ? "—" : fmtPrice(last),
              unit: last === null ? undefined : "USDC",
              hint: vsOffering === null ? undefined : `${vsOffering >= 0 ? "+" : ""}${formatPercent(vsOffering)} vs offering price`,
            },
            { label: "Best offer", value: best === null ? "—" : fmtPrice(best), unit: best === null ? undefined : "USDC" },
            { label: "Offering price", value: p ? fmtPrice(p.sharePrice) : "—", unit: "USDC" },
            { label: "24h volume", value: formatUsdc(dayVolume, { symbol: false }), unit: "USDC" },
            {
              label: "Yield at market",
              value: marketYield === null ? "—" : (marketYield * 100).toLocaleString("en-US", { maximumFractionDigits: 2 }),
              unit: marketYield === null ? undefined : "% p.a.",
              hint: "Estimated yield for a buyer at the last traded price (or best offer), from the last 24 hours of distributions",
            },
          ]}
        />
      </div>

      <div className="mt-12 grid gap-14 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-12">
          <section aria-labelledby="price-title">
            <SectionTitle note={history.length ? `${history.length.toLocaleString()} trade${history.length === 1 ? "" : "s"}` : undefined}>
              <span id="price-title">Price</span>
            </SectionTitle>
            <PriceChart trades={history} now={now} />
          </section>

          <section aria-labelledby="book-title">
            <SectionTitle note={asks.length ? `${asks.reduce((s, l) => s + l.amount, 0).toLocaleString()} shares offered` : undefined}>
              <span id="book-title">Offers</span>
            </SectionTitle>
            {listings.loading && !listings.data ? (
              <Skeleton className="h-40 w-full rounded-none" />
            ) : (
              <OrderBook asks={asks} me={publicKey?.toBase58() ?? null} />
            )}
          </section>

          <section aria-labelledby="trades-title">
            <SectionTitle>
              <span id="trades-title">Recent trades</span>
            </SectionTitle>
            {trades.loading && !trades.data ? (
              <Skeleton className="h-40 w-full rounded-none" />
            ) : (
              <TradesTable trades={history.slice(0, 20)} me={publicKey?.toBase58() ?? null} />
            )}
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="space-y-6 border p-6">
            {p ? <TradePanel project={p} asks={asks} lastPrice={last} onDone={refresh} /> : <Skeleton className="h-80 w-full rounded-none" />}
            <p className="text-[11.5px] leading-relaxed text-muted-foreground">
              Test assets on Solana devnet. Trades are peer-to-peer at the seller’s price; Solaris takes no fee. Yield is an
              estimate from recent distributions and is not guaranteed.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function PriceChart({ trades, now }: { trades: TradeInfo[]; now: number }) {
  const points: [number, number][] = trades
    .slice()
    .reverse()
    .map((t) => [t.t, t.price / USDC]);
  // Carry the last price to now so a single trade still draws a line.
  if (points.length) points.push([Math.max(now, points[points.length - 1][0] + 1), points[points.length - 1][1]]);
  return (
    <LineChart
      points={points}
      format={(v) => (+v.toFixed(4)).toString()}
      fromZero={false}
      stepped
      empty="No trades yet. The first trade sets the market price."
    />
  );
}

/** Offers grouped by price, cheapest first, with cumulative depth. */
function OrderBook({ asks, me }: { asks: ChainListing[]; me: string | null }) {
  if (!asks.length) {
    return (
      <p className="border-y py-8 text-center text-[13px] text-muted-foreground">
        No offers right now. Holders can offer shares from the Sell tab.
      </p>
    );
  }
  const levels: { price: number; shares: number; sellers: number; mine: boolean }[] = [];
  for (const l of asks) {
    const level = levels.at(-1);
    const mine = l.seller.toBase58() === me;
    if (level && level.price === l.price) {
      level.shares += l.amount;
      level.sellers++;
      level.mine ||= mine;
    } else {
      levels.push({ price: l.price, shares: l.amount, sellers: 1, mine });
    }
  }
  const total = levels.reduce((s, l) => s + l.shares, 0);
  let cum = 0;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-[13px]">
        <thead>
          <tr className="border-b border-foreground text-left text-[11px] tracking-[0.06em] text-muted-foreground uppercase">
            <th className="py-2.5 font-medium">Price (USDC)</th>
            <th className="py-2.5 text-right font-medium">Shares</th>
            <th className="py-2.5 text-right font-medium">Total (USDC)</th>
            <th className="py-2.5 text-right font-medium">Sellers</th>
          </tr>
        </thead>
        <tbody>
          {levels.slice(0, 12).map((l) => {
            cum += l.shares;
            return (
              <tr key={l.price} className="relative border-b">
                <td className="relative py-2.5 font-mono tabular-nums">
                  <span
                    className="absolute inset-y-0 left-0 bg-foreground/[0.05]"
                    style={{ width: `${(100 * cum) / total}%` }}
                    aria-hidden
                  />
                  <span className="relative">{fmtPrice(l.price)}</span>
                  {l.mine && <span className="relative ml-2 font-sans text-[11px] text-muted-foreground">yours</span>}
                </td>
                <td className="py-2.5 text-right font-mono tabular-nums">{l.shares.toLocaleString()}</td>
                <td className="py-2.5 text-right font-mono tabular-nums">{formatUsdc(l.shares * l.price, { symbol: false })}</td>
                <td className="py-2.5 text-right font-mono tabular-nums text-muted-foreground">{l.sellers}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TradesTable({ trades, me }: { trades: TradeInfo[]; me: string | null }) {
  if (!trades.length) {
    return <p className="border-y py-8 text-center text-[13px] text-muted-foreground">No trades yet.</p>;
  }
  const who = (a: string) => (a === me ? "You" : shortAddress(a));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-[13px]">
        <thead>
          <tr className="border-b border-foreground text-left text-[11px] tracking-[0.06em] text-muted-foreground uppercase">
            <th className="py-2.5 font-medium">Time</th>
            <th className="py-2.5 text-right font-medium">Price</th>
            <th className="py-2.5 text-right font-medium">Shares</th>
            <th className="py-2.5 text-right font-medium">Value</th>
            <th className="py-2.5 pl-6 font-medium">Seller → Buyer</th>
            <th className="py-2.5" />
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => (
            <tr key={`${t.sig}:${t.seller}:${t.shares}`} className="border-b">
              <td className="py-2.5 text-muted-foreground" title={new Date(t.t).toLocaleString()}>
                {timeAgo(t.t)}
              </td>
              <td className="py-2.5 text-right font-mono tabular-nums">{fmtPrice(t.price)}</td>
              <td className="py-2.5 text-right font-mono tabular-nums">{t.shares.toLocaleString()}</td>
              <td className="py-2.5 text-right font-mono tabular-nums">{formatUsdc(t.shares * t.price, { symbol: false })}</td>
              <td className={cn("py-2.5 pl-6 font-mono text-[12.5px]", (t.seller === me || t.buyer === me) ? "text-foreground" : "text-muted-foreground")}>
                {who(t.seller)} → {who(t.buyer)}
              </td>
              <td className="py-2.5 text-right">
                <a
                  href={explorerTx(t.sig)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Trade transaction on Solana Explorer"
                  className="inline-grid size-7 place-items-center text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="size-3.5" aria-hidden />
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
