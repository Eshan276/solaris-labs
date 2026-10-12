use anchor_lang::prelude::*;

use crate::{constants::ACC_PRECISION, error::ErrorCode};

#[account]
#[derive(InitSpace)]
pub struct ProtocolConfig {
    pub admin: Pubkey,
    pub stablecoin_mint: Pubkey,
    pub revenue_operator: Pubkey,
    pub project_count: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Project {
    pub project_id: u64,
    pub admin: Pubkey,
    pub stablecoin_mint: Pubkey,
    pub share_mint: Pubkey,
    pub investment_vault: Pubkey,
    pub revenue_vault: Pubkey,
    /// Ed25519 key of the project's meter. Readings it signs are the evidence behind each settlement.
    pub meter: Pubkey,
    /// Stablecoin base units per whole share.
    pub share_price: u64,
    pub max_shares: u64,
    pub total_shares: u64,
    pub active: bool,
    /// Number of settlements recorded; also the index of the next one.
    pub settlement_count: u64,
    /// End of the last settled period (unix seconds). Periods must not overlap.
    pub last_period_end: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct RevenueState {
    pub project: Pubkey,
    /// Cumulative revenue ever deposited.
    pub total_funded: u64,
    pub total_claimed: u64,
    /// Revenue per share ever deposited, scaled by `ACC_PRECISION`.
    pub acc_revenue_per_share: u128,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct InvestorPosition {
    pub investor: Pubkey,
    pub project: Pubkey,
    /// Revenue rights are tracked here, not by share-token balance.
    pub shares: u64,
    /// Lifetime revenue paid out to this investor.
    pub revenue_claimed: u64,
    /// `shares × acc_revenue_per_share` at the last checkpoint, so earlier revenue isn't counted again.
    pub reward_debt: u128,
    /// Revenue earned before the last share purchase and not yet claimed.
    pub pending: u64,
    pub bump: u8,
}

impl InvestorPosition {
    /// Revenue earned since the last checkpoint plus anything already pending.
    pub fn claimable(&self, acc_revenue_per_share: u128) -> Result<u64> {
        let accrued = (self.shares as u128)
            .checked_mul(acc_revenue_per_share)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_sub(self.reward_debt)
            .ok_or(ErrorCode::MathOverflow)?
            / ACC_PRECISION;
        let accrued = u64::try_from(accrued).map_err(|_| ErrorCode::MathOverflow)?;
        self.pending.checked_add(accrued).ok_or(error!(ErrorCode::MathOverflow))
    }

    /// Moves everything earned so far into `pending` and resets the debt for the current share count.
    pub fn checkpoint(&mut self, acc_revenue_per_share: u128) -> Result<()> {
        self.pending = self.claimable(acc_revenue_per_share)?;
        self.reward_debt = (self.shares as u128)
            .checked_mul(acc_revenue_per_share)
            .ok_or(ErrorCode::MathOverflow)?;
        Ok(())
    }
}

/// One revenue settlement and the evidence behind it.
#[account]
#[derive(InitSpace)]
pub struct Settlement {
    pub project: Pubkey,
    pub index: u64,
    /// Stablecoin base units deposited.
    pub amount: u64,
    /// Energy the settlement pays for, in watt-hours at project scale.
    pub energy_wh: u64,
    /// SHA-256 of the published, meter-signed readings file for this period.
    pub proof_hash: [u8; 32],
    pub readings_count: u32,
    pub period_start: i64,
    pub period_end: i64,
    pub funded_at: i64,
    /// Shares outstanding when this revenue was distributed.
    pub total_shares: u64,
    pub bump: u8,
}

/// Shares a holder has offered for sale at a fixed price. The share tokens sit in an escrow
/// account owned by this listing; the position's revenue rights stay with the seller until a sale.
/// One listing per seller per project: change the price by cancelling and listing again.
#[account]
#[derive(InitSpace)]
pub struct Listing {
    pub project: Pubkey,
    pub seller: Pubkey,
    /// Shares still for sale.
    pub amount: u64,
    /// Stablecoin base units per share.
    pub price: u64,
    pub created_at: i64,
    pub bump: u8,
}

/// Running secondary-market figures for a project.
#[account]
#[derive(InitSpace)]
pub struct Market {
    pub project: Pubkey,
    pub last_price: u64,
    pub trade_count: u64,
    pub volume_shares: u64,
    pub volume_stablecoin: u64,
    pub bump: u8,
}

#[event]
pub struct TradeEvent {
    pub project: Pubkey,
    pub seller: Pubkey,
    pub buyer: Pubkey,
    pub shares: u64,
    pub price: u64,
    pub timestamp: i64,
}
