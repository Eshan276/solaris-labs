mod common;

use {
    common::*,
    solana_keypair::Keypair,
    solana_signer::Signer,
    solaris_v2::state::Settlement,
};

const PRICE: u64 = 10 * USDC; // 10 USDC per share
const MAX_SHARES: u64 = 10_000;

#[test]
fn purchase_transfers_mints_and_records_position() {
    let mut env = Env::new(PRICE, MAX_SHARES);
    let alice = env.new_investor(1_000 * USDC);

    env.purchase(&alice, 10).expect("purchase");

    assert_eq!(token_balance(&env.svm, &env.investment_vault), 100 * USDC);
    assert_eq!(env.usdc_balance(&alice.pubkey()), 900 * USDC);
    assert_eq!(token_balance(&env.svm, &ata(&alice.pubkey(), &env.share_mint)), 10);
    let pos = env.position_state(&alice.pubkey());
    assert_eq!((pos.investor, pos.project, pos.shares), (alice.pubkey(), env.project, 10));

    env.purchase(&alice, 5).expect("second purchase");
    assert_eq!(env.position_state(&alice.pubkey()).shares, 15);
    assert_eq!(env.project_state().total_shares, 15);
}

#[test]
fn rejects_purchase_when_inactive_or_invalid() {
    let mut env = Env::new(PRICE, MAX_SHARES);
    let alice = env.new_investor(1_000 * USDC);

    env.set_active(false).expect("deactivate");
    assert_anchor_err(env.purchase(&alice, 1), "ProjectInactive");
    env.set_active(true).expect("reactivate");

    assert_anchor_err(env.purchase(&alice, 0), "InvalidShareAmount");
    assert_anchor_err(env.purchase(&alice, MAX_SHARES + 1), "ExceedsMaxShares");
    let broke = env.new_investor(5 * USDC);
    assert!(env.purchase(&broke, 1).is_err());
    assert_eq!(env.project_state().total_shares, 0);
}

#[test]
fn shares_can_be_bought_after_revenue_starts() {
    let mut env = Env::new(PRICE, MAX_SHARES);
    let alice = env.new_investor(10_000 * USDC);
    let bob = env.new_investor(10_000 * USDC);

    env.purchase(&alice, 100).unwrap();
    env.fund(100 * USDC).unwrap();
    env.purchase(&bob, 100).expect("late purchase is allowed");
    assert_eq!(env.project_state().total_shares, 200);
}

#[test]
fn late_investor_only_earns_revenue_after_joining() {
    let mut env = Env::new(PRICE, MAX_SHARES);
    let alice = env.new_investor(10_000 * USDC);
    let bob = env.new_investor(10_000 * USDC);

    env.purchase(&alice, 100).unwrap();
    env.fund(100 * USDC).unwrap(); // all of it belongs to Alice
    env.purchase(&bob, 100).unwrap();
    env.fund(100 * USDC).unwrap(); // split 50/50

    assert_eq!(env.claimable(&alice.pubkey()), 150 * USDC);
    assert_eq!(env.claimable(&bob.pubkey()), 50 * USDC);

    let (a0, b0) = (env.usdc_balance(&alice.pubkey()), env.usdc_balance(&bob.pubkey()));
    env.claim(&alice).unwrap();
    env.claim(&bob).unwrap();
    assert_eq!(env.usdc_balance(&alice.pubkey()) - a0, 150 * USDC);
    assert_eq!(env.usdc_balance(&bob.pubkey()) - b0, 50 * USDC);
    assert_eq!(token_balance(&env.svm, &env.revenue_vault), 0);
}

#[test]
fn topping_up_keeps_revenue_earned_before() {
    let mut env = Env::new(PRICE, MAX_SHARES);
    let alice = env.new_investor(10_000 * USDC);
    let bob = env.new_investor(10_000 * USDC);

    env.purchase(&alice, 100).unwrap();
    env.purchase(&bob, 100).unwrap();
    env.fund(100 * USDC).unwrap(); // 50 / 50
    env.purchase(&alice, 200).unwrap(); // Alice now holds 300 of 400
    assert_eq!(env.position_state(&alice.pubkey()).pending, 50 * USDC);
    env.fund(100 * USDC).unwrap(); // 75 / 25

    assert_eq!(env.claimable(&alice.pubkey()), 125 * USDC);
    assert_eq!(env.claimable(&bob.pubkey()), 75 * USDC);
}

#[test]
fn claims_pay_once_then_resume_after_new_revenue() {
    let mut env = Env::new(PRICE, MAX_SHARES);
    let alice = env.new_investor(10_000 * USDC);
    env.purchase(&alice, 10).unwrap();

    assert_anchor_err(env.claim(&alice), "NothingToClaim");
    env.fund(30 * USDC).unwrap();
    env.claim(&alice).unwrap();
    assert_anchor_err(env.claim(&alice), "NothingToClaim");
    env.fund(20 * USDC).unwrap();
    env.claim(&alice).unwrap();

    let pos = env.position_state(&alice.pubkey());
    assert_eq!(pos.revenue_claimed, 50 * USDC);
    assert_eq!(pos.pending, 0);
    assert_eq!(env.revenue().total_claimed, 50 * USDC);
}

#[test]
fn claim_requires_a_position() {
    let mut env = Env::new(PRICE, MAX_SHARES);
    let alice = env.new_investor(10_000 * USDC);
    let stranger = env.new_investor(0);
    env.purchase(&alice, 10).unwrap();
    env.fund(10 * USDC).unwrap();
    assert!(env.claim(&stranger).is_err());
}

