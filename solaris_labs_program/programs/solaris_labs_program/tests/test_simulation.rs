//! End-to-end simulation: a fake solar meter produces hourly readings, an off-chain
//! "operator backend" settles them into stablecoin revenue once a day, and investors
//! claim on different schedules. This stands in for the ESP32 + INA219 pipeline.
//!
//! Run with: cargo test --test test_simulation -- --nocapture

mod common;

use {common::*, solana_signer::Signer};

/// Simulated meter for a small rooftop array.
struct SolarMeter {
    peak_watts: f64,
    rng: u64,
}

impl SolarMeter {
    fn new(peak_watts: f64, seed: u64) -> Self {
        Self { peak_watts, rng: seed }
    }

    /// Deterministic pseudo-random number in [0, 1), so the simulation is reproducible.
    fn next_f64(&mut self) -> f64 {
        self.rng = self.rng.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        (self.rng >> 11) as f64 / (1u64 << 53) as f64
    }

    /// Hourly energy readings in watt-hours for one day: sun curve from 06:00 to 18:00,
    /// scaled by a daily cloud factor and a little per-hour noise.
    fn read_day(&mut self) -> Vec<u64> {
        let cloud = 0.35 + 0.65 * self.next_f64();
        (0..24)
            .map(|hour| {
                if !(6..18).contains(&hour) {
                    return 0;
                }
                let sun = (std::f64::consts::PI * (hour as f64 - 6.0 + 0.5) / 12.0).sin();
                let noise = 0.9 + 0.2 * self.next_f64();
                (self.peak_watts * sun * cloud * noise).max(0.0) as u64
            })
            .collect()
    }
}

/// Off-chain settlement: watt-hours × tariff → stablecoin base units.
/// 0.08 USDC per kWh = 80_000 base units per kWh = 80 base units per Wh.
const TARIFF_BASE_UNITS_PER_WH: u64 = 80;

const DAYS: usize = 30;
const PRICE: u64 = 10 * USDC;
const MAX_SHARES: u64 = 1_000;

#[test]
fn thirty_day_solar_revenue_simulation() {
    let mut env = Env::new(PRICE, MAX_SHARES);

    // Fundraise: 10,000 USDC for a 5 kW array.
    let alice = env.new_investor(5_000 * USDC);
    let bob = env.new_investor(3_000 * USDC);
    let carol = env.new_investor(2_000 * USDC);
    env.purchase(&alice, 500).unwrap();
    env.purchase(&bob, 300).unwrap();
    env.purchase(&carol, 200).unwrap();
    assert_eq!(token_balance(&env.svm, &env.investment_vault), 10_000 * USDC);

    let mut meter = SolarMeter::new(5_000.0, 42);
    let mut total_wh = 0u64;
    let mut total_revenue = 0u64;

    println!("\n day |   kWh  | revenue (USDC) | vault after claims (USDC)");
    println!("-----+--------+----------------+--------------------------");

    for day in 1..=DAYS {
        // 1. Meter -> backend: aggregate the day's readings.
        let wh: u64 = meter.read_day().iter().sum();
        let revenue = wh * TARIFF_BASE_UNITS_PER_WH;
        total_wh += wh;
        total_revenue += revenue;

        // 2. Backend -> chain: the authorized operator funds the day's revenue.
        env.fund(revenue).expect("fund_revenue");

        // 3. Investors claim on their own schedules.
        env.claim(&alice).expect("alice daily claim");
        if day % 7 == 0 {
            env.claim(&bob).expect("bob weekly claim");
        }

        // Invariant: vault always equals funded − claimed, so nothing is created or lost.
        let rev = env.revenue();
        let vault = token_balance(&env.svm, &env.revenue_vault);
        assert_eq!(vault, rev.total_funded - rev.total_claimed);

        println!(
            " {:>3} | {:>6.2} | {:>14.2} | {:>24.2}",
            day,
            wh as f64 / 1000.0,
            revenue as f64 / USDC as f64,
            vault as f64 / USDC as f64
        );
    }

    // Final settlement: everyone claims what is left.
    for investor in [&alice, &bob, &carol] {
        let _ = env.claim(investor); // may be NothingToClaim if already fully claimed
    }

    let rev = env.revenue();
    assert_eq!(rev.total_funded, total_revenue);

    // Each investor received exactly their pro-rata entitlement (floor), regardless of claim cadence.
    for (name, investor, shares) in [("alice", &alice, 500u64), ("bob", &bob, 300), ("carol", &carol, 200)] {
        let claimed = env.position_state(&investor.pubkey()).revenue_claimed;
        let expected = (shares as u128 * total_revenue as u128 / MAX_SHARES as u128) as u64;
        assert_eq!(claimed, expected, "{name} payout mismatch");
        println!(
            "{name:>5}: {shares} shares -> {:.2} USDC ({:.1}%)",
            claimed as f64 / USDC as f64,
            100.0 * shares as f64 / MAX_SHARES as f64
        );
    }

    let dust = token_balance(&env.svm, &env.revenue_vault);
    assert!(dust < 3, "rounding dust should be below one unit per investor, got {dust}");

    println!(
        "\nTotal generation: {:.1} kWh | total revenue: {:.2} USDC | dust left in vault: {} base units",
        total_wh as f64 / 1000.0,
        total_revenue as f64 / USDC as f64,
        dust
    );
}
