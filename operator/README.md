# Solaris operator service

Accepts signed meter readings, settles revenue on-chain with a proof hash, and serves live data, proof files, and a
devnet faucet to the investor app. See the top-level README for how payouts work.

```bash
bun install
bun run setup <meter-key-hex>      # one-time devnet setup (test USDC, config, project)
bun run src/server.ts              # http://localhost:4100
bun test                           # proof rules
```

| File | Purpose |
|---|---|
| `src/proof.ts` | Proof file format, energy/payout rules, browser verification. Identical copy in `app/src/lib/proof.ts`. |
| `src/settle.ts` | Every period: proof file → hash → `fund_revenue`. |
| `src/server.ts` | HTTP API and the settlement loop. |
| `scripts/e2e.ts` | Devnet end-to-end test with a throwaway project. |
| `scripts/test-project.ts`, `scripts/virtual-meter.ts` | Software-metered demo project (night/cloudy demos, UI tests). |
| `data/` | Deployment addresses, SQLite readings, proof files, virtual meter key (git-ignored). |
| `.keys/operator.json` | Revenue operator key (git-ignored). |
