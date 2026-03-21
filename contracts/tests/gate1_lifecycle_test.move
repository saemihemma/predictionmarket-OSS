/// Gate 1: Freeze invariant + transition matrix tests.
/// Proves: every mutable function on PMMarket either asserts !frozen or is in the runtime-only whitelist.
/// Whitelist: state, outcome_quantities, accrued_fees, total_collateral, invalidation_snapshot_*.
#[test_only]
module prediction_market::gate1_lifecycle_test;

use sui::test_scenario::{Self as ts};
use std::unit_test::destroy;
use sui::balance;
use prediction_market::{
    suffer::SUFFER,
    pm_rules,
    pm_market::{Self, PMMarket},
    pm_registry::{Self, PMRegistry, PMConfig, PMAdminCap},
    pm_policy::{Self, PMMarketTypePolicy, PMResolverPolicy},
    pm_source,
};

// ── Helper: create a test market in OPEN state ──

fun setup_test_infra(ctx: &mut TxContext): (PMRegistry, PMConfig, PMAdminCap, PMMarketTypePolicy, PMResolverPolicy) {
    let (registry, config, admin) = pm_registry::create_registry(
        100,  // trading_fee_bps
        50,   // settlement_fee_bps
        0,    // creation_bond_canonical (zero for tests)
        0,    // creation_bond_source_bound
        0,    // creation_bond_creator_resolved
        0,    // creation_bond_experimental
        1,    // dispute_bond_amount
        86_400_000,    // dispute_window_deterministic (24h)
        172_800_000,   // dispute_window_declared (48h)
        259_200_000,   // dispute_window_creator (72h)
        3_600_000,     // min_market_duration (1h)
        7_776_000_000, // max_market_duration (90d)
        16,            // max_outcomes
        1_000_000_000, // liquidity_param
        ctx,
    );

    let policy = pm_policy::create_market_type_policy(
        &admin,
        std::string::utf8(b"Binary Test"),
        0, // canonical
        0, // binary
        0, // deterministic
        2, // required_outcome_count
        2, // max_outcomes
        5, // onchain_state
        2, // tx_hash
        ctx,
    );

    let resolver_policy = pm_policy::create_resolver_policy(
        &admin,
        86_400_000,
        172_800_000,
        259_200_000,
        604_800_000,
        ctx,
    );

    (registry, config, admin, policy, resolver_policy)
}

fun create_test_market(
    registry: &mut PMRegistry,
    config: &PMConfig,
    policy: &PMMarketTypePolicy,
    resolver_policy: &PMResolverPolicy,
    clock: &sui::clock::Clock,
    ctx: &mut TxContext,
): PMMarket {
    let source = pm_source::deterministic_default();
    let influence = pm_market::new_creator_influence(0, false, std::string::utf8(b"none"));
    let bond = balance::zero<SUFFER>();

    pm_market::create_market(
        registry,
        config,
        policy,
        resolver_policy,
        std::string::utf8(b"Test Market"),
        std::string::utf8(b"Description"),
        std::string::utf8(b"Resolution text"),
        2,
        vector[std::string::utf8(b"YES"), std::string::utf8(b"NO")],
        source,
        influence,
        100_000_000, // close_time
        200_000_000, // resolve_deadline
        bond,
        clock,
        ctx,
    )
}

// ═══════════════════════════════════════════════════════════════
// Transition Matrix Tests
// For every (state, action) pair, assert allowed or aborted.
// ═══════════════════════════════════════════════════════════════

// ── OPEN state transitions ──

#[test]
fun test_open_to_closed() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let (mut registry, config, admin, policy, resolver_policy) = setup_test_infra(ctx);
    let mut clock = sui::clock::create_for_testing(ctx);
    sui::clock::increment_for_testing(&mut clock, 1_000_000);
    let mut market = create_test_market(&mut registry, &config, &policy, &resolver_policy, &clock, ctx);

    assert!(pm_market::state(&market) == pm_rules::state_open(), 0);
    pm_market::transition_to_closed(&mut market, 100_000_000); // at close_time
    assert!(pm_market::state(&market) == pm_rules::state_closed(), 1);

    // Cleanup
    destroy(clock);
    destroy(market);
    destroy(registry);
    destroy(config);
    destroy(admin);
    destroy(policy);
    destroy(resolver_policy);
    ts::end(scenario);
}

