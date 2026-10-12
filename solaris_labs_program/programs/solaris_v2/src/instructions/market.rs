//! Secondary market: holders list shares at a fixed price, others buy them.
//!
//! Revenue rights live in `InvestorPosition`, so a sale moves position shares as well as the share
//! tokens. Both positions are checkpointed at the moment of the trade: the seller keeps everything
//! earned before it, the buyer earns only from then on.
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{self, CloseAccount, Mint, TokenAccount, TokenInterface, TransferChecked},
};

use crate::{
    constants::*,
    error::ErrorCode,
    state::{InvestorPosition, Listing, Market, Project, RevenueState, TradeEvent},
};

// ---------------------------------------------------------------- list_shares

#[derive(Accounts)]
pub struct ListShares<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,
    #[account(
        seeds = [PROJECT_SEED, &project.project_id.to_le_bytes()],
        bump = project.bump,
        has_one = share_mint
    )]
    pub project: Box<Account<'info, Project>>,
    #[account(
        seeds = [POSITION_SEED, project.key().as_ref(), seller.key().as_ref()],
        bump = position.bump,
        constraint = position.investor == seller.key() @ ErrorCode::InsufficientShares
    )]
    pub position: Box<Account<'info, InvestorPosition>>,
    #[account(
        init,
        payer = seller,
        space = 8 + Listing::INIT_SPACE,
        seeds = [LISTING_SEED, project.key().as_ref(), seller.key().as_ref()],
        bump
    )]
    pub listing: Box<Account<'info, Listing>>,
    pub share_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        token::mint = share_mint,
        token::authority = seller,
        token::token_program = token_program
    )]
    pub seller_share_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init,
        payer = seller,
        associated_token::mint = share_mint,
        associated_token::authority = listing,
        associated_token::token_program = token_program
    )]
    pub escrow: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_list_shares(ctx: Context<ListShares>, amount: u64, price: u64) -> Result<()> {
    require!(amount > 0 && price > 0, ErrorCode::InvalidListing);
    require!(ctx.accounts.position.shares >= amount, ErrorCode::InsufficientShares);

    // Hold the share tokens in escrow so they can't be sold twice.
    token_interface::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.seller_share_account.to_account_info(),
                mint: ctx.accounts.share_mint.to_account_info(),
                to: ctx.accounts.escrow.to_account_info(),
                authority: ctx.accounts.seller.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.share_mint.decimals,
    )?;

    let listing = &mut ctx.accounts.listing;
    listing.project = ctx.accounts.project.key();
    listing.seller = ctx.accounts.seller.key();
    listing.amount = amount;
    listing.price = price;
    listing.created_at = Clock::get()?.unix_timestamp;
    listing.bump = ctx.bumps.listing;

    msg!("Listed {} shares at {} base units each", amount, price);
    Ok(())
}

// ---------------------------------------------------------------- buy_listing

