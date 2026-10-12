// Solaris operator service.
//   POST /api/meter/readings                       signed readings from the meter (Wi-Fi or USB bridge)
//   GET  /api/deployment                           program, mint, and project addresses
//   GET  /api/projects                             project metadata with live summary
//   GET  /api/projects/:id/live                    newest reading and the last 15 minutes of power
//   GET  /api/projects/:id/settlements             settlement records with proof links
//   GET  /api/projects/:id/settlements/:i/proof    the exact proof file whose hash is on-chain
//   GET  /api/projects/:id/trades                  share-market trades, newest first
//   POST /api/faucet                               test USDC (and a little SOL) for a devnet wallet
import { ed25519 } from "@noble/curves/ed25519.js";
import { createAssociatedTokenAccountIdempotent, mintTo } from "@solana/spl-token";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FAUCET_COOLDOWN_MS,
  FAUCET_SOL,
  FAUCET_USDC,
  METER_TIMEOUT_MS,
  PORT,
  PROOF_PARAMS,
  ROOT,
  SETTLEMENT_PERIOD_SEC,
  USDC_DECIMALS,
} from "./config";
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  admin,
  connection,
  errorText,
  loadDeployment,
  program,
  projectPda,
  provider,
} from "./chain";
import { addReading, db, faucetLast, faucetMark, lastReading, readingsBetween, settlements, trades } from "./db";
import { projectWatts, readingMessage } from "./proof";
import { proofPath, settleIfDue, settleLog, windowStart } from "./settle";
import { indexAllTrades } from "./trades";

const deployment = loadDeployment();
const usdcMint = new PublicKey(deployment.usdcMint);
const metadata: { id: number; [k: string]: unknown }[] = JSON.parse(
  readFileSync(process.env.PROJECTS_FILE ?? join(ROOT, "projects.json"), "utf8"),
);

// Meter key (hex) -> project id, refreshed from chain so a rotated key takes effect.
const meterToProject = new Map<string, number>();
async function refreshMeters() {
  for (const p of deployment.projects) {
    const project = await program.account.project.fetch(projectPda(p.id));
    for (const [k, v] of meterToProject) if (v === p.id) meterToProject.delete(k);
    meterToProject.set(Buffer.from(project.meter.toBytes()).toString("hex"), p.id);
  }
}

const lastSeen = new Map<number, { at: number; source: string }>();
const hexBytes = (h: string) => Uint8Array.from(Buffer.from(h, "hex"));
const isInt = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

function acceptReading(body: any, source: string): { status: number; error?: string } {
  const { b, n, mv, ua, k, sig } = body ?? {};
  if (!isInt(b, 1, 2 ** 32) || !isInt(n, 1, 2 ** 32) || !isInt(mv, -1e6, 1e6) || !isInt(ua, -1e7, 1e7)) {
    return { status: 400, error: "Expected integer fields b, n, mv, ua" };
  }
  if (typeof k !== "string" || !/^[0-9a-f]{64}$/.test(k) || typeof sig !== "string" || !/^[0-9a-f]{128}$/.test(sig)) {
    return { status: 400, error: "Expected hex fields k (32 bytes) and sig (64 bytes)" };
  }
  const project = meterToProject.get(k);
  if (project === undefined) return { status: 403, error: "Unknown meter" };
  const message = new TextEncoder().encode(readingMessage({ b, n, mv, ua }));
  if (!ed25519.verify(hexBytes(sig), message, hexBytes(k))) return { status: 403, error: "Bad signature" };
  const last = lastReading(project);
  if (last && (b < last.b || (b === last.b && n <= last.n))) return { status: 409, error: "Stale or replayed reading" };
  addReading(project, { t: Date.now(), b, n, mv, ua, sig });
  lastSeen.set(project, { at: Date.now(), source });
  return { status: 200 };
}

function live(projectId: number) {
  const last = lastReading(projectId);
  const seen = lastSeen.get(projectId);
  const online = !!seen && Date.now() - seen.at < METER_TIMEOUT_MS;
  // Last 15 minutes averaged into 10-second buckets.
  const since = Date.now() - 15 * 60_000;
  const buckets = new Map<number, { sum: number; count: number }>();
  for (const r of readingsBetween(projectId, since, Date.now() + 1)) {
    const key = Math.floor(r.t / 10_000) * 10_000;
    const bucket = buckets.get(key) ?? { sum: 0, count: 0 };
    bucket.sum += projectWatts(r, PROOF_PARAMS);
    bucket.count++;
    buckets.set(key, bucket);
  }
  const start = windowStart(projectId);
  return {
    online,
    source: seen?.source ?? null,
    last: last && {
      t: last.t,
      volts: last.mv / 1000,
      milliamps: last.ua / 1000,
      projectWatts: projectWatts(last, PROOF_PARAMS),
    },
    series: [...buckets].map(([t, b]) => [t, b.sum / b.count]),
    nextSettlementAt: start === null ? null : (start + SETTLEMENT_PERIOD_SEC) * 1000,
    settlementPeriodSec: SETTLEMENT_PERIOD_SEC,
    params: PROOF_PARAMS,
  };
}

// The faucet is public once the app is deployed: cap it per visitor and overall so the admin
// wallet's devnet SOL can't be drained by scripted requests.
const FAUCET_PER_IP_PER_HOUR = 3;
const FAUCET_TOTAL_PER_HOUR = 60;
const faucetHits: { at: number; ip: string }[] = [];
function faucetAllowed(ip: string): string | null {
  const hourAgo = Date.now() - 3_600_000;
  while (faucetHits.length && faucetHits[0].at < hourAgo) faucetHits.shift();
  if (faucetHits.length >= FAUCET_TOTAL_PER_HOUR) return "The faucet is busy. Please try again later.";
  if (ip && faucetHits.filter((h) => h.ip === ip).length >= FAUCET_PER_IP_PER_HOUR) {
    return "Too many requests from your network. Please try again in an hour.";
  }
  faucetHits.push({ at: Date.now(), ip });
  return null;
}

