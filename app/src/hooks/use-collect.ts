"use client";

import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { useWallet } from "@solana/wallet-adapter-react";
import { usePosition } from "@/hooks/use-solaris";
import { useTx } from "@/hooks/use-tx";
import { formatUsdc } from "@/lib/format";
import { ata, getProgram, positionPda, revenuePda, revenueVaultPda, type ChainProject } from "@/lib/solana";

/** The wallet's position in a project and a `collect` action for its available revenue. */
export function useCollect(project: ChainProject | undefined, onDone?: () => void) {
  const { publicKey } = useWallet();
  const position = usePosition(project, publicKey);
  const { run, pending } = useTx();

  async function collect() {
    const pos = position.data;
    if (!publicKey || !project || !pos || pos.claimable === 0) return;
    const amount = formatUsdc(pos.claimable);
    const sig = await run({ action: `Collecting ${amount}`, done: `Collected ${amount}` }, () =>
      getProgram()
        .methods.claimRevenue()
        .accountsPartial({
          investor: publicKey,
          project: project.address,
          revenueState: revenuePda(project.address),
          position: positionPda(project.address, publicKey),
          stablecoinMint: project.stablecoinMint,
          revenueVault: revenueVaultPda(project.address),
          investorStablecoinAccount: ata(publicKey, project.stablecoinMint),
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .transaction(),
    );
    if (sig) {
      await position.refresh();
      onDone?.();
    }
  }

  return { connected: !!publicKey, position, collect, pending };
}
