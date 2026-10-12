use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Signer is not the protocol admin")]
    UnauthorizedAdmin,
    #[msg("Signer is not the authorized revenue operator")]
    UnauthorizedOperator,
    #[msg("Project is not active")]
    ProjectInactive,
    #[msg("Share amount must be greater than zero")]
    InvalidShareAmount,
    #[msg("Purchase would exceed the project's maximum shares")]
    ExceedsMaxShares,
    #[msg("Share price and max shares must be greater than zero")]
    InvalidProjectParams,
    #[msg("Revenue amount must be greater than zero")]
    InvalidRevenueAmount,
    #[msg("Project has no shareholders to distribute revenue to")]
    NoShareholders,
    #[msg("No claimable revenue")]
    NothingToClaim,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Settlement period is empty or overlaps an already settled period")]
    InvalidPeriod,
    #[msg("Settlement must include at least one meter reading")]
    NoReadings,
    #[msg("Shares and price must be greater than zero")]
    InvalidListing,
    #[msg("Not enough shares in your position")]
    InsufficientShares,
    #[msg("You can't buy your own listing")]
    OwnListing,
    #[msg("The listing doesn't have that many shares left")]
    ListingTooSmall,
    #[msg("The listing price is above your maximum price")]
    PriceAboveMax,
}
