// Operator service API, served same-origin under /operator (see next.config.ts).
import type { ProofParams } from "./proof";

export type ProjectInfo = {
  id: number;
  slug: string;
  name: string;
  location: string;
  capacityKw: number;
  description: string;
  tariffUsdcPerKwh: number;
  address: string;
  meter: string;
  live: LiveData;
  settlements: number;
};

export type LiveData = {
  online: boolean;
  source: "usb" | "wifi" | null;
  last: { t: number; volts: number; milliamps: number; projectWatts: number } | null;
  series: [number, number][];
  nextSettlementAt: number | null;
  settlementPeriodSec: number;
  params: ProofParams;
};

export type SettlementInfo = {
  idx: number;
  period_start: number;
  period_end: number;
  energy_wh: number;
  amount: number;
  readings_count: number;
  proof_hash: string;
  tx: string | null;
  created_at: number;
  proofUrl: string;
};

export type TradeInfo = { sig: string; seller: string; buyer: string; shares: number; price: number; t: number };

export type Deployment = { cluster: string; programId: string; usdcMint: string; operator: string };

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`/operator${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(res.status >= 500 ? "The Solaris service is unavailable right now." : `Request failed (${res.status})`);
  return res.json();
}

export const api = {
  deployment: () => get<Deployment>("/api/deployment"),
  projects: () => get<ProjectInfo[]>("/api/projects"),
  live: (id: number) => get<LiveData>(`/api/projects/${id}/live`),
  settlements: (id: number) => get<SettlementInfo[]>(`/api/projects/${id}/settlements`),
  trades: (id: number) => get<TradeInfo[]>(`/api/projects/${id}/trades`),
  proofBytes: async (id: number, index: number) => {
    const res = await fetch(`/operator/api/projects/${id}/settlements/${index}/proof`, { cache: "no-store" });
    if (!res.ok) throw new Error("The proof file for this payout isn't available.");
    return new Uint8Array(await res.arrayBuffer());
  },
  faucet: async (wallet: string): Promise<{ usdc: number; sol: number }> => {
    const res = await fetch("/operator/api/faucet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wallet }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "The faucet is unavailable right now.");
    return data;
  },
};

/**
 * Annualized yield from payouts in the last 24 hours (or since the first payout, if sooner),
 * relative to the money invested. Null until there is a payout and at least one share.
 */
export function trailingYield(settlements: SettlementInfo[], totalShares: number, sharePrice: number): number | null {
  if (!settlements.length || !totalShares) return null;
  const now = Date.now() / 1000;
  const recent = settlements.filter((s) => s.period_end > now - 86_400);
  if (!recent.length) return 0;
  const start = Math.min(...recent.map((s) => s.period_start));
  const end = Math.max(...recent.map((s) => s.period_end));
  const paid = recent.reduce((sum, s) => sum + s.amount, 0);
  const perYear = (paid / Math.max(1, end - start)) * 31_536_000;
  return perYear / (totalShares * sharePrice);
}
