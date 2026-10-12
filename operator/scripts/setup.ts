// One-time devnet setup for solaris_v2: test USDC mint, operator key, protocol config, and a project
// registered to a meter key.
//
//   bun run setup <meter-key-hex>                 first run
//   bun run setup <meter-key-hex> --new-project   add another project to an existing deployment
//
// The meter key is printed by the ESP32 at boot ("# solar_meter ready, meter key ...").
import { TOKEN_PROGRAM_ID, createMint, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { DATA_DIR, DEPLOYMENT_FILE, USDC_DECIMALS } from "../src/config";
import {
  BN,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  admin,
  configPda,
  connection,
  investmentVaultPda,
  loadDeployment,
  operatorKeypair,
  program,
  projectPda,
  provider,
  revenuePda,
  revenueVaultPda,
  shareMintPda,
  type Deployment,
} from "../src/chain";

const USDC = 10 ** USDC_DECIMALS;
const SHARE_PRICE = 10 * USDC;
const MAX_SHARES = 1_000;

const [meterHex, flag] = process.argv.slice(2);
if (!meterHex || !/^[0-9a-f]{64}$/i.test(meterHex)) {
  console.error("Usage: bun run setup <meter-key-hex> [--new-project]");
  process.exit(1);
}
const meter = new PublicKey(Buffer.from(meterHex, "hex"));
const operator = operatorKeypair();
mkdirSync(DATA_DIR, { recursive: true });

async function createProject(usdcMint: InstanceType<typeof PublicKey>): Promise<number> {
  const config = await program.account.protocolConfig.fetch(configPda);
  const id = config.projectCount.toNumber();
  const project = projectPda(id);
  const sig = await program.methods
    .initializeProject(new BN(SHARE_PRICE), new BN(MAX_SHARES), meter)
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
  console.log(`Project #${id} ${project.toBase58()} (meter ${meter.toBase58()})  tx ${sig}`);
  return id;
}

if (flag === "--new-project") {
  const deployment = loadDeployment();
  const id = await createProject(new PublicKey(deployment.usdcMint));
  deployment.projects.push({ id, address: projectPda(id).toBase58(), meter: meter.toBase58() });
  writeFileSync(DEPLOYMENT_FILE, JSON.stringify(deployment, null, 2));
  process.exit(0);
}

if (existsSync(DEPLOYMENT_FILE)) {
  console.error(`${DEPLOYMENT_FILE} already exists. Use --new-project to add a project.`);
  process.exit(1);
}

console.log(`Program ${program.programId.toBase58()}, admin ${admin.publicKey.toBase58()}`);

// Resume an interrupted setup: the config is a singleton, so reuse its mint if it already exists.
const existing = await program.account.protocolConfig.fetchNullable(configPda);
let usdcMint: InstanceType<typeof PublicKey>;
if (existing) {
  if (!existing.revenueOperator.equals(operator.publicKey)) {
    console.error("Protocol config exists with a different operator; refusing to continue.");
    process.exit(1);
  }
  usdcMint = existing.stablecoinMint;
  console.log(`Reusing protocol config ${configPda.toBase58()} and mint ${usdcMint.toBase58()}`);
} else {
  // The operator pays rent for settlement records, so give it some devnet SOL.
  await provider.sendAndConfirm(
    new Transaction().add(
      SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: operator.publicKey, lamports: 2 * LAMPORTS_PER_SOL }),
    ),
  );
  console.log(`Operator ${operator.publicKey.toBase58()} funded with 2 SOL`);
  usdcMint = await createMint(connection, admin, admin.publicKey, null, USDC_DECIMALS);
  console.log(`Test USDC mint ${usdcMint.toBase58()}`);
  await program.methods
    .initializeConfig(operator.publicKey)
    .accountsPartial({ admin: admin.publicKey, config: configPda, stablecoinMint: usdcMint })
    .rpc();
  console.log(`Protocol config ${configPda.toBase58()}`);
}
await getOrCreateAssociatedTokenAccount(connection, admin, usdcMint, operator.publicKey);

const id = await createProject(usdcMint);
const deployment: Deployment = {
  cluster: "devnet",
  programId: program.programId.toBase58(),
  usdcMint: usdcMint.toBase58(),
  operator: operator.publicKey.toBase58(),
  projects: [{ id, address: projectPda(id).toBase58(), meter: meter.toBase58() }],
};
writeFileSync(DEPLOYMENT_FILE, JSON.stringify(deployment, null, 2));
console.log(`Saved ${DEPLOYMENT_FILE}`);
