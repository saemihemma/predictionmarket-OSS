/// SwapPool — protocol-owned SUI/SUFFER constant-product swap pool.
/// Lets users swap SUI↔SUFFER in-app without needing an external DEX.
/// Admin seeds liquidity; fee on every swap accrues to protocol.
///
/// UPGRADE NOTE: accrued_fee_sui and accrued_fee_suffer live inside the
/// SwapPool struct. Before any package upgrade that changes the struct
/// layout, admin MUST call withdraw_fees first to drain fee balances.
module prediction_market::swap_pool;

use sui::{balance::{Self, Balance}, coin::{Self, Coin}, sui::SUI, event};
use prediction_market::{
    suffer::SUFFER,
    pm_registry::PMAdminCap,
};

// ── Constants ──
const BPS_DENOMINATOR: u64 = 10_000;
const MIN_RESERVE: u64 = 1;

// ── Errors ──
#[error(code = 0)]
const EPoolPaused: vector<u8> = b"Swap pool is paused";
#[error(code = 1)]
const EFeeBpsTooHigh: vector<u8> = b"Fee BPS must be less than 10000";
#[error(code = 2)]
const EZeroLiquidity: vector<u8> = b"Initial liquidity must be greater than zero";
#[error(code = 3)]
const EZeroInput: vector<u8> = b"Swap input amount must be greater than zero";
#[error(code = 4)]
const ESlippageExceeded: vector<u8> = b"Output below minimum (slippage protection)";
#[error(code = 5)]
const EInsufficientReserve: vector<u8> = b"Insufficient pool reserve for withdrawal";
#[error(code = 6)]
const EZeroOutput: vector<u8> = b"Swap would produce zero output";
#[error(code = 7)]
const EBelowMinReserve: vector<u8> = b"Withdrawal would drop reserve below minimum floor";

// ── Events ──

public struct PoolCreatedEvent has copy, drop {
    pool_id: ID,
    initial_sui: u64,
    initial_suffer: u64,
    fee_bps: u64,
}

public struct SwapEvent has copy, drop {
    pool_id: ID,
    trader: address,
    /// 0 = SUI→SUFFER, 1 = SUFFER→SUI
    direction: u8,
    amount_in: u64,
    amount_out: u64,
    fee: u64,
}

public struct LiquidityAddedEvent has copy, drop {
    pool_id: ID,
    sui_added: u64,
    suffer_added: u64,
}

public struct LiquidityWithdrawnEvent has copy, drop {
    pool_id: ID,
    sui_withdrawn: u64,
    suffer_withdrawn: u64,
    recipient: address,
}

public struct FeeUpdatedEvent has copy, drop {
    pool_id: ID,
    old_fee_bps: u64,
    new_fee_bps: u64,
}

public struct PoolPausedEvent has copy, drop {
    pool_id: ID,
}

public struct PoolResumedEvent has copy, drop {
    pool_id: ID,
}

public struct FeesWithdrawnEvent has copy, drop {
    pool_id: ID,
    sui_amount: u64,
    suffer_amount: u64,
    recipient: address,
}

// ── Pool struct ──

public struct SwapPool has key {
    id: UID,
    reserve_sui: Balance<SUI>,
    reserve_suffer: Balance<SUFFER>,
    fee_bps: u64,
    accrued_fee_sui: Balance<SUI>,
    accrued_fee_suffer: Balance<SUFFER>,
    paused: bool,
    total_sui_volume: u64,
    total_suffer_volume: u64,
}

// ── Internal math ──

/// Constant-product swap output: dy = y * dx / (x + dx)
/// Floor division — pool always wins rounding.
fun compute_output(reserve_in: u64, reserve_out: u64, amount_in_after_fee: u64): u64 {
    let num = (reserve_out as u128) * (amount_in_after_fee as u128);
    let denom = (reserve_in as u128) + (amount_in_after_fee as u128);
    (num / denom) as u64
}

// ── Admin: Create & Seed ──