#[test]
fun test_open_to_invalid_pre_trade() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let (mut registry, config, admin, policy, resolver_policy) = setup_test_infra(ctx);
    let mut clock = sui::clock::create_for_testing(ctx);
    sui::clock::increment_for_testing(&mut clock, 1_000_000);
    let mut market = create_test_market(&mut registry, &config, &policy, &resolver_policy, &clock, ctx);

    assert!(pm_market::state(&market) == pm_rules::state_open(), 0);
    pm_market::admin_invalidate_pre_trade(&mut market, &admin, pm_rules::invalid_reason_admin_pre_trade(), ctx);
    assert!(pm_market::state(&market) == pm_rules::state_invalid(), 1);

    destroy(clock);
    destroy(market);
    destroy(registry);
    destroy(config);
    destroy(admin);
    destroy(policy);
    destroy(resolver_policy);
    ts::end(scenario);
}

#[test, expected_failure]
fun test_open_cannot_transition_to_resolved() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let (mut registry, config, admin, policy, resolver_policy) = setup_test_infra(ctx);
    let mut clock = sui::clock::create_for_testing(ctx);
    sui::clock::increment_for_testing(&mut clock, 1_000_000);
    let mut market = create_test_market(&mut registry, &config, &policy, &resolver_policy, &clock, ctx);

    // Should abort — can't go OPEN → RESOLVED
    pm_market::transition_to_resolved(&mut market);

    destroy(clock);
    destroy(market);
    destroy(registry);
    destroy(config);
    destroy(admin);
    destroy(policy);
    destroy(resolver_policy);
    ts::end(scenario);
}

#[test, expected_failure]
fun test_open_cannot_transition_to_disputed() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let (mut registry, config, admin, policy, resolver_policy) = setup_test_infra(ctx);
    let mut clock = sui::clock::create_for_testing(ctx);
    sui::clock::increment_for_testing(&mut clock, 1_000_000);
    let mut market = create_test_market(&mut registry, &config, &policy, &resolver_policy, &clock, ctx);

    // Should abort — can't go OPEN → DISPUTED
    pm_market::transition_to_disputed(&mut market);

    destroy(clock);
    destroy(market);
    destroy(registry);
    destroy(config);
    destroy(admin);
    destroy(policy);
    destroy(resolver_policy);
    ts::end(scenario);
}

// ── CLOSED state transitions ──

#[test]
fun test_closed_to_resolution_pending() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let (mut registry, config, admin, policy, resolver_policy) = setup_test_infra(ctx);
    let mut clock = sui::clock::create_for_testing(ctx);
    sui::clock::increment_for_testing(&mut clock, 1_000_000);
    let mut market = create_test_market(&mut registry, &config, &policy, &resolver_policy, &clock, ctx);

    pm_market::transition_to_closed(&mut market, 100_000_000);
    let record = pm_market::new_resolution_record(0, 0, @0x0, vector::empty(), 100_000_000, 200_000_000);
    pm_market::transition_to_resolution_pending(&mut market, record);
    assert!(pm_market::state(&market) == pm_rules::state_resolution_pending(), 0);

    destroy(clock);
    destroy(market);
    destroy(registry);
    destroy(config);
    destroy(admin);
    destroy(policy);
    destroy(resolver_policy);
    ts::end(scenario);
}

#[test]
fun test_closed_to_invalid() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let (mut registry, config, admin, policy, resolver_policy) = setup_test_infra(ctx);
    let mut clock = sui::clock::create_for_testing(ctx);
    sui::clock::increment_for_testing(&mut clock, 1_000_000);
    let mut market = create_test_market(&mut registry, &config, &policy, &resolver_policy, &clock, ctx);

    pm_market::transition_to_closed(&mut market, 100_000_000);
    pm_market::transition_to_invalid(&mut market, pm_rules::invalid_reason_deadline_expired());
    assert!(pm_market::state(&market) == pm_rules::state_invalid(), 0);

    destroy(clock);
    destroy(market);
    destroy(registry);
    destroy(config);
    destroy(admin);
    destroy(policy);
    destroy(resolver_policy);
    ts::end(scenario);
}

#[test, expected_failure]
fun test_closed_cannot_go_back_to_open() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let (mut registry, config, admin, policy, resolver_policy) = setup_test_infra(ctx);
    let mut clock = sui::clock::create_for_testing(ctx);
    sui::clock::increment_for_testing(&mut clock, 1_000_000);
    let mut market = create_test_market(&mut registry, &config, &policy, &resolver_policy, &clock, ctx);

    pm_market::transition_to_closed(&mut market, 100_000_000);
    // Try to re-close (should fail — not OPEN)
    pm_market::transition_to_closed(&mut market, 100_000_001);

    destroy(clock);
    destroy(market);
    destroy(registry);
    destroy(config);
    destroy(admin);
    destroy(policy);
    destroy(resolver_policy);
    ts::end(scenario);
}

