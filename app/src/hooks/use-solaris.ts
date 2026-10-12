"use client";

import { PublicKey } from "@solana/web3.js";
import { usePoll } from "@/hooks/use-poll";
import { api } from "@/lib/api";
import {
  getProgram,
  fetchListings,
  fetchMarkets,
  fetchPosition,
  fetchProject,
  getConnection,
  tokenBalance,
  type ChainProject,
} from "@/lib/solana";

export const useDeployment = () => usePoll("deployment", api.deployment, 60_000);
export const useProjects = () => usePoll("projects", api.projects, 5_000);
export const useLive = (id: number | null) => usePoll(id === null ? null : `live:${id}`, () => api.live(id!), 2_000);
export const useSettlements = (id: number | null) =>
  usePoll(id === null ? null : `settlements:${id}`, () => api.settlements(id!), 10_000);
export const useTrades = (id: number | null) => usePoll(id === null ? null : `trades:${id}`, () => api.trades(id!), 5_000);

/** Open share listings for a project, cheapest first. */
export const useListings = (address: string | null | undefined) =>
  usePoll(address ? `listings:${address}` : null, () => fetchListings(new PublicKey(address!)), 5_000);

/** Listings and market totals across all projects, for the market overview. */
export const useMarketOverview = () =>
  usePoll("market-overview", async () => {
    const [listings, markets, projects] = await Promise.all([fetchListings(), fetchMarkets(), getProgram().account.project.all()]);
    const sharePrices = new Map(projects.map((p) => [p.publicKey.toBase58(), p.account.sharePrice.toNumber()]));
    return { listings, markets, sharePrices };
  }, 10_000);

/** Share tokens in the wallet (not counting shares escrowed in a listing). */
export const useShareBalance = (wallet: PublicKey | null, shareMint: PublicKey | undefined) =>
  usePoll(wallet && shareMint ? `shares:${wallet.toBase58()}:${shareMint.toBase58()}` : null, async () =>
    (await tokenBalance(wallet!, shareMint!)) ?? 0, 5_000);

/** On-chain project and revenue state. */
export const useChainProject = (address: string | null | undefined) =>
  usePoll(address ? `chain:${address}` : null, () => fetchProject(new PublicKey(address!)), 8_000);

/** The connected investor's position in a project (null if they hold none). */
export function usePosition(project: ChainProject | undefined, wallet: PublicKey | null) {
  const key = project && wallet ? `pos:${project.address.toBase58()}:${wallet.toBase58()}:${project.acc.toString()}` : null;
  return usePoll(key, () => fetchPosition(project!, wallet!), 8_000);
}

/** Test USDC (base units, null if no token account) and SOL (lamports) for the wallet. */
export function useBalances(wallet: PublicKey | null, mint: string | undefined) {
  return usePoll(wallet && mint ? `bal:${wallet.toBase58()}:${mint}` : null, async () => {
    const [usdc, lamports] = await Promise.all([
      tokenBalance(wallet!, new PublicKey(mint!)),
      getConnection().getBalance(wallet!),
    ]);
    return { usdc, lamports };
  }, 8_000);
}
