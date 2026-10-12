pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("CT5Mi74a94AF6W4H2dfUnSC5F8P2gxK3J5jrCNGFMcZa");

#[program]
pub mod solaris_v2 {
    use super::*;

    pub fn initialize_config(ctx: Context<InitializeConfig>, revenue_operator: Pubkey) -> Result<()> {
        crate::instructions::initialize_config::handle_initialize_config(ctx, revenue_operator)
    }

    pub fn set_revenue_operator(ctx: Context<SetRevenueOperator>, revenue_operator: Pubkey) -> Result<()> {
        crate::instructions::admin::handle_set_revenue_operator(ctx, revenue_operator)
    }

    pub fn initialize_project(
        ctx: Context<InitializeProject>,
        share_price: u64,
        max_shares: u64,
        meter: Pubkey,
    ) -> Result<()> {
        crate::instructions::initialize_project::handle_initialize_project(ctx, share_price, max_shares, meter)
    }

    pub fn set_meter(ctx: Context<SetMeter>, meter: Pubkey) -> Result<()> {
        crate::instructions::admin::handle_set_meter(ctx, meter)
    }

    pub fn set_project_active(ctx: Context<SetProjectActive>, active: bool) -> Result<()> {
        crate::instructions::admin::handle_set_project_active(ctx, active)
    }

    pub fn purchase_shares(ctx: Context<PurchaseShares>, shares: u64) -> Result<()> {
        crate::instructions::purchase_shares::handle_purchase_shares(ctx, shares)
    }

    pub fn fund_revenue(ctx: Context<FundRevenue>, args: SettlementArgs) -> Result<()> {
        crate::instructions::fund_revenue::handle_fund_revenue(ctx, args)
    }

    pub fn claim_revenue(ctx: Context<ClaimRevenue>) -> Result<()> {
        crate::instructions::claim_revenue::handle_claim_revenue(ctx)
    }

    pub fn list_shares(ctx: Context<ListShares>, amount: u64, price: u64) -> Result<()> {
        crate::instructions::market::handle_list_shares(ctx, amount, price)
    }

    pub fn buy_listing(ctx: Context<BuyListing>, amount: u64, max_price: u64) -> Result<()> {
        crate::instructions::market::handle_buy_listing(ctx, amount, max_price)
    }

    pub fn cancel_listing(ctx: Context<CancelListing>) -> Result<()> {
        crate::instructions::market::handle_cancel_listing(ctx)
    }
}
