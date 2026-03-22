/// PMFaucet - generic starter + daily faucet for public-beta onboarding.
/// Shared object funded by operator-owned Coin<Collateral> top-ups.
module prediction_market::pm_faucet;

use sui::{
    balance::{Self, Balance},
    clock::Clock,
    coin::{Self, Coin},
    event,
};
use prediction_market::pm_registry::PMAdminCap;

#[error(code = 0)]
const EFaucetPaused: vector<u8> = b"Faucet is paused";
#[error(code = 1)]
const EAlreadyClaimedToday: vector<u8> = b"Wallet already claimed for the current UTC day";
#[error(code = 2)]
const EInsufficientFaucetBalance: vector<u8> = b"Faucet does not have enough collateral";
#[error(code = 3)]
const EClaimAmountZero: vector<u8> = b"Claim amount is zero";

const DAY_MS: u64 = 24 * 60 * 60 * 1000;

public struct FaucetCreatedEvent<phantom Collateral> has copy, drop {
    faucet_id: ID,
    starter_amount: u64,
    daily_amount: u64,
}

public struct FaucetConfiguredEvent<phantom Collateral> has copy, drop {
    faucet_id: ID,
    starter_amount: u64,
    daily_amount: u64,
    paused: bool,
}

public struct FaucetTopUpEvent<phantom Collateral> has copy, drop {
    faucet_id: ID,
    amount: u64,
    available_balance: u64,
}

public struct FaucetClaimedEvent<phantom Collateral> has copy, drop {
    faucet_id: ID,
    claimer: address,
    amount: u64,
    is_starter_claim: bool,
    claim_day_utc: u64,
}

public struct FaucetWithdrawnEvent<phantom Collateral> has copy, drop {
    faucet_id: ID,
    amount: u64,
    recipient: address,
}

public struct ClaimState has store, copy, drop {
    owner: address,
    last_claim_day_utc: u64,
    total_claimed: u64,
    claim_count: u64,
}

public struct PMFaucet<phantom Collateral> has key {
    id: UID,
    starter_amount: u64,
    daily_amount: u64,
    paused: bool,
    pool: Balance<Collateral>,
    total_claimed: u64,
    total_claim_count: u64,
    tracked_wallets: u64,
    claims: vector<ClaimState>,
}

fun find_claim_index<Collateral>(faucet: &PMFaucet<Collateral>, owner: address): (bool, u64) {
    let len = vector::length(&faucet.claims);
    let mut i = 0u64;
    while (i < len) {
        let state = vector::borrow(&faucet.claims, i);
        if (state.owner == owner) {
            return (true, i)
        };
        i = i + 1;
    };
    (false, 0)
}

public fun create_faucet<Collateral>(
    _admin: &PMAdminCap<Collateral>,
    starter_amount: u64,
    daily_amount: u64,
    ctx: &mut TxContext,
): PMFaucet<Collateral> {
    let faucet = PMFaucet<Collateral> {
        id: object::new(ctx),
        starter_amount,
        daily_amount,
        paused: false,
        pool: balance::zero<Collateral>(),
        total_claimed: 0,
        total_claim_count: 0,
        tracked_wallets: 0,
        claims: vector::empty(),
    };

    event::emit(FaucetCreatedEvent<Collateral> {
        faucet_id: object::id(&faucet),
        starter_amount,
        daily_amount,
    });

    faucet
}

public fun create_and_share_faucet<Collateral>(
    admin: &PMAdminCap<Collateral>,
    starter_amount: u64,
    daily_amount: u64,
    ctx: &mut TxContext,
) {
    transfer::share_object(create_faucet(admin, starter_amount, daily_amount, ctx));
}

public fun pause<Collateral>(faucet: &mut PMFaucet<Collateral>, _admin: &PMAdminCap<Collateral>) {
    faucet.paused = true;
    event::emit(FaucetConfiguredEvent<Collateral> {
        faucet_id: object::id(faucet),
        starter_amount: faucet.starter_amount,
        daily_amount: faucet.daily_amount,
        paused: true,
    });
}

public fun resume<Collateral>(faucet: &mut PMFaucet<Collateral>, _admin: &PMAdminCap<Collateral>) {
    faucet.paused = false;
    event::emit(FaucetConfiguredEvent<Collateral> {
        faucet_id: object::id(faucet),
        starter_amount: faucet.starter_amount,
        daily_amount: faucet.daily_amount,
        paused: false,
    });
}

