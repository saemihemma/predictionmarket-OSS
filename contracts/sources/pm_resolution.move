/// PMResolution — three resolution paths + finalization.
/// Class 0: deterministic (SnapshotRecord)
/// Class 1: declared-source (PMVerifierCap)
/// Class 2: creator-proposed (dispute window)
module prediction_market::pm_resolution;

use sui::{
    balance::{Self as balance},
    clock::Clock,
    coin::{Self as coin},
    event,
};
use prediction_market::{
    pm_rules,
    pm_market::{Self, PMMarket},
    pm_registry,
    pm_treasury::{Self as pm_treasury, PMTreasury},
};

// ── Errors ──
#[error(code = 0)]
const EWrongResolutionClass: vector<u8> = b"Market resolution class does not match this path";
#[error(code = 1)]
const EMarketNotClosed: vector<u8> = b"Market must be in CLOSED state";
#[error(code = 2)]
const EInvalidOutcome: vector<u8> = b"Resolved outcome exceeds market outcome count";
#[error(code = 3)]
const ECreatorPriorityWindowNotExpired: vector<u8> = b"Creator priority window has not expired; use propose_resolution() instead";
#[error(code = 4)]
const EDisputeWindowNotPassed: vector<u8> = b"Dispute window has not passed yet";
#[error(code = 5)]
const EAlreadyResolved: vector<u8> = b"Market already has a resolution record";
#[error(code = 6)]
const ENotResolutionPending: vector<u8> = b"Market is not in resolution pending state";
#[error(code = 7)]
const EEmergencyPaused: vector<u8> = b"Market is emergency paused";
#[error(code = 8)]
const EDeadlineNotExpired: vector<u8> = b"Resolve deadline has not expired";
#[error(code = 9)]
const EInsufficientCreationBond: vector<u8> = b"Insufficient community resolution bond amount";

const BASIS_POINTS: u64 = 10_000;
const COMMUNITY_CREATOR_BOND_REWARD_BPS: u64 = 5_000;
const COMMUNITY_DISPUTER_REWARD_BPS: u64 = 7_500;

// ── Events ──

public struct ResolutionProposedEvent<phantom Collateral> has copy, drop {
    market_id: ID,
    outcome: u16,
    resolver: address,
    resolution_class: u8,
    dispute_window_end_ms: u64,
}

public struct ResolutionFinalizedEvent<phantom Collateral> has copy, drop {
    market_id: ID,
    outcome: u16,
}

public struct DeadlineInvalidationEvent<phantom Collateral> has copy, drop {
    market_id: ID,
}

// ── Verifier capability ──

/// Capability held by authorized verifiers for declared-source resolution.
public struct PMVerifierCap<phantom Collateral> has key, store {
    id: UID,
}

/// Admin creates verifier caps.
public fun create_verifier_cap<Collateral>(
    _admin: &prediction_market::pm_registry::PMAdminCap<Collateral>,
    ctx: &mut TxContext,
): PMVerifierCap<Collateral> {
    PMVerifierCap<Collateral> { id: object::new(ctx) }
}

public(package) fun refund_community_resolution_bond<Collateral>(
    market: &mut PMMarket<Collateral>,
    ctx: &mut TxContext,
) {
    if (!pm_market::has_community_resolution_bond(market)) {
        return
    };

    let (bond, proposer) = pm_market::take_community_resolution_context(market);
    let amount = balance::value(&bond);
    if (amount > 0) {
        transfer::public_transfer(coin::from_balance(bond, ctx), proposer);
    } else {
        balance::destroy_zero(bond);
    };
}

public(package) fun settle_community_resolution_success<Collateral>(
    market: &mut PMMarket<Collateral>,
    ctx: &mut TxContext,
) {
    if (!pm_market::has_community_resolution_bond(market)) {
        return
    };

    let (bond, proposer) = pm_market::take_community_resolution_context(market);
    let bond_amount = balance::value(&bond);
    if (bond_amount > 0) {
        transfer::public_transfer(coin::from_balance(bond, ctx), proposer);
    } else {
        balance::destroy_zero(bond);
    };

    let mut creator_bond = pm_market::take_creation_bond(market);
    let creator_bond_amount = balance::value(&creator_bond);
    if (creator_bond_amount == 0) {
        balance::destroy_zero(creator_bond);
        return
    };

    let reward_amount = (((creator_bond_amount as u128) * (COMMUNITY_CREATOR_BOND_REWARD_BPS as u128)) / (BASIS_POINTS as u128)) as u64;
    if (reward_amount > 0) {
        let reward_coin = coin::from_balance(balance::split(&mut creator_bond, reward_amount), ctx);
        transfer::public_transfer(reward_coin, proposer);
    };

    pm_market::restore_creation_bond(market, creator_bond);
}