/// Create the swap pool with initial liquidity. Shares the pool object.
public fun create_pool(
    _admin: &PMAdminCap,
    sui_liquidity: Coin<SUI>,
    suffer_liquidity: Coin<SUFFER>,
    fee_bps: u64,
    ctx: &mut TxContext,
) {
    assert!(fee_bps < BPS_DENOMINATOR, EFeeBpsTooHigh);
    assert!(coin::value(&sui_liquidity) > 0, EZeroLiquidity);
    assert!(coin::value(&suffer_liquidity) > 0, EZeroLiquidity);

    let initial_sui = coin::value(&sui_liquidity);
    let initial_suffer = coin::value(&suffer_liquidity);

    let pool = SwapPool {
        id: object::new(ctx),
        reserve_sui: coin::into_balance(sui_liquidity),
        reserve_suffer: coin::into_balance(suffer_liquidity),
        fee_bps,
        accrued_fee_sui: balance::zero(),
        accrued_fee_suffer: balance::zero(),
        paused: false,
        total_sui_volume: 0,
        total_suffer_volume: 0,
    };

    event::emit(PoolCreatedEvent {
        pool_id: object::uid_to_inner(&pool.id),
        initial_sui,
        initial_suffer,
        fee_bps,
    });

    transfer::share_object(pool);
}

// ── Admin: Liquidity management ──

/// Add more liquidity to one or both sides.
public fun add_liquidity(
    pool: &mut SwapPool,
    _admin: &PMAdminCap,
    sui_coin: Coin<SUI>,
    suffer_coin: Coin<SUFFER>,
) {
    let sui_added = coin::value(&sui_coin);
    let suffer_added = coin::value(&suffer_coin);

    if (sui_added > 0) {
        balance::join(&mut pool.reserve_sui, coin::into_balance(sui_coin));
    } else {
        coin::destroy_zero(sui_coin);
    };

    if (suffer_added > 0) {
        balance::join(&mut pool.reserve_suffer, coin::into_balance(suffer_coin));
    } else {
        coin::destroy_zero(suffer_coin);
    };

    event::emit(LiquidityAddedEvent {
        pool_id: object::uid_to_inner(&pool.id),
        sui_added,
        suffer_added,
    });
}

/// Withdraw liquidity. Enforces minimum reserve floor.
public fun withdraw_liquidity(
    pool: &mut SwapPool,
    _admin: &PMAdminCap,
    sui_amount: u64,
    suffer_amount: u64,
    recipient: address,
    ctx: &mut TxContext,
) {
    let sui_reserve = balance::value(&pool.reserve_sui);
    let suffer_reserve = balance::value(&pool.reserve_suffer);

    assert!(sui_reserve >= sui_amount, EInsufficientReserve);
    assert!(suffer_reserve >= suffer_amount, EInsufficientReserve);
    assert!(sui_reserve - sui_amount >= MIN_RESERVE, EBelowMinReserve);
    assert!(suffer_reserve - suffer_amount >= MIN_RESERVE, EBelowMinReserve);

    if (sui_amount > 0) {
        let sui_coin = coin::take(&mut pool.reserve_sui, sui_amount, ctx);
        transfer::public_transfer(sui_coin, recipient);
    };

    if (suffer_amount > 0) {
        let suffer_coin = coin::take(&mut pool.reserve_suffer, suffer_amount, ctx);
        transfer::public_transfer(suffer_coin, recipient);
    };

    event::emit(LiquidityWithdrawnEvent {
        pool_id: object::uid_to_inner(&pool.id),
        sui_withdrawn: sui_amount,
        suffer_withdrawn: suffer_amount,
        recipient,
    });
}

// ── Admin: Config ──

/// Update the swap fee.
public fun update_fee(
    pool: &mut SwapPool,
    _admin: &PMAdminCap,
    new_fee_bps: u64,
) {
    assert!(new_fee_bps < BPS_DENOMINATOR, EFeeBpsTooHigh);
    let old_fee_bps = pool.fee_bps;
    pool.fee_bps = new_fee_bps;

    event::emit(FeeUpdatedEvent {
        pool_id: object::uid_to_inner(&pool.id),
        old_fee_bps,
        new_fee_bps,
    });
}

