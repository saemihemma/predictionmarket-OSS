/// Market type policies and resolver policies.
module prediction_market::pm_policy;

use std::string::String;
use sui::event;
use prediction_market::pm_rules;

// ── Errors ──
#[error(code = 0)]
const EInvalidMarketType: vector<u8> = b"Invalid market type for policy";
#[error(code = 1)]
const EInvalidTrustTier: vector<u8> = b"Invalid trust tier for policy";
#[error(code = 2)]
const EInvalidResolutionClass: vector<u8> = b"Invalid resolution class for policy";
#[error(code = 3)]
const EOutcomeCountExceedsMax: vector<u8> = b"Outcome count exceeds policy maximum";
#[error(code = 4)]
const EOutcomeCountMismatch: vector<u8> = b"Outcome count does not match policy";
#[error(code = 5)]
const EPolicyNotActive: vector<u8> = b"Policy is not active";
#[error(code = 6)]
const EInvalidSourceClass: vector<u8> = b"Source class does not match policy";
#[error(code = 7)]
const EInvalidEvidenceFormat: vector<u8> = b"Evidence format does not match policy";

// ── Events ──

public struct MarketTypePolicyCreatedEvent<phantom Collateral> has copy, drop {
    policy_id: ID,
    trust_tier: u8,
    market_type: u8,
    resolution_class: u8,
    version: u64,
}

public struct ResolverPolicyCreatedEvent<phantom Collateral> has copy, drop {
    policy_id: ID,
    version: u64,
}

/// Defines allowed market structures for a specific trust tier + market type combination.
public struct PMMarketTypePolicy<phantom Collateral> has key, store {
    id: UID,
    version: u64,
    name: String,
    trust_tier: u8,
    market_type: u8,
    resolution_class: u8,
    required_outcome_count: u16,
    max_outcomes: u16,
    required_source_class: u8,
    required_evidence_format: u8,
    active: bool,
}

/// Global resolver policy (v1: single global policy).
public struct PMResolverPolicy<phantom Collateral> has key, store {
    id: UID,
    version: u64,
    dispute_window_deterministic_ms: u64,
    dispute_window_declared_ms: u64,
    dispute_window_creator_ms: u64,
    escalation_timeout_ms: u64,
    active: bool,
}

// ── Market Type Policy creation ──

public fun create_market_type_policy<Collateral>(
    _admin: &prediction_market::pm_registry::PMAdminCap<Collateral>,
    name: String,
    trust_tier: u8,
    market_type: u8,
    resolution_class: u8,
    required_outcome_count: u16,
    max_outcomes: u16,
    required_source_class: u8,
    required_evidence_format: u8,
    ctx: &mut TxContext,
): PMMarketTypePolicy<Collateral> {
    assert!(pm_rules::is_valid_trust_tier(trust_tier), EInvalidTrustTier);
    assert!(pm_rules::is_valid_market_type(market_type), EInvalidMarketType);
    assert!(pm_rules::is_valid_resolution_class(resolution_class), EInvalidResolutionClass);

    let policy = PMMarketTypePolicy<Collateral> {
        id: object::new(ctx),
        version: 1,
        name,
        trust_tier,
        market_type,
        resolution_class,
        required_outcome_count,
        max_outcomes,
        required_source_class,
        required_evidence_format,
        active: true,
    };

    event::emit(MarketTypePolicyCreatedEvent<Collateral> {
        policy_id: object::id(&policy),
        trust_tier,
        market_type,
        resolution_class,
        version: 1,
    });

    policy
}

/// Testnet bootstrap intentionally creates and shares a fresh policy in one helper.
#[allow(lint(share_owned))]
public fun create_and_share_market_type_policy<Collateral>(
    admin: &prediction_market::pm_registry::PMAdminCap<Collateral>,
    name: String,
    trust_tier: u8,
    market_type: u8,
    resolution_class: u8,
    required_outcome_count: u16,
    max_outcomes: u16,
    required_source_class: u8,
    required_evidence_format: u8,
    ctx: &mut TxContext,
) {
    let policy = create_market_type_policy(
        admin,
        name,
        trust_tier,
        market_type,
        resolution_class,
        required_outcome_count,
        max_outcomes,
        required_source_class,
        required_evidence_format,
        ctx,
    );
    transfer::share_object(policy);
}

