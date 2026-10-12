pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("CgsfxU8Lv5iXXSHmt5NbNEurxXhVqwsQ9UJHjBCp9iQC");

#[program]
pub mod solaris_labs_program {
    use super::*;

    pub fn initialize_config(ctx: Context<InitializeConfig>, revenue_operator: Pubkey) -> Result<()> {
        crate::instructions::initialize_config::handle_initialize_config(ctx, revenue_operator)
    }

    pub fn set_revenue_operator(ctx: Context<SetRevenueOperator>, revenue_operator: Pubkey) -> Result<()> {
        crate::instructions::admin::handle_set_revenue_operator(ctx, revenue_operator)
    }

    pub fn initialize_project(ctx: Context<InitializeProject>, share_price: u64, max_shares: u64) -> Result<()> {
        crate::instructions::initialize_project::handle_initialize_project(ctx, share_price, max_shares)
    }

    pub fn set_project_active(ctx: Context<SetProjectActive>, active: bool) -> Result<()> {
        crate::instructions::admin::handle_set_project_active(ctx, active)
    }

    pub fn purchase_shares(ctx: Context<PurchaseShares>, shares: u64) -> Result<()> {
        crate::instructions::purchase_shares::handle_purchase_shares(ctx, shares)
    }

    pub fn fund_revenue(ctx: Context<FundRevenue>, amount: u64) -> Result<()> {
        crate::instructions::fund_revenue::handle_fund_revenue(ctx, amount)
    }

    pub fn claim_revenue(ctx: Context<ClaimRevenue>) -> Result<()> {
        crate::instructions::claim_revenue::handle_claim_revenue(ctx)
    }
}
