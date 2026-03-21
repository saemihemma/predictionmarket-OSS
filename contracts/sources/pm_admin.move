/// PMAdmin — admin orchestration module.
/// Admin powers are restricted: no post-trade invalidation via admin alone.
/// Emergency actions require PMEmergencyCap (separate from PMAdminCap).
module prediction_market::pm_admin;

use std::string::String;
use sui::{clock::Clock, event};
use prediction_market::{
    pm_rules,
    pm_registry::{PMRegistry, PMConfig, PMAdminCap},
    pm_policy::{PMMarketTypePolicy, PMResolverPolicy},
    pm_market::{Self, PMMarket},
    pm_treasury::{Self, PMTreasury},
    pm_source::SourceDeclaration,
    pm_market::CreatorInfluence,
};

// ── Errors ──
#[error(code = 0)]
const EReviewWindowNotPassed: vector<u8> = b"Emergency review window has not passed";
#[error(code = 1)]
const EMarketMismatch: vector<u8> = b"Market does not match pending invalidation request";
#[error(code = 2)]
const EPendingRequestExists: vector<u8> = b"A pending invalidation request already exists";

// ── Events ──

public struct EmergencyAuthorityRotatedEvent has copy, drop {
    old_members: vector<address>,
    new_members: vector<address>,
    rotated_at_ms: u64,
}

public struct EmergencyInvalidationRequestedEvent has copy, drop {
    market_id: ID,
    requested_by: address,
    requested_at_ms: u64,
}

public struct EmergencyInvalidationEvent has copy, drop {
    market_id: ID,
    reason_code: u8,
    emergency_authority: address,
}

// ── Emergency capability (separate from PMAdminCap) ──

/// Emergency capability — only this can invoke emergency pause/invalidation.
/// PMAdminCap CANNOT invoke emergency actions.
public struct PMEmergencyCap has key, store {
    id: UID,
}

/// Emergency multisig anchor — shared object with known ID.
/// Holds the emergency cap and tracks authorized members.
public struct PMEmergencyMultisig has key {
    id: UID,
    members: vector<address>,
    emergency_cap_id: ID,
    /// Tracks pending invalidation requests that are in review.
    pending_invalidation_market: Option<ID>,
    pending_invalidation_requested_at_ms: Option<u64>,
    review_window_ms: u64,
}

/// Create the emergency infrastructure. Called once at deploy.
public fun create_emergency_infra(
    _admin: &PMAdminCap,
    members: vector<address>,
    review_window_ms: u64,
    ctx: &mut TxContext,
): (PMEmergencyCap, PMEmergencyMultisig) {
    let cap = PMEmergencyCap { id: object::new(ctx) };
    let cap_id = object::id(&cap);

    let multisig = PMEmergencyMultisig {
        id: object::new(ctx),
        members,
        emergency_cap_id: cap_id,
        pending_invalidation_market: option::none(),
        pending_invalidation_requested_at_ms: option::none(),
        review_window_ms,
    };

    (cap, multisig)
}

/// Rotate emergency multisig members.
public fun rotate_emergency_members(
    multisig: &mut PMEmergencyMultisig,
    _cap: &PMEmergencyCap,
    new_members: vector<address>,
    clock: &Clock,
) {
    let old_members = multisig.members;
    multisig.members = new_members;

    event::emit(EmergencyAuthorityRotatedEvent {
        old_members,
        new_members: multisig.members,
        rotated_at_ms: sui::clock::timestamp_ms(clock),
    });
}

// ── Emergency pause (immediate, no review period) ──

/// Emergency pause a market. Immediate — no review period required.
public fun emergency_pause_market(
    market: &mut PMMarket,
    _cap: &PMEmergencyCap,
    ctx: &TxContext,
) {
    pm_market::emergency_pause(market, tx_context::sender(ctx));
}

/// Emergency unpause a market. Requires PMEmergencyCap.
public fun emergency_unpause_market(
    market: &mut PMMarket,
    _cap: &PMEmergencyCap,
) {
    pm_market::emergency_unpause(market);
}

// ── Emergency invalidation (requires review period) ──

