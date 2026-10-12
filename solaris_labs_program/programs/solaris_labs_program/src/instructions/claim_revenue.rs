use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::{
    constants::*,
    error::ErrorCode,
    state::{InvestorPosition, Project, RevenueState},
};

#[derive(Accounts)]
pub struct ClaimRevenue<'info> {
    pub investor: Signer<'info>,
    #[account(
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
    #[account(
        mut,
        seeds = [POSITION_SEED, project.key().as_ref(), investor.key().as_ref()],
        bump = position.bump,
        has_one = investor
    )]
    pub position: Box<Account<'info, InvestorPosition>>,
    pub stablecoin_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut)]
    pub revenue_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        token::mint = stablecoin_mint,
        token::authority = investor,
        token::token_program = token_program
    )]
    pub investor_stablecoin_account: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_claim_revenue(ctx: Context<ClaimRevenue>) -> Result<()> {
    let project = &ctx.accounts.project;

    // REQ08: pro-rata entitlement minus what was already claimed.
    let claimable = ctx
        .accounts
        .position
        .claimable(ctx.accounts.revenue_state.total_funded, project.total_shares)?;

    // REQ10: reject instead of sending a zero-value transfer.
    require!(claimable > 0, ErrorCode::NothingToClaim);

    // REQ09: revenue vault -> investor, signed by the project PDA, then update claimed state.
    let project_id = project.project_id.to_le_bytes();
    let signer_seeds: &[&[&[u8]]] = &[&[PROJECT_SEED, &project_id, &[project.bump]]];
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.revenue_vault.to_account_info(),
                mint: ctx.accounts.stablecoin_mint.to_account_info(),
                to: ctx.accounts.investor_stablecoin_account.to_account_info(),
                authority: ctx.accounts.project.to_account_info(),
            },
            signer_seeds,
        ),
        claimable,
        ctx.accounts.stablecoin_mint.decimals,
    )?;

    let position = &mut ctx.accounts.position;
    position.revenue_claimed = position
        .revenue_claimed
        .checked_add(claimable)
        .ok_or(ErrorCode::MathOverflow)?;
    let revenue_state = &mut ctx.accounts.revenue_state;
    revenue_state.total_claimed = revenue_state
        .total_claimed
        .checked_add(claimable)
        .ok_or(ErrorCode::MathOverflow)?;

    msg!("Claimed {} base units", claimable);
    Ok(())
}
