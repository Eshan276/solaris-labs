#![allow(dead_code)]

use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::{instruction::Instruction, system_program},
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    anchor_spl::associated_token::{self, get_associated_token_address_with_program_id},
    litesvm::{types::TransactionResult, LiteSVM},
    litesvm_token::{get_spl_account, CreateAssociatedTokenAccount, CreateMint, MintTo, TOKEN_ID},
    solaris_v2::{constants::*, state::*, SettlementArgs},
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
    spl_token_interface::state::Account as SplTokenAccount,
};

pub const USDC_DECIMALS: u8 = 6;
pub const USDC: u64 = 1_000_000;

pub struct Env {
    pub svm: LiteSVM,
    pub program_id: Pubkey,
    pub admin: Keypair,
    pub operator: Keypair,
    pub usdc_mint: Pubkey,
    pub operator_usdc: Pubkey,
    pub config: Pubkey,
    pub project: Pubkey,
    pub revenue_state: Pubkey,
    pub share_mint: Pubkey,
    pub investment_vault: Pubkey,
    pub revenue_vault: Pubkey,
    pub meter: Pubkey,
    /// End of the last period settled through `fund`, so helper settlements never overlap.
    pub next_period_start: i64,
}

pub fn pda(seeds: &[&[u8]]) -> Pubkey {
    Pubkey::find_program_address(seeds, &solaris_v2::id()).0
}

pub fn send(svm: &mut LiteSVM, ix: Instruction, payer: &Keypair, signers: &[&Keypair]) -> TransactionResult {
    // Fresh blockhash so repeated identical instructions are not deduplicated.
    svm.expire_blockhash();
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&payer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), signers).unwrap();
    svm.send_transaction(tx)
}

/// Asserts a transaction failed with the given Anchor error name (e.g. "NothingToClaim").
pub fn assert_anchor_err(res: TransactionResult, name: &str) {
    match res {
        Ok(_) => panic!("expected error {name}, but transaction succeeded"),
        Err(e) => assert!(
            e.meta.logs.iter().any(|l| l.contains(&format!("Error Code: {name}"))),
            "expected error {name}, got {:?}\nlogs: {:#?}",
            e.err,
            e.meta.logs
        ),
    }
}

pub fn read<T: AccountDeserialize>(svm: &LiteSVM, address: &Pubkey) -> T {
    let account = svm.get_account(address).expect("account missing");
    T::try_deserialize(&mut account.data.as_slice()).unwrap()
}

pub fn token_balance(svm: &LiteSVM, address: &Pubkey) -> u64 {
    get_spl_account::<SplTokenAccount>(svm, address).unwrap().amount
}

pub fn ata(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    get_associated_token_address_with_program_id(owner, mint, &TOKEN_ID)
}