/// Request emergency invalidation. Starts review window.
/// The actual invalidation happens after the review window via `execute_emergency_invalidation`.
public fun request_emergency_invalidation(
    multisig: &mut PMEmergencyMultisig,
    _cap: &PMEmergencyCap,
    market: &PMMarket,
    clock: &Clock,
    ctx: &TxContext,
) {
    assert!(option::is_none(&multisig.pending_invalidation_market), EPendingRequestExists);

    let market_id = pm_market::market_id(market);
    let requested_at_ms = sui::clock::timestamp_ms(clock);
    multisig.pending_invalidation_market = option::some(market_id);
    multisig.pending_invalidation_requested_at_ms = option::some(requested_at_ms);

    event::emit(EmergencyInvalidationRequestedEvent {
        market_id,
        requested_by: tx_context::sender(ctx),
        requested_at_ms,
    });
}

/// Execute emergency invalidation after review window passes.
public fun execute_emergency_invalidation(
    multisig: &mut PMEmergencyMultisig,
    _cap: &PMEmergencyCap,
    market: &mut PMMarket,
    treasury: &mut PMTreasury,
    clock: &Clock,
    ctx: &TxContext,
) {
    // Verify review window has passed
    let requested_at = *option::borrow(&multisig.pending_invalidation_requested_at_ms);
    let current_time_ms = sui::clock::timestamp_ms(clock);
    assert!(current_time_ms >= requested_at + multisig.review_window_ms, EReviewWindowNotPassed);

    // Verify this is the market that was requested for invalidation
    let market_id = pm_market::market_id(market);
    let pending_market = *option::borrow(&multisig.pending_invalidation_market);
    assert!(pending_market == market_id, EMarketMismatch);

    // Invalidate
    pm_market::transition_to_invalid(market, pm_rules::invalid_reason_emergency());

    // Forfeit creation bond
    let creator_bond = pm_market::take_creation_bond(market);
    pm_treasury::deposit_forfeited_bond(treasury, creator_bond);

    // Clear pending
    multisig.pending_invalidation_market = option::none();
    multisig.pending_invalidation_requested_at_ms = option::none();

    event::emit(EmergencyInvalidationEvent {
        market_id,
        reason_code: pm_rules::invalid_reason_emergency(),
        emergency_authority: tx_context::sender(ctx),
    });
}

// ── Standard admin orchestration ──

/// Admin creates and shares a market (convenience wrapper).
/// Markets can also be created directly via pm_market::create_market.
public fun admin_create_market(
    registry: &mut PMRegistry,
    config: &PMConfig,
    policy: &PMMarketTypePolicy,
    resolver_policy: &PMResolverPolicy,
    _admin: &PMAdminCap,
    title: String,
    description: String,
    resolution_text: String,
    outcome_count: u16,
    outcome_labels: vector<String>,
    source_declaration: SourceDeclaration,
    creator_influence: CreatorInfluence,
    close_time_ms: u64,
    resolve_deadline_ms: u64,
    creation_bond: sui::balance::Balance<prediction_market::suffer::SUFFER>,
    clock: &sui::clock::Clock,
    ctx: &mut TxContext,
) {
    let market = pm_market::create_market(
        registry,
        config,
        policy,
        resolver_policy,
        title,
        description,
        resolution_text,
        outcome_count,
        outcome_labels,
        source_declaration,
        creator_influence,
        close_time_ms,
        resolve_deadline_ms,
        creation_bond,
        clock,
        ctx,
    );
    pm_market::share_market(market);
}

/// Admin withdraws fees from treasury.
public fun admin_withdraw_treasury(
    treasury: &mut PMTreasury,
    admin: &PMAdminCap,
    amount: u64,
    recipient: address,
    ctx: &mut TxContext,
) {
    pm_treasury::withdraw(treasury, admin, amount, recipient, ctx);
}

// ── Read accessors ──

public fun emergency_multisig_members(m: &PMEmergencyMultisig): &vector<address> {
    &m.members
}

public fun emergency_review_window_ms(m: &PMEmergencyMultisig): u64 {
    m.review_window_ms
}

public fun has_pending_invalidation(m: &PMEmergencyMultisig): bool {
    option::is_some(&m.pending_invalidation_market)
}

/// Cancel a pending emergency invalidation request. Requires PMEmergencyCap.
public fun cancel_emergency_invalidation(
    multisig: &mut PMEmergencyMultisig,
    _cap: &PMEmergencyCap,
) {
    multisig.pending_invalidation_market = option::none();
    multisig.pending_invalidation_requested_at_ms = option::none();
}
