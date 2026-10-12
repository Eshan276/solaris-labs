// Periodic settlement: turns a period's signed readings into a proof file and a fund_revenue
// transaction that records the file's hash on-chain.
import { TOKEN_PROGRAM_ID, mintTo } from "@solana/spl-token";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PROOF_PARAMS, PROOFS_DIR, SETTLEMENT_PERIOD_SEC, USDC_DECIMALS } from "./config";
import {
  BN,
  LAMPORTS_PER_SOL,
  PROGRAM_ID,
  SystemProgram,
  Transaction,
  admin,
  ata,
  configPda,
  connection,
  errorText,
  operatorKeypair,
  program,
  projectPda,
  provider,
  revenuePda,
  revenueVaultPda,
  settlementPda,
  type PublicKeyT,
} from "./chain";
import { getMeta, readingsBetween, saveSettlement, setMeta } from "./db";
import { PROOF_VERSION, energyWh, settlementAmount, type ProofFile } from "./proof";

const operator = operatorKeypair();

export const proofPath = (project: number, index: number) => join(PROOFS_DIR, String(project), `${index}.json`);
const windowKey = (project: number) => `window_start:${project}`;

/** Start of the period that hasn't been settled yet (unix seconds), or null before any readings. */
export function windowStart(project: number): number | null {
  const v = getMeta(windowKey(project));
  return v === null ? null : Number(v);
}

export type SettleLog = { at: number; project: number; message: string; tx?: string };
export const settleLog: SettleLog[] = [];
function log(project: number, message: string, tx?: string) {
  settleLog.unshift({ at: Date.now(), project, message, tx });
  settleLog.length = Math.min(settleLog.length, 50);
  console.log(`[project ${project}] ${message}${tx ? ` ${tx}` : ""}`);
}

async function topUpOperator() {
  const balance = await connection.getBalance(operator.publicKey);
  if (balance >= 0.5 * LAMPORTS_PER_SOL) return;
  await provider.sendAndConfirm(
    new Transaction().add(
      SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: operator.publicKey, lamports: LAMPORTS_PER_SOL }),
    ),
  );
  log(-1, "Topped up operator with 1 SOL");
}

/** Settles the project if a full period has passed since the last settlement. */
export async function settleIfDue(projectId: number, usdcMint: PublicKeyT, firstReadingSec: number | null) {
  const projectAddr = projectPda(projectId);
  const project = await program.account.project.fetch(projectAddr);
  const chainEnd = project.lastPeriodEnd.toNumber();

  let start = windowStart(projectId);
  if (start === null) {
    if (firstReadingSec === null) return; // nothing measured yet
    start = firstReadingSec;
  }
  start = Math.max(start, chainEnd);
  setMeta(windowKey(projectId), String(start));

  const end = Math.floor(Date.now() / 1000);
  if (end - start < SETTLEMENT_PERIOD_SEC) return;

  const readings = readingsBetween(projectId, start * 1000, end * 1000);
  const wh = energyWh(readings, PROOF_PARAMS);
  const amount = settlementAmount(wh, PROOF_PARAMS);

  // Periods that can't be paid out are closed without a transaction: there is nobody to pay,
  // or the panel produced less than one watt-hour (e.g. at night).
  const skip =
    readings.length === 0 ? "no readings" : project.totalShares.isZero() ? "no shareholders yet" : amount === 0 ? "under 1 Wh produced" : null;
  if (skip) {
    setMeta(windowKey(projectId), String(end));
    log(projectId, `Period ${start}–${end} closed without payout: ${skip} (${readings.length} readings)`);
    return;
  }

  const index = project.settlementCount.toNumber();
  const file: ProofFile = {
    version: PROOF_VERSION,
    program: PROGRAM_ID.toBase58(),
    project: projectAddr.toBase58(),
    meter: project.meter.toBase58(),
    settlement_index: index,
    period_start: start,
    period_end: end,
    params: PROOF_PARAMS,
    readings,
    energy_wh: wh,
    amount,
  };
  const bytes = new TextEncoder().encode(JSON.stringify(file));
  const hash = sha256(bytes);
  mkdirSync(join(PROOFS_DIR, String(projectId)), { recursive: true });
  writeFileSync(proofPath(projectId, index), bytes);

  try {
    await topUpOperator();
    // Stand-in for the utility paying the operator: mint the revenue's test USDC to the operator.
    const operatorUsdc = ata(operator.publicKey, usdcMint);
    await mintTo(connection, admin, usdcMint, operatorUsdc, admin, amount);
    const tx = await program.methods
      .fundRevenue({
        amount: new BN(amount),
        energyWh: new BN(wh),
        proofHash: Array.from(hash),
        readingsCount: readings.length,
        periodStart: new BN(start),
        periodEnd: new BN(end),
      })
      .accountsPartial({
        operator: operator.publicKey,
        config: configPda,
        project: projectAddr,
        revenueState: revenuePda(projectAddr),
        settlement: settlementPda(projectAddr, index),
        stablecoinMint: usdcMint,
        revenueVault: revenueVaultPda(projectAddr),
        operatorStablecoinAccount: operatorUsdc,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([operator])
      .rpc();
    saveSettlement({
      project: projectId,
      idx: index,
      period_start: start,
      period_end: end,
      energy_wh: wh,
      amount,
      readings_count: readings.length,
      proof_hash: bytesToHex(hash),
      tx,
      created_at: Date.now(),
    });
    setMeta(windowKey(projectId), String(end));
    log(projectId, `Settlement #${index}: ${wh} Wh → ${(amount / 10 ** USDC_DECIMALS).toFixed(6)} USDC`, tx);
  } catch (e) {
    // The window stays open, so the next attempt covers these readings again.
    log(projectId, `Settlement #${index} failed, will retry: ${errorText(e)}`);
  }
}
