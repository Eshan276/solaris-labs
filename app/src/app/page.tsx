import Link from "next/link";
import { btnOutline, btnPrimary, Eyebrow } from "@/components/inst";
import { OfferingsTable, PlatformStats } from "@/components/offerings";

const steps = [
  { n: "01", title: "Subscribe", body: "Buy shares in a solar array from 10 USDC. Each share is an equal claim on the array's revenue." },
  { n: "02", title: "The array produces", body: "Electricity is sold at a fixed tariff. A meter on site records output about once a second." },
  { n: "03", title: "Distributions", body: "Every five minutes, that period's revenue is paid to shareholders. Collect it whenever you like." },
];

const checks = [
  ["Signed at the source", "The meter holds its own key and signs every reading. Its public key is recorded on Solana with the offering, so readings can't be forged or altered."],
  ["Committed on-chain", "Each distribution stores a SHA-256 fingerprint of its readings on Solana, alongside the energy and the amount paid. The record can't be edited afterwards."],
  ["Checked by you", "Open any distribution and your browser re-checks it: the fingerprint, every signature, and the energy and payout, recalculated from scratch."],
];

export default function Home() {
  return (
    <div className="mx-auto max-w-6xl px-6 lg:px-12">
      <section className="pt-16 pb-12 sm:pt-24">
        <Eyebrow>Solar infrastructure · on Solana</Eyebrow>
        <h1 className="mt-4 max-w-3xl font-serif text-[52px] leading-[1.02] tracking-[-0.02em] sm:text-[76px]">
          Own the sun.
          <br />
          Get paid.
        </h1>
        <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
          Shares in real solar arrays. Revenue from every kilowatt-hour sold is distributed to shareholders, and every
          distribution is backed by readings signed at the meter.
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Link href="#offerings" className={btnPrimary}>
            View offerings
          </Link>
          <Link href="#verification" className={btnOutline}>
            How verification works
          </Link>
        </div>
      </section>

      <PlatformStats />

      <section id="offerings" className="scroll-mt-24 pt-16">
        <div className="mb-6 flex items-end justify-between gap-6">
          <h2 className="font-serif text-[32px] tracking-tight">Offerings</h2>
          <p className="text-[12px] text-muted-foreground">Live figures from signed meter data</p>
        </div>
        <OfferingsTable />
      </section>

      <section className="pt-20">
        <h2 className="font-serif text-[32px] tracking-tight">How distributions work</h2>
        <ol className="mt-8 grid border-t sm:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.n} className={`py-6 sm:pr-8 ${i > 0 ? "border-t sm:border-t-0 sm:border-l sm:pl-8" : ""}`}>
              <span className="font-mono text-[12px] text-muted-foreground">{s.n}</span>
              <h3 className="mt-3 text-[15px] font-semibold">{s.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="verification" className="grid scroll-mt-24 gap-10 py-20 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <Eyebrow>Verification</Eyebrow>
          <h2 className="mt-3 font-serif text-[36px] leading-tight tracking-tight">Every distribution can be checked independently.</h2>
          <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
            Investors don&apos;t need to rely on a report. The evidence behind each payment is public, and the check runs
            in your own browser.
          </p>
        </div>
        <dl className="border-t border-foreground">
          {checks.map(([title, body]) => (
            <div key={title} className="grid gap-2 border-b py-5 sm:grid-cols-[200px_1fr]">
              <dt className="text-[14px] font-semibold">{title}</dt>
              <dd className="text-[13px] leading-relaxed text-muted-foreground">{body}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