public(package) fun forfeit_community_resolution_bond<Collateral>(
    market: &mut PMMarket<Collateral>,
    treasury: &mut PMTreasury<Collateral>,
    beneficiary: address,
    ctx: &mut TxContext,
) {
    if (!pm_market::has_community_resolution_bond(market)) {
        return
    };

    let (mut bond, _proposer) = pm_market::take_community_resolution_context(market);
    let bond_amount = balance::value(&bond);
    if (bond_amount == 0) {
        balance::destroy_zero(bond);
        return
    };

    let reward_amount = (((bond_amount as u128) * (COMMUNITY_DISPUTER_REWARD_BPS as u128)) / (BASIS_POINTS as u128)) as u64;
    if (reward_amount > 0) {
        let reward_coin = coin::from_balance(balance::split(&mut bond, reward_amount), ctx);
        transfer::public_transfer(reward_coin, beneficiary);
    };

    if (balance::value(&bond) > 0) {
        pm_treasury::deposit_forfeited_bond(treasury, bond);
    } else {
        balance::destroy_zero(bond);
    };
}

// ── Class 0: Deterministic resolution ──

/// Resolve a deterministic market by providing the outcome directly.
/// The caller (orchestrator / automated resolver) reads the data source off-chain
/// and submits the resolved outcome. This decouples the prediction market from
/// any specific game or data contract.
///
/// Access control: requires PMVerifierCap (same as declared-source resolution).
/// The verifier is trusted to read the correct data source and submit honestly.
/// If wrong, the community can dispute via SDVM.
public fun resolve_deterministic<Collateral>(
    market: &mut PMMarket<Collateral>,
    _verifier_cap: &PMVerifierCap<Collateral>,
    resolved_outcome: u16,
    evidence_hash: vector<u8>,
    clock: &Clock,
    ctx: &TxContext,
) {
    assert!(!pm_market::is_emergency_paused(market), EEmergencyPaused);
    let current_time = sui::clock::timestamp_ms(clock);
    pm_market::ensure_closed(market, current_time);
    assert!(pm_market::state(market) == pm_rules::state_closed(), EMarketNotClosed);
    assert!(pm_market::resolution_class(market) == pm_rules::resolution_class_deterministic(), EWrongResolutionClass);
    assert!(option::is_none(pm_market::resolution(market)), EAlreadyResolved);
    assert!((resolved_outcome as u64) < (pm_market::outcome_count(market) as u64), EInvalidOutcome);

    let dispute_window_end = current_time + pm_market::dispute_window_ms(market);
    let market_id = pm_market::market_id(market);

    let record = pm_market::new_resolution_record(
        resolved_outcome,
        pm_rules::resolution_class_deterministic(),
        tx_context::sender(ctx),
        evidence_hash,
        current_time,
        dispute_window_end,
    );

    pm_market::transition_to_resolution_pending(market, record);

    event::emit(ResolutionProposedEvent<Collateral> {
        market_id,
        outcome: resolved_outcome,
        resolver: tx_context::sender(ctx),
        resolution_class: pm_rules::resolution_class_deterministic(),
        dispute_window_end_ms: dispute_window_end,
    });
}

// ── Class 1: Declared-source resolution ──

