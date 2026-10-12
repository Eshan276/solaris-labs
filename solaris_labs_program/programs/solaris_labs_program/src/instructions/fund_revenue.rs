use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::{
    constants::*,
    error::ErrorCode,
    state::{Project, ProtocolConfig, RevenueState},
};

#[derive(Accounts)]
pub struct FundRevenue<'info> {
    pub operator: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, ProtocolConfig>>,
    #[account(
        mut,
        seeds = [PROJECT_SEED, &project.project_id.to_le_bytes()],
        bump = project.bump,
        has_one = stablecoin_mint,
        has_one = revenue_vault
    )]
    pub project: Box<Account<'info, Project>>,
    #[account(
        mut,
        seeds = [REVENUE_SEED, project.key().as_ref()],
        bump = revenue_state.bump
    )]
    pub revenue_state: Box<Account<'info, RevenueState>>,
    pub stablecoin_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut)]
    pub revenue_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        token::mint = stablecoin_mint,
        token::authority = operator,
        token::token_program = token_program
    )]
    pub operator_stablecoin_account: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_fund_revenue(ctx: Context<FundRevenue>, amount: u64) -> Result<()> {
    // REQ07: only the configured revenue operator may fund revenue.
    require_keys_eq!(
        ctx.accounts.operator.key(),
        ctx.accounts.config.revenue_operator,
        ErrorCode::UnauthorizedOperator
    );
    require!(amount > 0, ErrorCode::InvalidRevenueAmount);
    require!(ctx.accounts.project.total_shares > 0, ErrorCode::NoShareholders);

    // REQ06: operator stablecoin -> revenue vault.
    token_interface::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.operator_stablecoin_account.to_account_info(),
                mint: ctx.accounts.stablecoin_mint.to_account_info(),
                to: ctx.accounts.revenue_vault.to_account_info(),
                authority: ctx.accounts.operator.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.stablecoin_mint.decimals,
    )?;

    let revenue_state = &mut ctx.accounts.revenue_state;
    revenue_state.total_funded = revenue_state
        .total_funded
        .checked_add(amount)
        .ok_or(ErrorCode::MathOverflow)?;

    // Freeze total_shares once distribution starts so the pro-rata formula stays fair.
    ctx.accounts.project.sales_closed = true;

    msg!("Funded {} base units, total funded {}", amount, revenue_state.total_funded);
    Ok(())
}