public fun validate_market_against_policy<Collateral>(
    policy: &PMMarketTypePolicy<Collateral>,
    market_type: u8,
    trust_tier: u8,
    resolution_class: u8,
    outcome_count: u16,
    source_class: u8,
    evidence_format: u8,
) {
    assert!(policy.active, EPolicyNotActive);
    assert!(market_type == policy.market_type, EInvalidMarketType);
    assert!(trust_tier == policy.trust_tier, EInvalidTrustTier);
    assert!(resolution_class == policy.resolution_class, EInvalidResolutionClass);
    assert!(source_class == policy.required_source_class, EInvalidSourceClass);
    assert!(evidence_format == policy.required_evidence_format, EInvalidEvidenceFormat);
    if (policy.required_outcome_count > 0) {
        assert!(outcome_count == policy.required_outcome_count, EOutcomeCountMismatch);
    } else {
        assert!(outcome_count <= policy.max_outcomes, EOutcomeCountExceedsMax);
    };
}

// ── Resolver Policy creation ──

public fun create_resolver_policy<Collateral>(
    _admin: &prediction_market::pm_registry::PMAdminCap<Collateral>,
    dispute_window_deterministic_ms: u64,
    dispute_window_declared_ms: u64,
    dispute_window_creator_ms: u64,
    escalation_timeout_ms: u64,
    ctx: &mut TxContext,
): PMResolverPolicy<Collateral> {
    let policy = PMResolverPolicy<Collateral> {
        id: object::new(ctx),
        version: 1,
        dispute_window_deterministic_ms,
        dispute_window_declared_ms,
        dispute_window_creator_ms,
        escalation_timeout_ms,
        active: true,
    };

    event::emit(ResolverPolicyCreatedEvent<Collateral> {
        policy_id: object::id(&policy),
        version: 1,
    });

    policy
}

/// Testnet bootstrap intentionally creates and shares a fresh resolver policy in one helper.
#[allow(lint(share_owned))]
public fun create_and_share_resolver_policy<Collateral>(
    admin: &prediction_market::pm_registry::PMAdminCap<Collateral>,
    dispute_window_deterministic_ms: u64,
    dispute_window_declared_ms: u64,
    dispute_window_creator_ms: u64,
    escalation_timeout_ms: u64,
    ctx: &mut TxContext,
) {
    let policy = create_resolver_policy(
        admin,
        dispute_window_deterministic_ms,
        dispute_window_declared_ms,
        dispute_window_creator_ms,
        escalation_timeout_ms,
        ctx,
    );
    transfer::share_object(policy);
}

// ── Read accessors ──

public fun policy_version<Collateral>(p: &PMMarketTypePolicy<Collateral>): u64 { p.version }
public fun policy_trust_tier<Collateral>(p: &PMMarketTypePolicy<Collateral>): u8 { p.trust_tier }
public fun policy_market_type<Collateral>(p: &PMMarketTypePolicy<Collateral>): u8 { p.market_type }
public fun policy_resolution_class<Collateral>(p: &PMMarketTypePolicy<Collateral>): u8 { p.resolution_class }
public fun policy_required_outcome_count<Collateral>(p: &PMMarketTypePolicy<Collateral>): u16 { p.required_outcome_count }
public fun policy_max_outcomes<Collateral>(p: &PMMarketTypePolicy<Collateral>): u16 { p.max_outcomes }
public fun policy_required_source_class<Collateral>(p: &PMMarketTypePolicy<Collateral>): u8 { p.required_source_class }
public fun policy_required_evidence_format<Collateral>(p: &PMMarketTypePolicy<Collateral>): u8 { p.required_evidence_format }
public fun policy_is_active<Collateral>(p: &PMMarketTypePolicy<Collateral>): bool { p.active }

public fun resolver_version<Collateral>(p: &PMResolverPolicy<Collateral>): u64 { p.version }
public fun resolver_dispute_window_for_class<Collateral>(p: &PMResolverPolicy<Collateral>, resolution_class: u8): u64 {
    if (resolution_class == 0) { p.dispute_window_deterministic_ms }
    else if (resolution_class == 1) { p.dispute_window_declared_ms }
    else { p.dispute_window_creator_ms }
}
public fun resolver_escalation_timeout_ms<Collateral>(p: &PMResolverPolicy<Collateral>): u64 { p.escalation_timeout_ms }
public fun resolver_is_active<Collateral>(p: &PMResolverPolicy<Collateral>): bool { p.active }

/// RT-043: Policy deactivation does not affect existing markets.
/// Markets store policy_id at creation time (immutable). Deactivating a policy
/// only prevents NEW markets from using it. Existing markets continue to reference
/// the policy by ID regardless of its active status.
public fun deactivate_market_type_policy<Collateral>(
    policy: &mut PMMarketTypePolicy<Collateral>,
    _admin: &prediction_market::pm_registry::PMAdminCap<Collateral>,
) {
    policy.active = false;
}

public fun deactivate_resolver_policy<Collateral>(
    policy: &mut PMResolverPolicy<Collateral>,
    _admin: &prediction_market::pm_registry::PMAdminCap<Collateral>,
) {
    policy.active = false;
}
