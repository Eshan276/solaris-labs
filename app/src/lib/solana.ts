// Browser-side Solana client for the solaris_v2 program.
import { AnchorProvider, BN, Program } from "@anchor-lang/core";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Connection, PublicKey, type Transaction, type TransactionSignature } from "@solana/web3.js";
import idl from "./idl/solaris_v2.json";
import type { SolarisV2 } from "./idl/solaris_v2_types";

export { BN, PublicKey };
export const CLUSTER = "devnet";
export const USDC_DECIMALS = 6;
export const ACC_PRECISION = new BN("1000000000000");

let connection: Connection | null = null;
/** All RPC goes through /api/rpc on this site. */
export function getConnection(): Connection {
  connection ??= new Connection(new URL("/api/rpc", window.location.origin).toString(), "confirmed");
  return connection;
}

let readProgram: Program<SolarisV2> | null = null;
/** Program client for reads and for building transactions; the connected wallet signs them separately. */
export function getProgram(): Program<SolarisV2> {
  if (!readProgram) {
    const readOnly = async (): Promise<never> => {
      throw new Error("read-only");
    };
    const wallet = { publicKey: PublicKey.default, signTransaction: readOnly, signAllTransactions: readOnly };
    const provider = new AnchorProvider(getConnection(), wallet, { commitment: "confirmed" });
    readProgram = new Program<SolarisV2>(idl as SolarisV2, provider);
  }
  return readProgram;
}

export const PROGRAM_ID = new PublicKey((idl as { address: string }).address);
const pda = (...seeds: (Buffer | Uint8Array)[]) => PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
const u64le = (n: number) => new BN(n).toArrayLike(Buffer, "le", 8);

export const revenuePda = (project: PublicKey) => pda(Buffer.from("revenue"), project.toBuffer());
export const shareMintPda = (project: PublicKey) => pda(Buffer.from("share_mint"), project.toBuffer());
export const investmentVaultPda = (project: PublicKey) => pda(Buffer.from("investment_vault"), project.toBuffer());
export const revenueVaultPda = (project: PublicKey) => pda(Buffer.from("revenue_vault"), project.toBuffer());
export const positionPda = (project: PublicKey, investor: PublicKey) =>
  pda(Buffer.from("position"), project.toBuffer(), investor.toBuffer());
export const settlementPda = (project: PublicKey, index: number) =>
  pda(Buffer.from("settlement"), project.toBuffer(), u64le(index));
export const listingPda = (project: PublicKey, seller: PublicKey) =>
  pda(Buffer.from("listing"), project.toBuffer(), seller.toBuffer());
export const marketPda = (project: PublicKey) => pda(Buffer.from("market"), project.toBuffer());
export const ata = (owner: PublicKey, mint: PublicKey) => getAssociatedTokenAddressSync(mint, owner);
/** Token account holding a listing's shares (owned by the listing PDA, hence off-curve). */
export const escrowAta = (listing: PublicKey, shareMint: PublicKey) => getAssociatedTokenAddressSync(shareMint, listing, true);

export type ChainProject = {
  address: PublicKey;
  sharePrice: number;
  maxShares: number;
  totalShares: number;
  active: boolean;
  meter: PublicKey;
  settlementCount: number;
  stablecoinMint: PublicKey;
  shareMint: PublicKey;
  totalFunded: number;
  totalClaimed: number;
  acc: BN;
};

export async function fetchProject(address: PublicKey): Promise<ChainProject> {
  const program = getProgram();
  const [p, r] = await Promise.all([
    program.account.project.fetch(address),
    program.account.revenueState.fetch(revenuePda(address)),
  ]);
  return {
    address,
    sharePrice: p.sharePrice.toNumber(),
    maxShares: p.maxShares.toNumber(),
    totalShares: p.totalShares.toNumber(),
    active: p.active,
    meter: p.meter,
    settlementCount: p.settlementCount.toNumber(),
    stablecoinMint: p.stablecoinMint,
    shareMint: p.shareMint,
    totalFunded: r.totalFunded.toNumber(),
    totalClaimed: r.totalClaimed.toNumber(),
    acc: r.accRevenuePerShare,
  };
}

export type ChainPosition = { shares: number; claimed: number; claimable: number };

/** The investor's position, with claimable computed exactly as the program does. */
export async function fetchPosition(project: ChainProject, investor: PublicKey): Promise<ChainPosition | null> {
  const pos = await getProgram().account.investorPosition.fetchNullable(positionPda(project.address, investor));
  if (!pos) return null;
  const accrued = new BN(pos.shares).mul(project.acc).sub(pos.rewardDebt).div(ACC_PRECISION);
  return {
    shares: pos.shares.toNumber(),
    claimed: pos.revenueClaimed.toNumber(),
    claimable: pos.pending.add(accrued).toNumber(),
  };
}

export type ChainListing = { address: PublicKey; project: PublicKey; seller: PublicKey; amount: number; price: number; createdAt: number };

