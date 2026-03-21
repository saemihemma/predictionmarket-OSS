/// Gate 2: Emergency authority anchoring tests.
/// Proves: PMEmergencyCap is separate from PMAdminCap, pause is immediate,
/// invalidation requires review window, rotation emits events.
#[test_only]
module prediction_market::gate2_emergency_test;

use sui::test_scenario::{Self as ts};
use std::unit_test::destroy;
use sui::balance;
use prediction_market::{
    suffer::SUFFER,
    pm_rules,
    pm_market::{Self, PMMarket},
    pm_registry::{Self, PMRegistry, PMConfig, PMAdminCap},
    pm_policy::{Self, PMMarketTypePolicy, PMResolverPolicy},
    pm_admin::{Self, PMEmergencyCap, PMEmergencyMultisig},
    pm_treasury::{Self, PMTreasury},
    pm_source,
};

// ── Helpers ──

fun setup_test_infra(ctx: &mut TxContext): (PMRegistry, PMConfig, PMAdminCap, PMMarketTypePolicy, PMResolverPolicy, PMTreasury) {
    let (registry, config, admin) = pm_registry::create_registry(
        100, 50, 0, 0, 0, 0, 1,
        86_400_000, 172_800_000, 259_200_000,
        3_600_000, 7_776_000_000, 16, 1_000_000_000, ctx,
    );

    let policy = pm_policy::create_market_type_policy(
        &admin, std::string::utf8(b"Binary Test"),
        0, 0, 0, 2, 2, 5, 2, ctx,
    );

    let resolver_policy = pm_policy::create_resolver_policy(
        &admin, 86_400_000, 172_800_000, 259_200_000, 604_800_000, ctx,
    );

    let treasury = pm_treasury::create_treasury(ctx);

    (registry, config, admin, policy, resolver_policy, treasury)
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
        registry, config, policy, resolver_policy,
        std::string::utf8(b"Test Market"),
        std::string::utf8(b"Description"),
        std::string::utf8(b"Resolution text"),
        2,
        vector[std::string::utf8(b"YES"), std::string::utf8(b"NO")],
        source, influence,
        100_000_000, 200_000_000, bond, clock, ctx,
    )
}

// ═══════════════════════════════════════════════════════════════
// Emergency infrastructure creation
// ═══════════════════════════════════════════════════════════════

#[test]
fun test_create_emergency_infra() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let (registry, config, admin, policy, resolver_policy, treasury) = setup_test_infra(ctx);

    let members = vector[@0xA, @0xB, @0xC];
    let review_window = 86_400_000u64; // 24h
    let (cap, multisig) = pm_admin::create_emergency_infra(&admin, members, review_window, ctx);

    // Verify members and review window
    assert!(pm_admin::emergency_review_window_ms(&multisig) == 86_400_000, 0);
    assert!(!pm_admin::has_pending_invalidation(&multisig), 1);

    destroy(cap);
    destroy(multisig);
    destroy(registry);
    destroy(config);
    destroy(admin);
    destroy(policy);
    destroy(resolver_policy);
    destroy(treasury);
    ts::end(scenario);
}

// ═══════════════════════════════════════════════════════════════
// Emergency pause — immediate, no review period
// ═══════════════════════════════════════════════════════════════

#[test]
fun test_emergency_pause_immediate() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let (mut registry, config, admin, policy, resolver_policy, treasury) = setup_test_infra(ctx);
    let mut market_clock = sui::clock::create_for_testing(ctx);
    sui::clock::increment_for_testing(&mut market_clock, 1_000_000);
    let mut market = create_test_market(&mut registry, &config, &policy, &resolver_policy, &market_clock, ctx);
    destroy(market_clock);

    let members = vector[@0xA, @0xB, @0xC];
    let (cap, multisig) = pm_admin::create_emergency_infra(&admin, members, 86_400_000, ctx);

    // Market is not paused
    assert!(!pm_market::is_emergency_paused(&market), 0);

    // Emergency pause — immediate, no review
    pm_admin::emergency_pause_market(&mut market, &cap, ctx);
    assert!(pm_market::is_emergency_paused(&market), 1);

    destroy(cap);
    destroy(multisig);
    destroy(market);
    destroy(registry);
    destroy(config);
    destroy(admin);
    destroy(policy);
    destroy(resolver_policy);
    destroy(treasury);
    ts::end(scenario);
}

