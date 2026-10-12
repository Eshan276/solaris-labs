// Solana client for the solaris_v2 program, plus the keys the operator signs with.
import { AnchorProvider, BN, Program, Wallet, web3 } from "@anchor-lang/core";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import idl from "../idl/solaris_v2.json";
import { ADMIN_KEYPAIR, DEPLOYMENT_FILE, KEYS_DIR, RPC_URL } from "./config";

export const { Connection, Keypair, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } = web3;
export type PublicKeyT = InstanceType<typeof PublicKey>;
export type KeypairT = InstanceType<typeof Keypair>;
export { BN };

export const connection = new Connection(RPC_URL, "confirmed");

function loadKeypair(path: string): KeypairT {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
}

export const admin = loadKeypair(ADMIN_KEYPAIR);

/** The revenue operator key, created on first use and kept in .keys/ (git-ignored). */
export function operatorKeypair(): KeypairT {
  const path = join(KEYS_DIR, "operator.json");
  if (!existsSync(path)) {
    mkdirSync(KEYS_DIR, { recursive: true });
    writeFileSync(path, JSON.stringify(Array.from(Keypair.generate().secretKey)), { mode: 0o600 });
  }
  return loadKeypair(path);
}

export const provider = new AnchorProvider(connection, new Wallet(admin), { commitment: "confirmed" });
export const program = new Program(idl as any, provider) as any;
export const PROGRAM_ID: PublicKeyT = program.programId;

const pda = (...seeds: (Buffer | Uint8Array)[]) => PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
const u64le = (n: number | bigint) => new BN(n.toString()).toArrayLike(Buffer, "le", 8);

export const configPda = pda(Buffer.from("config"));
export const projectPda = (id: number) => pda(Buffer.from("project"), u64le(id));
export const revenuePda = (project: PublicKeyT) => pda(Buffer.from("revenue"), project.toBuffer());
export const shareMintPda = (project: PublicKeyT) => pda(Buffer.from("share_mint"), project.toBuffer());
export const investmentVaultPda = (project: PublicKeyT) => pda(Buffer.from("investment_vault"), project.toBuffer());
export const revenueVaultPda = (project: PublicKeyT) => pda(Buffer.from("revenue_vault"), project.toBuffer());
export const positionPda = (project: PublicKeyT, investor: PublicKeyT) =>
  pda(Buffer.from("position"), project.toBuffer(), investor.toBuffer());
export const settlementPda = (project: PublicKeyT, index: number) =>
  pda(Buffer.from("settlement"), project.toBuffer(), u64le(index));
export const marketPda = (project: PublicKeyT) => pda(Buffer.from("market"), project.toBuffer());
export const ata = (owner: PublicKeyT, mint: PublicKeyT) => getAssociatedTokenAddressSync(mint, owner);

export type Deployment = {
  cluster: "devnet";
  programId: string;
  usdcMint: string;
  operator: string;
  projects: { id: number; address: string; meter: string }[];
};

export function loadDeployment(): Deployment {
  if (!existsSync(DEPLOYMENT_FILE)) throw new Error("No deployment yet. Run `bun run setup` first.");
  return JSON.parse(readFileSync(DEPLOYMENT_FILE, "utf8"));
}

export function errorText(e: any): string {
  return (
    e?.error?.errorMessage ??
    e?.logs?.find?.((l: string) => l.includes("Error Message"))?.split("Error Message: ")[1] ??
    e?.message?.split("\n")[0] ??
    String(e)
  );
}
