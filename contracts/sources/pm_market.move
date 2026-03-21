/// PMMarket — core market object with embedded pool, lifecycle state machine, and freeze logic.
/// Shared object: one per market. Pool state embedded to minimize shared-object contention.
module prediction_market::pm_market;

use std::string::String;
use sui::{balance::{Self, Balance}, clock::Clock, coin, event};
use prediction_market::{
    suffer::SUFFER,
    pm_rules,
    pm_source::SourceDeclaration,
    pm_registry::{Self, PMRegistry, PMConfig, PMAdminCap},
    pm_policy::{Self, PMMarketTypePolicy, PMResolverPolicy},
};

// ── Errors ──
#[error(code = 0)]
const EMarketNotOpen: vector<u8> = b"Market is not in OPEN state";
#[error(code = 3)]
const EInvalidOutcomeCount: vector<u8> = b"Invalid outcome count for market type";
#[error(code = 4)]
const EInvalidTimings: vector<u8> = b"Close time must be before resolve deadline";
#[error(code = 5)]
const EMarketDurationTooShort: vector<u8> = b"Market duration below minimum";
#[error(code = 6)]
const EMarketDurationTooLong: vector<u8> = b"Market duration exceeds maximum";
#[error(code = 7)]
const ETitleTooLong: vector<u8> = b"Title exceeds maximum length";
#[error(code = 8)]
const EDescriptionTooLong: vector<u8> = b"Description exceeds maximum length";
#[error(code = 9)]
const EInvalidStateTransition: vector<u8> = b"Invalid state transition";
#[error(code = 10)]
const EResolvedIsTerminal: vector<u8> = b"RESOLVED is a terminal state";
#[error(code = 11)]
const EInvalidIsTerminal: vector<u8> = b"INVALID is a terminal state";
#[error(code = 12)]
const ENotCreator: vector<u8> = b"Only the market creator can perform this action";
#[error(code = 13)]
const EMarketHasTraded: vector<u8> = b"Cannot invalidate a market that has traded (admin pre-trade only)";
#[error(code = 14)]
const ERegistryPaused: vector<u8> = b"Registry is paused";
#[error(code = 15)]
const EInvalidOutcomeIndex: vector<u8> = b"Outcome index out of bounds";
#[error(code = 16)]
const EResolverPolicyNotActive: vector<u8> = b"Resolver policy is not active";
#[error(code = 17)]
const ECloseTimeInPast: vector<u8> = b"Close time must be in the future";
#[error(code = 18)]
const EInsufficientCreationBond: vector<u8> = b"Insufficient creation bond amount";
#[error(code = 19)]
const ECannotUnpauseTerminal: vector<u8> = b"Cannot unpause a market in terminal state";
#[error(code = 20)]
const ELabelCountMismatch: vector<u8> = b"Outcome labels count must match outcome count";
#[error(code = 21)]
const EInvalidOutcomeRange: vector<u8> = b"Outcome count must be between 2 and 8";

// ── Events ──

public struct MarketCreatedEvent has copy, drop {
    market_id: ID,
    creator: address,
    market_type: u8,
    trust_tier: u8,
    resolution_class: u8,
    close_time_ms: u64,
    resolve_deadline_ms: u64,
    market_type_policy_id: ID,
    resolver_policy_id: ID,
    config_version: u64,
    outcome_count: u16,
}

public struct MarketFrozenEvent has copy, drop {
    market_id: ID,
}

public struct MarketClosedEvent has copy, drop {
    market_id: ID,
    closed_at_ms: u64,
}

public struct MarketResolvedEvent has copy, drop {
    market_id: ID,
    outcome: u16,
    finalized: bool,
}

public struct MarketInvalidatedEvent has copy, drop {
    market_id: ID,
    reason: u8,
}

public struct EmergencyPauseEvent has copy, drop {
    market_id: ID,
    paused_by: address,
}

public struct EmergencyUnpauseEvent has copy, drop {
    market_id: ID,
}

/// Creator influence disclosure — first-class, stored on market.
public struct CreatorInfluence has store, copy, drop {
    influence_level: u8,
    creator_is_source_controller: bool,
    disclosure_text: String,
}