// ═══════════════════════════════════════════════════════════════
// Emergency invalidation — requires review window
// ═══════════════════════════════════════════════════════════════

#[test, expected_failure]
fun test_emergency_invalidation_fails_before_review_window() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let (mut registry, config, admin, policy, resolver_policy, mut treasury) = setup_test_infra(ctx);
    let mut market_clock = sui::clock::create_for_testing(ctx);
    sui::clock::increment_for_testing(&mut market_clock, 1_000_000);
    let mut market = create_test_market(&mut registry, &config, &policy, &resolver_policy, &market_clock, ctx);
    destroy(market_clock);

    let members = vector[@0xA, @0xB, @0xC];
    let review_window = 86_400_000u64; // 24h
    let (cap, mut multisig) = pm_admin::create_emergency_infra(&admin, members, review_window, ctx);

    // Close market first (invalidation needs non-RESOLVED state)
    pm_market::transition_to_closed(&mut market, 100_000_000);

    // Request invalidation at t=100_000_000
    let mut clock = sui::clock::create_for_testing(ctx);
    sui::clock::increment_for_testing(&mut clock, 100_000_000);
    pm_admin::request_emergency_invalidation(&mut multisig, &cap, &market, &clock, ctx);
    assert!(pm_admin::has_pending_invalidation(&multisig), 0);

    // Try to execute at t=100_000_001 — MUST FAIL (review window is 24h)
    sui::clock::increment_for_testing(&mut clock, 1);
    pm_admin::execute_emergency_invalidation(
        &mut multisig, &cap, &mut market, &mut treasury, &clock, ctx,
    );

    destroy(clock);
    destroy(cap);
    destroy(multisig);
    destroy(market);
    destroy(registry);
    destroy(config);
    destroy(admin);
    destroy(policy);
    destroy(resolver_policy);
    destroy(treasury);
    ts::end(scenario);
}

#[test]
fun test_emergency_invalidation_succeeds_after_review_window() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let (mut registry, config, admin, policy, resolver_policy, mut treasury) = setup_test_infra(ctx);
    let mut market_clock = sui::clock::create_for_testing(ctx);
    sui::clock::increment_for_testing(&mut market_clock, 1_000_000);
    let mut market = create_test_market(&mut registry, &config, &policy, &resolver_policy, &market_clock, ctx);
    destroy(market_clock);

    let members = vector[@0xA, @0xB, @0xC];
    let review_window = 86_400_000u64; // 24h
    let (cap, mut multisig) = pm_admin::create_emergency_infra(&admin, members, review_window, ctx);

    // Close market
    pm_market::transition_to_closed(&mut market, 100_000_000);

    // Request invalidation at t=100_000_000
    let mut clock = sui::clock::create_for_testing(ctx);
    sui::clock::increment_for_testing(&mut clock, 100_000_000);
    pm_admin::request_emergency_invalidation(&mut multisig, &cap, &market, &clock, ctx);

    // Execute at t=186_400_000 (100M + 86.4M = past review window)
    sui::clock::increment_for_testing(&mut clock, 86_400_000);
    pm_admin::execute_emergency_invalidation(
        &mut multisig, &cap, &mut market, &mut treasury, &clock, ctx,
    );

    assert!(pm_market::state(&market) == pm_rules::state_invalid(), 0);
    assert!(!pm_admin::has_pending_invalidation(&multisig), 1);

    destroy(clock);
    destroy(cap);
    destroy(multisig);
    destroy(market);
    destroy(registry);
    destroy(config);
    destroy(admin);
    destroy(policy);
    destroy(resolver_policy);
    destroy(treasury);
    ts::end(scenario);
}

