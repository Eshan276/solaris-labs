use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{self, Mint, MintTo, TokenAccount, TokenInterface, TransferChecked},
};

use crate::{
    constants::*,
    error::ErrorCode,
    state::{InvestorPosition, Project},
};

#[derive(Accounts)]
pub struct PurchaseShares<'info> {
    #[account(mut)]
    pub investor: Signer<'info>,
    #[account(
        mut,
        seeds = [PROJECT_SEED, &project.project_id.to_le_bytes()],
        bump = project.bump,
        has_one = stablecoin_mint,
        has_one = share_mint,
        has_one = investment_vault
    )]
    pub project: Box<Account<'info, Project>>,
    #[account(
        init_if_needed,
        payer = investor,
        space = 8 + InvestorPosition::INIT_SPACE,
        seeds = [POSITION_SEED, project.key().as_ref(), investor.key().as_ref()],
        bump
    )]
    pub position: Box<Account<'info, InvestorPosition>>,
    pub stablecoin_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut)]
    pub share_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut)]
    pub investment_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        token::mint = stablecoin_mint,
        token::authority = investor,
        token::token_program = token_program
    )]
    pub investor_stablecoin_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = investor,
        associated_token::mint = share_mint,
        associated_token::authority = investor,
        associated_token::token_program = token_program
    )]
    pub investor_share_account: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_purchase_shares(ctx: Context<PurchaseShares>, shares: u64) -> Result<()> {
    let project = &ctx.accounts.project;

    // REQ01 / REQ05: project must be active, still selling, and the amount must be valid.
    require!(project.active, ErrorCode::ProjectInactive);
    require!(!project.sales_closed, ErrorCode::SalesClosed);
    require!(shares > 0, ErrorCode::InvalidShareAmount);
    let new_total = project
        .total_shares
        .checked_add(shares)
        .ok_or(ErrorCode::MathOverflow)?;
    require!(new_total <= project.max_shares, ErrorCode::ExceedsMaxShares);
    let cost = shares
        .checked_mul(project.share_price)
        .ok_or(ErrorCode::MathOverflow)?;

    // REQ02: investor stablecoin -> investment vault.
    token_interface::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.investor_stablecoin_account.to_account_info(),
                mint: ctx.accounts.stablecoin_mint.to_account_info(),
                to: ctx.accounts.investment_vault.to_account_info(),
                authority: ctx.accounts.investor.to_account_info(),
            },
        ),
        cost,
        ctx.accounts.stablecoin_mint.decimals,
    )?;

    // REQ03: mint ownership shares, signed by the project PDA.
    let project_id = project.project_id.to_le_bytes();
    let signer_seeds: &[&[&[u8]]] = &[&[PROJECT_SEED, &project_id, &[project.bump]]];
    token_interface::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            MintTo {
                mint: ctx.accounts.share_mint.to_account_info(),
                to: ctx.accounts.investor_share_account.to_account_info(),
                authority: ctx.accounts.project.to_account_info(),
            },
            signer_seeds,
        ),
        shares,
    )?;

    // REQ04: create or update the investor position.
    let project_key = ctx.accounts.project.key();
    let position = &mut ctx.accounts.position;
    if position.investor == Pubkey::default() {
        position.investor = ctx.accounts.investor.key();
        position.project = project_key;
        position.bump = ctx.bumps.position;
    }
    position.shares = position
        .shares
        .checked_add(shares)
        .ok_or(ErrorCode::MathOverflow)?;

    ctx.accounts.project.total_shares = new_total;

    msg!("Purchased {} shares for {} base units", shares, cost);
    Ok(())
}
