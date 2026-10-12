// Integration tests for solaris_v2 against the program DEPLOYED ON DEVNET.
//
// Each run creates a fresh project (so it never touches the live projects) and exercises every
// instruction with real transactions: primary purchase, proof-backed revenue settlement, claims,
// the share market, admin controls, and the error paths that guard them.
//
//   RPC_URL=<devnet rpc> bun test --timeout 120000
//
// Needs the protocol admin key (also the test-USDC mint authority) and the revenue operator key:
//   ADMIN_KEYPAIR    default ~/.config/solana/id.json
//   OPERATOR_KEYPAIR default ../../operator/.keys/operator.json
import { AnchorProvider, BN, Program, Wallet, web3 } from "@anchor-lang/core";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotent,
  getAccount,
  getAssociatedTokenAddressSync,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import idl from "./idl/solaris_v2.json";

const { Connection, Keypair, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } = web3;
type Key = InstanceType<typeof PublicKey>;
type Signer = InstanceType<typeof Keypair>;

const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";
const USDC = 1_000_000;
const SHARE_PRICE = 10 * USDC;
const MAX_SHARES = 100;

const loadKey = (path: string) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
const admin = loadKey(process.env.ADMIN_KEYPAIR ?? join(homedir(), ".config/solana/id.json"));
const operator = loadKey(process.env.OPERATOR_KEYPAIR ?? join(import.meta.dir, "../../operator/.keys/operator.json"));

const connection = new Connection(RPC_URL, "confirmed");
const provider = new AnchorProvider(connection, new Wallet(admin), { commitment: "confirmed" });
const program = new Program(idl as any, provider) as any;
const PROGRAM_ID: Key = program.programId;

const pda = (...seeds: (Buffer | Uint8Array)[]) => PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
const u64 = (n: number | BN) => new BN(n.toString()).toArrayLike(Buffer, "le", 8);
const configPda = pda(Buffer.from("config"));
const projectPda = (id: number) => pda(Buffer.from("project"), u64(id));
const revenuePda = (p: Key) => pda(Buffer.from("revenue"), p.toBuffer());
const shareMintPda = (p: Key) => pda(Buffer.from("share_mint"), p.toBuffer());
const investmentVaultPda = (p: Key) => pda(Buffer.from("investment_vault"), p.toBuffer());
const revenueVaultPda = (p: Key) => pda(Buffer.from("revenue_vault"), p.toBuffer());
const positionPda = (p: Key, who: Key) => pda(Buffer.from("position"), p.toBuffer(), who.toBuffer());
const settlementPda = (p: Key, i: number) => pda(Buffer.from("settlement"), p.toBuffer(), u64(i));
const listingPda = (p: Key, seller: Key) => pda(Buffer.from("listing"), p.toBuffer(), seller.toBuffer());
const marketPda = (p: Key) => pda(Buffer.from("market"), p.toBuffer());
const ata = (owner: Key, mint: Key, offCurve = false) => getAssociatedTokenAddressSync(mint, owner, offCurve);

/** Expects the call to fail with the given Anchor error code name. */
async function expectError(call: Promise<unknown>, code: string) {
  try {
    await call;
  } catch (e: any) {
    const text = [e?.error?.errorCode?.code, e?.message, ...(e?.logs ?? []), ...(e?.transactionLogs ?? [])].join("\n");
    expect(text).toContain(code);
    return;
  }
  throw new Error(`Expected ${code}, but the transaction succeeded`);
}

const tokenBalance = async (address: Key) => Number((await getAccount(connection, address)).amount);

let usdcMint: Key;
let project: Key;
let shareMint: Key;
let projectId: number;
const alice = Keypair.generate();
const bob = Keypair.generate();
const carol = Keypair.generate();
let periodEnd = 0;

async function fundWallet(who: Signer, usdc: number) {
  await provider.sendAndConfirm(
    new Transaction().add(
      SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: who.publicKey, lamports: 0.03 * LAMPORTS_PER_SOL }),
    ),
  );
  const account = await createAssociatedTokenAccountIdempotent(connection, admin, usdcMint, who.publicKey);
  await mintTo(connection, admin, usdcMint, account, admin, usdc);
}

