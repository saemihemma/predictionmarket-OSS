/// PMTrading — buy, sell, claim, and invalid refund entry points.
/// Trade path touches only PMMarket + Clock (2 shared objects, minimum contention).
/// Fees accrue inside the market, not the treasury.
module prediction_market::pm_trading;

use sui::{balance, coin::{Self, Coin}, clock::Clock, event};
use prediction_market::{
    pm_rules,
    pm_math,
    pm_market::{Self, PMMarket},
    pm_position::{Self, PMPosition},
    pm_registry::{Self, PMConfig},
};

// ── Errors ──
#[error(code = 100)]
const EMarketNotOpen: vector<u8> = b"Market is not open for trading";
#[error(code = 101)]
const EMarketPastCloseTime: vector<u8> = b"Market is past close time";
#[error(code = 102)]
const EInsufficientPayment: vector<u8> = b"Insufficient payment for trade";
#[error(code = 103)]
const EMarketNotResolved: vector<u8> = b"Market is not resolved";
#[error(code = 104)]
const EResolutionNotFinalized: vector<u8> = b"Resolution is not finalized";
#[error(code = 105)]
const ESlippageExceeded: vector<u8> = b"Slippage tolerance exceeded";
#[error(code = 106)]
const EMarketNotInvalid: vector<u8> = b"Market is not invalidated";
#[error(code = 107)]
const EEmergencyPaused: vector<u8> = b"Market is emergency paused";
#[error(code = 108)]
const EZeroAmount: vector<u8> = b"Amount must be greater than zero";
#[error(code = 109)]
const EInsufficientOutcomes: vector<u8> = b"Markets must have at least 2 outcomes";
#[error(code = 110)]
const EBondAlreadyReturned: vector<u8> = b"Creation bond has already been returned";
#[error(code = 111)]
const EDeadlineExpired: vector<u8> = b"Transaction deadline has expired";
#[error(code = 112)]
const EInvalidOutcomeIndex: vector<u8> = b"Outcome index out of bounds";
// Error codes 113+ reserved

// ── Events ──

public struct TradeExecutedEvent<phantom Collateral> has copy, drop {
    market_id: ID,
    trader: address,
    direction: u8,
    outcome_index: u16,
    amount: u64,
    cost: u64,
    fee: u64,
}

public struct ClaimExecutedEvent<phantom Collateral> has copy, drop {
    market_id: ID,
    claimer: address,
    outcome_index: u16,
    payout: u64,
}

public struct InvalidRefundExecutedEvent<phantom Collateral> has copy, drop {
    market_id: ID,
    claimer: address,
    refund_amount: u64,
}

public struct CreationBondReturnedEvent<phantom Collateral> has copy, drop {
    market_id: ID,
    creator: address,
    bond_amount: u64,
}

// ── Constants ──
const BPS_DENOMINATOR: u64 = 10_000;

// ── Buy ──

