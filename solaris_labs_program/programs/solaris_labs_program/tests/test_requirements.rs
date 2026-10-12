mod common;

use {
    anchor_lang::{solana_program::instruction::Instruction, InstructionData, ToAccountMetas},
    common::*,
    solana_keypair::Keypair,
    solana_signer::Signer,
};

const PRICE: u64 = 10 * USDC; // 10 USDC per share
const MAX_SHARES: u64 = 1_000;

#[test]
fn req01_to_req04_purchase_transfers_mints_and_records_position() {
    let mut env = Env::new(PRICE, MAX_SHARES);
    let alice = env.new_investor(1_000 * USDC);

    env.purchase(&alice, 10).expect("purchase");

    // REQ02: 10 shares × 10 USDC moved into the investment vault.
    assert_eq!(token_balance(&env.svm, &env.investment_vault), 100 * USDC);
    assert_eq!(env.usdc_balance(&alice.pubkey()), 900 * USDC);
    // REQ03: share tokens minted to the investor.
    assert_eq!(token_balance(&env.svm, &ata(&alice.pubkey(), &env.share_mint)), 10);
    // REQ04: position created.
    let pos = env.position_state(&alice.pubkey());
    assert_eq!(pos.investor, alice.pubkey());
    assert_eq!(pos.project, env.project);
    assert_eq!(pos.shares, 10);
    assert_eq!(env.project_state().total_shares, 10);

    // REQ04: second purchase updates the same position.
    env.purchase(&alice, 5).expect("second purchase");
    assert_eq!(env.position_state(&alice.pubkey()).shares, 15);
    assert_eq!(env.project_state().total_shares, 15);
    assert_eq!(token_balance(&env.svm, &env.investment_vault), 150 * USDC);
}

#[test]
fn req05_rejects_purchase_when_project_inactive() {
    let mut env = Env::new(PRICE, MAX_SHARES);
    let alice = env.new_investor(1_000 * USDC);

    env.set_active(false).expect("deactivate");
    assert_anchor_err(env.purchase(&alice, 1), "ProjectInactive");
    assert_eq!(token_balance(&env.svm, &env.investment_vault), 0);

    env.set_active(true).expect("reactivate");
    env.purchase(&alice, 1).expect("purchase after reactivation");
}

#[test]
fn req05_rejects_invalid_investment_amounts() {
    let mut env = Env::new(PRICE, MAX_SHARES);
    let alice = env.new_investor(1_000 * USDC);

    assert_anchor_err(env.purchase(&alice, 0), "InvalidShareAmount");
    assert_anchor_err(env.purchase(&alice, MAX_SHARES + 1), "ExceedsMaxShares");

    // Not enough USDC: the token transfer fails and the whole transaction reverts atomically.
    let broke = env.new_investor(5 * USDC);
    assert!(env.purchase(&broke, 1).is_err());
    assert_eq!(env.project_state().total_shares, 0);
    assert!(env.svm.get_account(&env.position(&broke.pubkey())).map_or(true, |a| a.data.is_empty()));
}

#[test]
fn req06_operator_funds_revenue_pool() {
    let mut env = Env::new(PRICE, MAX_SHARES);
    let alice = env.new_investor(1_000 * USDC);
    env.purchase(&alice, 10).unwrap();

    env.fund(50 * USDC).expect("fund");

    assert_eq!(token_balance(&env.svm, &env.revenue_vault), 50 * USDC);
    assert_eq!(env.revenue().total_funded, 50 * USDC);
    // Capital and revenue stay in separate vaults.
    assert_eq!(token_balance(&env.svm, &env.investment_vault), 100 * USDC);
    // First funding closes share sales.
    assert!(env.project_state().sales_closed);
}

#[test]
fn req07_rejects_revenue_from_unauthorized_signer() {
    let mut env = Env::new(PRICE, MAX_SHARES);
    let alice = env.new_investor(1_000 * USDC);
    env.purchase(&alice, 10).unwrap();

    let mallory = env.new_investor(100 * USDC);
    assert_anchor_err(env.fund_as(&mallory, 10 * USDC), "UnauthorizedOperator");
    assert_eq!(token_balance(&env.svm, &env.revenue_vault), 0);
    assert_eq!(env.revenue().total_funded, 0);
}

#[test]
fn fund_revenue_rejects_zero_amount_and_empty_project() {
    let mut env = Env::new(PRICE, MAX_SHARES);
    assert_anchor_err(env.fund(10 * USDC), "NoShareholders");

    let alice = env.new_investor(1_000 * USDC);
    env.purchase(&alice, 1).unwrap();
    assert_anchor_err(env.fund(0), "InvalidRevenueAmount");
}

#[test]
fn purchases_are_rejected_after_revenue_starts() {
    let mut env = Env::new(PRICE, MAX_SHARES);
    let alice = env.new_investor(1_000 * USDC);
    let late = env.new_investor(1_000 * USDC);
    env.purchase(&alice, 10).unwrap();
    env.fund(100 * USDC).unwrap();

    // A late buyer cannot dilute revenue that was already earned.
    assert_anchor_err(env.purchase(&late, 10), "SalesClosed");
}