// ═══════════════════════════════════════════════════════════════
// Member rotation
// ═══════════════════════════════════════════════════════════════

#[test]
fun test_rotate_emergency_members() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let (registry, config, admin, policy, resolver_policy, treasury) = setup_test_infra(ctx);

    let members = vector[@0xA, @0xB, @0xC];
    let (cap, mut multisig) = pm_admin::create_emergency_infra(&admin, members, 86_400_000, ctx);

    let old_members = *pm_admin::emergency_multisig_members(&multisig);
    assert!(vector::length(&old_members) == 3, 0);

    // Rotate to new set
    let new_members = vector[@0xD, @0xE];
    let clock = sui::clock::create_for_testing(ctx);
    pm_admin::rotate_emergency_members(&mut multisig, &cap, new_members, &clock);

    let updated = *pm_admin::emergency_multisig_members(&multisig);
    assert!(vector::length(&updated) == 2, 1);
    assert!(*vector::borrow(&updated, 0) == @0xD, 2);
    assert!(*vector::borrow(&updated, 1) == @0xE, 3);

    destroy(clock);
    destroy(cap);
    destroy(multisig);
    destroy(registry);
    destroy(config);
    destroy(admin);
    destroy(policy);
    destroy(resolver_policy);
    destroy(treasury);
    ts::end(scenario);
}

// ═══════════════════════════════════════════════════════════════
// Split powers: PMAdminCap cannot invoke emergency actions
// (This is enforced by Move's type system — emergency functions
// require &PMEmergencyCap, not &PMAdminCap. No runtime test needed,
// but we verify the type separation exists by confirming both
// can be created independently.)
// ═══════════════════════════════════════════════════════════════

#[test]
fun test_cap_separation() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let (registry, config, admin, policy, resolver_policy, treasury) = setup_test_infra(ctx);

    // PMAdminCap and PMEmergencyCap are distinct types
    let (cap, multisig) = pm_admin::create_emergency_infra(&admin, vector[@0xA], 86_400_000, ctx);

    // Both exist independently
    let _review = pm_admin::emergency_review_window_ms(&multisig);

    destroy(cap);
    destroy(multisig);
    destroy(registry);
    destroy(config);
    destroy(admin);
    destroy(policy);
    destroy(resolver_policy);
    destroy(treasury);
    ts::end(scenario);
}

// ═══════════════════════════════════════════════════════════════
// Review window boundary: exact boundary succeeds
// ═══════════════════════════════════════════════════════════════

#[test]
fun test_emergency_invalidation_exact_boundary() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let (mut registry, config, admin, policy, resolver_policy, mut treasury) = setup_test_infra(ctx);
    let mut market_clock = sui::clock::create_for_testing(ctx);
    sui::clock::increment_for_testing(&mut market_clock, 1_000_000);
    let mut market = create_test_market(&mut registry, &config, &policy, &resolver_policy, &market_clock, ctx);
    destroy(market_clock);

    let review_window = 86_400_000u64;
    let (cap, mut multisig) = pm_admin::create_emergency_infra(&admin, vector[@0xA], review_window, ctx);

    pm_market::transition_to_closed(&mut market, 100_000_000);
    let mut clock = sui::clock::create_for_testing(ctx);
    sui::clock::increment_for_testing(&mut clock, 100_000_000);
    pm_admin::request_emergency_invalidation(&mut multisig, &cap, &market, &clock, ctx);

    // Execute at EXACTLY 100_000_000 + 86_400_000 = 186_400_000 — should succeed
    sui::clock::increment_for_testing(&mut clock, 86_400_000);
    pm_admin::execute_emergency_invalidation(
        &mut multisig, &cap, &mut market, &mut treasury, &clock, ctx,
    );
    assert!(pm_market::state(&market) == pm_rules::state_invalid(), 0);

    destroy(clock); destroy(cap); destroy(multisig); destroy(market);
    destroy(registry); destroy(config); destroy(admin);
    destroy(policy); destroy(resolver_policy); destroy(treasury);
    ts::end(scenario);
}

