use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    state::{Project, ProtocolConfig},
};

#[derive(Accounts)]
pub struct SetRevenueOperator<'info> {
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ ErrorCode::UnauthorizedAdmin
    )]
    pub config: Account<'info, ProtocolConfig>,
}

pub fn handle_set_revenue_operator(ctx: Context<SetRevenueOperator>, revenue_operator: Pubkey) -> Result<()> {
    ctx.accounts.config.revenue_operator = revenue_operator;
    Ok(())
}

#[derive(Accounts)]
pub struct SetProjectActive<'info> {
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [PROJECT_SEED, &project.project_id.to_le_bytes()],
        bump = project.bump,
        has_one = admin @ ErrorCode::UnauthorizedAdmin
    )]
    pub project: Account<'info, Project>,
}

pub fn handle_set_project_active(ctx: Context<SetProjectActive>, active: bool) -> Result<()> {
    ctx.accounts.project.active = active;
    Ok(())
}
