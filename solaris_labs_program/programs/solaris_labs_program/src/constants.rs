use anchor_lang::prelude::*;

#[constant]
pub const CONFIG_SEED: &[u8] = b"config";

#[constant]
pub const PROJECT_SEED: &[u8] = b"project";

#[constant]
pub const POSITION_SEED: &[u8] = b"position";

#[constant]
pub const REVENUE_SEED: &[u8] = b"revenue";

#[constant]
pub const SHARE_MINT_SEED: &[u8] = b"share_mint";

#[constant]
pub const INVESTMENT_VAULT_SEED: &[u8] = b"investment_vault";

#[constant]
pub const REVENUE_VAULT_SEED: &[u8] = b"revenue_vault";

/// Project shares are whole units.
#[constant]
pub const SHARE_DECIMALS: u8 = 0;