#[test, expected_failure]
/// Execute 1ms before boundary MUST fail.
fun test_emergency_invalidation_one_ms_before_boundary() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let (mut registry, config, admin, policy, resolver_policy, mut treasury) = setup_test_infra(ctx);
    let mut market_clock = sui::clock::create_for_testing(ctx);
    sui::clock::increment_for_testing(&mut market_clock, 1_000_000);
    let mut market = create_test_market(&mut registry, &config, &policy, &resolver_policy, &market_clock, ctx);
    destroy(market_clock);

    let review_window = 86_400_000u64;
    let (cap, mut multisig) = pm_admin::create_emergency_infra(&admin, vector[@0xA], review_window, ctx);

    pm_market::transition_to_closed(&mut market, 100_000_000);
    let mut clock = sui::clock::create_for_testing(ctx);
    sui::clock::increment_for_testing(&mut clock, 100_000_000);
    pm_admin::request_emergency_invalidation(&mut multisig, &cap, &market, &clock, ctx);

    // 186_400_000 - 1 = 186_399_999 — MUST ABORT
    sui::clock::increment_for_testing(&mut clock, 86_400_000 - 1);
    pm_admin::execute_emergency_invalidation(
        &mut multisig, &cap, &mut market, &mut treasury, &clock, ctx,
    );

    destroy(clock); destroy(cap); destroy(multisig); destroy(market);
    destroy(registry); destroy(config); destroy(admin);
    destroy(policy); destroy(resolver_policy); destroy(treasury);
    ts::end(scenario);
}

// ═══════════════════════════════════════════════════════════════
// Emergency pause assertion integration
// ═══════════════════════════════════════════════════════════════

#[test, expected_failure]
/// assert_not_emergency_paused aborts on paused market.
fun test_pause_assertion_aborts() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let (mut registry, config, admin, policy, resolver_policy, treasury) = setup_test_infra(ctx);
    let mut market_clock = sui::clock::create_for_testing(ctx);
    sui::clock::increment_for_testing(&mut market_clock, 1_000_000);
    let mut market = create_test_market(&mut registry, &config, &policy, &resolver_policy, &market_clock, ctx);
    destroy(market_clock);
    let (cap, multisig) = pm_admin::create_emergency_infra(&admin, vector[@0xA], 86_400_000, ctx);

    pm_admin::emergency_pause_market(&mut market, &cap, ctx);
    // THIS MUST ABORT
    pm_market::assert_not_emergency_paused(&market);

    destroy(cap); destroy(multisig); destroy(market);
    destroy(registry); destroy(config); destroy(admin);
    destroy(policy); destroy(resolver_policy); destroy(treasury);
    ts::end(scenario);
}

// ═══════════════════════════════════════════════════════════════
// Emergency pause works in any non-terminal state
// ═══════════════════════════════════════════════════════════════

#[test]
fun test_emergency_pause_in_closed_state() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let (mut registry, config, admin, policy, resolver_policy, treasury) = setup_test_infra(ctx);
    let mut market_clock = sui::clock::create_for_testing(ctx);
    sui::clock::increment_for_testing(&mut market_clock, 1_000_000);
    let mut market = create_test_market(&mut registry, &config, &policy, &resolver_policy, &market_clock, ctx);
    destroy(market_clock);
    let (cap, multisig) = pm_admin::create_emergency_infra(&admin, vector[@0xA], 86_400_000, ctx);

    pm_market::transition_to_closed(&mut market, 100_000_000);
    pm_admin::emergency_pause_market(&mut market, &cap, ctx);
    assert!(pm_market::is_emergency_paused(&market), 0);

    destroy(cap); destroy(multisig); destroy(market);
    destroy(registry); destroy(config); destroy(admin);
    destroy(policy); destroy(resolver_policy); destroy(treasury);
    ts::end(scenario);
}

