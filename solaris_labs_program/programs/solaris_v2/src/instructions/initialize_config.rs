use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;

use crate::{constants::*, state::ProtocolConfig};

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = 8 + ProtocolConfig::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, ProtocolConfig>,
    pub stablecoin_mint: InterfaceAccount<'info, Mint>,
    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_config(ctx: Context<InitializeConfig>, revenue_operator: Pubkey) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.stablecoin_mint = ctx.accounts.stablecoin_mint.key();
    config.revenue_operator = revenue_operator;
    config.project_count = 0;
    config.bump = ctx.bumps.config;
    Ok(())
}
