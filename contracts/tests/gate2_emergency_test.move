#[test_only]
module prediction_market::gate2_emergency_test;

use std::unit_test::destroy;
use sui::{clock::{Self as clock}, test_scenario::{Self as ts}};
use prediction_market::{
    pm_admin,
    pm_market,
    pm_rules,
    pm_treasury,
    test_support::{Self as support, TEST_COLLATERAL},
};

fun setup_market_with_emergency(
    ctx: &mut TxContext,
    test_clock: &sui::clock::Clock,
): (
    prediction_market::pm_registry::PMRegistry<TEST_COLLATERAL>,
    prediction_market::pm_registry::PMConfig<TEST_COLLATERAL>,
    prediction_market::pm_registry::PMAdminCap<TEST_COLLATERAL>,
    prediction_market::pm_policy::PMMarketTypePolicy<TEST_COLLATERAL>,
    prediction_market::pm_policy::PMResolverPolicy<TEST_COLLATERAL>,
    prediction_market::pm_treasury::PMTreasury<TEST_COLLATERAL>,
    prediction_market::pm_market::PMMarket<TEST_COLLATERAL>,
    prediction_market::pm_admin::PMEmergencyCap<TEST_COLLATERAL>,
    prediction_market::pm_admin::PMEmergencyMultisig<TEST_COLLATERAL>,
) {
    let (mut registry, config, admin) = support::create_core_bundle<TEST_COLLATERAL>(ctx);
    let (policy, resolver_policy) = support::create_creator_policy(&admin, ctx);
    let treasury = pm_treasury::create_treasury<TEST_COLLATERAL>(ctx);
    let market = support::create_binary_market(
        &mut registry,
        &config,
        &policy,
        &resolver_policy,
        support::mint_test_balance(support::default_creation_bond(), ctx),
        10_000,
        20_000,
        test_clock,
        ctx,
    );
    let (emergency_cap, multisig) = pm_admin::create_emergency_infra(
        &admin,
        vector[@0x1, @0x2, @0x3],
        5_000,
        ctx,
    );

    (registry, config, admin, policy, resolver_policy, treasury, market, emergency_cap, multisig)
}

#[test]
fun test_emergency_pause_and_unpause_are_generic() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let test_clock = clock::create_for_testing(ctx);
    let (registry, config, admin, policy, resolver_policy, treasury, mut market, emergency_cap, multisig) =
        setup_market_with_emergency(ctx, &test_clock);

    pm_admin::emergency_pause_market(&mut market, &emergency_cap, ctx);
    assert!(pm_market::is_emergency_paused(&market), 0);

    pm_admin::emergency_unpause_market(&mut market, &emergency_cap);
    assert!(!pm_market::is_emergency_paused(&market), 1);

    destroy(multisig);
    destroy(emergency_cap);
    destroy(market);
    destroy(treasury);
    destroy(policy);
    destroy(resolver_policy);
    destroy(admin);
    destroy(config);
    destroy(registry);
    clock::destroy_for_testing(test_clock);
    ts::end(scenario);
}

#[test]
fun test_emergency_invalidation_waits_for_review_window() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let mut test_clock = clock::create_for_testing(ctx);
    let (registry, config, admin, policy, resolver_policy, mut treasury, mut market, emergency_cap, mut multisig) =
        setup_market_with_emergency(ctx, &test_clock);

    pm_admin::request_emergency_invalidation(
        &mut multisig,
        &emergency_cap,
        &market,
        &test_clock,
        ctx,
    );
    clock::increment_for_testing(&mut test_clock, 5_001);
    pm_admin::execute_emergency_invalidation(
        &mut multisig,
        &emergency_cap,
        &mut market,
        &mut treasury,
        &test_clock,
        ctx,
    );

    assert!(pm_market::state(&market) == pm_rules::state_invalid(), 0);
    assert!(pm_treasury::balance(&treasury) >= support::default_creation_bond(), 1);

    destroy(multisig);
    destroy(emergency_cap);
    destroy(market);
    destroy(treasury);
    destroy(policy);
    destroy(resolver_policy);
    destroy(admin);
    destroy(config);
    destroy(registry);
    clock::destroy_for_testing(test_clock);
    ts::end(scenario);
}
