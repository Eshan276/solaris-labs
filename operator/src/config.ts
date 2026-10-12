// Operator service configuration. Everything here can be overridden with environment variables.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ProofParams } from "./proof";

const env = (name: string, fallback: string) => process.env[name] ?? fallback;

function rpcUrl(): string {
  if (process.env.RPC_URL) return process.env.RPC_URL;
  try {
    const cfg = readFileSync(join(homedir(), ".config/solana/cli/config.yml"), "utf8");
    const url = cfg.match(/^json_rpc_url:\s*"?([^"\s]+)"?/m)?.[1];
    if (url?.includes("devnet")) return url;
  } catch {}
  return "https://api.devnet.solana.com";
}

export const ROOT = join(import.meta.dir, "..");
export const PORT = Number(env("PORT", "4100"));
export const RPC_URL = rpcUrl();
export const ADMIN_KEYPAIR = env("ADMIN_KEYPAIR", join(homedir(), ".config/solana/id.json"));
export const KEYS_DIR = join(ROOT, ".keys");
export const DATA_DIR = env("DATA_DIR", join(ROOT, "data"));
export const DEPLOYMENT_FILE = join(DATA_DIR, "deployment.json");
export const DB_FILE = join(DATA_DIR, "operator.sqlite");
export const PROOFS_DIR = join(DATA_DIR, "proofs");

/** How often revenue is settled on-chain. Each settlement creates a small rent-paying account. */
export const SETTLEMENT_PERIOD_SEC = Number(env("SETTLEMENT_PERIOD_SEC", "300"));
/** A meter that hasn't reported for this long is shown as offline. */
export const METER_TIMEOUT_MS = 10_000;

export const USDC_DECIMALS = 6;
/** Test USDC handed out by the faucet, and how often each wallet may ask. */
export const FAUCET_USDC = 1_000;
export const FAUCET_SOL = 0.05;
export const FAUCET_COOLDOWN_MS = 60 * 60 * 1000;

/** Energy and pricing rules published inside every proof file. */
export const PROOF_PARAMS: ProofParams = {
  test_gain: Number(env("TEST_GAIN", "100")),
  project_scale: 5_000 / 1.5, // 6 V × 250 mA model panel stands in for a 5 kW array
  tariff_base_units_per_wh: 80, // 0.08 USDC per kWh
  max_gap_ms: 10_000,
};
