use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::{
    constants::*,
    error::ErrorCode,
    state::{Project, ProtocolConfig, RevenueState},
};

#[derive(Accounts)]
pub struct InitializeProject<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ ErrorCode::UnauthorizedAdmin,
        has_one = stablecoin_mint
    )]
    pub config: Box<Account<'info, ProtocolConfig>>,
    #[account(
        init,
        payer = admin,
        space = 8 + Project::INIT_SPACE,
        seeds = [PROJECT_SEED, &config.project_count.to_le_bytes()],
        bump
    )]
    pub project: Box<Account<'info, Project>>,
    #[account(
        init,
        payer = admin,
        space = 8 + RevenueState::INIT_SPACE,
        seeds = [REVENUE_SEED, project.key().as_ref()],
        bump
    )]
    pub revenue_state: Box<Account<'info, RevenueState>>,
    #[account(mint::token_program = token_program)]
    pub stablecoin_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        init,
        payer = admin,
        seeds = [SHARE_MINT_SEED, project.key().as_ref()],
        bump,
        mint::decimals = SHARE_DECIMALS,
        mint::authority = project,
        mint::token_program = token_program
    )]
    pub share_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        init,
        payer = admin,
        seeds = [INVESTMENT_VAULT_SEED, project.key().as_ref()],
        bump,
        token::mint = stablecoin_mint,
        token::authority = project,
        token::token_program = token_program
    )]
    pub investment_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init,
        payer = admin,
        seeds = [REVENUE_VAULT_SEED, project.key().as_ref()],
        bump,
        token::mint = stablecoin_mint,
        token::authority = project,
        token::token_program = token_program
    )]
    pub revenue_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_project(
    ctx: Context<InitializeProject>,
    share_price: u64,
    max_shares: u64,
) -> Result<()> {
    require!(share_price > 0 && max_shares > 0, ErrorCode::InvalidProjectParams);

    let config = &mut ctx.accounts.config;
    let project_id = config.project_count;
    config.project_count = project_id.checked_add(1).ok_or(ErrorCode::MathOverflow)?;

    let project_key = ctx.accounts.project.key();
    let project = &mut ctx.accounts.project;
    project.project_id = project_id;
    project.admin = ctx.accounts.admin.key();
    project.stablecoin_mint = ctx.accounts.stablecoin_mint.key();
    project.share_mint = ctx.accounts.share_mint.key();
    project.investment_vault = ctx.accounts.investment_vault.key();
    project.revenue_vault = ctx.accounts.revenue_vault.key();
    project.share_price = share_price;
    project.max_shares = max_shares;
    project.total_shares = 0;
    project.active = true;
    project.sales_closed = false;
    project.bump = ctx.bumps.project;

    let revenue_state = &mut ctx.accounts.revenue_state;
    revenue_state.project = project_key;
    revenue_state.total_funded = 0;
    revenue_state.total_claimed = 0;
    revenue_state.bump = ctx.bumps.revenue_state;

    msg!("Project {} initialized", project_id);
    Ok(())
}
