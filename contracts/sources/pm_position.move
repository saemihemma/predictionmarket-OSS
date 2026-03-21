/// PMPosition — aggregate user position per (user, market, outcome).
/// Owned object, transferred to trader. Merged on repeat buys.
/// Not transferable in v1. Tracks net_cost_basis for invalidation refunds.
module prediction_market::pm_position;

// ── Errors ──
#[error(code = 0)]
const EPositionMarketMismatch: vector<u8> = b"Position does not belong to this market";
#[error(code = 1)]
const EPositionOutcomeMismatch: vector<u8> = b"Position outcome does not match";
#[error(code = 2)]
const EInsufficientQuantity: vector<u8> = b"Insufficient position quantity for sell";
#[error(code = 3)]
const EPositionOwnerMismatch: vector<u8> = b"Position owner does not match sender";

/// Aggregate position: one per (user, market, outcome).
public struct PMPosition has key, store {
    id: UID,
    market_id: ID,
    owner: address,
    outcome_index: u16,
    quantity: u64,
    /// Net collateral paid in minus collateral received from sells.
    /// Used for invalidation refund calculation.
    /// Accounting: incremented by buy cost, decremented proportionally on sell
    /// (proportional = net_cost_basis * quantity_sold / quantity_held).
    net_cost_basis: u64,
    created_at_ms: u64,
}

// ── Creation ──

/// Create a new position for a first-time buyer of this outcome.
public(package) fun create(
    market_id: ID,
    owner: address,
    outcome_index: u16,
    quantity: u64,
    cost: u64,
    current_time_ms: u64,
    ctx: &mut TxContext,
): PMPosition {
    PMPosition {
        id: object::new(ctx),
        market_id,
        owner,
        outcome_index,
        quantity,
        net_cost_basis: cost,
        created_at_ms: current_time_ms,
    }
}

// ── Merge (repeat buy) ──

/// Merge additional shares into an existing position.
/// Called when user buys more of the same outcome on the same market.
public(package) fun merge(
    position: &mut PMPosition,
    additional_quantity: u64,
    additional_cost: u64,
) {
    position.quantity = position.quantity + additional_quantity;
    position.net_cost_basis = position.net_cost_basis + additional_cost;
}

// ── Partial sell ──

/// Reduce position by sold quantity. Returns the proportional cost basis reduction.
/// Accounting: cost_reduction = net_cost_basis * quantity_sold / quantity_held
public(package) fun reduce(
    position: &mut PMPosition,
    quantity_sold: u64,
): u64 {
    assert!(position.quantity >= quantity_sold, EInsufficientQuantity);

    // Proportional cost basis reduction
    let cost_reduction = if (quantity_sold == position.quantity) {
        position.net_cost_basis
    } else {
        // Integer division: net_cost_basis * quantity_sold / quantity_held
        (((position.net_cost_basis as u128) * (quantity_sold as u128)) / (position.quantity as u128)) as u64
    };

    position.quantity = position.quantity - quantity_sold;
    position.net_cost_basis = position.net_cost_basis - cost_reduction;

    cost_reduction
}

/// Check if position is fully depleted (zero quantity).
public fun is_empty(position: &PMPosition): bool {
    position.quantity == 0
}

// ── Read accessors ──

public fun market_id(p: &PMPosition): ID { p.market_id }
public fun owner(p: &PMPosition): address { p.owner }
public fun outcome_index(p: &PMPosition): u16 { p.outcome_index }
public fun quantity(p: &PMPosition): u64 { p.quantity }
public fun net_cost_basis(p: &PMPosition): u64 { p.net_cost_basis }
public fun created_at_ms(p: &PMPosition): u64 { p.created_at_ms }

// ── Assertions ──

public fun assert_market(position: &PMPosition, market_id: ID) {
    assert!(position.market_id == market_id, EPositionMarketMismatch);
}

public fun assert_outcome(position: &PMPosition, outcome_index: u16) {
    assert!(position.outcome_index == outcome_index, EPositionOutcomeMismatch);
}

public fun assert_owner(position: &PMPosition, ctx: &TxContext) {
    assert!(position.owner == tx_context::sender(ctx), EPositionOwnerMismatch);
}

// ── Destroy ──

/// Destroy an empty position.
public(package) fun destroy_empty(position: PMPosition) {
    let PMPosition { id, market_id: _, owner: _, outcome_index: _, quantity: _, net_cost_basis: _, created_at_ms: _ } = position;
    object::delete(id);
}

/// Destroy a position during claim or invalid refund (may have non-zero quantity).
public(package) fun destroy(position: PMPosition) {
    let PMPosition { id, market_id: _, owner: _, outcome_index: _, quantity: _, net_cost_basis: _, created_at_ms: _ } = position;
    object::delete(id);
}
