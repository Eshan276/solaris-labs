// A software stand-in for the ESP32: signs readings with the test project's meter key and posts them
// to the operator once a second, exactly like the real firmware.
//
//   DATA_DIR=/tmp/solaris-test bun run scripts/virtual-meter.ts [operator-url] [millivolts] [microamps]
import { ed25519 } from "@noble/curves/ed25519.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "../src/config";
import { readingMessage } from "../src/proof";

const [url = "http://localhost:4200", mvArg = "4100", uaArg = "350"] = process.argv.slice(2);
const secret = Uint8Array.from(Buffer.from(JSON.parse(readFileSync(join(DATA_DIR, "virtual-meter.json"), "utf8")).secret, "hex"));
const k = Buffer.from(ed25519.getPublicKey(secret)).toString("hex");
const boot = Math.floor(Date.now() / 1000); // fresh "boot" each run keeps sequence numbers increasing
let n = 0;

// Panel-like output instead of a clean wave: a slowly drifting baseline, passing clouds that dip
// the output gradually and recover, and small sensor noise. Voltage moves a little with brightness.
const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
let haze = 0; // slow drift, roughly -0.1..0.1
let cloud: { start: number; length: number; depth: number } | null = null;

function irradiance(): number {
  haze += -0.02 * haze + 0.006 * gauss(); // mean-reverting drift
  if (!cloud && Math.random() < 1 / 150) {
    cloud = { start: n, length: 20 + Math.random() * 70, depth: 0.25 + Math.random() * 0.45 };
  }
  let shade = 0;
  if (cloud) {
    const x = (n - cloud.start) / cloud.length;
    if (x >= 1) cloud = null;
    else shade = cloud.depth * Math.sin(Math.PI * x) ** 2; // fades in, then out
  }
  return Math.max(0.05, Math.min(1.1, (0.92 + haze) * (1 - shade)));
}

console.log(`Virtual meter ${k.slice(0, 16)}… posting to ${url} (around ${mvArg} mV, ${uaArg} µA)`);
setInterval(async () => {
  n++;
  const irr = irradiance();
  const mv = Math.round(Number(mvArg) * (0.93 + 0.07 * irr) + 6 * gauss());
  const ua = Math.max(0, Math.round(Number(uaArg) * irr * (1 + 0.012 * gauss())));
  const reading = { b: boot, n, mv, ua };
  const sig = Buffer.from(ed25519.sign(new TextEncoder().encode(readingMessage(reading)), secret)).toString("hex");
  try {
    const res = await fetch(`${url}/api/meter/readings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...reading, k, sig, source: "wifi" }),
    });
    if (!res.ok) console.log(`Rejected #${n}: ${await res.text()}`);
  } catch (e) {
    console.log(`Operator unreachable: ${e instanceof Error ? e.message : e}`);
  }
}, 1000);