#[derive(Accounts)]
pub struct BuyListing<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    /// CHECK: the listing's seller; receives the payment and, when the listing sells out, its rent.
    #[account(mut, address = listing.seller)]
    pub seller: UncheckedAccount<'info>,
    #[account(
        seeds = [PROJECT_SEED, &project.project_id.to_le_bytes()],
        bump = project.bump,
        has_one = stablecoin_mint,
        has_one = share_mint
    )]
    pub project: Box<Account<'info, Project>>,
    #[account(
        seeds = [REVENUE_SEED, project.key().as_ref()],
        bump = revenue_state.bump
    )]
    pub revenue_state: Box<Account<'info, RevenueState>>,
    #[account(
        mut,
        seeds = [LISTING_SEED, project.key().as_ref(), seller.key().as_ref()],
        bump = listing.bump,
        has_one = project
    )]
    pub listing: Box<Account<'info, Listing>>,
    #[account(
        mut,
        seeds = [POSITION_SEED, project.key().as_ref(), seller.key().as_ref()],
        bump = seller_position.bump
    )]
    pub seller_position: Box<Account<'info, InvestorPosition>>,
    #[account(
        init_if_needed,
        payer = buyer,
        space = 8 + InvestorPosition::INIT_SPACE,
        seeds = [POSITION_SEED, project.key().as_ref(), buyer.key().as_ref()],
        bump
    )]
    pub buyer_position: Box<Account<'info, InvestorPosition>>,
    #[account(
        init_if_needed,
        payer = buyer,
        space = 8 + Market::INIT_SPACE,
        seeds = [MARKET_SEED, project.key().as_ref()],
        bump
    )]
    pub market: Box<Account<'info, Market>>,
    pub stablecoin_mint: Box<InterfaceAccount<'info, Mint>>,
    pub share_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = share_mint,
        associated_token::authority = listing,
        associated_token::token_program = token_program
    )]
    pub escrow: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        token::mint = stablecoin_mint,
        token::authority = buyer,
        token::token_program = token_program
    )]
    pub buyer_stablecoin_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        token::mint = stablecoin_mint,
        token::authority = seller,
        token::token_program = token_program
    )]
    pub seller_stablecoin_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = share_mint,
        associated_token::authority = buyer,
        associated_token::token_program = token_program
    )]
    pub buyer_share_account: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_buy_listing(ctx: Context<BuyListing>, amount: u64, max_price: u64) -> Result<()> {
    let seller_key = ctx.accounts.seller.key();
    let buyer_key = ctx.accounts.buyer.key();
    require!(amount > 0, ErrorCode::InvalidListing);
    require_keys_neq!(buyer_key, seller_key, ErrorCode::OwnListing);
    let price = ctx.accounts.listing.price;
    require!(price <= max_price, ErrorCode::PriceAboveMax);
    require!(ctx.accounts.listing.amount >= amount, ErrorCode::ListingTooSmall);
    require!(ctx.accounts.seller_position.shares >= amount, ErrorCode::InsufficientShares);
    let cost = amount.checked_mul(price).ok_or(ErrorCode::MathOverflow)?;

    // Buyer pays the seller directly.
    token_interface::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.buyer_stablecoin_account.to_account_info(),
                mint: ctx.accounts.stablecoin_mint.to_account_info(),
                to: ctx.accounts.seller_stablecoin_account.to_account_info(),
                authority: ctx.accounts.buyer.to_account_info(),
            },
        ),
        cost,
        ctx.accounts.stablecoin_mint.decimals,
    )?;

    // Share tokens leave escrow, signed by the listing PDA.
    let project_key = ctx.accounts.project.key();
    let listing_bump = ctx.accounts.listing.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[LISTING_SEED, project_key.as_ref(), seller_key.as_ref(), &[listing_bump]]];
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.escrow.to_account_info(),
                mint: ctx.accounts.share_mint.to_account_info(),
                to: ctx.accounts.buyer_share_account.to_account_info(),
                authority: ctx.accounts.listing.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
        ctx.accounts.share_mint.decimals,
    )?;

    // Move revenue rights: lock in what each side has earned so far, then shift the shares.
    let acc = ctx.accounts.revenue_state.acc_revenue_per_share;
    let seller_position = &mut ctx.accounts.seller_position;
    seller_position.checkpoint(acc)?;
    seller_position.shares -= amount;
    seller_position.reward_debt = (seller_position.shares as u128)
        .checked_mul(acc)
        .ok_or(ErrorCode::MathOverflow)?;

    let buyer_position = &mut ctx.accounts.buyer_position;
    if buyer_position.investor == Pubkey::default() {
        buyer_position.investor = buyer_key;
        buyer_position.project = project_key;
        buyer_position.bump = ctx.bumps.buyer_position;
    }
    buyer_position.checkpoint(acc)?;
    buyer_position.shares = buyer_position.shares.checked_add(amount).ok_or(ErrorCode::MathOverflow)?;
    buyer_position.reward_debt = (buyer_position.shares as u128)
        .checked_mul(acc)
        .ok_or(ErrorCode::MathOverflow)?;

    let market = &mut ctx.accounts.market;
    if market.project == Pubkey::default() {
        market.project = project_key;
        market.bump = ctx.bumps.market;
    }
    market.last_price = price;
    market.trade_count = market.trade_count.checked_add(1).ok_or(ErrorCode::MathOverflow)?;
    market.volume_shares = market.volume_shares.checked_add(amount).ok_or(ErrorCode::MathOverflow)?;
    market.volume_stablecoin = market.volume_stablecoin.checked_add(cost).ok_or(ErrorCode::MathOverflow)?;

    ctx.accounts.listing.amount -= amount;
    emit!(TradeEvent {
        project: project_key,
        seller: seller_key,
        buyer: buyer_key,
        shares: amount,
        price,
        timestamp: Clock::get()?.unix_timestamp,
    });
    msg!("Bought {} shares at {} base units each", amount, price);

    // Sold out: close the escrow and the listing, returning their rent to the seller.
    if ctx.accounts.listing.amount == 0 {
        token_interface::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            CloseAccount {
                account: ctx.accounts.escrow.to_account_info(),
                destination: ctx.accounts.seller.to_account_info(),
                authority: ctx.accounts.listing.to_account_info(),
            },
            signer_seeds,
        ))?;
        ctx.accounts.listing.close(ctx.accounts.seller.to_account_info())?;
    }
    Ok(())
}

// ---------------------------------------------------------------- cancel_listing

#[derive(Accounts)]
pub struct CancelListing<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,
    #[account(
        seeds = [PROJECT_SEED, &project.project_id.to_le_bytes()],
        bump = project.bump,
        has_one = share_mint
    )]
    pub project: Box<Account<'info, Project>>,
    #[account(
        mut,
        close = seller,
        seeds = [LISTING_SEED, project.key().as_ref(), seller.key().as_ref()],
        bump = listing.bump,
        has_one = seller,
        has_one = project
    )]
    pub listing: Box<Account<'info, Listing>>,
    pub share_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = share_mint,
        associated_token::authority = listing,
        associated_token::token_program = token_program
    )]
    pub escrow: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        token::mint = share_mint,
        token::authority = seller,
        token::token_program = token_program
    )]
    pub seller_share_account: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_cancel_listing(ctx: Context<CancelListing>) -> Result<()> {
    let project_key = ctx.accounts.project.key();
    let seller_key = ctx.accounts.seller.key();
    let signer_seeds: &[&[&[u8]]] = &[&[LISTING_SEED, project_key.as_ref(), seller_key.as_ref(), &[ctx.accounts.listing.bump]]];

    let remaining = ctx.accounts.escrow.amount;
    if remaining > 0 {
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                TransferChecked {
                    from: ctx.accounts.escrow.to_account_info(),
                    mint: ctx.accounts.share_mint.to_account_info(),
                    to: ctx.accounts.seller_share_account.to_account_info(),
                    authority: ctx.accounts.listing.to_account_info(),
                },
                signer_seeds,
            ),
            remaining,
            ctx.accounts.share_mint.decimals,
        )?;
    }
    token_interface::close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.key(),
        CloseAccount {
            account: ctx.accounts.escrow.to_account_info(),
            destination: ctx.accounts.seller.to_account_info(),
            authority: ctx.accounts.listing.to_account_info(),
        },
        signer_seeds,
    ))?;
    msg!("Listing cancelled, {} shares returned", remaining);
    Ok(())
}
