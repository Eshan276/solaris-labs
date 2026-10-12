"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Line chart with value and time axes, for power over time. Points are [ms timestamp, watts].
 * The numbers are also shown as text nearby, so the chart itself is hidden from screen readers.
 */
export function LineChart({
  points,
  height = 220,
  className,
  format,
  fromZero = true,
  stepped = false,
  empty = "Waiting for meter readings",
}: {
  points: [number, number][];
  height?: number;
  className?: string;
  /** Axis label for a value. Defaults to watts, switching to kW for large values. */
  format?: (v: number) => string;
  /** Start the value axis at zero (power) or fit it to the data (prices). */
  fromZero?: boolean;
  /** Hold each value until the next point, as for trade prices. */
  stepped?: boolean;
  empty?: string;
}) {
  // Draw at the real pixel width so axis text isn't stretched.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(800);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setW(Math.max(200, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = height;
  const pad = { l: 44, r: 8, t: 10, b: 22 };
  if (points.length < 2) {
    return (
      <div ref={box} className={className} style={{ height }}>
        <div className="flex h-full items-center justify-center border-y text-[13px] text-muted-foreground">{empty}</div>
      </div>
    );
  }
  const t0 = points[0][0];
  const t1 = points[points.length - 1][0];
  const span = Math.max(1, t1 - t0);
  const values = points.map((p) => p[1]);
  // Power is shown in W or kW; custom formats use the raw values.
  const unitKw = !format && Math.max(...values) >= 1000;
  const div = unitKw ? 1000 : 1;
  const hi = Math.max(...values) / div;
  const lo = fromZero ? 0 : Math.min(...values) / div;
  // A "nice" step (1, 2, 2.5 or 5 × 10^k) giving about four gridlines.
  const rough = Math.max(hi - lo, Math.abs(hi) * 0.02, 1e-6) / 4;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * mag >= rough) ?? 10) * mag;
  const bottom = fromZero ? 0 : Math.floor(lo / step) * step;
  const top = Math.max(bottom + step, Math.ceil(hi / step) * step);
  const ticks = Array.from({ length: Math.round((top - bottom) / step) + 1 }, (_, i) => bottom + i * step);
  const label = format ?? ((v: number) => `${+v.toFixed(2)}${unitKw ? "kW" : "W"}`);
  const x = (t: number) => pad.l + ((t - t0) / span) * (W - pad.l - pad.r);
  const yv = (v: number) => pad.t + (1 - (v - bottom) / (top - bottom)) * (H - pad.t - pad.b);
  const y = (raw: number) => yv(raw / div);
  const line = points
    .map(([t, w], i) => (i === 0 ? `M${x(t).toFixed(1)} ${y(w).toFixed(1)}` : stepped ? `H${x(t).toFixed(1)} V${y(w).toFixed(1)}` : `L${x(t).toFixed(1)} ${y(w).toFixed(1)}`))
    .join(" ");
  const fmtT = (t: number) =>
    span > 20 * 3600_000
      ? new Date(t).toLocaleDateString([], { month: "short", day: "numeric" })
      : new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const timeTicks = [t0, t0 + span / 2, t1];
  const last = points[points.length - 1];

  return (
    <div ref={box} className={className}>
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full" aria-hidden>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={yv(v)} y2={yv(v)} className="stroke-border" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <text x={pad.l - 8} y={yv(v) + 3} textAnchor="end" className="fill-muted-foreground font-mono text-[10px]">
            {label(v)}
          </text>
        </g>
      ))}
      {timeTicks.map((t, i) => (
        <text key={i} x={x(t)} y={H - 6} textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"} className="fill-muted-foreground font-mono text-[10px]">
          {fmtT(t)}
        </text>
      ))}
      <path d={`${line} L${x(t1)} ${yv(bottom)} L${x(t0)} ${yv(bottom)} Z`} className="fill-foreground/[0.04]" />
      <path d={line} className="fill-none stroke-foreground" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <circle cx={x(last[0])} cy={y(last[1])} r={3} className="fill-foreground" />
    </svg>
    </div>
  );
}