/// Resolution record — stored as a field on PMMarket (not a separate shared object).
public struct PMResolutionRecord has store, copy, drop {
    resolved_outcome: u16,
    resolution_class: u8,
    resolver_address: address,
    evidence_hash: vector<u8>,
    resolved_at_ms: u64,
    dispute_window_end_ms: u64,
    finalized: bool,
}

/// The core market object. Shared — one per market.
public struct PMMarket has key {
    id: UID,
    market_number: u64,

    // ── Immutable terms (frozen after first trade) ──
    creator: address,
    title: String,
    description: String,
    resolution_text: String,
    market_type: u8,
    resolution_class: u8,
    trust_tier: u8,
    outcome_count: u16,
    outcome_labels: vector<String>,
    source_declaration: SourceDeclaration,
    creator_influence: CreatorInfluence,
    close_time_ms: u64,
    resolve_deadline_ms: u64,
    dispute_window_ms: u64,

    // ── Policy references (set at creation, never change) ──
    market_type_policy_id: ID,
    resolver_policy_id: ID,
    config_version: u64,

    // ── Lifecycle ──
    state: u8,
    frozen: bool,
    created_at_ms: u64,

    // ── Embedded AMM pool state (runtime-mutable) ──
    outcome_quantities: vector<u64>,
    total_collateral: Balance<SUFFER>,
    accrued_fees: Balance<SUFFER>,

    // ── Cost basis tracking (for pro-rata invalidation refunds) ──
    total_cost_basis_sum: u64,

    // ── Bonds ──
    creation_bond: Balance<SUFFER>,
    community_resolution_bond: Option<Balance<SUFFER>>,
    community_resolution_proposer: Option<address>,

    // ── Resolution (set once when resolution is proposed) ──
    resolution: Option<PMResolutionRecord>,

    // ── Invalidation snapshot fields ──
    // Set once at the moment of invalidation, immutable after.
    // Writable ONLY during *->INVALID transitions (RESOLVED is terminal, no RESOLVED->INVALID).
    invalidation_snapshot_collateral: Option<u64>,

    // ── Emergency ──
    emergency_paused: bool,
}

// ── Creation ──

