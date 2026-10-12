"use client";

import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Transaction, type PublicKey } from "@solana/web3.js";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { btnOutline, btnPrimary } from "@/components/inst";
import { useBalances, usePosition, useShareBalance } from "@/hooks/use-solaris";
import { useTx } from "@/hooks/use-tx";
import { api } from "@/lib/api";
import { formatUsdc } from "@/lib/format";
import {
  ata,
  BN,
  escrowAta,
  getProgram,
  listingPda,
  marketPda,
  positionPda,
  revenuePda,
  type ChainListing,
  type ChainProject,
} from "@/lib/solana";
import { cn } from "@/lib/utils";

/** Offers filled per transaction; more would overflow the transaction size limit. */
const MAX_LEGS = 3;
const USDC = 1_000_000;

export type Fill = { legs: { listing: ChainListing; take: number }[]; shares: number; cost: number; worst: number };

/** Fills `want` shares from the cheapest offers, skipping the buyer's own listing. */
export function planFill(asks: ChainListing[], want: number, buyer: PublicKey | null): Fill {
  const legs: Fill["legs"] = [];
  let left = want;
  for (const l of asks) {
    if (left <= 0 || legs.length >= MAX_LEGS) break;
    if (buyer && l.seller.equals(buyer)) continue;
    const take = Math.min(left, l.amount);
    legs.push({ listing: l, take });
    left -= take;
  }
  const shares = legs.reduce((s, l) => s + l.take, 0);
  const cost = legs.reduce((s, l) => s + l.take * l.listing.price, 0);
  return { legs, shares, cost, worst: legs.at(-1)?.listing.price ?? 0 };
}

/** Parses a USDC amount typed by the user into base units (null if invalid). */
function parseUsdc(input: string): number | null {
  if (!/^\d+(\.\d{0,6})?$/.test(input.trim())) return null;
  const v = Math.round(Number(input) * USDC);
  return v > 0 ? v : null;
}

export function TradePanel({
  project,
  asks,
  lastPrice,
  onDone,
}: {
  project: ChainProject;
  asks: ChainListing[];
  lastPrice: number | null;
  onDone: () => void;
}) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  return (
    <div>
      <div className="grid grid-cols-2 border" role="group" aria-label="Order side">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={side === s}
            onClick={() => setSide(s)}
            className={cn(
              "h-10 text-[13px] font-medium capitalize transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
              side === s && "bg-foreground text-background hover:bg-foreground",
            )}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="mt-5">
        {side === "buy" ? (
          <BuyForm project={project} asks={asks} onDone={onDone} />
        ) : (
          <SellForm project={project} asks={asks} lastPrice={lastPrice} onDone={onDone} />
        )}
      </div>
    </div>
  );
}

