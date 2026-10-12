use anchor_lang::prelude::*;

use crate::error::ErrorCode;

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
    /// Stablecoin base units per whole share.
    pub share_price: u64,
    pub max_shares: u64,
    pub total_shares: u64,
    pub active: bool,
    /// Set by the first `fund_revenue`, so `total_shares` is fixed while revenue is distributed.
    pub sales_closed: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct RevenueState {
    pub project: Pubkey,
    /// Cumulative revenue ever deposited; this is the distributable amount in the pro-rata formula.
    pub total_funded: u64,
    pub total_claimed: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct InvestorPosition {
    pub investor: Pubkey,
    pub project: Pubkey,
    /// Revenue rights are tracked here, not by share-token balance.
    pub shares: u64,
    pub revenue_claimed: u64,
    pub bump: u8,
}

impl InvestorPosition {
    /// claimable = floor(shares × total_funded / total_shares) − revenue_claimed
    pub fn claimable(&self, total_funded: u64, total_shares: u64) -> Result<u64> {
        if total_shares == 0 {
            return Ok(0);
        }
        let entitled = (self.shares as u128)
            .checked_mul(total_funded as u128)
            .ok_or(ErrorCode::MathOverflow)?
            / total_shares as u128;
        let entitled = u64::try_from(entitled).map_err(|_| ErrorCode::MathOverflow)?;
        Ok(entitled.saturating_sub(self.revenue_claimed))
    }
}