#[test]
fn fund_records_settlement_with_proof() {
    let mut env = Env::new(PRICE, MAX_SHARES);
    let alice = env.new_investor(10_000 * USDC);
    env.purchase(&alice, 40).unwrap();

    let operator_usdc = env.operator_usdc;
    env.mint_usdc_to(&operator_usdc, 8 * USDC);
    let operator = env.operator.insecure_clone();
    let mut args = env.next_args(8 * USDC);
    args.energy_wh = 100_000;
    args.proof_hash = [42u8; 32];
    args.readings_count = 86_400;
    let (start, end) = (args.period_start, args.period_end);
    env.fund_with(&operator, args).expect("fund");

    let s: Settlement = read(&env.svm, &env.settlement(0));
    assert_eq!(s.project, env.project);
    assert_eq!((s.index, s.amount, s.energy_wh), (0, 8 * USDC, 100_000));
    assert_eq!(s.proof_hash, [42u8; 32]);
    assert_eq!(s.readings_count, 86_400);
    assert_eq!((s.period_start, s.period_end), (start, end));
    assert_eq!(s.total_shares, 40);

    let p = env.project_state();
    assert_eq!(p.settlement_count, 1);
    assert_eq!(p.last_period_end, end);
    assert_eq!(env.revenue().total_funded, 8 * USDC);
    assert_eq!(token_balance(&env.svm, &env.revenue_vault), 8 * USDC);
}

#[test]
fn settlements_get_sequential_records() {
    let mut env = Env::new(PRICE, MAX_SHARES);
    let alice = env.new_investor(10_000 * USDC);
    env.purchase(&alice, 1).unwrap();
    for _ in 0..3 {
        env.fund(USDC).unwrap();
    }
    for i in 0..3u64 {
        let s: Settlement = read(&env.svm, &env.settlement(i));
        assert_eq!(s.index, i);
    }
    assert_eq!(env.project_state().settlement_count, 3);
}

#[test]
fn rejects_overlapping_or_empty_periods() {
    let mut env = Env::new(PRICE, MAX_SHARES);
    let alice = env.new_investor(10_000 * USDC);
    env.purchase(&alice, 1).unwrap();
    env.fund(USDC).unwrap();

    let operator_usdc = env.operator_usdc;
    env.mint_usdc_to(&operator_usdc, 10 * USDC);
    let operator = env.operator.insecure_clone();

    // Starts before the last settled period ended.
    let mut overlap = env.next_args(USDC);
    overlap.period_start -= 1;
    assert_anchor_err(env.fund_with(&operator, overlap), "InvalidPeriod");

    // Ends where it starts.
    let mut empty = env.next_args(USDC);
    empty.period_end = empty.period_start;
    assert_anchor_err(env.fund_with(&operator, empty), "InvalidPeriod");

    // No readings behind it.
    let mut no_readings = env.next_args(USDC);
    no_readings.readings_count = 0;
    assert_anchor_err(env.fund_with(&operator, no_readings), "NoReadings");

    assert_eq!(env.project_state().settlement_count, 1);
    assert_eq!(env.revenue().total_funded, USDC);
}

#[test]
fn rejects_invalid_revenue() {
    let mut env = Env::new(PRICE, MAX_SHARES);
    // Nobody to pay yet.
    assert_anchor_err(env.fund(USDC), "NoShareholders");

    let alice = env.new_investor(10_000 * USDC);
    env.purchase(&alice, 1).unwrap();
    assert_anchor_err(env.fund(0), "InvalidRevenueAmount");

    // Only the configured operator may fund.
    let impostor = env.new_investor(100 * USDC);
    let args = env.next_args(USDC);
    assert_anchor_err(env.fund_with(&impostor, args), "UnauthorizedOperator");
    assert_eq!(env.revenue().total_funded, 0);
}

#[test]
fn only_admin_can_change_meter_or_status() {
    let mut env = Env::new(PRICE, MAX_SHARES);
    let mallory = env.new_investor(0);
    let new_meter = Keypair::new().pubkey();

    assert_anchor_err(env.set_meter_as(&mallory, new_meter), "UnauthorizedAdmin");
    assert_eq!(env.project_state().meter, env.meter);

    let admin = env.admin.insecure_clone();
    env.set_meter_as(&admin, new_meter).expect("admin rotates meter");
    assert_eq!(env.project_state().meter, new_meter);
}

#[test]
fn payouts_never_exceed_funding_under_random_activity() {
    let mut env = Env::new(7_919, 1_000_000); // odd price so nothing divides evenly
    let investors: Vec<Keypair> = (0..4).map(|_| env.new_investor(1_000_000 * USDC)).collect();

    // Deterministic pseudo-random sequence of buys, fundings, and claims.
    let mut seed: u64 = 0x5EED;
    let mut next = |n: u64| {
        seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        (seed >> 33) % n
    };
    env.purchase(&investors[0], 3).unwrap();
    for _ in 0..120 {
        match next(3) {
            0 => {
                let who = next(4) as usize;
                env.purchase(&investors[who], 1 + next(997)).unwrap();
            }
            1 => {
                env.fund(1 + next(9_999_991)).unwrap();
            }
            _ => {
                let who = next(4) as usize;
                let _ = env.claim(&investors[who]); // may have nothing to claim
            }
        }
        let rev = env.revenue();
        assert!(rev.total_claimed <= rev.total_funded);
        assert_eq!(
            token_balance(&env.svm, &env.revenue_vault),
            rev.total_funded - rev.total_claimed
        );
    }

    // Everyone claims what's left: the vault holds only rounding dust.
    for who in &investors {
        let _ = env.claim(who);
    }
    let rev = env.revenue();
    let dust = rev.total_funded - rev.total_claimed;
    let settlements = env.project_state().settlement_count;
    assert!(dust <= settlements * investors.len() as u64, "dust {dust} too large");
}
