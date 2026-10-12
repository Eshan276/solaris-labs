use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::{
    constants::*,
    error::ErrorCode,
    state::{Project, ProtocolConfig, RevenueState, Settlement},
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SettlementArgs {
    pub amount: u64,
    pub energy_wh: u64,
    /// SHA-256 of the published readings file for this period.
    pub proof_hash: [u8; 32],
    pub readings_count: u32,
    pub period_start: i64,
    pub period_end: i64,
}

#[derive(Accounts)]
pub struct FundRevenue<'info> {
    #[account(mut)]
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
    #[account(
        init,
        payer = operator,
        space = 8 + Settlement::INIT_SPACE,
        seeds = [SETTLEMENT_SEED, project.key().as_ref(), &project.settlement_count.to_le_bytes()],
        bump
    )]
    pub settlement: Box<Account<'info, Settlement>>,
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
    pub system_program: Program<'info, System>,
}

pub fn handle_fund_revenue(ctx: Context<FundRevenue>, args: SettlementArgs) -> Result<()> {
    // REQ07: only the configured revenue operator may fund revenue.
    require_keys_eq!(
        ctx.accounts.operator.key(),
        ctx.accounts.config.revenue_operator,
        ErrorCode::UnauthorizedOperator
    );
    require!(args.amount > 0, ErrorCode::InvalidRevenueAmount);
    require!(args.readings_count > 0, ErrorCode::NoReadings);
    let project = &ctx.accounts.project;
    require!(project.total_shares > 0, ErrorCode::NoShareholders);
    // Each period is settled once: it must be non-empty and start after the previous one ended.
    require!(
        args.period_end > args.period_start && args.period_start >= project.last_period_end,
        ErrorCode::InvalidPeriod
    );

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
        args.amount,
        ctx.accounts.stablecoin_mint.decimals,
    )?;

    // Spread the deposit over the shares that exist right now. Rounding down leaves dust in the
    // vault, so payouts can never exceed what was funded.
    let total_shares = project.total_shares;
    let increment = (args.amount as u128)
        .checked_mul(ACC_PRECISION)
        .ok_or(ErrorCode::MathOverflow)?
        / total_shares as u128;
    let revenue_state = &mut ctx.accounts.revenue_state;
    revenue_state.acc_revenue_per_share = revenue_state
        .acc_revenue_per_share
        .checked_add(increment)
        .ok_or(ErrorCode::MathOverflow)?;
    revenue_state.total_funded = revenue_state
        .total_funded
        .checked_add(args.amount)
        .ok_or(ErrorCode::MathOverflow)?;

    let project_key = ctx.accounts.project.key();
    let index = ctx.accounts.project.settlement_count;
    let settlement = &mut ctx.accounts.settlement;
    settlement.project = project_key;
    settlement.index = index;
    settlement.amount = args.amount;
    settlement.energy_wh = args.energy_wh;
    settlement.proof_hash = args.proof_hash;
    settlement.readings_count = args.readings_count;
    settlement.period_start = args.period_start;
    settlement.period_end = args.period_end;
    settlement.funded_at = Clock::get()?.unix_timestamp;
    settlement.total_shares = total_shares;
    settlement.bump = ctx.bumps.settlement;

    let project = &mut ctx.accounts.project;
    project.settlement_count = index.checked_add(1).ok_or(ErrorCode::MathOverflow)?;
    project.last_period_end = args.period_end;

    msg!(
        "Settlement {}: {} base units for {} Wh, total funded {}",
        index,
        args.amount,
        args.energy_wh,
        revenue_state.total_funded
    );
    Ok(())
}