#[test]
fn req08_req09_claims_are_pro_rata_and_update_state() {
    let mut env = Env::new(PRICE, MAX_SHARES);
    let alice = env.new_investor(1_000 * USDC);
    let bob = env.new_investor(1_000 * USDC);
    env.purchase(&alice, 30).unwrap();
    env.purchase(&bob, 70).unwrap();

    env.fund(100 * USDC).unwrap();

    let alice_before = env.usdc_balance(&alice.pubkey());
    env.claim(&alice).expect("alice claim");
    assert_eq!(env.usdc_balance(&alice.pubkey()) - alice_before, 30 * USDC);
    assert_eq!(env.position_state(&alice.pubkey()).revenue_claimed, 30 * USDC);

    let bob_before = env.usdc_balance(&bob.pubkey());
    env.claim(&bob).expect("bob claim");
    assert_eq!(env.usdc_balance(&bob.pubkey()) - bob_before, 70 * USDC);

    assert_eq!(token_balance(&env.svm, &env.revenue_vault), 0);
    assert_eq!(env.revenue().total_claimed, 100 * USDC);

    // A second funding round is distributed on top of what was already claimed.
    env.fund(50 * USDC).unwrap();
    env.claim(&alice).unwrap();
    env.claim(&bob).unwrap();
    assert_eq!(env.position_state(&alice.pubkey()).revenue_claimed, 45 * USDC);
    assert_eq!(env.position_state(&bob.pubkey()).revenue_claimed, 105 * USDC);
}

#[test]
fn req10_rejects_claim_with_nothing_claimable() {
    let mut env = Env::new(PRICE, MAX_SHARES);
    let alice = env.new_investor(1_000 * USDC);
    let bob = env.new_investor(1_000 * USDC);
    env.purchase(&alice, 10).unwrap();
    env.purchase(&bob, 10).unwrap();

    // Before any revenue.
    assert_anchor_err(env.claim(&alice), "NothingToClaim");

    env.fund(20 * USDC).unwrap();
    env.claim(&alice).unwrap();
    // Already claimed everything available.
    assert_anchor_err(env.claim(&alice), "NothingToClaim");
    // Bob's share is untouched.
    env.claim(&bob).unwrap();
    assert_eq!(env.usdc_balance(&bob.pubkey()), 910 * USDC);
}

#[test]
fn claim_requires_a_position() {
    let mut env = Env::new(PRICE, MAX_SHARES);
    let alice = env.new_investor(1_000 * USDC);
    env.purchase(&alice, 10).unwrap();
    env.fund(10 * USDC).unwrap();

    let stranger = env.new_investor(0);
    assert!(env.claim(&stranger).is_err());
    assert_eq!(token_balance(&env.svm, &env.revenue_vault), 10 * USDC);
}

#[test]
fn rounding_never_pays_out_more_than_funded() {
    let mut env = Env::new(PRICE, MAX_SHARES);
    let investors: Vec<Keypair> = (0..3).map(|_| env.new_investor(100 * USDC)).collect();
    for inv in &investors {
        env.purchase(inv, 1).unwrap();
    }

    env.fund(100).unwrap(); // 100 base units across 3 equal holders
    for inv in &investors {
        env.claim(inv).unwrap();
        assert_eq!(env.position_state(&inv.pubkey()).revenue_claimed, 33);
    }
    // 1 unit of rounding dust stays in the vault.
    assert_eq!(token_balance(&env.svm, &env.revenue_vault), 1);

    // Dust becomes claimable once more revenue arrives.
    env.fund(2).unwrap();
    for inv in &investors {
        env.claim(inv).unwrap();
        assert_eq!(env.position_state(&inv.pubkey()).revenue_claimed, 34);
    }
    assert_eq!(token_balance(&env.svm, &env.revenue_vault), 0);
}

#[test]
fn admin_actions_reject_non_admin() {
    let mut env = Env::new(PRICE, MAX_SHARES);
    let mallory = env.new_investor(0);

    let ix = Instruction::new_with_bytes(
        env.program_id,
        &solaris_labs_program::instruction::SetProjectActive { active: false }.data(),
        solaris_labs_program::accounts::SetProjectActive {
            admin: mallory.pubkey(),
            project: env.project,
        }
        .to_account_metas(None),
    );
    assert_anchor_err(send(&mut env.svm, ix, &mallory, &[&mallory]), "UnauthorizedAdmin");

    let ix = Instruction::new_with_bytes(
        env.program_id,
        &solaris_labs_program::instruction::SetRevenueOperator {
            revenue_operator: mallory.pubkey(),
        }
        .data(),
        solaris_labs_program::accounts::SetRevenueOperator {
            admin: mallory.pubkey(),
            config: env.config,
        }
        .to_account_metas(None),
    );
    assert_anchor_err(send(&mut env.svm, ix, &mallory, &[&mallory]), "UnauthorizedAdmin");
    assert!(env.project_state().active);
}
