const USDC = 1_000_000;

/** USDC amount from base units. Small values keep enough decimals to be non-zero. */
export function formatUsdc(base: number, opts: { symbol?: boolean } = {}): string {
  const v = base / USDC;
  const digits = v === 0 ? 2 : Math.abs(v) < 0.01 ? 6 : Math.abs(v) < 1 ? 4 : 2;
  const s = v.toLocaleString("en-US", { minimumFractionDigits: Math.min(2, digits), maximumFractionDigits: digits });
  return opts.symbol === false ? s : `${s} USDC`;
}

export function formatPower(watts: number): string {
  if (watts >= 1000) return `${(watts / 1000).toLocaleString("en-US", { maximumFractionDigits: 2 })} kW`;
  return `${Math.round(watts).toLocaleString("en-US")} W`;
}

export function formatEnergy(wh: number): string {
  if (wh >= 1000) return `${(wh / 1000).toLocaleString("en-US", { maximumFractionDigits: 2 })} kWh`;
  return `${wh.toLocaleString("en-US")} Wh`;
}

export const formatPercent = (fraction: number) =>
  `${(fraction * 100).toLocaleString("en-US", { maximumFractionDigits: fraction < 0.1 ? 2 : 1 })}%`;

export const shortAddress = (a: string, chars = 4) => (a.length > chars * 2 + 3 ? `${a.slice(0, chars)}…${a.slice(-chars)}` : a);

export function timeAgo(ms: number): string {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86_400)} d ago`;
}

export function timeUntil(ms: number): string {
  const s = Math.max(0, Math.round((ms - Date.now()) / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}
