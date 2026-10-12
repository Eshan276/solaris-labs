# Solaris Labs – Anchor POC

On-chain ownership and revenue distribution for a tokenized solar project. This file documents the v1 POC
(`programs/solaris_labs_program`); the deployed product is `programs/solaris_v2`, documented in the root README.

## Instructions

| Instruction | Signer | What it does | REQs |
|---|---|---|---|
| `initialize_config` | Admin | Sets the accepted stablecoin mint and the revenue operator | setup |
| `set_revenue_operator` | Admin | Rotates the revenue operator | setup |
| `initialize_project` | Admin | Creates Project, RevenueState, share mint, investment vault, revenue vault | setup |
| `set_project_active` | Admin | Pauses / resumes share sales | REQ05 |
| `purchase_shares` | Investor | Stablecoin → investment vault, mints shares, updates position | REQ01–05 |
| `fund_revenue` | Revenue operator | Stablecoin → revenue vault, increases distributable revenue | REQ06–07 |
| `claim_revenue` | Investor | Pays the pro-rata share of revenue not yet claimed | REQ08–10 |

Claim formula: `floor(shares × total_funded / total_shares) − revenue_claimed`, computed in `u128`.

The first `fund_revenue` closes share sales, so `total_shares` is fixed while revenue is distributed.
Revenue rights follow `InvestorPosition.shares`, not the share-token balance, so moving share
tokens does not move revenue rights in this POC.

## Run

```bash
anchor build                               # compiles the program to target/deploy/*.so
cargo test                                 # 12 requirement tests + 30-day simulation (LiteSVM, no validator)
cargo test --test test_simulation -- --nocapture   # prints the day-by-day simulation table
```

Rebuild with `anchor build` after changing program code; the tests load the compiled `.so`.

## Tests

- `tests/test_requirements.rs` – one or more tests per REQ, including every failure branch.
- `tests/test_simulation.rs` – a simulated 5 kW solar meter produces hourly Wh readings for 30 days.
  An off-chain "backend" settles each day at 0.08 USDC/kWh and calls `fund_revenue`. Investors claim
  daily, weekly, and once at the end, and each one receives exactly their pro-rata share.
  This is the stand-in for the future ESP32 + INA219 meter: real hardware replaces `SolarMeter::read_day`.

## Toolchain notes

- Anchor 1.2, Solana CLI 4.1 (builds SBPF v3).
- Tests use LiteSVM 0.17 (older versions can't load SBPF v3), which needs host rustc ≥ 1.97.1;
  `rust-toolchain.toml` pins 1.98.1. The on-chain build uses Solana's own SBF toolchain.