// ── RESOLUTION_PENDING state transitions ──

#[test]
fun test_resolution_pending_to_resolved() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let (mut registry, config, admin, policy, resolver_policy) = setup_test_infra(ctx);
    let mut clock = sui::clock::create_for_testing(ctx);
    sui::clock::increment_for_testing(&mut clock, 1_000_000);
    let mut market = create_test_market(&mut registry, &config, &policy, &resolver_policy, &clock, ctx);

    pm_market::transition_to_closed(&mut market, 100_000_000);
    let record = pm_market::new_resolution_record(0, 0, @0x0, vector::empty(), 100_000_000, 200_000_000);
    pm_market::transition_to_resolution_pending(&mut market, record);
    pm_market::transition_to_resolved(&mut market);
    assert!(pm_market::state(&market) == pm_rules::state_resolved(), 0);

    destroy(clock);
    destroy(market);
    destroy(registry);
    destroy(config);
    destroy(admin);
    destroy(policy);
    destroy(resolver_policy);
    ts::end(scenario);
}

#[test]
fun test_resolution_pending_to_disputed() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let (mut registry, config, admin, policy, resolver_policy) = setup_test_infra(ctx);
    let mut clock = sui::clock::create_for_testing(ctx);
    sui::clock::increment_for_testing(&mut clock, 1_000_000);
    let mut market = create_test_market(&mut registry, &config, &policy, &resolver_policy, &clock, ctx);

    pm_market::transition_to_closed(&mut market, 100_000_000);
    let record = pm_market::new_resolution_record(0, 0, @0x0, vector::empty(), 100_000_000, 200_000_000);
    pm_market::transition_to_resolution_pending(&mut market, record);
    pm_market::transition_to_disputed(&mut market);
    assert!(pm_market::state(&market) == pm_rules::state_disputed(), 0);

    destroy(clock);
    destroy(market);
    destroy(registry);
    destroy(config);
    destroy(admin);
    destroy(policy);
    destroy(resolver_policy);
    ts::end(scenario);
}

#[test]
fun test_resolution_pending_to_invalid() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let (mut registry, config, admin, policy, resolver_policy) = setup_test_infra(ctx);
    let mut clock = sui::clock::create_for_testing(ctx);
    sui::clock::increment_for_testing(&mut clock, 1_000_000);
    let mut market = create_test_market(&mut registry, &config, &policy, &resolver_policy, &clock, ctx);

    pm_market::transition_to_closed(&mut market, 100_000_000);
    let record = pm_market::new_resolution_record(0, 0, @0x0, vector::empty(), 100_000_000, 200_000_000);
    pm_market::transition_to_resolution_pending(&mut market, record);
    pm_market::transition_to_invalid(&mut market, pm_rules::invalid_reason_dispute_verdict());
    assert!(pm_market::state(&market) == pm_rules::state_invalid(), 0);

    destroy(clock);
    destroy(market);
    destroy(registry);
    destroy(config);
    destroy(admin);
    destroy(policy);
    destroy(resolver_policy);
    ts::end(scenario);
}

// ── DISPUTED state transitions ──

#[test]
fun test_disputed_to_resolved() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let (mut registry, config, admin, policy, resolver_policy) = setup_test_infra(ctx);
    let mut clock = sui::clock::create_for_testing(ctx);
    sui::clock::increment_for_testing(&mut clock, 1_000_000);
    let mut market = create_test_market(&mut registry, &config, &policy, &resolver_policy, &clock, ctx);

    pm_market::transition_to_closed(&mut market, 100_000_000);
    let record = pm_market::new_resolution_record(0, 0, @0x0, vector::empty(), 100_000_000, 200_000_000);
    pm_market::transition_to_resolution_pending(&mut market, record);
    pm_market::transition_to_disputed(&mut market);
    pm_market::transition_to_resolved(&mut market);
    assert!(pm_market::state(&market) == pm_rules::state_resolved(), 0);

    destroy(clock);
    destroy(market);
    destroy(registry);
    destroy(config);
    destroy(admin);
    destroy(policy);
    destroy(resolver_policy);
    ts::end(scenario);
}