const purchase = (who: Signer, shares: number) =>
  program.methods
    .purchaseShares(new BN(shares))
    .accountsPartial({
      investor: who.publicKey,
      project,
      revenueState: revenuePda(project),
      position: positionPda(project, who.publicKey),
      stablecoinMint: usdcMint,
      shareMint,
      investmentVault: investmentVaultPda(project),
      investorStablecoinAccount: ata(who.publicKey, usdcMint),
      investorShareAccount: ata(who.publicKey, shareMint),
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .signers([who])
    .rpc();

/** Settles one period of revenue, as the operator does after each meter period. */
async function fund(amount: number, signer: Signer = operator, opts: { readings?: number; start?: number } = {}) {
  const start = opts.start ?? periodEnd;
  const end = start + 300;
  const index = (await program.account.project.fetch(project)).settlementCount.toNumber();
  const sig = await program.methods
    .fundRevenue({
      amount: new BN(amount),
      energyWh: new BN(amount / 80),
      proofHash: Array.from(createHash("sha256").update(`devnet-test-${projectId}-${index}`).digest()),
      readingsCount: opts.readings ?? 300,
      periodStart: new BN(start),
      periodEnd: new BN(end),
    })
    .accountsPartial({
      operator: signer.publicKey,
      config: configPda,
      project,
      revenueState: revenuePda(project),
      settlement: settlementPda(project, index),
      stablecoinMint: usdcMint,
      revenueVault: revenueVaultPda(project),
      operatorStablecoinAccount: ata(signer.publicKey, usdcMint),
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([signer])
    .rpc();
  periodEnd = end;
  return { sig, index };
}

const claim = (who: Signer) =>
  program.methods
    .claimRevenue()
    .accountsPartial({
      investor: who.publicKey,
      project,
      revenueState: revenuePda(project),
      position: positionPda(project, who.publicKey),
      stablecoinMint: usdcMint,
      revenueVault: revenueVaultPda(project),
      investorStablecoinAccount: ata(who.publicKey, usdcMint),
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([who])
    .rpc();

const list = (who: Signer, amount: number, price: number) => {
  const listing = listingPda(project, who.publicKey);
  return program.methods
    .listShares(new BN(amount), new BN(price))
    .accountsPartial({
      seller: who.publicKey,
      project,
      position: positionPda(project, who.publicKey),
      listing,
      shareMint,
      sellerShareAccount: ata(who.publicKey, shareMint),
      escrow: ata(listing, shareMint, true),
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .signers([who])
    .rpc();
};

const buy = (who: Signer, seller: Key, amount: number, maxPrice: number) => {
  const listing = listingPda(project, seller);
  return program.methods
    .buyListing(new BN(amount), new BN(maxPrice))
    .accountsPartial({
      buyer: who.publicKey,
      seller,
      project,
      revenueState: revenuePda(project),
      listing,
      sellerPosition: positionPda(project, seller),
      buyerPosition: positionPda(project, who.publicKey),
      market: marketPda(project),
      stablecoinMint: usdcMint,
      shareMint,
      escrow: ata(listing, shareMint, true),
      buyerStablecoinAccount: ata(who.publicKey, usdcMint),
      sellerStablecoinAccount: ata(seller, usdcMint),
      buyerShareAccount: ata(who.publicKey, shareMint),
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .signers([who])
    .rpc();
};

const cancel = (who: Signer) => {
  const listing = listingPda(project, who.publicKey);
  return program.methods
    .cancelListing()
    .accountsPartial({
      seller: who.publicKey,
      project,
      listing,
      shareMint,
      escrow: ata(listing, shareMint, true),
      sellerShareAccount: ata(who.publicKey, shareMint),
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([who])
    .rpc();
};

const shares = async (who: Signer) => (await program.account.investorPosition.fetch(positionPda(project, who.publicKey))).shares.toNumber();

beforeAll(async () => {
  const config = await program.account.protocolConfig.fetch(configPda);
  usdcMint = config.stablecoinMint;
  // Make sure the operator can fund this run's settlements.
  const opUsdc = await createAssociatedTokenAccountIdempotent(connection, admin, usdcMint, operator.publicKey);
  await mintTo(connection, admin, usdcMint, opUsdc, admin, 10 * USDC);
  await Promise.all([fundWallet(alice, 500 * USDC), fundWallet(bob, 500 * USDC), fundWallet(carol, 500 * USDC)]);
  periodEnd = Math.floor(Date.now() / 1000) - 100_000;
});

describe("deployment", () => {
  test("program is deployed and executable on devnet", async () => {
    const info = await connection.getAccountInfo(PROGRAM_ID);
    expect(info?.executable).toBe(true);
    expect(PROGRAM_ID.toBase58()).toBe("CT5Mi74a94AF6W4H2dfUnSC5F8P2gxK3J5jrCNGFMcZa");
  });

  test("protocol config names the admin and revenue operator", async () => {
    const config = await program.account.protocolConfig.fetch(configPda);
    expect(config.admin.toBase58()).toBe(admin.publicKey.toBase58());
    expect(config.revenueOperator.toBase58()).toBe(operator.publicKey.toBase58());
  });
});

describe("initialize_project", () => {
  test("admin creates a project with a meter key", async () => {
    projectId = (await program.account.protocolConfig.fetch(configPda)).projectCount.toNumber();
    project = projectPda(projectId);
    shareMint = shareMintPda(project);
    const meter = Keypair.generate().publicKey;
    await program.methods
      .initializeProject(new BN(SHARE_PRICE), new BN(MAX_SHARES), meter)
      .accountsPartial({
        admin: admin.publicKey,
        config: configPda,
        project,
        revenueState: revenuePda(project),
        stablecoinMint: usdcMint,
        shareMint,
        investmentVault: investmentVaultPda(project),
        revenueVault: revenueVaultPda(project),
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    const p = await program.account.project.fetch(project);
    expect(p.sharePrice.toNumber()).toBe(SHARE_PRICE);
    expect(p.maxShares.toNumber()).toBe(MAX_SHARES);
    expect(p.totalShares.toNumber()).toBe(0);
    expect(p.meter.toBase58()).toBe(meter.toBase58());
    expect(p.active).toBe(true);
  });

  test("non-admin cannot create a project", async () => {
    const next = projectPda(projectId + 1);
    await expectError(
      program.methods
        .initializeProject(new BN(SHARE_PRICE), new BN(MAX_SHARES), Keypair.generate().publicKey)
        .accountsPartial({
          admin: alice.publicKey,
          config: configPda,
          project: next,
          revenueState: revenuePda(next),
          stablecoinMint: usdcMint,
          shareMint: shareMintPda(next),
          investmentVault: investmentVaultPda(next),
          revenueVault: revenueVaultPda(next),
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([alice])
        .rpc(),
      "UnauthorizedAdmin",
    );
  });
});

describe("purchase_shares", () => {
  test("investor buys shares; USDC goes to the investment vault", async () => {
    await purchase(alice, 10);
    expect(await shares(alice)).toBe(10);
    expect(await tokenBalance(ata(alice.publicKey, shareMint))).toBe(10);
    expect(await tokenBalance(investmentVaultPda(project))).toBe(10 * SHARE_PRICE);
    expect((await program.account.project.fetch(project)).totalShares.toNumber()).toBe(10);
  });

  test("rejects zero shares", async () => {
    await expectError(purchase(bob, 0), "InvalidShareAmount");
  });

  test("rejects purchases beyond max shares", async () => {
    await expectError(purchase(bob, MAX_SHARES), "ExceedsMaxShares");
  });

  test("paused project rejects purchases, and resumes", async () => {
    const setActive = (active: boolean) =>
      program.methods.setProjectActive(active).accountsPartial({ admin: admin.publicKey, project }).rpc();
    await setActive(false);
    await expectError(purchase(bob, 1), "ProjectInactive");
    await setActive(true);
  });
});

describe("fund_revenue (proof-backed settlement)", () => {
  test("operator settles a period; the settlement records proof hash and period", async () => {
    const { index } = await fund(1 * USDC);
    const s = await program.account.settlement.fetch(settlementPda(project, index));
    expect(s.amount.toNumber()).toBe(1 * USDC);
    expect(s.readingsCount).toBe(300);
    expect(s.periodEnd.toNumber()).toBe(periodEnd);
    expect(Buffer.from(s.proofHash).toString("hex")).toBe(
      createHash("sha256").update(`devnet-test-${projectId}-${index}`).digest("hex"),
    );
    expect(await tokenBalance(revenueVaultPda(project))).toBe(1 * USDC);
  });

  test("only the revenue operator can fund", async () => {
    await expectError(fund(1 * USDC, alice), "UnauthorizedOperator");
  });

  test("rejects overlapping periods", async () => {
    await expectError(fund(1 * USDC, operator, { start: periodEnd - 10 }), "InvalidPeriod");
  });

  test("rejects settlements without readings", async () => {
    await expectError(fund(1 * USDC, operator, { readings: 0 }), "NoReadings");
  });
});

describe("claim_revenue", () => {
  test("sole holder claims the whole distribution", async () => {
    const before = await tokenBalance(ata(alice.publicKey, usdcMint));
    await claim(alice);
    expect((await tokenBalance(ata(alice.publicKey, usdcMint))) - before).toBe(1 * USDC);
  });

  test("nothing left to claim afterwards", async () => {
    await expectError(claim(alice), "NothingToClaim");
  });

  test("a late investor earns only from later distributions", async () => {
    await purchase(bob, 10); // alice 10, bob 10
    await fund(2 * USDC);
    const aBefore = await tokenBalance(ata(alice.publicKey, usdcMint));
    const bBefore = await tokenBalance(ata(bob.publicKey, usdcMint));
    await claim(alice);
    await claim(bob);
    expect((await tokenBalance(ata(alice.publicKey, usdcMint))) - aBefore).toBe(1 * USDC);
    expect((await tokenBalance(ata(bob.publicKey, usdcMint))) - bBefore).toBe(1 * USDC);
  });
});

describe("share market", () => {
  test("list_shares escrows tokens; the seller keeps revenue rights", async () => {
    await list(alice, 6, 12 * USDC);
    const listing = await program.account.listing.fetch(listingPda(project, alice.publicKey));
    expect(listing.amount.toNumber()).toBe(6);
    expect(listing.price.toNumber()).toBe(12 * USDC);
    expect(await tokenBalance(ata(listingPda(project, alice.publicKey), shareMint, true))).toBe(6);
    expect(await shares(alice)).toBe(10);
  });

  test("rejects listing by a wallet with no position", async () => {
    await expectError(list(carol, 1, USDC), "AccountNotInitialized");
  });

  test("rejects a buy above the buyer's max price", async () => {
    await expectError(buy(carol, alice.publicKey, 1, 11 * USDC), "PriceAboveMax");
  });

  test("rejects buying more than the listing holds", async () => {
    await expectError(buy(carol, alice.publicKey, 7, 12 * USDC), "ListingTooSmall");
  });

  test("buy_listing pays the seller and moves shares and revenue rights", async () => {
    const aBefore = await tokenBalance(ata(alice.publicKey, usdcMint));
    await buy(carol, alice.publicKey, 4, 12 * USDC);
    expect((await tokenBalance(ata(alice.publicKey, usdcMint))) - aBefore).toBe(48 * USDC);
    expect(await shares(alice)).toBe(6);
    expect(await shares(carol)).toBe(4);
    expect(await tokenBalance(ata(carol.publicKey, shareMint))).toBe(4);
    const m = await program.account.market.fetch(marketPda(project));
    expect(m.lastPrice.toNumber()).toBe(12 * USDC);
    expect(m.tradeCount.toNumber()).toBe(1);
    expect(m.volumeShares.toNumber()).toBe(4);
  });

  test("buying the rest closes the listing and its escrow", async () => {
    await buy(bob, alice.publicKey, 2, 12 * USDC);
    expect(await connection.getAccountInfo(listingPda(project, alice.publicKey))).toBeNull();
    expect(await connection.getAccountInfo(ata(listingPda(project, alice.publicKey), shareMint, true))).toBeNull();
    expect(await shares(alice)).toBe(4);
    expect(await shares(bob)).toBe(12);
  });

  test("revenue after trades follows the new holdings", async () => {
    await fund(2 * USDC); // alice 4, bob 12, carol 4 of 20
    const expected: [Signer, number][] = [[alice, 0.4 * USDC], [bob, 1.2 * USDC], [carol, 0.4 * USDC]];
    for (const [who, amount] of expected) {
      const before = await tokenBalance(ata(who.publicKey, usdcMint));
      await claim(who);
      expect((await tokenBalance(ata(who.publicKey, usdcMint))) - before).toBe(amount);
    }
    const r = await program.account.revenueState.fetch(revenuePda(project));
    expect(r.totalClaimed.toNumber()).toBe(r.totalFunded.toNumber());
  });

  test("cancel_listing returns unsold shares", async () => {
    await list(bob, 5, 15 * USDC);
    expect(await tokenBalance(ata(bob.publicKey, shareMint))).toBe(7);
    await cancel(bob);
    expect(await tokenBalance(ata(bob.publicKey, shareMint))).toBe(12);
    expect(await connection.getAccountInfo(listingPda(project, bob.publicKey))).toBeNull();
  });

  test("rejects zero-price listings", async () => {
    await expectError(list(bob, 1, 0), "InvalidListing");
  });

  test("rejects listing more shares than held", async () => {
    await expectError(list(carol, 5, USDC), "InsufficientShares"); // carol holds 4
  });
});

describe("admin controls", () => {
  test("admin rotates the meter key; others cannot", async () => {
    const meter = Keypair.generate().publicKey;
    await expectError(
      program.methods.setMeter(meter).accountsPartial({ admin: alice.publicKey, project }).signers([alice]).rpc(),
      "UnauthorizedAdmin",
    );
    await program.methods.setMeter(meter).accountsPartial({ admin: admin.publicKey, project }).rpc();
    expect((await program.account.project.fetch(project)).meter.toBase58()).toBe(meter.toBase58());
  });
});