public fun update_amounts<Collateral>(
    faucet: &mut PMFaucet<Collateral>,
    _admin: &PMAdminCap<Collateral>,
    starter_amount: u64,
    daily_amount: u64,
) {
    faucet.starter_amount = starter_amount;
    faucet.daily_amount = daily_amount;
    event::emit(FaucetConfiguredEvent<Collateral> {
        faucet_id: object::id(faucet),
        starter_amount,
        daily_amount,
        paused: faucet.paused,
    });
}

public fun top_up<Collateral>(
    faucet: &mut PMFaucet<Collateral>,
    _admin: &PMAdminCap<Collateral>,
    payment: Coin<Collateral>,
) {
    let amount = coin::value(&payment);
    let payment_balance = coin::into_balance(payment);
    balance::join(&mut faucet.pool, payment_balance);

    event::emit(FaucetTopUpEvent<Collateral> {
        faucet_id: object::id(faucet),
        amount,
        available_balance: balance::value(&faucet.pool),
    });
}

public fun withdraw<Collateral>(
    faucet: &mut PMFaucet<Collateral>,
    _admin: &PMAdminCap<Collateral>,
    amount: u64,
    recipient: address,
    ctx: &mut TxContext,
) {
    let coin_out = coin::take(&mut faucet.pool, amount, ctx);
    transfer::public_transfer(coin_out, recipient);

    event::emit(FaucetWithdrawnEvent<Collateral> {
        faucet_id: object::id(faucet),
        amount,
        recipient,
    });
}

public fun claim<Collateral>(
    faucet: &mut PMFaucet<Collateral>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(!faucet.paused, EFaucetPaused);

    let claimer = tx_context::sender(ctx);
    let claim_day_utc = sui::clock::timestamp_ms(clock) / DAY_MS;
    let (found, index) = find_claim_index(faucet, claimer);

    let mut amount = faucet.starter_amount;
    let mut is_starter_claim = true;

    if (found) {
        let state = vector::borrow_mut(&mut faucet.claims, index);
        assert!(claim_day_utc > state.last_claim_day_utc, EAlreadyClaimedToday);
        amount = faucet.daily_amount;
        is_starter_claim = false;
        state.last_claim_day_utc = claim_day_utc;
        state.total_claimed = state.total_claimed + amount;
        state.claim_count = state.claim_count + 1;
    } else {
        vector::push_back(&mut faucet.claims, ClaimState {
            owner: claimer,
            last_claim_day_utc: claim_day_utc,
            total_claimed: amount,
            claim_count: 1,
        });
        faucet.tracked_wallets = faucet.tracked_wallets + 1;
    };

    assert!(amount > 0, EClaimAmountZero);
    assert!(balance::value(&faucet.pool) >= amount, EInsufficientFaucetBalance);

    faucet.total_claimed = faucet.total_claimed + amount;
    faucet.total_claim_count = faucet.total_claim_count + 1;

    let payout = coin::take(&mut faucet.pool, amount, ctx);
    transfer::public_transfer(payout, claimer);

    event::emit(FaucetClaimedEvent<Collateral> {
        faucet_id: object::id(faucet),
        claimer,
        amount,
        is_starter_claim,
        claim_day_utc,
    });
}

public fun starter_amount<Collateral>(faucet: &PMFaucet<Collateral>): u64 { faucet.starter_amount }
public fun daily_amount<Collateral>(faucet: &PMFaucet<Collateral>): u64 { faucet.daily_amount }
public fun is_paused<Collateral>(faucet: &PMFaucet<Collateral>): bool { faucet.paused }
public fun available_balance<Collateral>(faucet: &PMFaucet<Collateral>): u64 { balance::value(&faucet.pool) }
public fun total_claimed<Collateral>(faucet: &PMFaucet<Collateral>): u64 { faucet.total_claimed }
public fun total_claim_count<Collateral>(faucet: &PMFaucet<Collateral>): u64 { faucet.total_claim_count }
public fun tracked_wallets<Collateral>(faucet: &PMFaucet<Collateral>): u64 { faucet.tracked_wallets }
public fun claim_state_count<Collateral>(faucet: &PMFaucet<Collateral>): u64 { vector::length(&faucet.claims) }