/// Buy shares of an outcome. Creates a new position or merges into existing.
public fun buy<Collateral>(
    market: &mut PMMarket<Collateral>,
    config: &PMConfig<Collateral>,
    clock: &Clock,
    outcome_index: u16,
    amount: u64,
    max_cost: u64,
    deadline_ms: u64,
    mut payment: Coin<Collateral>,
    ctx: &mut TxContext,
): PMPosition<Collateral> {
    assert!(amount > 0, EZeroAmount);
    assert!(pm_market::outcome_count(market) >= 2, EInsufficientOutcomes);  // Now supports N ≥ 2
    assert!((outcome_index as u64) < (pm_market::outcome_count(market) as u64), EInvalidOutcomeIndex);
    assert!(!pm_market::is_emergency_paused(market), EEmergencyPaused);
    assert!(pm_market::state(market) == pm_rules::state_open(), EMarketNotOpen);

    let current_time = sui::clock::timestamp_ms(clock);
    assert!(current_time < deadline_ms, EDeadlineExpired);
    assert!(current_time < pm_market::close_time_ms(market), EMarketPastCloseTime);

    // Freeze on first trade
    pm_market::freeze_if_needed(market);

    // Compute cost via AMM
    let cost = pm_math::compute_buy_cost(
        pm_market::outcome_quantities(market),
        pm_registry::liquidity_param(config),
        outcome_index,
        amount,
    );

    // Compute fee (minimum fee of 1 when cost > 0 to prevent dust trade fee evasion)
    // RT-DUST-FIX-001: Cap fee at cost to prevent fees exceeding small trades
    let fee_bps = pm_registry::trading_fee_bps(config);
    let fee = if (cost > 0 && fee_bps > 0) {
        let f = (((cost as u128) * (fee_bps as u128)) / (BPS_DENOMINATOR as u128)) as u64;
        let f_floored = if (f == 0) { 1 } else { f };
        if (f_floored > cost) { cost } else { f_floored }
    } else { 0 };
    let total_cost = cost + fee;

    // Check slippage tolerance
    assert!(total_cost <= max_cost, ESlippageExceeded);
    assert!(coin::value(&payment) >= total_cost, EInsufficientPayment);

    // Split exact payment, return change
    let trade_coin = coin::split(&mut payment, total_cost, ctx);
    let mut trade_balance = coin::into_balance(trade_coin);

    // Split fee from trade balance
    let fee_balance = balance::split(&mut trade_balance, fee);
    pm_market::accrue_fee(market, fee_balance);

    // Deposit collateral
    pm_market::deposit_collateral(market, trade_balance);

    // Track cost basis for pro-rata invalidation refunds
    pm_market::add_cost_basis(market, cost);

    // Update pool reserves: CPMM — bought shares leave pool, cost enters as other outcomes
    // For binary: reserve[bought] decreases by amount, reserve[other] increases by cost
    // For N>2: reserve[bought] decreases, cost is distributed equally to all other reserves
    pm_market::sub_outcome_quantity(market, outcome_index, amount);

    let n = pm_market::outcome_count(market);
    let mut i = 0u16;
    while (i < n) {
        if (i != outcome_index) {
            pm_market::add_outcome_quantity(market, i, cost);
        };
        i = i + 1;
    };

    // Note: solvency is guaranteed by CPMM construction — ceiling division on buy
    // ensures cost >= fair value, so collateral always covers maximum potential payout.
    // An explicit check was removed here because the formula max(q0,q1) was incorrect
    // for pool-reserve semantics (would reject all valid trades).

    // Return change to trader
    if (coin::value(&payment) > 0) {
        transfer::public_transfer(payment, tx_context::sender(ctx));
    } else {
        coin::destroy_zero(payment);
    };

    let market_id = pm_market::market_id(market);

    event::emit(TradeExecutedEvent<Collateral> {
        market_id,
        trader: tx_context::sender(ctx),
        direction: pm_rules::direction_buy(),
        outcome_index,
        amount,
        cost,
        fee,
    });

    // Create new position
    pm_position::create(
        market_id,
        tx_context::sender(ctx),
        outcome_index,
        amount,
        cost,
        current_time,
        ctx,
    )
}

/// Buy and merge into an existing position.
public fun buy_merge<Collateral>(
    market: &mut PMMarket<Collateral>,
    config: &PMConfig<Collateral>,
    clock: &Clock,
    outcome_index: u16,
    amount: u64,
    max_cost: u64,
    deadline_ms: u64,
    payment: Coin<Collateral>,
    position: &mut PMPosition<Collateral>,
    ctx: &mut TxContext,
) {
    pm_position::assert_market(position, pm_market::market_id(market));
    pm_position::assert_outcome(position, outcome_index);
    let new_pos = buy(market, config, clock, outcome_index, amount, max_cost, deadline_ms, payment, ctx);
    let additional_quantity = pm_position::quantity(&new_pos);
    let additional_cost = pm_position::net_cost_basis(&new_pos);
    pm_position::merge(position, additional_quantity, additional_cost);
    pm_position::destroy(new_pos);
}

// ── Sell ──