impl Env {
    /// Deploys the program, creates a mock USDC mint, the protocol config, and project #0.
    pub fn new(share_price: u64, max_shares: u64) -> Self {
        let program_id = solaris_v2::id();
        let mut svm = LiteSVM::new();
        let bytes = include_bytes!(concat!(
            env!("CARGO_TARGET_TMPDIR"),
            "/../deploy/solaris_v2.so"
        ));
        svm.add_program(program_id, bytes).unwrap();

        let admin = Keypair::new();
        let operator = Keypair::new();
        svm.airdrop(&admin.pubkey(), 10_000_000_000).unwrap();
        svm.airdrop(&operator.pubkey(), 10_000_000_000).unwrap();

        let usdc_mint = CreateMint::new(&mut svm, &admin)
            .decimals(USDC_DECIMALS)
            .send()
            .unwrap();
        let operator_usdc = CreateAssociatedTokenAccount::new(&mut svm, &operator, &usdc_mint)
            .send()
            .unwrap();

        let config = pda(&[CONFIG_SEED]);
        let ix = Instruction::new_with_bytes(
            program_id,
            &solaris_v2::instruction::InitializeConfig {
                revenue_operator: operator.pubkey(),
            }
            .data(),
            solaris_v2::accounts::InitializeConfig {
                admin: admin.pubkey(),
                config,
                stablecoin_mint: usdc_mint,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        );
        send(&mut svm, ix, &admin, &[&admin]).expect("initialize_config");

        let project = pda(&[PROJECT_SEED, &0u64.to_le_bytes()]);
        let revenue_state = pda(&[REVENUE_SEED, project.as_ref()]);
        let share_mint = pda(&[SHARE_MINT_SEED, project.as_ref()]);
        let investment_vault = pda(&[INVESTMENT_VAULT_SEED, project.as_ref()]);
        let revenue_vault = pda(&[REVENUE_VAULT_SEED, project.as_ref()]);

        let mut env = Env {
            svm,
            program_id,
            admin,
            operator,
            usdc_mint,
            operator_usdc,
            config,
            project,
            revenue_state,
            share_mint,
            investment_vault,
            revenue_vault,
            meter: Pubkey::new_unique(),
            next_period_start: 1_700_000_000,
        };
        env.initialize_project(share_price, max_shares).expect("initialize_project");
        env
    }

    pub fn initialize_project(&mut self, share_price: u64, max_shares: u64) -> TransactionResult {
        let ix = Instruction::new_with_bytes(
            self.program_id,
            &solaris_v2::instruction::InitializeProject { share_price, max_shares, meter: self.meter }.data(),
            solaris_v2::accounts::InitializeProject {
                admin: self.admin.pubkey(),
                config: self.config,
                project: self.project,
                revenue_state: self.revenue_state,
                stablecoin_mint: self.usdc_mint,
                share_mint: self.share_mint,
                investment_vault: self.investment_vault,
                revenue_vault: self.revenue_vault,
                token_program: TOKEN_ID,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        );
        let admin = self.admin.insecure_clone();
        send(&mut self.svm, ix, &admin, &[&admin])
    }

    /// Creates a funded wallet holding `usdc` base units of mock USDC.
    pub fn new_investor(&mut self, usdc: u64) -> Keypair {
        let investor = Keypair::new();
        self.svm.airdrop(&investor.pubkey(), 1_000_000_000).unwrap();
        let investor_usdc = CreateAssociatedTokenAccount::new(&mut self.svm, &investor, &self.usdc_mint)
            .send()
            .unwrap();
        if usdc > 0 {
            let admin = self.admin.insecure_clone();
            MintTo::new(&mut self.svm, &admin, &self.usdc_mint, &investor_usdc, usdc)
                .send()
                .unwrap();
        }
        investor
    }

    /// Gives the operator stablecoin to deposit as revenue.
    pub fn mint_usdc_to(&mut self, destination: &Pubkey, amount: u64) {
        let admin = self.admin.insecure_clone();
        MintTo::new(&mut self.svm, &admin, &self.usdc_mint, destination, amount)
            .send()
            .unwrap();
    }

    pub fn position(&self, investor: &Pubkey) -> Pubkey {
        pda(&[POSITION_SEED, self.project.as_ref(), investor.as_ref()])
    }

    pub fn purchase(&mut self, investor: &Keypair, shares: u64) -> TransactionResult {
        let ix = Instruction::new_with_bytes(
            self.program_id,
            &solaris_v2::instruction::PurchaseShares { shares }.data(),
            solaris_v2::accounts::PurchaseShares {
                investor: investor.pubkey(),
                project: self.project,
                revenue_state: self.revenue_state,
                position: self.position(&investor.pubkey()),
                stablecoin_mint: self.usdc_mint,
                share_mint: self.share_mint,
                investment_vault: self.investment_vault,
                investor_stablecoin_account: ata(&investor.pubkey(), &self.usdc_mint),
                investor_share_account: ata(&investor.pubkey(), &self.share_mint),
                token_program: TOKEN_ID,
                associated_token_program: associated_token::ID,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        );
        send(&mut self.svm, ix, investor, &[investor])
    }

    pub fn settlement(&self, index: u64) -> Pubkey {
        pda(&[SETTLEMENT_SEED, self.project.as_ref(), &index.to_le_bytes()])
    }

    /// A one-hour settlement that starts where the previous helper settlement ended.
    pub fn next_args(&self, amount: u64) -> SettlementArgs {
        SettlementArgs {
            amount,
            energy_wh: amount / 80, // 0.08 USDC per kWh
            proof_hash: [7u8; 32],
            readings_count: 3_600,
            period_start: self.next_period_start,
            period_end: self.next_period_start + 3_600,
        }
    }

    /// Funds revenue signed by `signer`, paying from `signer`'s USDC ATA.
    pub fn fund_with(&mut self, signer: &Keypair, args: SettlementArgs) -> TransactionResult {
        let index = self.project_state().settlement_count;
        let ix = Instruction::new_with_bytes(
            self.program_id,
            &solaris_v2::instruction::FundRevenue { args }.data(),
            solaris_v2::accounts::FundRevenue {
                operator: signer.pubkey(),
                config: self.config,
                project: self.project,
                revenue_state: self.revenue_state,
                settlement: self.settlement(index),
                stablecoin_mint: self.usdc_mint,
                revenue_vault: self.revenue_vault,
                operator_stablecoin_account: ata(&signer.pubkey(), &self.usdc_mint),
                token_program: TOKEN_ID,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        );
        send(&mut self.svm, ix, signer, &[signer])
    }

    /// Funds the next period as the authorized operator, minting the USDC to deposit first.
    pub fn fund(&mut self, amount: u64) -> TransactionResult {
        let operator_usdc = self.operator_usdc;
        self.mint_usdc_to(&operator_usdc, amount);
        let operator = self.operator.insecure_clone();
        let args = self.next_args(amount);
        let end = args.period_end;
        let res = self.fund_with(&operator, args);
        if res.is_ok() {
            self.next_period_start = end;
        }
        res
    }

    pub fn set_meter_as(&mut self, signer: &Keypair, meter: Pubkey) -> TransactionResult {
        let ix = Instruction::new_with_bytes(
            self.program_id,
            &solaris_v2::instruction::SetMeter { meter }.data(),
            solaris_v2::accounts::SetMeter { admin: signer.pubkey(), project: self.project }.to_account_metas(None),
        );
        send(&mut self.svm, ix, signer, &[signer])
    }

    pub fn listing(&self, seller: &Pubkey) -> Pubkey {
        pda(&[LISTING_SEED, self.project.as_ref(), seller.as_ref()])
    }

    pub fn market(&self) -> Pubkey {
        pda(&[MARKET_SEED, self.project.as_ref()])
    }

    pub fn escrow(&self, seller: &Pubkey) -> Pubkey {
        ata(&self.listing(seller), &self.share_mint)
    }

    pub fn share_balance(&self, owner: &Pubkey) -> u64 {
        token_balance(&self.svm, &ata(owner, &self.share_mint))
    }

    pub fn list(&mut self, seller: &Keypair, amount: u64, price: u64) -> TransactionResult {
        let ix = Instruction::new_with_bytes(
            self.program_id,
            &solaris_v2::instruction::ListShares { amount, price }.data(),
            solaris_v2::accounts::ListShares {
                seller: seller.pubkey(),
                project: self.project,
                position: self.position(&seller.pubkey()),
                listing: self.listing(&seller.pubkey()),
                share_mint: self.share_mint,
                seller_share_account: ata(&seller.pubkey(), &self.share_mint),
                escrow: self.escrow(&seller.pubkey()),
                token_program: TOKEN_ID,
                associated_token_program: associated_token::ID,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        );
        send(&mut self.svm, ix, seller, &[seller])
    }

    pub fn buy_listing(&mut self, buyer: &Keypair, seller: &Pubkey, amount: u64, max_price: u64) -> TransactionResult {
        let ix = Instruction::new_with_bytes(
            self.program_id,
            &solaris_v2::instruction::BuyListing { amount, max_price }.data(),
            solaris_v2::accounts::BuyListing {
                buyer: buyer.pubkey(),
                seller: *seller,
                project: self.project,
                revenue_state: self.revenue_state,
                listing: self.listing(seller),
                seller_position: self.position(seller),
                buyer_position: self.position(&buyer.pubkey()),
                market: self.market(),
                stablecoin_mint: self.usdc_mint,
                share_mint: self.share_mint,
                escrow: self.escrow(seller),
                buyer_stablecoin_account: ata(&buyer.pubkey(), &self.usdc_mint),
                seller_stablecoin_account: ata(seller, &self.usdc_mint),
                buyer_share_account: ata(&buyer.pubkey(), &self.share_mint),
                token_program: TOKEN_ID,
                associated_token_program: associated_token::ID,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        );
        send(&mut self.svm, ix, buyer, &[buyer])
    }

    pub fn cancel_listing(&mut self, signer: &Keypair, seller: &Pubkey) -> TransactionResult {
        let ix = Instruction::new_with_bytes(
            self.program_id,
            &solaris_v2::instruction::CancelListing {}.data(),
            solaris_v2::accounts::CancelListing {
                seller: signer.pubkey(),
                project: self.project,
                listing: self.listing(seller),
                share_mint: self.share_mint,
                escrow: self.escrow(seller),
                seller_share_account: ata(&signer.pubkey(), &self.share_mint),
                token_program: TOKEN_ID,
            }
            .to_account_metas(None),
        );
        send(&mut self.svm, ix, signer, &[signer])
    }

    pub fn exists(&self, address: &Pubkey) -> bool {
        self.svm.get_account(address).is_some_and(|a| a.lamports > 0)
    }

    /// What the program would pay `investor` if they claimed now.
    pub fn claimable(&self, investor: &Pubkey) -> u64 {
        self.position_state(investor).claimable(self.revenue().acc_revenue_per_share).unwrap()
    }

    pub fn claim(&mut self, investor: &Keypair) -> TransactionResult {
        let ix = Instruction::new_with_bytes(
            self.program_id,
            &solaris_v2::instruction::ClaimRevenue {}.data(),
            solaris_v2::accounts::ClaimRevenue {
                investor: investor.pubkey(),
                project: self.project,
                revenue_state: self.revenue_state,
                position: self.position(&investor.pubkey()),
                stablecoin_mint: self.usdc_mint,
                revenue_vault: self.revenue_vault,
                investor_stablecoin_account: ata(&investor.pubkey(), &self.usdc_mint),
                token_program: TOKEN_ID,
            }
            .to_account_metas(None),
        );
        send(&mut self.svm, ix, investor, &[investor])
    }

    pub fn set_active(&mut self, active: bool) -> TransactionResult {
        let ix = Instruction::new_with_bytes(
            self.program_id,
            &solaris_v2::instruction::SetProjectActive { active }.data(),
            solaris_v2::accounts::SetProjectActive {
                admin: self.admin.pubkey(),
                project: self.project,
            }
            .to_account_metas(None),
        );
        let admin = self.admin.insecure_clone();
        send(&mut self.svm, ix, &admin, &[&admin])
    }

    pub fn usdc_balance(&self, owner: &Pubkey) -> u64 {
        token_balance(&self.svm, &ata(owner, &self.usdc_mint))
    }

    pub fn project_state(&self) -> Project {
        read(&self.svm, &self.project)
    }

    pub fn revenue(&self) -> RevenueState {
        read(&self.svm, &self.revenue_state)
    }

    pub fn position_state(&self, investor: &Pubkey) -> InvestorPosition {
        read(&self.svm, &self.position(investor))
    }
}