/** Open listings, for one project or (without an argument) all projects. Cheapest first, then oldest first. */
export async function fetchListings(project?: PublicKey): Promise<ChainListing[]> {
  const filters = project ? [{ memcmp: { offset: 8, bytes: project.toBase58() } }] : [];
  const rows = await getProgram().account.listing.all(filters);
  return rows
    .map(({ publicKey, account: l }) => ({
      address: publicKey,
      project: l.project,
      seller: l.seller,
      amount: l.amount.toNumber(),
      price: l.price.toNumber(),
      createdAt: l.createdAt.toNumber() * 1000,
    }))
    .filter((l) => l.amount > 0)
    .sort((a, b) => a.price - b.price || a.createdAt - b.createdAt);
}

export type ChainMarket = { project: PublicKey; lastPrice: number; tradeCount: number; volumeShares: number; volumeStablecoin: number };

/** Market totals for every project that has had at least one trade. */
export async function fetchMarkets(): Promise<ChainMarket[]> {
  const rows = await getProgram().account.market.all();
  return rows.map(({ account: m }) => ({
    project: m.project,
    lastPrice: m.lastPrice.toNumber(),
    tradeCount: m.tradeCount.toNumber(),
    volumeShares: m.volumeShares.toNumber(),
    volumeStablecoin: m.volumeStablecoin.toNumber(),
  }));
}

export async function tokenBalance(owner: PublicKey, mint: PublicKey): Promise<number | null> {
  try {
    const res = await getConnection().getTokenAccountBalance(ata(owner, mint));
    return Number(res.value.amount);
  } catch {
    return null; // no token account yet
  }
}

export type TxSigner = {
  signTransaction?: (tx: Transaction) => Promise<Transaction>;
  sendTransaction: (tx: Transaction, connection: Connection) => Promise<TransactionSignature>;
};

/**
 * Has the wallet sign the transaction, submits it to devnet through this site's RPC, and waits for
 * confirmation by polling (the RPC proxy is HTTP-only, so no websocket subscriptions).
 *
 * Submitting ourselves matters: a wallet that sends on its own uses whatever network it's set to,
 * so a wallet left on mainnet would broadcast a devnet transaction into the void.
 */
export async function sendAndConfirm(tx: Transaction, wallet: TxSigner, onSent?: (sig: string) => void): Promise<string> {
  const conn = getConnection();
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  let sig: string;
  if (wallet.signTransaction) {
    const signed = await wallet.signTransaction(tx);
    // Preflight simulation on devnet turns program errors into a readable message before anything is spent.
    sig = await conn.sendRawTransaction(signed.serialize(), { preflightCommitment: "confirmed" });
  } else {
    sig = await wallet.sendTransaction(tx, conn);
  }
  onSent?.(sig);
  for (let i = 0; ; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const { value } = await conn.getSignatureStatuses([sig]);
    const status = value[0];
    if (status?.err) throw new TxError(sig, decodeError(status.err));
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return sig;
    // Checking expiry costs an extra request, so only do it every few polls.
    if (i % 4 === 3 && (await conn.getBlockHeight("confirmed")) > lastValidBlockHeight) {
      throw new TxError(sig, "The network was too busy and the transaction expired. Nothing was charged. Please try again.");
    }
  }
}

export class TxError extends Error {
  constructor(public signature: string | null, message: string) {
    super(message);
  }
}

const PROGRAM_ERRORS: Record<number, string> = Object.fromEntries(idl.errors.map((e) => [e.code, e.msg]));

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Turns program, token, and wallet errors into a sentence for the user. */
export function decodeError(e: unknown): string {
  // Preflight failures carry the program logs; Anchor writes its message there.
  const logs = (e as { logs?: string[]; transactionLogs?: string[] })?.logs ?? (e as { transactionLogs?: string[] })?.transactionLogs;
  const anchorMsg = logs?.find((l) => l.includes("Error Message: "))?.split("Error Message: ")[1];
  if (anchorMsg) return anchorMsg.replace(/\.$/, "") + ".";
  if (logs?.some((l) => /insufficient funds/i.test(l))) return "Not enough test USDC for this. Use “Get free test funds”.";
  // Failed transaction status: { InstructionError: [index, { Custom: code }] }
  const custom = (e as { InstructionError?: [number, { Custom?: number }] })?.InstructionError?.[1]?.Custom;
  if (typeof custom === "number" && PROGRAM_ERRORS[custom]) return PROGRAM_ERRORS[custom];
  if (custom === 1) return "Not enough balance for this transaction.";
  const msg = message(e);
  if (/insufficient (lamports|funds)|no record of a prior credit/i.test(msg))
    return "Not enough SOL to pay the network fee. Use “Get free test funds”.";
  if (/blockhash not found/i.test(msg)) return "The network was busy and the transaction expired. Please try again.";
  return msg.split("\n")[0];
}

export const isUserRejection = (e: unknown) =>
  /reject|denied|cancel/i.test(message(e)) || (e as { name?: string })?.name === "WalletSignTransactionError";

export const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=${CLUSTER}`;
export const explorerAddress = (a: string) => `https://explorer.solana.com/address/${a}?cluster=${CLUSTER}`;
