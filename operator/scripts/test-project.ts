// Creates a devnet test project whose meter is a software key, for demos and UI tests when the real
// panel can't produce (night, clouds). Writes a self-contained operator data dir:
//
//   DATA_DIR=/tmp/solaris-test bun run scripts/test-project.ts
//   DATA_DIR=/tmp/solaris-test PORT=4200 PROJECTS_FILE=/tmp/solaris-test/projects.json SETTLEMENT_PERIOD_SEC=60 bun run src/server.ts
//   DATA_DIR=/tmp/solaris-test bun run scripts/virtual-meter.ts http://localhost:4200
import { ed25519 } from "@noble/curves/ed25519.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, ROOT } from "../src/config";
import {
  BN,
  PublicKey,
  admin,
  configPda,
  investmentVaultPda,
  program,
  projectPda,
  revenuePda,
  revenueVaultPda,
  shareMintPda,
} from "../src/chain";

if (DATA_DIR === join(ROOT, "data")) {
  console.error("Set DATA_DIR to a separate folder so the test project never mixes with the real one.");
  process.exit(1);
}
mkdirSync(DATA_DIR, { recursive: true });
const real = JSON.parse(readFileSync(join(ROOT, "data/deployment.json"), "utf8"));
const usdcMint = new PublicKey(real.usdcMint);

const secret = ed25519.utils.randomSecretKey();
const meter = new PublicKey(ed25519.getPublicKey(secret));
const id = (await program.account.protocolConfig.fetch(configPda)).projectCount.toNumber();
const project = projectPda(id);
await program.methods
  .initializeProject(new BN(10_000_000), new BN(1_000), meter)
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

writeFileSync(join(DATA_DIR, "virtual-meter.json"), JSON.stringify({ secret: Buffer.from(secret).toString("hex") }), { mode: 0o600 });
writeFileSync(
  join(DATA_DIR, "deployment.json"),
  JSON.stringify({ ...real, projects: [{ id, address: project.toBase58(), meter: meter.toBase58() }] }, null, 2),
);
writeFileSync(
  join(DATA_DIR, "projects.json"),
  JSON.stringify(
    [
      {
        id,
        slug: `test-${id}`,
        name: "Test Rooftop (virtual meter)",
        location: "Simulation",
        capacityKw: 5,
        description: "A test project driven by a software meter, for demos and UI testing. Same program, same proofs.",
        tariffUsdcPerKwh: 0.08,
      },
    ],
    null,
    2,
  ),
);
console.log(`Test project #${id} ${project.toBase58()} with virtual meter ${meter.toBase58()} in ${DATA_DIR}`);