/// Emergency pause — stops all swaps.
public fun pause(pool: &mut SwapPool, _admin: &PMAdminCap) {
    pool.paused = true;
    event::emit(PoolPausedEvent { pool_id: object::uid_to_inner(&pool.id) });
}

/// Resume after pause.
public fun resume(pool: &mut SwapPool, _admin: &PMAdminCap) {
    pool.paused = false;
    event::emit(PoolResumedEvent { pool_id: object::uid_to_inner(&pool.id) });
}

/// Withdraw accrued protocol fees.
public fun withdraw_fees(
    pool: &mut SwapPool,
    _admin: &PMAdminCap,
    recipient: address,
    ctx: &mut TxContext,
) {
    let sui_amount = balance::value(&pool.accrued_fee_sui);
    let suffer_amount = balance::value(&pool.accrued_fee_suffer);

    if (sui_amount > 0) {
        let sui_coin = coin::take(&mut pool.accrued_fee_sui, sui_amount, ctx);
        transfer::public_transfer(sui_coin, recipient);
    };

    if (suffer_amount > 0) {
        let suffer_coin = coin::take(&mut pool.accrued_fee_suffer, suffer_amount, ctx);
        transfer::public_transfer(suffer_coin, recipient);
    };

    event::emit(FeesWithdrawnEvent {
        pool_id: object::uid_to_inner(&pool.id),
        sui_amount,
        suffer_amount,
        recipient,
    });
}

// ── User: Swap ──

/// Swap SUI for SUFFER.
public fun swap_sui_for_suffer(
    pool: &mut SwapPool,
    sui_in: Coin<SUI>,
    min_suffer_out: u64,
    ctx: &mut TxContext,
): Coin<SUFFER> {
    assert!(!pool.paused, EPoolPaused);
    let sui_amount = coin::value(&sui_in);
    assert!(sui_amount > 0, EZeroInput);

    // Deduct fee from input
    let fee = (((sui_amount as u128) * (pool.fee_bps as u128)) / (BPS_DENOMINATOR as u128)) as u64;
    let effective_in = sui_amount - fee;

    // Compute output
    let r_sui = balance::value(&pool.reserve_sui);
    let r_sfr = balance::value(&pool.reserve_suffer);
    let suffer_out = compute_output(r_sui, r_sfr, effective_in);
    assert!(suffer_out > 0, EZeroOutput);
    assert!(suffer_out >= min_suffer_out, ESlippageExceeded);

    // Execute: deposit SUI, split fee, withdraw SUFFER
    let mut sui_balance = coin::into_balance(sui_in);
    let fee_balance = balance::split(&mut sui_balance, fee);
    balance::join(&mut pool.accrued_fee_sui, fee_balance);
    balance::join(&mut pool.reserve_sui, sui_balance);
    let suffer_balance = balance::split(&mut pool.reserve_suffer, suffer_out);

    pool.total_sui_volume = pool.total_sui_volume + sui_amount;

    event::emit(SwapEvent {
        pool_id: object::uid_to_inner(&pool.id),
        trader: tx_context::sender(ctx),
        direction: 0,
        amount_in: sui_amount,
        amount_out: suffer_out,
        fee,
    });

    coin::from_balance(suffer_balance, ctx)
}