async function faucet(wallet: string) {
  let owner: InstanceType<typeof PublicKey>;
  try {
    owner = new PublicKey(wallet);
  } catch {
    return { status: 400, error: "Not a valid Solana address" };
  }
  const wait = faucetLast(owner.toBase58()) + FAUCET_COOLDOWN_MS - Date.now();
  if (wait > 0) return { status: 429, error: `Already funded. Try again in ${Math.ceil(wait / 60_000)} min.` };
  faucetMark(owner.toBase58());
  try {
    // Idempotent create: no read-back, so a lagging RPC can't fail a request that already worked.
    const account = await createAssociatedTokenAccountIdempotent(connection, admin, usdcMint, owner, { commitment: "confirmed" });
    await mintTo(connection, admin, usdcMint, account, admin, FAUCET_USDC * 10 ** USDC_DECIMALS, [], { commitment: "confirmed" });
    let sol = 0;
    if ((await connection.getBalance(owner)) < 0.02 * LAMPORTS_PER_SOL) {
      await provider.sendAndConfirm(
        new Transaction().add(
          SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: owner, lamports: FAUCET_SOL * LAMPORTS_PER_SOL }),
        ),
      );
      sol = FAUCET_SOL;
    }
    return { status: 200, usdc: FAUCET_USDC, sol };
  } catch (e) {
    db.query("DELETE FROM faucet WHERE wallet = ?").run(owner.toBase58());
    console.error("Faucet:", e);
    return { status: 502, error: `Faucet failed: ${errorText(e) || (e as Error)?.name || "unknown error"}` };
  }
}

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...cors } });

function projectOr404(id: string) {
  const n = Number(id);
  return deployment.projects.some((p) => p.id === n) ? n : null;
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    if (req.method === "POST" && path === "/api/meter/readings") {
      const body = await req.json().catch(() => null);
      const res = acceptReading(body, body?.source === "usb" ? "usb" : "wifi");
      return json(res.error ? { ok: false, error: res.error } : { ok: true }, res.status);
    }
    if (req.method === "POST" && path === "/api/faucet") {
      const body = await req.json().catch(() => null);
      const limited = faucetAllowed(req.headers.get("x-client-ip") ?? "");
      if (limited) return json({ ok: false, error: limited }, 429);
      const res = await faucet(String(body?.wallet ?? ""));
      return json(res.status === 200 ? { ok: true, ...res } : { ok: false, error: res.error }, res.status);
    }

    if (path === "/api/health") return json({ ok: true });
    if (path === "/api/deployment") return json(deployment);
    if (path === "/api/projects") {
      return json(
        deployment.projects.map((p) => ({
          ...metadata.find((m) => m.id === p.id),
          ...p,
          live: live(p.id),
          settlements: settlements(p.id).length,
        })),
      );
    }
    if (path === "/api/activity") return json(settleLog);

    let m = path.match(/^\/api\/projects\/(\d+)\/live$/);
    if (m) {
      const id = projectOr404(m[1]);
      return id === null ? json({ error: "Unknown project" }, 404) : json(live(id));
    }
    m = path.match(/^\/api\/projects\/(\d+)\/settlements$/);
    if (m) {
      const id = projectOr404(m[1]);
      if (id === null) return json({ error: "Unknown project" }, 404);
      return json(
        settlements(id).map((s) => ({ ...s, proofUrl: `/api/projects/${id}/settlements/${s.idx}/proof` })),
      );
    }
    m = path.match(/^\/api\/projects\/(\d+)\/trades$/);
    if (m) {
      const id = projectOr404(m[1]);
      return id === null ? json({ error: "Unknown project" }, 404) : json(trades(id));
    }
    m = path.match(/^\/api\/projects\/(\d+)\/settlements\/(\d+)\/proof$/);
    if (m) {
      const id = projectOr404(m[1]);
      const file = id === null ? null : proofPath(id, Number(m[2]));
      if (!file || !existsSync(file)) return json({ error: "No proof file" }, 404);
      // Served byte-for-byte: its SHA-256 must equal the hash stored on-chain.
      return new Response(Bun.file(file), { headers: { "content-type": "application/json", ...cors } });
    }
    return json({ error: "Not found" }, 404);
  },
});

await refreshMeters();
console.log(`Solaris operator on http://localhost:${PORT}  program ${deployment.programId}`);
console.log(`Settling every ${SETTLEMENT_PERIOD_SEC}s with test gain ×${PROOF_PARAMS.test_gain}`);

// Settlement loop.
let busy = false;
setInterval(async () => {
  if (busy) return;
  busy = true;
  try {
    await refreshMeters();
    for (const p of deployment.projects) {
      const first = db
        .query("SELECT MIN(t) AS t FROM readings WHERE project = ?")
        .get(p.id) as { t: number | null };
      await settleIfDue(p.id, usdcMint, first.t === null ? null : Math.floor(first.t / 1000));
    }
  } catch (e) {
    console.error("Settlement loop:", errorText(e));
  } finally {
    busy = false;
  }
}, 15_000);

// Trade indexer.
let indexing = false;
const runIndexer = async () => {
  if (indexing) return;
  indexing = true;
  await indexAllTrades(deployment.projects.map((p) => p.id));
  indexing = false;
};
runIndexer();
setInterval(runIndexer, 10_000);