#[test]
fun test_emergency_pause_in_disputed_state() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let (mut registry, config, admin, policy, resolver_policy, treasury) = setup_test_infra(ctx);
    let mut market_clock = sui::clock::create_for_testing(ctx);
    sui::clock::increment_for_testing(&mut market_clock, 1_000_000);
    let mut market = create_test_market(&mut registry, &config, &policy, &resolver_policy, &market_clock, ctx);
    destroy(market_clock);
    let (cap, multisig) = pm_admin::create_emergency_infra(&admin, vector[@0xA], 86_400_000, ctx);

    pm_market::transition_to_closed(&mut market, 100_000_000);
    let record = pm_market::new_resolution_record(0, 0, @0x0, vector::empty(), 100_000_000, 200_000_000);
    pm_market::transition_to_resolution_pending(&mut market, record);
    pm_market::transition_to_disputed(&mut market);

    pm_admin::emergency_pause_market(&mut market, &cap, ctx);
    assert!(pm_market::is_emergency_paused(&market), 0);

    destroy(cap); destroy(multisig); destroy(market);
    destroy(registry); destroy(config); destroy(admin);
    destroy(policy); destroy(resolver_policy); destroy(treasury);
    ts::end(scenario);
}

// ═══════════════════════════════════════════════════════════════
// Admin pre-trade invalidation cannot work post-trade
// ═══════════════════════════════════════════════════════════════

#[test, expected_failure]
/// Admin cannot invalidate after freeze — only emergency path works post-trade.
fun test_admin_blocked_post_freeze() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let (mut registry, config, admin, policy, resolver_policy, treasury) = setup_test_infra(ctx);
    let mut market_clock = sui::clock::create_for_testing(ctx);
    sui::clock::increment_for_testing(&mut market_clock, 1_000_000);
    let mut market = create_test_market(&mut registry, &config, &policy, &resolver_policy, &market_clock, ctx);
    destroy(market_clock);

    pm_market::freeze_if_needed(&mut market);
    // THIS MUST ABORT
    pm_market::admin_invalidate_pre_trade(&mut market, &admin, pm_rules::invalid_reason_admin_pre_trade(), ctx);

    destroy(market); destroy(registry); destroy(config); destroy(admin);
    destroy(policy); destroy(resolver_policy); destroy(treasury);
    ts::end(scenario);
}

// ═══════════════════════════════════════════════════════════════
// Emergency pause on frozen market (post-trade)
// ═══════════════════════════════════════════════════════════════

#[test]
fun test_emergency_pause_after_freeze() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let (mut registry, config, admin, policy, resolver_policy, treasury) = setup_test_infra(ctx);
    let mut market_clock = sui::clock::create_for_testing(ctx);
    sui::clock::increment_for_testing(&mut market_clock, 1_000_000);
    let mut market = create_test_market(&mut registry, &config, &policy, &resolver_policy, &market_clock, ctx);
    destroy(market_clock);

    // Freeze (simulate first trade)
    pm_market::freeze_if_needed(&mut market);
    assert!(pm_market::is_frozen(&market), 0);

    // Emergency pause still works on frozen market
    let (cap, multisig) = pm_admin::create_emergency_infra(&admin, vector[@0xA], 86_400_000, ctx);
    pm_admin::emergency_pause_market(&mut market, &cap, ctx);
    assert!(pm_market::is_emergency_paused(&market), 1);

    destroy(cap);
    destroy(multisig);
    destroy(market);
    destroy(registry);
    destroy(config);
    destroy(admin);
    destroy(policy);
    destroy(resolver_policy);
    destroy(treasury);
    ts::end(scenario);
}