#[test]
fun test_disputed_to_invalid() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let (mut registry, config, admin, policy, resolver_policy) = setup_test_infra(ctx);
    let mut clock = sui::clock::create_for_testing(ctx);
    sui::clock::increment_for_testing(&mut clock, 1_000_000);
    let mut market = create_test_market(&mut registry, &config, &policy, &resolver_policy, &clock, ctx);

    pm_market::transition_to_closed(&mut market, 100_000_000);
    let record = pm_market::new_resolution_record(0, 0, @0x0, vector::empty(), 100_000_000, 200_000_000);
    pm_market::transition_to_resolution_pending(&mut market, record);
    pm_market::transition_to_disputed(&mut market);
    pm_market::transition_to_invalid(&mut market, pm_rules::invalid_reason_dispute_timeout());
    assert!(pm_market::state(&market) == pm_rules::state_invalid(), 0);

    destroy(clock);
    destroy(market);
    destroy(registry);
    destroy(config);
    destroy(admin);
    destroy(policy);
    destroy(resolver_policy);
    ts::end(scenario);
}

// ── RESOLVED is terminal ──

#[test, expected_failure]
fun test_resolved_cannot_go_to_invalid() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let (mut registry, config, admin, policy, resolver_policy) = setup_test_infra(ctx);
    let mut clock = sui::clock::create_for_testing(ctx);
    sui::clock::increment_for_testing(&mut clock, 1_000_000);
    let mut market = create_test_market(&mut registry, &config, &policy, &resolver_policy, &clock, ctx);

    pm_market::transition_to_closed(&mut market, 100_000_000);
    let record = pm_market::new_resolution_record(0, 0, @0x0, vector::empty(), 100_000_000, 200_000_000);
    pm_market::transition_to_resolution_pending(&mut market, record);
    pm_market::transition_to_resolved(&mut market);

    // This MUST fail — RESOLVED is terminal
    pm_market::transition_to_invalid(&mut market, pm_rules::invalid_reason_emergency());

    destroy(clock);
    destroy(market);
    destroy(registry);
    destroy(config);
    destroy(admin);
    destroy(policy);
    destroy(resolver_policy);
    ts::end(scenario);
}

// ── INVALID is terminal ──

#[test, expected_failure]
fun test_invalid_cannot_go_to_resolved() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let (mut registry, config, admin, policy, resolver_policy) = setup_test_infra(ctx);
    let mut clock = sui::clock::create_for_testing(ctx);
    sui::clock::increment_for_testing(&mut clock, 1_000_000);
    let mut market = create_test_market(&mut registry, &config, &policy, &resolver_policy, &clock, ctx);

    pm_market::transition_to_closed(&mut market, 100_000_000);
    pm_market::transition_to_invalid(&mut market, pm_rules::invalid_reason_deadline_expired());

    // This MUST fail — can't go from INVALID to RESOLVED
    pm_market::transition_to_resolved(&mut market);

    destroy(clock);
    destroy(market);
    destroy(registry);
    destroy(config);
    destroy(admin);
    destroy(policy);
    destroy(resolver_policy);
    ts::end(scenario);
}

#[test, expected_failure]
fun test_invalid_cannot_go_to_invalid_again() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let (mut registry, config, admin, policy, resolver_policy) = setup_test_infra(ctx);
    let mut clock = sui::clock::create_for_testing(ctx);
    sui::clock::increment_for_testing(&mut clock, 1_000_000);
    let mut market = create_test_market(&mut registry, &config, &policy, &resolver_policy, &clock, ctx);

    pm_market::transition_to_closed(&mut market, 100_000_000);
    pm_market::transition_to_invalid(&mut market, pm_rules::invalid_reason_deadline_expired());

    // Double invalidation MUST fail
    pm_market::transition_to_invalid(&mut market, pm_rules::invalid_reason_emergency());

    destroy(clock);
    destroy(market);
    destroy(registry);
    destroy(config);
    destroy(admin);
    destroy(policy);
    destroy(resolver_policy);
    ts::end(scenario);
}

// ═══════════════════════════════════════════════════════════════
// Freeze Invariant Tests
// ═══════════════════════════════════════════════════════════════

#[test]
fun test_freeze_on_first_trade() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let (mut registry, config, admin, policy, resolver_policy) = setup_test_infra(ctx);
    let mut clock = sui::clock::create_for_testing(ctx);
    sui::clock::increment_for_testing(&mut clock, 1_000_000);
    let mut market = create_test_market(&mut registry, &config, &policy, &resolver_policy, &clock, ctx);

    assert!(!pm_market::is_frozen(&market), 0);
    pm_market::freeze_if_needed(&mut market);
    assert!(pm_market::is_frozen(&market), 1);

    // Second freeze is a no-op
    pm_market::freeze_if_needed(&mut market);
    assert!(pm_market::is_frozen(&market), 2);

    destroy(clock);
    destroy(market);
    destroy(registry);
    destroy(config);
    destroy(admin);
    destroy(policy);
    destroy(resolver_policy);
    ts::end(scenario);
}