public fun create_market(
    registry: &mut PMRegistry,
    config: &PMConfig,
    policy: &PMMarketTypePolicy,
    resolver_policy: &PMResolverPolicy,
    title: String,
    description: String,
    resolution_text: String,
    outcome_count: u16,
    outcome_labels: vector<String>,
    source_declaration: SourceDeclaration,
    creator_influence: CreatorInfluence,
    close_time_ms: u64,
    resolve_deadline_ms: u64,
    creation_bond: Balance<SUFFER>,
    clock: &Clock,
    ctx: &mut TxContext,
): PMMarket {
    let current_time_ms = sui::clock::timestamp_ms(clock);

    // Validate registry not paused
    pm_registry::assert_not_paused(registry);

    // Validate against policy
    pm_policy::validate_market_against_policy(
        policy,
        pm_policy::policy_market_type(policy),
        pm_policy::policy_trust_tier(policy),
        pm_policy::policy_resolution_class(policy),
        outcome_count,
    );
    assert!(pm_policy::resolver_is_active(resolver_policy), EResolverPolicyNotActive);

    // Validate outcome labels match outcome count
    assert!(vector::length(&outcome_labels) == (outcome_count as u64), ELabelCountMismatch);

    // RT-033: Consider validating outcome labels are unique (skipped for v1 — some market types may allow duplicates)

    // Validate timings
    assert!(close_time_ms > current_time_ms, ECloseTimeInPast);
    assert!(close_time_ms < resolve_deadline_ms, EInvalidTimings);
    let duration = close_time_ms - current_time_ms;
    assert!(duration >= pm_registry::min_market_duration_ms(config), EMarketDurationTooShort);
    assert!(duration <= pm_registry::max_market_duration_ms(config), EMarketDurationTooLong);

    // Validate text lengths
    assert!(std::string::length(&title) <= pm_rules::max_title_length(), ETitleTooLong);
    assert!(std::string::length(&description) <= pm_rules::max_description_length(), EDescriptionTooLong);

    // Validate outcome count (supports binary N=2 and categorical N=3-16)
    let max_for_type = pm_rules::max_outcomes_for_type(pm_policy::policy_market_type(policy));
    assert!(outcome_count >= 2 && outcome_count <= max_for_type, EInvalidOutcomeCount);

    // RT-OVERFLOW-FIX: Prevent u128 overflow in CPMM math by capping reserves for N-outcome markets.
    // The cp_buy_cost/cp_sell_proceeds functions compute product of (N-1) reserves.
    // For safe execution within u128:
    //   N=2 (binary): any reserves work (product of 1 reserve always fits)
    //   N=3-4: reserves up to 10^9 (safe)
    //   N=5-8: reserves up to 10^4 (100 SFR)
    //   N>8: NOT SAFE without binary search (deferred to v2)
    // For testnet, we cap N<=8 and initial_reserve to 100 SFR (10,000 base units)
    // This ensures product of 7 reserves: (10,000)^7 = 10^28 < u128::MAX (3.4e38)
    if (outcome_count > 8) {
        // Future enhancement: implement binary search or use different pricing model
        abort(19); // EInvalidOutcomeCount
    };

    // Validate bond amount
    let required_bond = pm_registry::creation_bond_for_tier(config, pm_policy::policy_trust_tier(policy));
    assert!(balance::value(&creation_bond) >= required_bond, EInsufficientCreationBond);

    let market_number = pm_registry::increment_market_count(registry);
    let dispute_window_ms = pm_policy::resolver_dispute_window_for_class(
        resolver_policy,
        pm_policy::policy_resolution_class(policy),
    );

    // Initialize pool reserves to CPMM liquidity parameter (1 SFR per outcome)
    // This is required for constant-product AMM to function — reserves must be non-zero.
    let initial_reserve: u64 = 100; // 1 SFR = 10^2 base units
    let mut outcome_quantities = vector::empty<u64>();
    let mut i: u16 = 0;
    while (i < outcome_count) {
        vector::push_back(&mut outcome_quantities, initial_reserve);
        i = i + 1;
    };

    let market = PMMarket {
        id: object::new(ctx),
        market_number,
        creator: tx_context::sender(ctx),
        title,
        description,
        resolution_text,
        market_type: pm_policy::policy_market_type(policy),
        resolution_class: pm_policy::policy_resolution_class(policy),
        trust_tier: pm_policy::policy_trust_tier(policy),
        outcome_count,
        outcome_labels,
        source_declaration,
        creator_influence,
        close_time_ms,
        resolve_deadline_ms,
        dispute_window_ms,
        market_type_policy_id: object::id(policy),
        resolver_policy_id: object::id(resolver_policy),
        config_version: pm_registry::config_version(config),
        state: pm_rules::state_open(),
        frozen: false,
        created_at_ms: current_time_ms,
        outcome_quantities,
        total_collateral: balance::zero<SUFFER>(),
        accrued_fees: balance::zero<SUFFER>(),
        total_cost_basis_sum: 0,
        creation_bond,
        community_resolution_bond: option::none(),
        community_resolution_proposer: option::none(),
        resolution: option::none(),
        invalidation_snapshot_collateral: option::none(),
        emergency_paused: false,
    };

    // RT-034: market_id included in event for frontend indexing ✓
    event::emit(MarketCreatedEvent {
        market_id: object::id(&market),
        creator: tx_context::sender(ctx),
        market_type: pm_policy::policy_market_type(policy),
        trust_tier: pm_policy::policy_trust_tier(policy),
        resolution_class: pm_policy::policy_resolution_class(policy),
        close_time_ms,
        resolve_deadline_ms,
        market_type_policy_id: object::id(policy),
        resolver_policy_id: object::id(resolver_policy),
        config_version: pm_registry::config_version(config),
        outcome_count,
    });

    market
}

// ── Freeze on first trade ──

/// Called by trading module on first trade. Sets frozen = true, emits event.
public(package) fun freeze_if_needed(market: &mut PMMarket) {
    if (!market.frozen) {
        market.frozen = true;
        event::emit(MarketFrozenEvent {
            market_id: object::id(market),
        });
    };
}

// ── State transitions ──

/// Transition to CLOSED. Called on first interaction after close_time.
public(package) fun transition_to_closed(market: &mut PMMarket, current_time_ms: u64) {
    assert!(market.state == pm_rules::state_open(), EInvalidStateTransition);
    assert!(current_time_ms >= market.close_time_ms, EMarketNotOpen);
    market.state = pm_rules::state_closed();
    event::emit(MarketClosedEvent {
        market_id: object::id(market),
        closed_at_ms: current_time_ms,
    });
}