/// Resolve a declared-source market. Requires PMVerifierCap.
public fun resolve_declared<Collateral>(
    market: &mut PMMarket<Collateral>,
    _verifier: &PMVerifierCap<Collateral>,
    outcome: u16,
    evidence_hash: vector<u8>,
    clock: &Clock,
    ctx: &TxContext,
) {
    assert!(!pm_market::is_emergency_paused(market), EEmergencyPaused);
    let current_time = sui::clock::timestamp_ms(clock);
    pm_market::ensure_closed(market, current_time);
    assert!(pm_market::state(market) == pm_rules::state_closed(), EMarketNotClosed);
    assert!(pm_market::resolution_class(market) == pm_rules::resolution_class_declared_source(), EWrongResolutionClass);
    assert!(option::is_none(pm_market::resolution(market)), EAlreadyResolved);
    assert!((outcome as u64) < (pm_market::outcome_count(market) as u64), EInvalidOutcome);
    let dispute_window_end = current_time + pm_market::dispute_window_ms(market);
    let market_id = pm_market::market_id(market);

    let record = pm_market::new_resolution_record(
        outcome,
        pm_rules::resolution_class_declared_source(),
        tx_context::sender(ctx),
        evidence_hash,
        current_time,
        dispute_window_end,
    );

    pm_market::transition_to_resolution_pending(market, record);

    event::emit(ResolutionProposedEvent<Collateral> {
        market_id,
        outcome,
        resolver: tx_context::sender(ctx),
        resolution_class: pm_rules::resolution_class_declared_source(),
        dispute_window_end_ms: dispute_window_end,
    });
}

// ── Class 2: Creator-proposed resolution ──

/// Creator proposes a resolution. Starts dispute window.
public fun propose_resolution<Collateral>(
    market: &mut PMMarket<Collateral>,
    outcome: u16,
    evidence_hash: vector<u8>,
    clock: &Clock,
    ctx: &TxContext,
) {
    assert!(!pm_market::is_emergency_paused(market), EEmergencyPaused);
    let current_time = sui::clock::timestamp_ms(clock);
    pm_market::ensure_closed(market, current_time);
    assert!(pm_market::state(market) == pm_rules::state_closed(), EMarketNotClosed);
    assert!(
        pm_market::resolution_class(market) == pm_rules::resolution_class_creator_proposed(),
        EWrongResolutionClass,
    );
    assert!(option::is_none(pm_market::resolution(market)), EAlreadyResolved);
    pm_market::assert_creator(market, ctx);
    assert!((outcome as u64) < (pm_market::outcome_count(market) as u64), EInvalidOutcome);
    let dispute_window_end = current_time + pm_market::dispute_window_ms(market);
    let market_id = pm_market::market_id(market);

    let record = pm_market::new_resolution_record(
        outcome,
        pm_rules::resolution_class_creator_proposed(),
        tx_context::sender(ctx),
        evidence_hash,
        current_time,
        dispute_window_end,
    );

    pm_market::transition_to_resolution_pending(market, record);

    event::emit(ResolutionProposedEvent<Collateral> {
        market_id,
        outcome,
        resolver: tx_context::sender(ctx),
        resolution_class: pm_rules::resolution_class_creator_proposed(),
        dispute_window_end_ms: dispute_window_end,
    });
}

// ── Finalization ──

/// Anyone can finalize a resolution after the dispute window passes undisputed.
public fun finalize_resolution<Collateral>(
    market: &mut PMMarket<Collateral>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(!pm_market::is_emergency_paused(market), EEmergencyPaused);
    assert!(pm_market::state(market) == pm_rules::state_resolution_pending(), ENotResolutionPending);

    let resolution = pm_market::resolution(market);
    let record = option::borrow(resolution);
    let dispute_window_end = pm_market::resolution_dispute_window_end_ms(record);

    let current_time = sui::clock::timestamp_ms(clock);
    assert!(current_time >= dispute_window_end, EDisputeWindowNotPassed);

    let outcome = pm_market::resolution_outcome(record);
    pm_market::transition_to_resolved(market);
    settle_community_resolution_success(market, ctx);
    let market_id = pm_market::market_id(market);

    event::emit(ResolutionFinalizedEvent<Collateral> {
        market_id,
        outcome,
    });
}

// ── Community-proposed resolution ──