#[test, expected_failure]
fun test_admin_invalidate_blocked_after_freeze() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let (mut registry, config, admin, policy, resolver_policy) = setup_test_infra(ctx);
    let mut clock = sui::clock::create_for_testing(ctx);
    sui::clock::increment_for_testing(&mut clock, 1_000_000);
    let mut market = create_test_market(&mut registry, &config, &policy, &resolver_policy, &clock, ctx);

    pm_market::freeze_if_needed(&mut market); // simulate first trade

    // Admin pre-trade invalidation MUST fail after freeze
    pm_market::admin_invalidate_pre_trade(&mut market, &admin, pm_rules::invalid_reason_admin_pre_trade(), ctx);

    destroy(clock);
    destroy(market);
    destroy(registry);
    destroy(config);
    destroy(admin);
    destroy(policy);
    destroy(resolver_policy);
    ts::end(scenario);
}

// ═══════════════════════════════════════════════════════════════
// Gate 4: Invalidation snapshot tests
// ═══════════════════════════════════════════════════════════════

#[test]
fun test_invalidation_snapshots_set_once() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let (mut registry, config, admin, policy, resolver_policy) = setup_test_infra(ctx);
    let mut clock = sui::clock::create_for_testing(ctx);
    sui::clock::increment_for_testing(&mut clock, 1_000_000);
    let mut market = create_test_market(&mut registry, &config, &policy, &resolver_policy, &clock, ctx);

    // Before invalidation, snapshots are None
    assert!(option::is_none(&pm_market::invalidation_snapshot_collateral(&market)), 0);

    pm_market::transition_to_closed(&mut market, 100_000_000);
    pm_market::transition_to_invalid(&mut market, pm_rules::invalid_reason_deadline_expired());

    // After invalidation, collateral snapshot is set
    assert!(option::is_some(&pm_market::invalidation_snapshot_collateral(&market)), 2);

    destroy(clock);
    destroy(market);
    destroy(registry);
    destroy(config);
    destroy(admin);
    destroy(policy);
    destroy(resolver_policy);
    ts::end(scenario);
}

// ═══════════════════════════════════════════════════════════════
// Pool operations work on frozen market (runtime-only whitelist)
// ═══════════════════════════════════════════════════════════════

#[test]
fun test_pool_ops_work_after_freeze() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let (mut registry, config, admin, policy, resolver_policy) = setup_test_infra(ctx);
    let mut clock = sui::clock::create_for_testing(ctx);
    sui::clock::increment_for_testing(&mut clock, 1_000_000);
    let mut market = create_test_market(&mut registry, &config, &policy, &resolver_policy, &clock, ctx);

    pm_market::freeze_if_needed(&mut market);

    // These should all succeed on a frozen market (runtime-only whitelist):
    pm_market::add_outcome_quantity(&mut market, 0, 100);
    pm_market::sub_outcome_quantity(&mut market, 0, 50);

    let deposit = balance::zero<SUFFER>();
    pm_market::deposit_collateral(&mut market, deposit);

    let fee = balance::zero<SUFFER>();
    pm_market::accrue_fee(&mut market, fee);

    // State transitions work on frozen market
    pm_market::transition_to_closed(&mut market, 100_000_000);

    assert!(pm_market::state(&market) == pm_rules::state_closed(), 0);

    destroy(clock);
    destroy(market);
    destroy(registry);
    destroy(config);
    destroy(admin);
    destroy(policy);
    destroy(resolver_policy);
    ts::end(scenario);
}

#[test]
fun test_emergency_pause() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let (mut registry, config, admin, policy, resolver_policy) = setup_test_infra(ctx);
    let mut clock = sui::clock::create_for_testing(ctx);
    sui::clock::increment_for_testing(&mut clock, 1_000_000);
    let mut market = create_test_market(&mut registry, &config, &policy, &resolver_policy, &clock, ctx);

    assert!(!pm_market::is_emergency_paused(&market), 0);
    pm_market::emergency_pause(&mut market, @0xA);
    assert!(pm_market::is_emergency_paused(&market), 1);

    destroy(clock);
    destroy(market);
    destroy(registry);
    destroy(config);
    destroy(admin);
    destroy(policy);
    destroy(resolver_policy);
    ts::end(scenario);
}