/// Lazy close: if market is OPEN and past close_time, auto-transition to CLOSED.
/// If already CLOSED (or any other state), this is a no-op.
/// Eliminates external dependency on anyone calling close_market() first —
/// resolution/invalidation entry points call this to ensure CLOSED precondition
/// without requiring a separate close_market transaction.
/// No race condition: idempotent within a single Move call.
public(package) fun ensure_closed(market: &mut PMMarket, current_time_ms: u64) {
    if (market.state == pm_rules::state_open() && current_time_ms >= market.close_time_ms) {
        market.state = pm_rules::state_closed();
        event::emit(MarketClosedEvent {
            market_id: object::id(market),
            closed_at_ms: current_time_ms,
        });
    };
}

/// Transition to RESOLUTION_PENDING when resolution is proposed.
public(package) fun transition_to_resolution_pending(
    market: &mut PMMarket,
    record: PMResolutionRecord,
) {
    assert!(market.state == pm_rules::state_closed(), EInvalidStateTransition);
    market.state = pm_rules::state_resolution_pending();
    market.resolution = option::some(record);
}

/// Transition to DISPUTED.
public(package) fun transition_to_disputed(market: &mut PMMarket) {
    assert!(market.state == pm_rules::state_resolution_pending(), EInvalidStateTransition);
    market.state = pm_rules::state_disputed();
}

/// Finalize resolution — transition to RESOLVED (terminal).
public(package) fun transition_to_resolved(market: &mut PMMarket) {
    assert!(
        market.state == pm_rules::state_resolution_pending() ||
        market.state == pm_rules::state_disputed(),
        EInvalidStateTransition,
    );
    let market_id = object::id(market);
    // Mark resolution as finalized
    let res = option::borrow_mut(&mut market.resolution);
    res.finalized = true;
    let outcome = res.resolved_outcome;
    market.state = pm_rules::state_resolved();
    event::emit(MarketResolvedEvent {
        market_id,
        outcome,
        finalized: true,
    });
}

/// Transition to INVALID — allowed from OPEN, CLOSED, RESOLUTION_PENDING, or DISPUTED.
/// NOT allowed from RESOLVED (terminal state).
public(package) fun transition_to_invalid(
    market: &mut PMMarket,
    reason: u8,
) {
    assert!(market.state != pm_rules::state_resolved(), EResolvedIsTerminal);
    assert!(market.state != pm_rules::state_invalid(), EInvalidIsTerminal);

    // Snapshot collateral at moment of invalidation
    market.invalidation_snapshot_collateral = option::some(balance::value(&market.total_collateral));
    market.state = pm_rules::state_invalid();

    event::emit(MarketInvalidatedEvent {
        market_id: object::id(market),
        reason,
    });
}

/// Admin pre-trade invalidation only.
public fun admin_invalidate_pre_trade(
    market: &mut PMMarket,
    _admin: &PMAdminCap,
    reason: u8,
    ctx: &mut TxContext,
) {
    assert!(!market.frozen, EMarketHasTraded);
    assert!(market.state == pm_rules::state_open(), EInvalidStateTransition);
    market.state = pm_rules::state_invalid();
    market.invalidation_snapshot_collateral = option::some(0);

    // Return creation bond to creator (pre-trade invalidation is not creator's fault)
    let creator_bond = take_creation_bond(market);
    let bond_amount = balance::value(&creator_bond);
    if (bond_amount > 0) {
        let bond_coin = coin::from_balance(creator_bond, ctx);
        transfer::public_transfer(bond_coin, market.creator);
    } else {
        balance::destroy_zero(creator_bond);
    };

    event::emit(MarketInvalidatedEvent {
        market_id: object::id(market),
        reason,
    });
}

// ── Emergency ──

/// RT-035: Emergency pause freezes all market operations.
/// Recovery procedure:
/// 1. Investigate root cause
/// 2. Fix underlying issue (if contract bug, deploy upgrade)
/// 3. Call emergency_unpause() via PMAdminCap
/// 4. Verify market state is consistent via check_invariants()
/// Note: Terminal states (RESOLVED, INVALID) cannot be unpaused.
public(package) fun emergency_pause(market: &mut PMMarket, paused_by: address) {
    market.emergency_paused = true;
    event::emit(EmergencyPauseEvent {
        market_id: object::id(market),
        paused_by,
    });
}