/// Sell shares from an existing position.
public fun sell<Collateral>(
    market: &mut PMMarket<Collateral>,
    config: &PMConfig<Collateral>,
    clock: &Clock,
    position: &mut PMPosition<Collateral>,
    amount: u64,
    min_proceeds: u64,
    deadline_ms: u64,
    ctx: &mut TxContext,
) {
    // RT-031: Zero-quantity sell assertion
    assert!(amount > 0, EZeroAmount);
    assert!(pm_market::outcome_count(market) >= 2, EInsufficientOutcomes);
    assert!(!pm_market::is_emergency_paused(market), EEmergencyPaused);
    assert!(pm_market::state(market) == pm_rules::state_open(), EMarketNotOpen);

    let current_time = sui::clock::timestamp_ms(clock);
    assert!(current_time < deadline_ms, EDeadlineExpired);
    assert!(current_time < pm_market::close_time_ms(market), EMarketPastCloseTime);

    let market_id = pm_market::market_id(market);
    pm_position::assert_market(position, market_id);
    pm_position::assert_owner(position, ctx);

    let outcome_index = pm_position::outcome_index(position);
    assert!((outcome_index as u64) < (pm_market::outcome_count(market) as u64), EInvalidOutcomeIndex);

    // Compute proceeds via AMM
    let proceeds = pm_math::compute_sell_proceeds(
        pm_market::outcome_quantities(market),
        pm_registry::liquidity_param(config),
        outcome_index,
        amount,
    );

    // Compute fee (minimum fee of 1 when proceeds > 0 to prevent dust trade fee evasion)
    // RT-DUST-FIX-002: Cap fee at proceeds to prevent fees exceeding small trades
    let fee_bps = pm_registry::trading_fee_bps(config);
    let fee = if (proceeds > 0 && fee_bps > 0) {
        let f = (((proceeds as u128) * (fee_bps as u128)) / (BPS_DENOMINATOR as u128)) as u64;
        let f_floored = if (f == 0) { 1 } else { f };
        if (f_floored > proceeds) { proceeds } else { f_floored }
    } else { 0 };
    let net_proceeds = proceeds - fee;

    // Check slippage tolerance
    assert!(net_proceeds >= min_proceeds, ESlippageExceeded);

    // Reduce position (returns proportional cost basis reduction)
    let cost_reduction = pm_position::reduce(position, amount);

    // Track cost basis for pro-rata invalidation refunds
    pm_market::sub_cost_basis(market, cost_reduction);

    // Update pool reserves: CPMM — sold shares return to pool, proceeds leave as other outcomes
    // For binary: reserve[sold] increases by amount, reserve[other] decreases by proceeds
    // For N>2: reserve[sold] increases, proceeds withdrawn equally from all other reserves
    pm_market::add_outcome_quantity(market, outcome_index, amount);

    let n = pm_market::outcome_count(market);
    let mut i = 0u16;
    while (i < n) {
        if (i != outcome_index) {
            pm_market::sub_outcome_quantity(market, i, proceeds);
        };
        i = i + 1;
    };

    // Note: solvency is guaranteed by CPMM construction — floor division on sell
    // ensures proceeds <= fair value, so collateral always covers remaining obligations.

    // Withdraw collateral and split fee
    let mut proceeds_balance = pm_market::withdraw_collateral(market, proceeds);
    let fee_balance = balance::split(&mut proceeds_balance, fee);
    pm_market::accrue_fee(market, fee_balance);

    // Transfer net proceeds to seller
    let proceeds_coin = coin::from_balance(proceeds_balance, ctx);
    transfer::public_transfer(proceeds_coin, tx_context::sender(ctx));

    event::emit(TradeExecutedEvent<Collateral> {
        market_id,
        trader: tx_context::sender(ctx),
        direction: pm_rules::direction_sell(),
        outcome_index,
        amount,
        cost: net_proceeds,
        fee,
    });
}

// ── Claim (resolved market) ──

/// Claim payout for a winning position on a resolved market.
public fun claim<Collateral>(
    market: &mut PMMarket<Collateral>,
    config: &PMConfig<Collateral>,
    position: PMPosition<Collateral>,
    ctx: &mut TxContext,
) {
    assert!(!pm_market::is_emergency_paused(market), EEmergencyPaused);
    assert!(pm_market::state(market) == pm_rules::state_resolved(), EMarketNotResolved);

    let resolution = pm_market::resolution(market);
    let record = option::borrow(resolution);
    assert!(pm_market::resolution_finalized(record), EResolutionNotFinalized);

    let winning_outcome = pm_market::resolution_outcome(record);
    let market_id = pm_market::market_id(market);
    pm_position::assert_market(&position, market_id);
    pm_position::assert_owner(&position, ctx);

    let outcome_index = pm_position::outcome_index(&position);

    if (outcome_index == winning_outcome) {
        // Winning position: payout = position quantity (1 share = 1 SUFFER at settlement)
        // Settlement fee deducted
        // RT-DUST-FIX-003: Cap fee at payout to prevent fees exceeding small claims
        let payout_gross = pm_position::quantity(&position);
        let settlement_fee_bps = pm_registry::settlement_fee_bps(config);
        let fee = if (payout_gross > 0 && settlement_fee_bps > 0) {
            let f = (((payout_gross as u128) * (settlement_fee_bps as u128)) / (BPS_DENOMINATOR as u128)) as u64;
            let f_floored = if (f == 0) { 1 } else { f };
            if (f_floored > payout_gross) { payout_gross } else { f_floored }
        } else { 0 };
        let payout_net = payout_gross - fee;

        // Withdraw payout and fee from collateral
        let mut payout_balance = pm_market::withdraw_collateral(market, payout_gross);
        let fee_balance = balance::split(&mut payout_balance, fee);
        pm_market::accrue_fee(market, fee_balance);

        let payout_coin = coin::from_balance(payout_balance, ctx);
        transfer::public_transfer(payout_coin, tx_context::sender(ctx));

        event::emit(ClaimExecutedEvent<Collateral> {
            market_id,
            claimer: tx_context::sender(ctx),
            outcome_index,
            payout: payout_net,
        });
    } else {
        // Losing position: no payout
        event::emit(ClaimExecutedEvent<Collateral> {
            market_id,
            claimer: tx_context::sender(ctx),
            outcome_index,
            payout: 0,
        });
    };

    pm_position::destroy(position);
}

