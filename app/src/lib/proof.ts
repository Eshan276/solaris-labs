// Settlement proof format and the deterministic rules that turn signed meter readings into energy
// and revenue. Two identical copies exist: operator/src/proof.ts (settles) and app/src/lib/proof.ts
// (re-checks settlements in the investor's browser). operator/src/proof.test.ts fails if they differ.

import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";

export const READING_PREFIX = "solaris-reading-v1";
export const PROOF_VERSION = "solaris-settlement-v1";

/** One meter reading as stored in a proof file. `t` is when the operator received it (ms). */
export type ProofReading = {
  t: number;
  b: number; // meter boot counter
  n: number; // sequence number within the boot
  mv: number; // millivolts
  ua: number; // microamps
  sig: string; // Ed25519 signature over readingMessage(), hex
};

export type ProofParams = {
  /** Multiplier on measured current while the test load draws too little (1 = none). */
  test_gain: number;
  /** Scale from the model panel's watts to the project's watts. */
  project_scale: number;
  /** Stablecoin base units paid per watt-hour (80 = 0.08 USDC per kWh). */
  tariff_base_units_per_wh: number;
  /** Gaps between readings longer than this count as no production. */
  max_gap_ms: number;
};

export type ProofFile = {
  version: typeof PROOF_VERSION;
  program: string;
  project: string;
  /** Base58 meter key; must equal the project's `meter` on-chain. */
  meter: string;
  settlement_index: number;
  period_start: number; // unix seconds, inclusive
  period_end: number; // unix seconds, exclusive
  params: ProofParams;
  readings: ProofReading[];
  energy_wh: number;
  amount: number;
};

/** Exact bytes the meter signs. */
export function readingMessage(r: Pick<ProofReading, "b" | "n" | "mv" | "ua">): string {
  return `${READING_PREFIX}:${r.b}:${r.n}:${r.mv}:${r.ua}`;
}

/** Project-scale watts implied by one reading. Negative values (sensor offset) count as zero. */
export function projectWatts(r: Pick<ProofReading, "mv" | "ua">, p: ProofParams): number {
  const volts = Math.max(0, r.mv) / 1000;
  const amps = Math.max(0, r.ua) / 1_000_000;
  return volts * amps * p.test_gain * p.project_scale;
}

/** Trapezoidal energy over consecutive readings, rounded down to whole watt-hours. */
export function energyWh(readings: ProofReading[], p: ProofParams): number {
  let wh = 0;
  for (let i = 1; i < readings.length; i++) {
    const dt = readings[i].t - readings[i - 1].t;
    if (dt <= 0 || dt > p.max_gap_ms) continue;
    wh += (((projectWatts(readings[i - 1], p) + projectWatts(readings[i], p)) / 2) * dt) / 3_600_000;
  }
  return Math.floor(wh);
}

export function settlementAmount(wh: number, p: ProofParams): number {
  return wh * p.tariff_base_units_per_wh;
}

/** Readings must be in time order with strictly increasing (boot, seq) so none are replayed. */
export function readingsInOrder(readings: ProofReading[]): boolean {
  for (let i = 1; i < readings.length; i++) {
    const a = readings[i - 1];
    const b = readings[i];
    if (b.t < a.t) return false;
    if (b.b < a.b || (b.b === a.b && b.n <= a.n)) return false;
  }
  return true;
}

// ---------- verification (runs in the investor's browser) ----------

/** The settlement record as read from the chain. */
export type ChainSettlement = {
  project: string;
  index: number;
  amount: number;
  energyWh: number;
  proofHash: Uint8Array;
  readingsCount: number;
  periodStart: number;
  periodEnd: number;
};

export type Check = { label: string; ok: boolean; detail: string };

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const fromHex = (h: string) => Uint8Array.from(h.match(/../g) ?? [], (x) => parseInt(x, 16));

/**
 * Re-checks a settlement from scratch: the file is the one hashed on-chain, every reading was
 * signed by the project's meter, and the energy and payout follow from the readings.
 * `meter` is the project's meter key from the chain (32 bytes) and its base58 form.
 */
export function verifyProof(
  bytes: Uint8Array,
  chain: ChainSettlement,
  meter: { bytes: Uint8Array; base58: string },
): Check[] {
  const checks: Check[] = [];
  const add = (label: string, ok: boolean, detail: string) => checks.push({ label, ok, detail });

  const hash = sha256(bytes);
  add(
    "File matches the hash stored on-chain",
    toHex(hash) === toHex(chain.proofHash),
    `SHA-256 ${toHex(hash).slice(0, 16)}… vs on-chain ${toHex(chain.proofHash).slice(0, 16)}…`,
  );

  let file: ProofFile;
  try {
    file = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    add("File is readable", false, "Not valid JSON");
    return checks;
  }
  add(
    "File describes this distribution",
    file.version === PROOF_VERSION && file.project === chain.project && file.settlement_index === chain.index,
    `${file.version}, project ${file.project.slice(0, 6)}…, distribution #${file.settlement_index + 1}`,
  );
  add(
    "Period matches the chain",
    file.period_start === chain.periodStart && file.period_end === chain.periodEnd,
    `${new Date(file.period_start * 1000).toLocaleString()} → ${new Date(file.period_end * 1000).toLocaleString()}`,
  );
  add("Meter is the project's registered meter", file.meter === meter.base58, file.meter);

  const readings = file.readings ?? [];
  const inPeriod = readings.every((r) => r.t >= file.period_start * 1000 && r.t < file.period_end * 1000);
  add(
    "Reading count matches the chain",
    readings.length === chain.readingsCount,
    `${readings.length} readings in file, ${chain.readingsCount} on-chain`,
  );
  add(
    "Readings are in order, unique, and inside the period",
    inPeriod && readingsInOrder(readings),
    inPeriod ? "Sequence numbers strictly increase" : "Some readings fall outside the period",
  );

  let bad = 0;
  for (const r of readings) {
    const msg = new TextEncoder().encode(readingMessage(r));
    let ok = false;
    try {
      ok = ed25519.verify(fromHex(r.sig), msg, meter.bytes);
    } catch {}
    if (!ok) bad++;
  }
  add(
    "Every reading is signed by the meter",
    readings.length > 0 && bad === 0,
    bad === 0 ? `${readings.length} of ${readings.length} signatures valid` : `${bad} invalid signatures`,
  );

  const wh = energyWh(readings, file.params);
  add(
    "Energy recomputes from the readings",
    wh === file.energy_wh && wh === chain.energyWh,
    `${wh} Wh recomputed, ${chain.energyWh} Wh on-chain`,
  );
  const amount = settlementAmount(wh, file.params);
  add(
    "Payout follows from energy × tariff",
    amount === chain.amount,
    `${wh} Wh × ${file.params.tariff_base_units_per_wh / 1e6} USDC/Wh = ${(amount / 1e6).toFixed(6)} USDC`,
  );
  return checks;
}
