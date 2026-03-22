/// SwapPool — protocol-owned SUI/SUFFER constant-product swap pool.
/// Lets users swap SUI↔SUFFER in-app without needing an external DEX.
/// Admin seeds liquidity; fee on every swap accrues to protocol.
///
/// UPGRADE NOTE: accrued_fee_sui and accrued_fee_suffer live inside the
/// SwapPool struct. Before any package upgrade that changes the struct
/// layout, admin MUST call withdraw_fees first to drain fee balances.
module prediction_market::swap_pool;

use sui::{balance::{Self, Balance}, coin::{Self, Coin}, sui::SUI, event};
use prediction_market::pm_registry::PMAdminCap;

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

public struct PoolCreatedEvent<phantom Collateral> has copy, drop {
    pool_id: ID,
    initial_sui: u64,
    initial_collateral: u64,
    fee_bps: u64,
}

public struct SwapEvent<phantom Collateral> has copy, drop {
    pool_id: ID,
    trader: address,
    /// 0 = SUI→Collateral, 1 = Collateral→SUI
    direction: u8,
    amount_in: u64,
    amount_out: u64,
    fee: u64,
}

public struct LiquidityAddedEvent<phantom Collateral> has copy, drop {
    pool_id: ID,
    sui_added: u64,
    collateral_added: u64,
}

public struct LiquidityWithdrawnEvent<phantom Collateral> has copy, drop {
    pool_id: ID,
    sui_withdrawn: u64,
    collateral_withdrawn: u64,
    recipient: address,
}

public struct FeeUpdatedEvent<phantom Collateral> has copy, drop {
    pool_id: ID,
    old_fee_bps: u64,
    new_fee_bps: u64,
}

public struct PoolPausedEvent<phantom Collateral> has copy, drop {
    pool_id: ID,
}

public struct PoolResumedEvent<phantom Collateral> has copy, drop {
    pool_id: ID,
}

public struct FeesWithdrawnEvent<phantom Collateral> has copy, drop {
    pool_id: ID,
    sui_amount: u64,
    collateral_amount: u64,
    recipient: address,
}

// ── Pool struct ──