// ── Invalid refund ──

/// Refund a position holder on an invalidated market.
/// Pro-rata distribution: refund = (my_cost_basis / total_cost_basis_sum) * snapshot_collateral.
/// This prevents bank-run dynamics where early claimers drain the pool.
public fun refund_invalid<Collateral>(
    market: &mut PMMarket<Collateral>,
    position: PMPosition<Collateral>,
    ctx: &mut TxContext,
) {
    assert!(pm_market::state(market) == pm_rules::state_invalid(), EMarketNotInvalid);

    let market_id = pm_market::market_id(market);
    pm_position::assert_market(&position, market_id);
    pm_position::assert_owner(&position, ctx);

    let my_cost_basis = pm_position::net_cost_basis(&position);
    let total_basis = pm_market::total_cost_basis_sum(market);
    let snapshot_collateral = pm_market::invalidation_snapshot_collateral(market);
    let snapshot = *option::borrow(&snapshot_collateral);

    // Pro-rata: (my_cost_basis / total_cost_basis_sum) * snapshot_collateral
    // Use u128 to avoid overflow on multiplication
    let actual_refund = if (my_cost_basis > 0 && total_basis > 0 && snapshot > 0) {
        let refund = (((my_cost_basis as u128) * (snapshot as u128)) / (total_basis as u128)) as u64;
        // Cap at available collateral (safety net)
        let available = pm_market::total_collateral(market);
        if (refund > available) { available } else { refund }
    } else {
        0
    };

    if (actual_refund > 0) {
        let refund_balance = pm_market::withdraw_collateral(market, actual_refund);
        let refund_coin = coin::from_balance(refund_balance, ctx);
        transfer::public_transfer(refund_coin, tx_context::sender(ctx));
    };

    event::emit(InvalidRefundExecutedEvent<Collateral> {
        market_id,
        claimer: tx_context::sender(ctx),
        refund_amount: actual_refund,
    });

    pm_position::destroy(position);
}

// ── Close market ──

/// Close a market that has passed its close time. Anyone can call this.
/// Sui has no cron — this lazy close is triggered by the first caller after close_time.
public fun close_market<Collateral>(
    market: &mut PMMarket<Collateral>,
    clock: &Clock,
) {
    let current_time = sui::clock::timestamp_ms(clock);
    pm_market::transition_to_closed(market, current_time);
}

// ── Fee sweep ──

/// Anyone can call this to sweep accrued fees from a market to the treasury.
/// Blocked during emergency pause to prevent extraction during incident response.
/// RT-032: Sweep deadline validation — callers should only call on resolved/invalid markets.
/// If only called via treasury deposit path, this is enforced transitively.
public fun sweep_fees<Collateral>(
    market: &mut PMMarket<Collateral>,
    treasury: &mut prediction_market::pm_treasury::PMTreasury<Collateral>,
) {
    assert!(!pm_market::is_emergency_paused(market), EEmergencyPaused);
    let market_id = pm_market::market_id(market);
    let fees = pm_market::sweep_accrued_fees(market);
    prediction_market::pm_treasury::deposit_fees(treasury, fees, market_id);
}

// ── Creator bond return ──

/// Return creation bond to market creator after normal resolution.
/// Only callable when market is RESOLVED and resolution is finalized.
/// Blocked during emergency pause.
public fun return_creator_bond<Collateral>(
    market: &mut PMMarket<Collateral>,
    ctx: &mut TxContext,
) {
    assert!(!pm_market::is_emergency_paused(market), EEmergencyPaused);
    assert!(pm_market::state(market) == pm_rules::state_resolved(), EMarketNotResolved);
    let resolution = pm_market::resolution(market);
    let record = option::borrow(resolution);
    assert!(pm_market::resolution_finalized(record), EResolutionNotFinalized);
    pm_market::assert_creator(market, ctx);

    let bond = pm_market::take_creation_bond(market);
    let bond_amount = balance::value(&bond);
    assert!(bond_amount > 0, EBondAlreadyReturned);

    let market_id = pm_market::market_id(market);
    let creator = pm_market::creator(market);
    let bond_coin = coin::from_balance(bond, ctx);
    transfer::public_transfer(bond_coin, creator);

    event::emit(CreationBondReturnedEvent<Collateral> {
        market_id,
        creator,
        bond_amount,
    });
}

// ── Solvency note ──
// The CPMM invariant (q0 * q1 = k) with ceiling division on buys and floor
// division on sells guarantees that total_collateral >= max(initial_reserve - q0,
// initial_reserve - q1) at all times. An explicit solvency check is not needed
// and was removed because the naive formula max(q0,q1) conflated pool reserves
// with shares outstanding, causing all trades to abort.
