mod common;

use {
    common::*,
    solana_keypair::Keypair,
    solana_signer::Signer,
    solaris_v2::state::{Listing, Market},
};

const PRICE: u64 = 10 * USDC;
const MAX_SHARES: u64 = 10_000;

fn holder(env: &mut Env, shares: u64) -> Keypair {
    let k = env.new_investor(100_000 * USDC);
    env.purchase(&k, shares).unwrap();
    k
}

#[test]
fn listing_escrows_tokens_and_keeps_revenue_rights() {
    let mut env = Env::new(PRICE, MAX_SHARES);
    let alice = holder(&mut env, 100);

    env.list(&alice, 40, 12 * USDC).expect("list");

    let l: Listing = read(&env.svm, &env.listing(&alice.pubkey()));
    assert_eq!((l.seller, l.amount, l.price), (alice.pubkey(), 40, 12 * USDC));
    assert_eq!(token_balance(&env.svm, &env.escrow(&alice.pubkey())), 40);
    assert_eq!(env.share_balance(&alice.pubkey()), 60);
    // Still earning on all 100 until sold.
    assert_eq!(env.position_state(&alice.pubkey()).shares, 100);
}

#[test]
fn partial_buy_moves_payment_tokens_and_position() {
    let mut env = Env::new(PRICE, MAX_SHARES);
    let alice = holder(&mut env, 100);
    let bob = env.new_investor(1_000 * USDC);
    env.list(&alice, 40, 12 * USDC).unwrap();
    let alice_usdc = env.usdc_balance(&alice.pubkey());

    env.buy_listing(&bob, &alice.pubkey(), 10, 12 * USDC).expect("buy");

    assert_eq!(env.usdc_balance(&alice.pubkey()) - alice_usdc, 120 * USDC);
    assert_eq!(env.usdc_balance(&bob.pubkey()), 880 * USDC);
    assert_eq!(env.share_balance(&bob.pubkey()), 10);
    assert_eq!(env.position_state(&alice.pubkey()).shares, 90);
    assert_eq!(env.position_state(&bob.pubkey()).shares, 10);
    assert_eq!(env.project_state().total_shares, 100); // trading doesn't create shares
    let l: Listing = read(&env.svm, &env.listing(&alice.pubkey()));
    assert_eq!(l.amount, 30);
    let m: Market = read(&env.svm, &env.market());
    assert_eq!((m.last_price, m.trade_count, m.volume_shares, m.volume_stablecoin), (12 * USDC, 1, 10, 120 * USDC));
}

#[test]
fn selling_out_closes_listing_and_escrow() {
    let mut env = Env::new(PRICE, MAX_SHARES);
    let alice = holder(&mut env, 100);
    let bob = env.new_investor(1_000 * USDC);
    env.list(&alice, 20, 11 * USDC).unwrap();

    env.buy_listing(&bob, &alice.pubkey(), 20, 11 * USDC).expect("buy all");

    assert!(!env.exists(&env.listing(&alice.pubkey())));
    assert!(!env.exists(&env.escrow(&alice.pubkey())));
    assert_eq!(env.position_state(&bob.pubkey()).shares, 20);
    // The seller can list again afterwards.
    env.list(&alice, 10, 13 * USDC).expect("relist");
}

#[test]
fn revenue_splits_exactly_at_the_trade() {
    let mut env = Env::new(PRICE, MAX_SHARES);
    let alice = holder(&mut env, 100);
    let bob = env.new_investor(1_000 * USDC);

    env.fund(100 * USDC).unwrap(); // all Alice's
    env.list(&alice, 50, 10 * USDC).unwrap();
    env.fund(100 * USDC).unwrap(); // listed shares still Alice's
    env.buy_listing(&bob, &alice.pubkey(), 50, 10 * USDC).unwrap();
    env.fund(100 * USDC).unwrap(); // 50 / 50

    assert_eq!(env.claimable(&alice.pubkey()), 250 * USDC);
    assert_eq!(env.claimable(&bob.pubkey()), 50 * USDC);
    env.claim(&alice).unwrap();
    env.claim(&bob).unwrap();
    assert_eq!(token_balance(&env.svm, &env.revenue_vault), 0);
}