/// Swap SUFFER for SUI.
public fun swap_suffer_for_sui(
    pool: &mut SwapPool,
    suffer_in: Coin<SUFFER>,
    min_sui_out: u64,
    ctx: &mut TxContext,
): Coin<SUI> {
    assert!(!pool.paused, EPoolPaused);
    let suffer_amount = coin::value(&suffer_in);
    assert!(suffer_amount > 0, EZeroInput);

    // Deduct fee from input
    let fee = (((suffer_amount as u128) * (pool.fee_bps as u128)) / (BPS_DENOMINATOR as u128)) as u64;
    let effective_in = suffer_amount - fee;

    // Compute output
    let r_sui = balance::value(&pool.reserve_sui);
    let r_sfr = balance::value(&pool.reserve_suffer);
    let sui_out = compute_output(r_sfr, r_sui, effective_in);
    assert!(sui_out > 0, EZeroOutput);
    assert!(sui_out >= min_sui_out, ESlippageExceeded);

    // Execute: deposit SUFFER, split fee, withdraw SUI
    let mut suffer_balance = coin::into_balance(suffer_in);
    let fee_balance = balance::split(&mut suffer_balance, fee);
    balance::join(&mut pool.accrued_fee_suffer, fee_balance);
    balance::join(&mut pool.reserve_suffer, suffer_balance);
    let sui_balance = balance::split(&mut pool.reserve_sui, sui_out);

    pool.total_suffer_volume = pool.total_suffer_volume + suffer_amount;

    event::emit(SwapEvent {
        pool_id: object::uid_to_inner(&pool.id),
        trader: tx_context::sender(ctx),
        direction: 1,
        amount_in: suffer_amount,
        amount_out: sui_out,
        fee,
    });

    coin::from_balance(sui_balance, ctx)
}

// ── View functions ──

/// Quote: how much SUFFER for a given SUI input?
public fun quote_sui_to_suffer(pool: &SwapPool, sui_amount: u64): (u64, u64) {
    let fee = (((sui_amount as u128) * (pool.fee_bps as u128)) / (BPS_DENOMINATOR as u128)) as u64;
    let effective = sui_amount - fee;
    let r_sui = balance::value(&pool.reserve_sui);
    let r_sfr = balance::value(&pool.reserve_suffer);
    let out = compute_output(r_sui, r_sfr, effective);
    (out, fee)
}

/// Quote: how much SUI for a given SUFFER input?
public fun quote_suffer_to_sui(pool: &SwapPool, suffer_amount: u64): (u64, u64) {
    let fee = (((suffer_amount as u128) * (pool.fee_bps as u128)) / (BPS_DENOMINATOR as u128)) as u64;
    let effective = suffer_amount - fee;
    let r_sui = balance::value(&pool.reserve_sui);
    let r_sfr = balance::value(&pool.reserve_suffer);
    let out = compute_output(r_sfr, r_sui, effective);
    (out, fee)
}

/// Spot price: SUFFER base units per 1 SUI (10^9 MIST).
public fun price_suffer_per_sui(pool: &SwapPool): u64 {
    let r_sui = balance::value(&pool.reserve_sui) as u128;
    let r_sfr = balance::value(&pool.reserve_suffer) as u128;
    ((r_sfr * 1_000_000_000) / r_sui) as u64
}

/// Spot price: MIST per 1 SUFFER (100 base units).
public fun price_sui_per_suffer(pool: &SwapPool): u64 {
    let r_sui = balance::value(&pool.reserve_sui) as u128;
    let r_sfr = balance::value(&pool.reserve_suffer) as u128;
    ((r_sui * 100) / r_sfr) as u64
}

// ── Read accessors ──

public fun reserve_sui(pool: &SwapPool): u64 { balance::value(&pool.reserve_sui) }
public fun reserve_suffer(pool: &SwapPool): u64 { balance::value(&pool.reserve_suffer) }
public fun fee_bps(pool: &SwapPool): u64 { pool.fee_bps }
public fun is_paused(pool: &SwapPool): bool { pool.paused }
public fun accrued_fee_sui(pool: &SwapPool): u64 { balance::value(&pool.accrued_fee_sui) }
public fun accrued_fee_suffer(pool: &SwapPool): u64 { balance::value(&pool.accrued_fee_suffer) }
public fun total_sui_volume(pool: &SwapPool): u64 { pool.total_sui_volume }
public fun total_suffer_volume(pool: &SwapPool): u64 { pool.total_suffer_volume }