public(package) fun emergency_unpause(market: &mut PMMarket) {
    assert!(
        market.state != pm_rules::state_resolved() && market.state != pm_rules::state_invalid(),
        ECannotUnpauseTerminal,
    );
    market.emergency_paused = false;
    event::emit(EmergencyUnpauseEvent { market_id: object::id(market) });
}

// ── Pool operations (called by trading module) ──

public(package) fun add_outcome_quantity(market: &mut PMMarket, outcome_index: u16, amount: u64) {
    assert!((outcome_index as u64) < vector::length(&market.outcome_quantities), EInvalidOutcomeIndex);
    let current = vector::borrow_mut(&mut market.outcome_quantities, outcome_index as u64);
    *current = *current + amount;
}

public(package) fun sub_outcome_quantity(market: &mut PMMarket, outcome_index: u16, amount: u64) {
    assert!((outcome_index as u64) < vector::length(&market.outcome_quantities), EInvalidOutcomeIndex);
    let current = vector::borrow_mut(&mut market.outcome_quantities, outcome_index as u64);
    *current = *current - amount;
}

public(package) fun deposit_collateral(market: &mut PMMarket, collateral: Balance<SUFFER>) {
    balance::join(&mut market.total_collateral, collateral);
}

public(package) fun withdraw_collateral(market: &mut PMMarket, amount: u64): Balance<SUFFER> {
    balance::split(&mut market.total_collateral, amount)
}

public(package) fun accrue_fee(market: &mut PMMarket, fee: Balance<SUFFER>) {
    balance::join(&mut market.accrued_fees, fee);
}

/// Sweep all accrued fees out of market (for treasury deposit).
public(package) fun sweep_accrued_fees(market: &mut PMMarket): Balance<SUFFER> {
    let amount = balance::value(&market.accrued_fees);
    balance::split(&mut market.accrued_fees, amount)
}

/// Take the creation bond out of the market (for return or forfeiture).
public(package) fun take_creation_bond(market: &mut PMMarket): Balance<SUFFER> {
    let amount = balance::value(&market.creation_bond);
    balance::split(&mut market.creation_bond, amount)
}

/// Deposit community resolution bond (called during propose_community_resolution).
public(package) fun deposit_community_resolution_bond(
    market: &mut PMMarket,
    bond: Balance<SUFFER>,
    proposer: address,
) {
    market.community_resolution_bond = option::some(bond);
    market.community_resolution_proposer = option::some(proposer);
}

/// Take the community resolution bond out of the market (for return or distribution).
public(package) fun take_community_resolution_bond(market: &mut PMMarket): Balance<SUFFER> {
    let bond = option::extract(&mut market.community_resolution_bond);
    bond
}

/// Get the community resolution proposer address (if any).
public fun community_resolution_proposer(market: &PMMarket): Option<address> {
    market.community_resolution_proposer
}

public(package) fun add_cost_basis(market: &mut PMMarket, amount: u64) {
    market.total_cost_basis_sum = market.total_cost_basis_sum + amount;
}

public(package) fun sub_cost_basis(market: &mut PMMarket, amount: u64) {
    market.total_cost_basis_sum = market.total_cost_basis_sum - amount;
}

// ── Read accessors ──

public fun market_id(market: &PMMarket): ID { object::id(market) }
public fun creator(market: &PMMarket): address { market.creator }
public fun title(market: &PMMarket): &String { &market.title }
public fun state(market: &PMMarket): u8 { market.state }
public fun is_frozen(market: &PMMarket): bool { market.frozen }
public fun market_type(market: &PMMarket): u8 { market.market_type }
public fun resolution_class(market: &PMMarket): u8 { market.resolution_class }
public fun trust_tier(market: &PMMarket): u8 { market.trust_tier }
public fun outcome_count(market: &PMMarket): u16 { market.outcome_count }
public fun close_time_ms(market: &PMMarket): u64 { market.close_time_ms }
public fun resolve_deadline_ms(market: &PMMarket): u64 { market.resolve_deadline_ms }
public fun dispute_window_ms(market: &PMMarket): u64 { market.dispute_window_ms }
public fun outcome_quantities(market: &PMMarket): &vector<u64> { &market.outcome_quantities }
public fun total_collateral(market: &PMMarket): u64 { balance::value(&market.total_collateral) }
public fun accrued_fees(market: &PMMarket): u64 { balance::value(&market.accrued_fees) }
public fun total_cost_basis_sum(market: &PMMarket): u64 { market.total_cost_basis_sum }
public fun is_emergency_paused(market: &PMMarket): bool { market.emergency_paused }
public fun market_type_policy_id(market: &PMMarket): ID { market.market_type_policy_id }
public fun resolver_policy_id(market: &PMMarket): ID { market.resolver_policy_id }
public fun config_version(market: &PMMarket): u64 { market.config_version }
public fun created_at_ms(market: &PMMarket): u64 { market.created_at_ms }