#[test]
fn cancel_returns_tokens_and_closes() {
    let mut env = Env::new(PRICE, MAX_SHARES);
    let alice = holder(&mut env, 30);
    let bob = env.new_investor(1_000 * USDC);
    env.list(&alice, 30, 15 * USDC).unwrap();
    env.buy_listing(&bob, &alice.pubkey(), 5, 15 * USDC).unwrap();

    // Only the seller can cancel.
    assert!(env.cancel_listing(&bob, &alice.pubkey()).is_err());
    env.cancel_listing(&alice, &alice.pubkey()).expect("cancel");

    assert_eq!(env.share_balance(&alice.pubkey()), 25);
    assert!(!env.exists(&env.listing(&alice.pubkey())));
    assert!(!env.exists(&env.escrow(&alice.pubkey())));
    assert_eq!(env.position_state(&alice.pubkey()).shares, 25);
}

#[test]
fn rejects_invalid_listings_and_buys() {
    let mut env = Env::new(PRICE, MAX_SHARES);
    let alice = holder(&mut env, 10);
    let bob = env.new_investor(1_000 * USDC);

    assert_anchor_err(env.list(&alice, 11, PRICE), "InsufficientShares");
    assert_anchor_err(env.list(&alice, 0, PRICE), "InvalidListing");
    assert_anchor_err(env.list(&alice, 5, 0), "InvalidListing");
    let stranger = env.new_investor(0);
    assert!(env.list(&stranger, 1, PRICE).is_err());

    env.list(&alice, 5, 20 * USDC).unwrap();
    // Buying your own listing is refused (Anchor's duplicate-account check fires first).
    assert!(env.buy_listing(&alice, &alice.pubkey(), 1, 20 * USDC).is_err());
    assert_anchor_err(env.buy_listing(&bob, &alice.pubkey(), 6, 20 * USDC), "ListingTooSmall");
    assert_anchor_err(env.buy_listing(&bob, &alice.pubkey(), 1, 19 * USDC), "PriceAboveMax");
    assert_anchor_err(env.buy_listing(&bob, &alice.pubkey(), 0, 20 * USDC), "InvalidListing");
    let broke = env.new_investor(10 * USDC);
    assert!(env.buy_listing(&broke, &alice.pubkey(), 1, 20 * USDC).is_err());
    assert_eq!(env.position_state(&alice.pubkey()).shares, 10);
}

#[test]
fn payouts_never_exceed_funding_with_trading() {
    let mut env = Env::new(7_919, 1_000_000);
    let people: Vec<Keypair> = (0..4).map(|_| env.new_investor(1_000_000 * USDC)).collect();
    for p in &people {
        env.purchase(p, 50).unwrap();
    }
    let mut seed: u64 = 0xBEEF;
    let mut next = |n: u64| {
        seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        (seed >> 33) % n
    };
    for _ in 0..150 {
        let a = next(4) as usize;
        let b = next(4) as usize;
        match next(5) {
            0 => {
                env.fund(1 + next(5_000_000)).unwrap();
            }
            1 => {
                let _ = env.list(&people[a], 1 + next(20), 1 + next(30 * USDC));
            }
            2 => {
                if a != b {
                    let _ = env.buy_listing(&people[b], &people[a].pubkey(), 1 + next(10), u64::MAX);
                }
            }
            3 => {
                let _ = env.cancel_listing(&people[a], &people[a].pubkey());
            }
            _ => {
                let _ = env.claim(&people[a]);
            }
        }
        let rev = env.revenue();
        assert!(rev.total_claimed <= rev.total_funded);
        let held: u64 = people.iter().map(|p| env.position_state(&p.pubkey()).shares).sum();
        assert_eq!(held, env.project_state().total_shares, "trades must conserve shares");
    }
    for p in &people {
        let _ = env.claim(p);
    }
    let rev = env.revenue();
    assert!(rev.total_funded - rev.total_claimed <= env.project_state().settlement_count * 4);
}