function useFunds(wallet: PublicKey | null, mint: string) {
  const balances = useBalances(wallet, mint);
  const [funding, setFunding] = useState(false);
  async function getFunds() {
    if (!wallet) return;
    setFunding(true);
    try {
      const res = await api.faucet(wallet.toBase58());
      toast.success(`Added ${res.usdc.toLocaleString()} test USDC${res.sol ? ` and ${res.sol} SOL for fees` : ""}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      await balances.refresh();
      setFunding(false);
    }
  }
  return { balances, funding, getFunds };
}

function BuyForm({ project, asks, onDone }: { project: ChainProject; asks: ChainListing[]; onDone: () => void }) {
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const { balances, funding, getFunds } = useFunds(publicKey, project.stablecoinMint.toBase58());
  const { run, pending } = useTx();
  const [input, setInput] = useState("5");

  const want = Number(input);
  const valid = Number.isInteger(want) && want > 0;
  const fill = planFill(asks, valid ? want : 0, publicKey);
  const offered = asks.filter((l) => !publicKey || !l.seller.equals(publicKey)).reduce((s, l) => s + l.amount, 0);
  const usdc = balances.data?.usdc ?? null;
  const lowSol = balances.data ? balances.data.lamports < 10_000_000 : false;
  const avg = fill.shares ? fill.cost / fill.shares : 0;

  let problem: string | null = null;
  if (input !== "" && !valid) problem = "Enter a whole number of shares.";
  else if (!offered) problem = "No shares are offered for sale right now.";
  else if (valid && fill.shares < want)
    problem =
      fill.legs.length >= MAX_LEGS && offered > fill.shares
        ? `Up to ${fill.shares.toLocaleString()} shares fill in one order (${MAX_LEGS} offers). Buy those, then the rest.`
        : `Only ${fill.shares.toLocaleString()} shares are offered.`;
  else if (funding) problem = "Sending your test funds…";
  else if (publicKey && balances.data && (usdc ?? 0) < fill.cost) problem = "Insufficient test USDC. Use “Get test funds” below.";
  else if (publicKey && lowSol) problem = "Insufficient SOL for network fees. Use “Get test funds” below.";

  async function buy() {
    if (!publicKey || problem || !fill.shares) return;
    const n = fill.shares;
    const sig = await run({ action: `Buying ${n} shares`, done: `Bought ${n} share${n === 1 ? "" : "s"}` }, async () => {
      const tx = new Transaction();
      for (const { listing, take } of fill.legs) {
        tx.add(
          await getProgram()
            .methods.buyListing(new BN(take), new BN(listing.price))
            .accountsPartial({
              buyer: publicKey,
              seller: listing.seller,
              project: project.address,
              revenueState: revenuePda(project.address),
              listing: listing.address,
              sellerPosition: positionPda(project.address, listing.seller),
              buyerPosition: positionPda(project.address, publicKey),
              market: marketPda(project.address),
              stablecoinMint: project.stablecoinMint,
              shareMint: project.shareMint,
              escrow: escrowAta(listing.address, project.shareMint),
              buyerStablecoinAccount: ata(publicKey, project.stablecoinMint),
              sellerStablecoinAccount: ata(listing.seller, project.stablecoinMint),
              buyerShareAccount: ata(publicKey, project.shareMint),
              tokenProgram: TOKEN_PROGRAM_ID,
              associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            })
            .instruction(),
        );
      }
      return tx;
    });
    if (sig) {
      balances.refresh();
      onDone();
    }
  }

  return (
    <div>
      <label htmlFor="buy-shares" className="text-[12px] text-muted-foreground">
        Shares to buy
      </label>
      <div className="mt-1.5 flex h-12 items-center border border-input focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-ring">
        <input
          id="buy-shares"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          autoComplete="off"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-invalid={!!problem}
          aria-describedby="buy-help"
          className="h-full min-w-0 flex-1 bg-transparent px-3 font-mono text-[16px] tabular-nums outline-none"
        />
        <span className="pr-3 text-[13px] text-muted-foreground">shares</span>
      </div>

      <dl className="mt-4 text-[13px]">
        <Row label="Average price" value={fill.shares ? formatUsdc(Math.round(avg)) : "—"} />
        <Row label="Offers filled" value={fill.legs.length ? String(fill.legs.length) : "—"} />
        <Row label="Total cost" value={formatUsdc(fill.cost)} />
        {publicKey && <Row label="Wallet balance" value={balances.data ? formatUsdc(usdc ?? 0) : "…"} />}
      </dl>

      <p id="buy-help" className={cn("mt-2 min-h-5 text-[12px]", problem && !funding ? "text-destructive" : "text-muted-foreground")}>
        {problem ?? `${offered.toLocaleString()} shares offered · cheapest offers fill first`}
      </p>
      {project.active && project.totalShares < project.maxShares && fill.shares > 0 && avg > project.sharePrice && (
        <p className="mt-1 text-[12px] text-muted-foreground">
          New shares are still available from the offering at {formatUsdc(project.sharePrice)}.
        </p>
      )}

      {!publicKey ? (
        <button type="button" className={`${btnPrimary} mt-3 w-full`} onClick={() => setVisible(true)}>
          Connect wallet to trade
        </button>
      ) : (
        <button type="button" className={`${btnPrimary} mt-3 w-full`} disabled={!!problem || !fill.shares || pending} onClick={buy}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {pending ? "Buying…" : fill.shares ? `Buy ${fill.shares.toLocaleString()} shares` : "Buy"}
        </button>
      )}
      {publicKey && (usdc === null || (usdc ?? 0) < fill.cost || lowSol) && (
        <button type="button" className={`${btnOutline} mt-2 w-full`} disabled={funding} onClick={getFunds}>
          {funding && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {funding ? "Sending test funds…" : "Get test funds"}
        </button>
      )}
    </div>
  );
}

function SellForm({
  project,
  asks,
  lastPrice,
  onDone,
}: {
  project: ChainProject;
  asks: ChainListing[];
  lastPrice: number | null;
  onDone: () => void;
}) {
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const position = usePosition(project, publicKey);
  const free = useShareBalance(publicKey, project.shareMint);
  const { balances } = useFunds(publicKey, project.stablecoinMint.toBase58());
  const { run, pending } = useTx();
  const mine = publicKey ? asks.find((l) => l.seller.equals(publicKey)) : undefined;
  const suggested = asks.find((l) => !publicKey || !l.seller.equals(publicKey))?.price ?? lastPrice ?? project.sharePrice;
  const [input, setInput] = useState("");
  const [priceInput, setPriceInput] = useState(() => (suggested / USDC).toFixed(2));

  const amount = Number(input);
  const available = free.data ?? 0;
  const price = parseUsdc(priceInput);
  const lowSol = balances.data ? balances.data.lamports < 5_000_000 : false;

  let problem: string | null = null;
  if (input !== "" && (!Number.isInteger(amount) || amount <= 0)) problem = "Enter a whole number of shares.";
  else if (price === null && priceInput !== "") problem = "Enter a price in USDC, up to 6 decimals.";
  else if (publicKey && free.data !== undefined && amount > available)
    problem = `You have ${available.toLocaleString()} share${available === 1 ? "" : "s"} available to sell.`;
  else if (publicKey && lowSol) problem = "Insufficient SOL for network fees.";

  async function list() {
    if (!publicKey || problem || !price || !amount) return;
    const listing = listingPda(project.address, publicKey);
    const sig = await run({ action: `Listing ${amount} shares`, done: `Listed ${amount} share${amount === 1 ? "" : "s"} for sale` }, () =>
      getProgram()
        .methods.listShares(new BN(amount), new BN(price))
        .accountsPartial({
          seller: publicKey,
          project: project.address,
          position: positionPda(project.address, publicKey),
          listing,
          shareMint: project.shareMint,
          sellerShareAccount: ata(publicKey, project.shareMint),
          escrow: escrowAta(listing, project.shareMint),
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .transaction(),
    );
    if (sig) {
      setInput("");
      free.refresh();
      onDone();
    }
  }

  async function cancel() {
    if (!publicKey || !mine) return;
    const sig = await run({ action: "Cancelling your offer", done: "Offer cancelled; shares returned" }, () =>
      getProgram()
        .methods.cancelListing()
        .accountsPartial({
          seller: publicKey,
          project: project.address,
          listing: mine.address,
          shareMint: project.shareMint,
          escrow: escrowAta(mine.address, project.shareMint),
          sellerShareAccount: ata(publicKey, project.shareMint),
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .transaction(),
    );
    if (sig) {
      free.refresh();
      onDone();
    }
  }

  if (!publicKey) {
    return (
      <div>
        <p className="text-[13px] text-muted-foreground">Connect the wallet that holds your shares to offer them for sale.</p>
        <button type="button" className={`${btnPrimary} mt-4 w-full`} onClick={() => setVisible(true)}>
          Connect wallet to trade
        </button>
      </div>
    );
  }

  if (mine) {
    return (
      <div>
        <p className="text-[12px] text-muted-foreground">Your offer</p>
        <p className="mt-1 font-serif text-[30px] leading-none tabular-nums">
          {mine.amount.toLocaleString()}
          <span className="ml-2 font-sans text-[13px] text-muted-foreground">shares at {formatUsdc(mine.price)}</span>
        </p>
        <dl className="mt-4 text-[13px]">
          <Row label="Proceeds if sold" value={formatUsdc(mine.amount * mine.price)} />
          <Row label="Still in wallet" value={free.data === undefined ? "…" : `${available.toLocaleString()} shares`} />
        </dl>
        <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
          You keep earning distributions on offered shares until they sell. One offer per wallet: to change the price or
          size, cancel and list again.
        </p>
        <button type="button" className={`${btnOutline} mt-4 w-full`} disabled={pending} onClick={cancel}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {pending ? "Cancelling…" : "Cancel offer"}
        </button>
      </div>
    );
  }

  const holding = position.data?.shares ?? 0;
  if (position.data !== undefined && holding === 0) {
    return <p className="text-[13px] text-muted-foreground">You don’t hold shares in this offering yet. Buy or subscribe first.</p>;
  }

  return (
    <div>
      <label htmlFor="sell-shares" className="text-[12px] text-muted-foreground">
        Shares to sell
      </label>
      <div className="mt-1.5 flex h-12 items-center border border-input focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-ring">
        <input
          id="sell-shares"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          autoComplete="off"
          placeholder="0"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-invalid={!!problem}
          aria-describedby="sell-help"
          className="h-full min-w-0 flex-1 bg-transparent px-3 font-mono text-[16px] tabular-nums outline-none"
        />
        <button
          type="button"
          onClick={() => setInput(String(available))}
          disabled={!available}
          className="mr-2 px-2 py-1 text-[12px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-40"
        >
          Max
        </button>
      </div>

      <label htmlFor="sell-price" className="mt-4 block text-[12px] text-muted-foreground">
        Price per share
      </label>
      <div className="mt-1.5 flex h-12 items-center border border-input focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-ring">
        <input
          id="sell-price"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={priceInput}
          onChange={(e) => setPriceInput(e.target.value)}
          aria-describedby="sell-help"
          className="h-full min-w-0 flex-1 bg-transparent px-3 font-mono text-[16px] tabular-nums outline-none"
        />
        <span className="pr-3 text-[13px] text-muted-foreground">USDC</span>
      </div>

      <dl className="mt-4 text-[13px]">
        <Row label="Proceeds if sold" value={price && amount > 0 ? formatUsdc(price * amount) : "—"} />
        <Row label="Offering price" value={formatUsdc(project.sharePrice)} />
        <Row label="Available to sell" value={free.data === undefined ? "…" : `${available.toLocaleString()} shares`} />
      </dl>

      <p id="sell-help" className={cn("mt-2 min-h-5 text-[12px]", problem ? "text-destructive" : "text-muted-foreground")}>
        {problem ?? "Shares are held by the program until sold. You keep earning on them until then."}
      </p>

      <button type="button" className={`${btnPrimary} mt-3 w-full`} disabled={!!problem || !amount || !price || pending} onClick={list}>
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {pending ? "Listing…" : "Offer for sale"}
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
