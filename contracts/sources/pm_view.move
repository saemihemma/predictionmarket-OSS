/// PMView — read-only view functions for frontend queries.
/// Aggregates data from multiple modules into convenient accessors.
module prediction_market::pm_view;

use prediction_market::{
    pm_rules,
    pm_market::{Self, PMMarket},
    pm_position::{Self, PMPosition},
    pm_math,
    pm_registry::{Self, PMRegistry, PMConfig},
    pm_treasury::{Self, PMTreasury},
};

// ── Market views ──

/// Get the current implied probability for an outcome in basis points (0-10000).
public fun market_probability_bps(
    market: &PMMarket,
    config: &PMConfig,
    outcome_index: u16,
): u64 {
    pm_math::outcome_probability_bps(
        pm_market::outcome_quantities(market),
        pm_registry::liquidity_param(config),
        outcome_index,
    )
}

/// Check if a market is currently tradeable (OPEN + before close time + not paused).
public fun is_tradeable(
    market: &PMMarket,
    current_time_ms: u64,
): bool {
    pm_market::state(market) == pm_rules::state_open() &&
    current_time_ms < pm_market::close_time_ms(market) &&
    !pm_market::is_emergency_paused(market)
}

/// Check if a market is claimable (RESOLVED + finalized).
public fun is_claimable(market: &PMMarket): bool {
    if (pm_market::state(market) != pm_rules::state_resolved()) {
        return false
    };
    let resolution = pm_market::resolution(market);
    if (option::is_none(resolution)) {
        return false
    };
    let record = option::borrow(resolution);
    pm_market::resolution_finalized(record)
}

/// Check if a market is refundable (INVALID state).
public fun is_refundable(market: &PMMarket): bool {
    pm_market::state(market) == pm_rules::state_invalid()
}

// ── Position views ──
// (winning_outcome() and is_winning_position() removed — see DEAD_CODE_CLEANUP_SUMMARY.md)

/// Estimate the payout for a winning position (gross, before settlement fee).
public fun estimate_claim_payout(
    position: &PMPosition,
): u64 {
    // In the placeholder 1:1 model, payout = quantity
    pm_position::quantity(position)
}

// estimate_refund() removed — see DEAD_CODE_CLEANUP_SUMMARY.md

// ── Protocol stats ──

/// Get total markets created.
public fun total_markets(registry: &PMRegistry): u64 {
    pm_registry::total_markets(registry)
}

/// Get treasury balance.
public fun treasury_balance(treasury: &PMTreasury): u64 {
    pm_treasury::balance(treasury)
}

/// Get total fees collected by treasury.
public fun total_fees_collected(treasury: &PMTreasury): u64 {
    pm_treasury::total_fees_collected(treasury)
}