/// Community resolution proposal. After creator's priority window expires (24h post-close),
/// ANYONE can propose a resolution by posting a bond equal to the creation bond.
///
/// Priority window: first 24h after close = creator only (via existing propose_resolution).
/// After 24h: anyone can call this function.
///
/// The proposer must post a bond equal to the creation bond amount.
/// If correct (not disputed, or dispute rejected): bond returned + 50% of creator's bond as reward.
/// If wrong (dispute upheld): proposer loses bond (75% to disputer, 25% to treasury).
///
/// Lifecycle:
/// 1. Market closes → 24h creator priority window starts
/// 2. If creator proposes within 24h: normal flow (propose_resolution)
/// 3. If creator doesn't propose within 24h: any community member can call this function
/// 4. Community proposer posts bond (same amount as creation bond)
/// 5. Market transitions to RESOLUTION_PENDING, dispute window starts
/// 6. Same dispute/finalization flow applies
public fun propose_community_resolution<Collateral>(
    market: &mut PMMarket<Collateral>,
    config: &prediction_market::pm_registry::PMConfig<Collateral>,
    proposed_outcome: u16,
    evidence_hash: vector<u8>,
    mut bond_coin: sui::coin::Coin<Collateral>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(!pm_market::is_emergency_paused(market), EEmergencyPaused);
    let current_time = sui::clock::timestamp_ms(clock);
    pm_market::ensure_closed(market, current_time);
    assert!(pm_market::state(market) == pm_rules::state_closed(), EMarketNotClosed);
    assert!(
        pm_market::resolution_class(market) == pm_rules::resolution_class_creator_proposed(),
        EWrongResolutionClass,
    );
    assert!(option::is_none(pm_market::resolution(market)), EAlreadyResolved);
    assert!((proposed_outcome as u64) < (pm_market::outcome_count(market) as u64), EInvalidOutcome);

    // Check that creator priority window has expired
    let creator_priority_window_ms = pm_registry::creator_priority_window_ms(config);
    let priority_window_end = pm_market::close_time_ms(market) + creator_priority_window_ms;
    assert!(current_time >= priority_window_end, ECreatorPriorityWindowNotExpired);

    // Validate bond amount matches creation bond (or treasury requirement)
    // For now, any amount >= creation bond is acceptable, but we enforce a minimum
    let required_bond = pm_registry::creation_bond_for_tier(
        config,
        pm_market::trust_tier(market),
    );
    let bond_amount = coin::value(&bond_coin);
    assert!(bond_amount >= required_bond, EInsufficientCreationBond);

    let bond_payment = coin::split(&mut bond_coin, required_bond, ctx);
    if (coin::value(&bond_coin) > 0) {
        transfer::public_transfer(bond_coin, tx_context::sender(ctx));
    } else {
        coin::destroy_zero(bond_coin);
    };

    let bond_balance = coin::into_balance(bond_payment);
    pm_market::deposit_community_resolution_bond(market, bond_balance, tx_context::sender(ctx));

    let dispute_window_end = current_time + pm_market::dispute_window_ms(market);
    let market_id = pm_market::market_id(market);

    let record = pm_market::new_resolution_record(
        proposed_outcome,
        pm_rules::resolution_class_creator_proposed(),
        tx_context::sender(ctx),
        evidence_hash,
        current_time,
        dispute_window_end,
    );

    pm_market::transition_to_resolution_pending(market, record);

    event::emit(ResolutionProposedEvent<Collateral> {
        market_id,
        outcome: proposed_outcome,
        resolver: tx_context::sender(ctx),
        resolution_class: pm_rules::resolution_class_creator_proposed(),
        dispute_window_end_ms: dispute_window_end,
    });
}

// ── Deadline expiry invalidation ──

/// If resolve deadline passes without any resolution submission, anyone can invalidate.
public fun invalidate_deadline_expired<Collateral>(
    market: &mut PMMarket<Collateral>,
    treasury: &mut PMTreasury<Collateral>,
    clock: &Clock,
) {
    assert!(!pm_market::is_emergency_paused(market), EEmergencyPaused);
    let current_time = sui::clock::timestamp_ms(clock);
    pm_market::ensure_closed(market, current_time);
    assert!(pm_market::state(market) == pm_rules::state_closed(), EMarketNotClosed);
    assert!(option::is_none(pm_market::resolution(market)), EAlreadyResolved);
    assert!(current_time >= pm_market::resolve_deadline_ms(market), EDeadlineNotExpired);

    let market_id = pm_market::market_id(market);

    pm_market::transition_to_invalid(market, pm_rules::invalid_reason_deadline_expired());

    // Forfeit creation bond to treasury (creator failed to resolve by deadline)
    let creator_bond = pm_market::take_creation_bond(market);
    prediction_market::pm_treasury::deposit_forfeited_bond(treasury, creator_bond);

    event::emit(DeadlineInvalidationEvent<Collateral> { market_id });
}
