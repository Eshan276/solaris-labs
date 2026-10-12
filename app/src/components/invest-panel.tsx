"use client";

import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { btnOutline, btnPrimary } from "@/components/inst";
import { useBalances } from "@/hooks/use-solaris";
import { useTx } from "@/hooks/use-tx";
import { api } from "@/lib/api";
import { formatPercent, formatUsdc } from "@/lib/format";
import {
  ata,
  BN,
  getProgram,
  investmentVaultPda,
  positionPda,
  revenuePda,
  type ChainProject,
} from "@/lib/solana";
import { cn } from "@/lib/utils";

const QUICK = [5, 10, 25, 100];

export function InvestPanel({ project, onDone, yieldPct }: { project: ChainProject; onDone: () => void; yieldPct: number | null }) {
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const mint = project.stablecoinMint.toBase58();
  const balances = useBalances(publicKey, mint);
  const { run, pending } = useTx();
  const [input, setInput] = useState("5");
  const [funding, setFunding] = useState(false);

  const shares = Number(input);
  const left = project.maxShares - project.totalShares;
  const cost = Number.isInteger(shares) && shares > 0 ? shares * project.sharePrice : 0;
  const usdc = balances.data?.usdc ?? null;
  // A first purchase also opens the investor's position and share accounts, which costs ~0.004 SOL rent.
  const lowSol = balances.data ? balances.data.lamports < 10_000_000 : false;

  let problem: string | null = null;
  if (input !== "" && (!Number.isInteger(shares) || shares <= 0)) problem = "Enter a whole number of shares.";
  else if (shares > left) problem = `Only ${left.toLocaleString()} shares are left.`;
  else if (funding) problem = "Sending your test funds…";
  else if (publicKey && balances.data && (usdc ?? 0) < cost) problem = "Insufficient test USDC. Use “Get test funds” below.";
  else if (publicKey && lowSol) problem = "Insufficient SOL for network fees. Use “Get test funds” below.";
  else if (!project.active) problem = "Subscriptions to this offering are paused.";

  async function getFunds() {
    if (!publicKey) return;
    setFunding(true);
    try {
      const res = await api.faucet(publicKey.toBase58());
      toast.success(`Added ${res.usdc.toLocaleString()} test USDC${res.sol ? ` and ${res.sol} SOL for fees` : ""}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      // Wait for the new balances before re-enabling Buy, so it never acts on a half-funded wallet.
      await balances.refresh();
      setFunding(false);
    }
  }

  async function buy() {
    if (!publicKey || problem || !cost) return;
    const sig = await run({ action: `Subscribing to ${shares} shares`, done: `Subscribed to ${shares} share${shares === 1 ? "" : "s"}` }, () =>
      getProgram()
        .methods.purchaseShares(new BN(shares))
        .accountsPartial({
          investor: publicKey,
          project: project.address,
          revenueState: revenuePda(project.address),
          position: positionPda(project.address, publicKey),
          stablecoinMint: project.stablecoinMint,
          shareMint: project.shareMint,
          investmentVault: investmentVaultPda(project.address),
          investorStablecoinAccount: ata(publicKey, project.stablecoinMint),
          investorShareAccount: ata(publicKey, project.shareMint),
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .transaction(),
    );
    if (sig) {
      balances.refresh();
      onDone();
    }
  }

  const annual = yieldPct !== null && cost ? Math.round(cost * yieldPct) : null;

  return (
    <div>
      <label htmlFor="shares" className="text-[12px] text-muted-foreground">
        Subscribe
      </label>
      <div className="mt-1.5 flex h-12 items-center border border-input focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-ring">
        <input
          id="shares"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          autoComplete="off"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-invalid={!!problem}
          aria-describedby="shares-help"
          className="h-full min-w-0 flex-1 bg-transparent px-3 font-mono text-[16px] tabular-nums outline-none"
        />
        <span className="pr-3 text-[13px] text-muted-foreground">shares</span>
      </div>
      <div className="mt-2 grid grid-cols-4 border-t border-l" role="group" aria-label="Quick amounts">
        {QUICK.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => setInput(String(q))}
            aria-pressed={shares === q}
            className={cn(
              "h-9 border-r border-b font-mono text-[12px] tabular-nums transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
              shares === q && "bg-foreground text-background hover:bg-foreground",
            )}
          >
            {q}
          </button>
        ))}
      </div>

      <dl className="mt-4 text-[13px]">
        <div className="flex justify-between py-1.5">
          <dt className="text-muted-foreground">Subscription amount</dt>
          <dd className="font-mono tabular-nums">{formatUsdc(cost)}</dd>
        </div>
        <div className="flex justify-between py-1.5">
          <dt className="text-muted-foreground">Estimated annual income</dt>
          <dd className="font-mono tabular-nums">{annual === null ? "—" : formatUsdc(annual)}</dd>
        </div>
        {publicKey && (
          <div className="flex justify-between py-1.5">
            <dt className="text-muted-foreground">Wallet balance</dt>
            <dd className="font-mono tabular-nums">{balances.data ? formatUsdc(usdc ?? 0) : "…"}</dd>
          </div>
        )}
      </dl>

      <p
        id="shares-help"
        className={cn("mt-2 min-h-5 text-[12px]", problem && !funding ? "text-destructive" : "text-muted-foreground")}
      >
        {problem ?? `${left.toLocaleString()} of ${project.maxShares.toLocaleString()} shares available · ${formatPercent(project.totalShares / project.maxShares)} subscribed`}
      </p>

      {!publicKey ? (
        <button type="button" className={`${btnPrimary} mt-3 w-full`} onClick={() => setVisible(true)}>
          Connect wallet to subscribe
        </button>
      ) : (
        <button type="button" className={`${btnPrimary} mt-3 w-full`} disabled={!!problem || !cost || pending} onClick={buy}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {pending ? "Subscribing…" : "Subscribe"}
        </button>
      )}

      {publicKey && (usdc === null || (usdc ?? 0) < cost || lowSol) && (
        <button type="button" className={`${btnOutline} mt-2 w-full`} disabled={funding} onClick={getFunds}>
          {funding && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {funding ? "Sending test funds…" : "Get test funds"}
        </button>
      )}
    </div>
  );
}
