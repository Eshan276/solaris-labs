// End-to-end devnet check of the settlement pipeline, independent of the live meter:
// a throwaway project with a software meter, signed readings, an investor, one settlement,
// independent proof verification against the chain, and a claim.
//
//   DATA_DIR=/tmp/solaris-e2e bun run scripts/e2e.ts
import { ed25519 } from "@noble/curves/ed25519.js";
import { getAccount, getOrCreateAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { readFileSync, rmSync } from "node:fs";
import { DATA_DIR, PROOF_PARAMS } from "../src/config";
import {
  BN,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  admin,
  ata,
  configPda,
  connection,
  investmentVaultPda,
  loadDeployment,
  positionPda,
  program,
  projectPda,
  provider,
  revenuePda,
  revenueVaultPda,
  settlementPda,
  shareMintPda,
} from "../src/chain";
import { addReading, setMeta } from "../src/db";
import { readingMessage, verifyProof } from "../src/proof";
import { proofPath, settleIfDue } from "../src/settle";

if (!DATA_DIR.startsWith("/tmp/")) {
  console.error("Run with DATA_DIR=/tmp/... so the test never touches the real operator data.");
  process.exit(1);
}
rmSync(`${DATA_DIR}/proofs`, { recursive: true, force: true });

// The real deployment's mint and config are shared; the project is new and never listed.
const { usdcMint: mintStr } = JSON.parse(readFileSync(new URL("../data/deployment.json", import.meta.url), "utf8"));
const usdcMint = new PublicKey(mintStr);
const meterSecret = ed25519.utils.randomSecretKey();
const meterPub = ed25519.getPublicKey(meterSecret);

const config = await program.account.protocolConfig.fetch(configPda);
const id = config.projectCount.toNumber();
const project = projectPda(id);
await program.methods
  .initializeProject(new BN(10_000_000), new BN(1_000), new PublicKey(meterPub))
  .accountsPartial({
    admin: admin.publicKey,
    config: configPda,
    project,
    revenueState: revenuePda(project),
    stablecoinMint: usdcMint,
    shareMint: shareMintPda(project),
    investmentVault: investmentVaultPda(project),
    revenueVault: revenueVaultPda(project),
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .rpc();
console.log(`1. Test project #${id} created with a software meter`);

// An investor buys 5 shares.
const investor = Keypair.generate();
await provider.sendAndConfirm(
  new Transaction().add(
    SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: investor.publicKey, lamports: 0.05 * LAMPORTS_PER_SOL }),
  ),
);
const investorUsdc = await getOrCreateAssociatedTokenAccount(connection, admin, usdcMint, investor.publicKey);
await mintTo(connection, admin, usdcMint, investorUsdc.address, admin, 100_000_000);
await program.methods
  .purchaseShares(new BN(5))
  .accountsPartial({
    investor: investor.publicKey,
    project,
    revenueState: revenuePda(project),
    position: positionPda(project, investor.publicKey),
    stablecoinMint: usdcMint,
    shareMint: shareMintPda(project),
    investmentVault: investmentVaultPda(project),
    investorStablecoinAccount: investorUsdc.address,
    investorShareAccount: ata(investor.publicKey, shareMintPda(project)),
    tokenProgram: TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
  })
  .signers([investor])
  .rpc();
console.log("2. Investor bought 5 shares (50 USDC)");

// 400 seconds of torch-level readings (4.1 V, 0.35 mA), signed by the software meter.
const now = Date.now();
for (let i = 0; i < 400; i++) {
  const r = { b: 1, n: i + 1, mv: 4100, ua: 350 };
  const sig = Buffer.from(ed25519.sign(new TextEncoder().encode(readingMessage(r)), meterSecret)).toString("hex");
  addReading(id, { t: now - 400_000 + i * 1000, ...r, sig });
}
setMeta(`window_start:${id}`, String(Math.floor(now / 1000) - 401));
console.log("3. 400 signed readings stored");

await settleIfDue(id, usdcMint, null);
const s = await program.account.settlement.fetch(settlementPda(project, 0));
console.log(`4. Settled on-chain: ${s.energyWh} Wh, ${s.amount.toNumber() / 1e6} USDC, ${s.readingsCount} readings`);

const onChainProject = await program.account.project.fetch(project);
const checks = verifyProof(
  new Uint8Array(readFileSync(proofPath(id, 0))),
  {
    project: project.toBase58(),
    index: 0,
    amount: s.amount.toNumber(),
    energyWh: s.energyWh.toNumber(),
    proofHash: Uint8Array.from(s.proofHash),
    readingsCount: s.readingsCount,
    periodStart: s.periodStart.toNumber(),
    periodEnd: s.periodEnd.toNumber(),
  },
  { bytes: onChainProject.meter.toBytes(), base58: onChainProject.meter.toBase58() },
);
for (const c of checks) console.log(`   ${c.ok ? "✓" : "✗"} ${c.label}: ${c.detail}`);

// A tampered proof file must fail verification.
const tampered = JSON.parse(readFileSync(proofPath(id, 0), "utf8"));
tampered.readings[10].ua += 1;
const tamperedChecks = verifyProof(new TextEncoder().encode(JSON.stringify(tampered)), {
  project: project.toBase58(),
  index: 0,
  amount: s.amount.toNumber(),
  energyWh: s.energyWh.toNumber(),
  proofHash: Uint8Array.from(s.proofHash),
  readingsCount: s.readingsCount,
  periodStart: s.periodStart.toNumber(),
  periodEnd: s.periodEnd.toNumber(),
}, { bytes: onChainProject.meter.toBytes(), base58: onChainProject.meter.toBase58() });
const caught = tamperedChecks.filter((c) => !c.ok).map((c) => c.label);
console.log(`5. Tampered file (one reading +1 µA) rejected by: ${caught.join("; ")}`);

const before = (await getAccount(connection, investorUsdc.address)).amount;
await program.methods
  .claimRevenue()
  .accountsPartial({
    investor: investor.publicKey,
    project,
    revenueState: revenuePda(project),
    position: positionPda(project, investor.publicKey),
    stablecoinMint: usdcMint,
    revenueVault: revenueVaultPda(project),
    investorStablecoinAccount: investorUsdc.address,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .signers([investor])
  .rpc();
const after = (await getAccount(connection, investorUsdc.address)).amount;
console.log(`6. Investor claimed ${Number(after - before) / 1e6} USDC (the whole settlement: sole shareholder)`);

const allOk = checks.every((c) => c.ok) && caught.length > 0 && Number(after - before) === s.amount.toNumber();
console.log(allOk ? "\nE2E PASSED" : "\nE2E FAILED");
process.exit(allOk ? 0 : 1);
