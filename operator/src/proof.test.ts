import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { energyWh, projectWatts, readingsInOrder, settlementAmount, type ProofParams, type ProofReading } from "./proof";

const params: ProofParams = { test_gain: 1, project_scale: 1000, tariff_base_units_per_wh: 80, max_gap_ms: 10_000 };
const r = (t: number, n: number, mv: number, ua: number): ProofReading => ({ t, b: 1, n, mv, ua, sig: "" });

test("operator and app use the same proof rules", () => {
  const operator = readFileSync(new URL("./proof.ts", import.meta.url), "utf8");
  const app = readFileSync(new URL("../../app/src/lib/proof.ts", import.meta.url), "utf8");
  expect(app).toBe(operator);
});

test("project watts ignore negative sensor offsets", () => {
  expect(projectWatts({ mv: 5000, ua: 100_000 }, params)).toBeCloseTo(500); // 5 V × 0.1 A × 1000
  expect(projectWatts({ mv: 5000, ua: -300 }, params)).toBe(0);
  expect(projectWatts({ mv: -10, ua: 100_000 }, params)).toBe(0);
});

test("energy integrates readings and skips gaps", () => {
  // 500 W for one hour, one reading per second -> 500 Wh (minus the last partial second).
  const steady = Array.from({ length: 3601 }, (_, i) => r(i * 1000, i + 1, 5000, 100_000));
  expect(energyWh(steady, params)).toBe(500);
  // A 20 s gap (meter offline) contributes nothing.
  const gap = [r(0, 1, 5000, 100_000), r(20_000, 2, 5000, 100_000)];
  expect(energyWh(gap, params)).toBe(0);
  expect(settlementAmount(500, params)).toBe(40_000); // 0.04 USDC
});

test("replayed or reordered readings are detected", () => {
  expect(readingsInOrder([r(0, 1, 0, 0), r(1, 2, 0, 0)])).toBe(true);
  expect(readingsInOrder([r(0, 2, 0, 0), r(1, 2, 0, 0)])).toBe(false);
  expect(readingsInOrder([r(5, 1, 0, 0), r(1, 2, 0, 0)])).toBe(false);
});