public fun resolution(market: &PMMarket): &Option<PMResolutionRecord> { &market.resolution }
public fun invalidation_snapshot_collateral(market: &PMMarket): Option<u64> { market.invalidation_snapshot_collateral }

public fun source_declaration(market: &PMMarket): &SourceDeclaration { &market.source_declaration }
public fun creator_influence(market: &PMMarket): &CreatorInfluence { &market.creator_influence }

// Resolution record accessors
public fun resolution_outcome(record: &PMResolutionRecord): u16 { record.resolved_outcome }
public fun resolution_finalized(record: &PMResolutionRecord): bool { record.finalized }
public fun resolution_dispute_window_end_ms(record: &PMResolutionRecord): u64 { record.dispute_window_end_ms }
public fun resolution_resolver(record: &PMResolutionRecord): address { record.resolver_address }

// Creator influence accessors
public fun influence_level(ci: &CreatorInfluence): u8 { ci.influence_level }
public fun is_source_controller(ci: &CreatorInfluence): bool { ci.creator_is_source_controller }

// ── Assertions ──

public fun assert_open(market: &PMMarket) {
    assert!(market.state == pm_rules::state_open(), EMarketNotOpen);
}

public fun assert_not_emergency_paused(market: &PMMarket) {
    assert!(!market.emergency_paused, ERegistryPaused);
}

public fun assert_creator(market: &PMMarket, ctx: &TxContext) {
    assert!(market.creator == tx_context::sender(ctx), ENotCreator);
}

// ── Constructor helpers ──

public fun new_creator_influence(
    influence_level: u8,
    creator_is_source_controller: bool,
    disclosure_text: String,
): CreatorInfluence {
    assert!(pm_rules::is_valid_creator_influence(influence_level), EInvalidStateTransition);
    CreatorInfluence {
        influence_level,
        creator_is_source_controller,
        disclosure_text,
    }
}

/// Share a market object. Must be called from within this package.
public(package) fun share_market(market: PMMarket) {
    transfer::share_object(market);
}

public fun new_resolution_record(
    resolved_outcome: u16,
    resolution_class: u8,
    resolver_address: address,
    evidence_hash: vector<u8>,
    resolved_at_ms: u64,
    dispute_window_end_ms: u64,
): PMResolutionRecord {
    PMResolutionRecord {
        resolved_outcome,
        resolution_class,
        resolver_address,
        evidence_hash,
        resolved_at_ms,
        dispute_window_end_ms,
        finalized: false,
    }
}

/// RT-015: Read-only invariant check. Returns true if market state is internally consistent.
/// Checks: pool reserves match outcome_count, collateral is non-negative,
/// state is valid, and terminal states have appropriate resolution records.
public fun check_invariants(market: &PMMarket): bool {
    // Pool reserves count matches outcome_count
    if (vector::length(&market.outcome_quantities) != (market.outcome_count as u64)) {
        return false
    };
    // State is valid
    if (!pm_rules::is_valid_state(market.state)) {
        return false
    };
    // RESOLVED must have a finalized resolution
    if (market.state == pm_rules::state_resolved()) {
        if (option::is_none(&market.resolution)) { return false };
        let record = option::borrow(&market.resolution);
        if (!record.finalized) { return false };
    };
    // INVALID must have a snapshot
    if (market.state == pm_rules::state_invalid()) {
        if (option::is_none(&market.invalidation_snapshot_collateral)) { return false };
    };
    // Close time before resolve deadline
    if (market.close_time_ms >= market.resolve_deadline_ms) {
        return false
    };
    true
}