public struct SwapPool<phantom Collateral> has key {
    id: UID,
    reserve_sui: Balance<SUI>,
    reserve_collateral: Balance<Collateral>,
    fee_bps: u64,
    accrued_fee_sui: Balance<SUI>,
    accrued_fee_collateral: Balance<Collateral>,
    paused: bool,
    total_sui_volume: u64,
    total_collateral_volume: u64,
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
public fun create_pool<Collateral>(
    _admin: &PMAdminCap<Collateral>,
    sui_liquidity: Coin<SUI>,
    collateral_liquidity: Coin<Collateral>,
    fee_bps: u64,
    ctx: &mut TxContext,
) {
    assert!(fee_bps < BPS_DENOMINATOR, EFeeBpsTooHigh);
    assert!(coin::value(&sui_liquidity) > 0, EZeroLiquidity);
    assert!(coin::value(&collateral_liquidity) > 0, EZeroLiquidity);

    let initial_sui = coin::value(&sui_liquidity);
    let initial_collateral = coin::value(&collateral_liquidity);

    let pool = SwapPool<Collateral> {
        id: object::new(ctx),
        reserve_sui: coin::into_balance(sui_liquidity),
        reserve_collateral: coin::into_balance(collateral_liquidity),
        fee_bps,
        accrued_fee_sui: balance::zero(),
        accrued_fee_collateral: balance::zero(),
        paused: false,
        total_sui_volume: 0,
        total_collateral_volume: 0,
    };

    event::emit(PoolCreatedEvent<Collateral> {
        pool_id: object::uid_to_inner(&pool.id),
        initial_sui,
        initial_collateral,
        fee_bps,
    });

    transfer::share_object(pool);
}

// ── Admin: Liquidity management ──

/// Add more liquidity to one or both sides.
public fun add_liquidity<Collateral>(
    pool: &mut SwapPool<Collateral>,
    _admin: &PMAdminCap<Collateral>,
    sui_coin: Coin<SUI>,
    collateral_coin: Coin<Collateral>,
) {
    let sui_added = coin::value(&sui_coin);
    let collateral_added = coin::value(&collateral_coin);

    if (sui_added > 0) {
        balance::join(&mut pool.reserve_sui, coin::into_balance(sui_coin));
    } else {
        coin::destroy_zero(sui_coin);
    };

    if (collateral_added > 0) {
        balance::join(&mut pool.reserve_collateral, coin::into_balance(collateral_coin));
    } else {
        coin::destroy_zero(collateral_coin);
    };

    event::emit(LiquidityAddedEvent<Collateral> {
        pool_id: object::uid_to_inner(&pool.id),
        sui_added,
        collateral_added,
    });
}

/// Withdraw liquidity. Enforces minimum reserve floor.
public fun withdraw_liquidity<Collateral>(
    pool: &mut SwapPool<Collateral>,
    _admin: &PMAdminCap<Collateral>,
    sui_amount: u64,
    collateral_amount: u64,
    recipient: address,
    ctx: &mut TxContext,
) {
    let sui_reserve = balance::value(&pool.reserve_sui);
    let collateral_reserve = balance::value(&pool.reserve_collateral);

    assert!(sui_reserve >= sui_amount, EInsufficientReserve);
    assert!(collateral_reserve >= collateral_amount, EInsufficientReserve);
    assert!(sui_reserve - sui_amount >= MIN_RESERVE, EBelowMinReserve);
    assert!(collateral_reserve - collateral_amount >= MIN_RESERVE, EBelowMinReserve);

    if (sui_amount > 0) {
        let sui_coin = coin::take(&mut pool.reserve_sui, sui_amount, ctx);
        transfer::public_transfer(sui_coin, recipient);
    };

    if (collateral_amount > 0) {
        let collateral_coin = coin::take(&mut pool.reserve_collateral, collateral_amount, ctx);
        transfer::public_transfer(collateral_coin, recipient);
    };

    event::emit(LiquidityWithdrawnEvent<Collateral> {
        pool_id: object::uid_to_inner(&pool.id),
        sui_withdrawn: sui_amount,
        collateral_withdrawn: collateral_amount,
        recipient,
    });
}

// ── Admin: Config ──

/// Update the swap fee.
public fun update_fee<Collateral>(
    pool: &mut SwapPool<Collateral>,
    _admin: &PMAdminCap<Collateral>,
    new_fee_bps: u64,
) {
    assert!(new_fee_bps < BPS_DENOMINATOR, EFeeBpsTooHigh);
    let old_fee_bps = pool.fee_bps;
    pool.fee_bps = new_fee_bps;

    event::emit(FeeUpdatedEvent<Collateral> {
        pool_id: object::uid_to_inner(&pool.id),
        old_fee_bps,
        new_fee_bps,
    });
}

/// Emergency pause — stops all swaps.
public fun pause<Collateral>(pool: &mut SwapPool<Collateral>, _admin: &PMAdminCap<Collateral>) {
    pool.paused = true;
    event::emit(PoolPausedEvent<Collateral> { pool_id: object::uid_to_inner(&pool.id) });
}

/// Resume after pause.
public fun resume<Collateral>(pool: &mut SwapPool<Collateral>, _admin: &PMAdminCap<Collateral>) {
    pool.paused = false;
    event::emit(PoolResumedEvent<Collateral> { pool_id: object::uid_to_inner(&pool.id) });
}

/// Withdraw accrued protocol fees.
public fun withdraw_fees<Collateral>(
    pool: &mut SwapPool<Collateral>,
    _admin: &PMAdminCap<Collateral>,
    recipient: address,
    ctx: &mut TxContext,
) {
    let sui_amount = balance::value(&pool.accrued_fee_sui);
    let collateral_amount = balance::value(&pool.accrued_fee_collateral);

    if (sui_amount > 0) {
        let sui_coin = coin::take(&mut pool.accrued_fee_sui, sui_amount, ctx);
        transfer::public_transfer(sui_coin, recipient);
    };

    if (collateral_amount > 0) {
        let collateral_coin = coin::take(&mut pool.accrued_fee_collateral, collateral_amount, ctx);
        transfer::public_transfer(collateral_coin, recipient);
    };

    event::emit(FeesWithdrawnEvent<Collateral> {
        pool_id: object::uid_to_inner(&pool.id),
        sui_amount,
        collateral_amount,
        recipient,
    });
}

// ── User: Swap ──

/// Swap SUI for SUFFER.
public fun swap_sui_for_collateral<Collateral>(
    pool: &mut SwapPool<Collateral>,
    sui_in: Coin<SUI>,
    min_collateral_out: u64,
    ctx: &mut TxContext,
): Coin<Collateral> {
    assert!(!pool.paused, EPoolPaused);
    let sui_amount = coin::value(&sui_in);
    assert!(sui_amount > 0, EZeroInput);

    // Deduct fee from input
    let fee = (((sui_amount as u128) * (pool.fee_bps as u128)) / (BPS_DENOMINATOR as u128)) as u64;
    let effective_in = sui_amount - fee;

    // Compute output
    let r_sui = balance::value(&pool.reserve_sui);
    let r_collateral = balance::value(&pool.reserve_collateral);
    let collateral_out = compute_output(r_sui, r_collateral, effective_in);
    assert!(collateral_out > 0, EZeroOutput);
    assert!(collateral_out >= min_collateral_out, ESlippageExceeded);

    // Execute: deposit SUI, split fee, withdraw SUFFER
    let mut sui_balance = coin::into_balance(sui_in);
    let fee_balance = balance::split(&mut sui_balance, fee);
    balance::join(&mut pool.accrued_fee_sui, fee_balance);
    balance::join(&mut pool.reserve_sui, sui_balance);
    let collateral_balance = balance::split(&mut pool.reserve_collateral, collateral_out);

    pool.total_sui_volume = pool.total_sui_volume + sui_amount;

    event::emit(SwapEvent<Collateral> {
        pool_id: object::uid_to_inner(&pool.id),
        trader: tx_context::sender(ctx),
        direction: 0,
        amount_in: sui_amount,
        amount_out: collateral_out,
        fee,
    });

    coin::from_balance(collateral_balance, ctx)
}

/// Swap SUFFER for SUI.
public fun swap_collateral_for_sui<Collateral>(
    pool: &mut SwapPool<Collateral>,
    collateral_in: Coin<Collateral>,
    min_sui_out: u64,
    ctx: &mut TxContext,
): Coin<SUI> {
    assert!(!pool.paused, EPoolPaused);
    let collateral_amount = coin::value(&collateral_in);
    assert!(collateral_amount > 0, EZeroInput);

    // Deduct fee from input
    let fee = (((collateral_amount as u128) * (pool.fee_bps as u128)) / (BPS_DENOMINATOR as u128)) as u64;
    let effective_in = collateral_amount - fee;

    // Compute output
    let r_sui = balance::value(&pool.reserve_sui);
    let r_collateral = balance::value(&pool.reserve_collateral);
    let sui_out = compute_output(r_collateral, r_sui, effective_in);
    assert!(sui_out > 0, EZeroOutput);
    assert!(sui_out >= min_sui_out, ESlippageExceeded);

    // Execute: deposit SUFFER, split fee, withdraw SUI
    let mut collateral_balance = coin::into_balance(collateral_in);
    let fee_balance = balance::split(&mut collateral_balance, fee);
    balance::join(&mut pool.accrued_fee_collateral, fee_balance);
    balance::join(&mut pool.reserve_collateral, collateral_balance);
    let sui_balance = balance::split(&mut pool.reserve_sui, sui_out);

    pool.total_collateral_volume = pool.total_collateral_volume + collateral_amount;

    event::emit(SwapEvent<Collateral> {
        pool_id: object::uid_to_inner(&pool.id),
        trader: tx_context::sender(ctx),
        direction: 1,
        amount_in: collateral_amount,
        amount_out: sui_out,
        fee,
    });

    coin::from_balance(sui_balance, ctx)
}

// ── View functions ──

/// Quote: how much collateral for a given SUI input?
public fun quote_sui_to_collateral<Collateral>(pool: &SwapPool<Collateral>, sui_amount: u64): (u64, u64) {
    let fee = (((sui_amount as u128) * (pool.fee_bps as u128)) / (BPS_DENOMINATOR as u128)) as u64;
    let effective = sui_amount - fee;
    let r_sui = balance::value(&pool.reserve_sui);
    let r_collateral = balance::value(&pool.reserve_collateral);
    let out = compute_output(r_sui, r_collateral, effective);
    (out, fee)
}

/// Quote: how much SUI for a given collateral input?
public fun quote_collateral_to_sui<Collateral>(pool: &SwapPool<Collateral>, collateral_amount: u64): (u64, u64) {
    let fee = (((collateral_amount as u128) * (pool.fee_bps as u128)) / (BPS_DENOMINATOR as u128)) as u64;
    let effective = collateral_amount - fee;
    let r_sui = balance::value(&pool.reserve_sui);
    let r_collateral = balance::value(&pool.reserve_collateral);
    let out = compute_output(r_collateral, r_sui, effective);
    (out, fee)
}

/// Spot price: collateral base units per 1 SUI (10^9 MIST).
public fun price_collateral_per_sui<Collateral>(pool: &SwapPool<Collateral>): u64 {
    let r_sui = balance::value(&pool.reserve_sui) as u128;
    let r_collateral = balance::value(&pool.reserve_collateral) as u128;
    ((r_collateral * 1_000_000_000) / r_sui) as u64
}

/// Spot price: MIST per 1 collateral base unit.
public fun price_sui_per_collateral<Collateral>(pool: &SwapPool<Collateral>): u64 {
    let r_sui = balance::value(&pool.reserve_sui) as u128;
    let r_collateral = balance::value(&pool.reserve_collateral) as u128;
    (r_sui / r_collateral) as u64
}

// ── Read accessors ──

public fun reserve_sui<Collateral>(pool: &SwapPool<Collateral>): u64 { balance::value(&pool.reserve_sui) }
public fun reserve_collateral<Collateral>(pool: &SwapPool<Collateral>): u64 { balance::value(&pool.reserve_collateral) }
public fun fee_bps<Collateral>(pool: &SwapPool<Collateral>): u64 { pool.fee_bps }
public fun is_paused<Collateral>(pool: &SwapPool<Collateral>): bool { pool.paused }
public fun accrued_fee_sui<Collateral>(pool: &SwapPool<Collateral>): u64 { balance::value(&pool.accrued_fee_sui) }
public fun accrued_fee_collateral<Collateral>(pool: &SwapPool<Collateral>): u64 { balance::value(&pool.accrued_fee_collateral) }
public fun total_sui_volume<Collateral>(pool: &SwapPool<Collateral>): u64 { pool.total_sui_volume }
public fun total_collateral_volume<Collateral>(pool: &SwapPool<Collateral>): u64 { pool.total_collateral_volume }
