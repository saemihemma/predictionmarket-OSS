#[test_only]
module prediction_market::community_resolution_test;

use std::unit_test::destroy;
use sui::{clock::{Self as clock}, test_scenario::{Self as ts}};
use prediction_market::{
    pm_market,
    pm_resolution,
    pm_rules,
    test_support::{Self as support, TEST_COLLATERAL},
};

#[test]
fun test_community_resolution_only_escrows_required_bond_and_returns_it_on_finalize() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let mut test_clock = clock::create_for_testing(ctx);

    let (mut registry, config, admin) = support::create_core_bundle<TEST_COLLATERAL>(ctx);
    let (policy, resolver_policy) = support::create_creator_policy(&admin, ctx);
    let mut market = support::create_binary_market(
        &mut registry,
        &config,
        &policy,
        &resolver_policy,
        support::mint_test_balance(support::default_creation_bond(), ctx),
        10_000,
        20_000,
        &test_clock,
        ctx,
    );

    clock::increment_for_testing(&mut test_clock, 11_001);
    pm_market::ensure_closed(&mut market, clock::timestamp_ms(&test_clock));
    clock::increment_for_testing(&mut test_clock, 1_000);

    pm_resolution::propose_community_resolution(
        &mut market,
        &config,
        1,
        b"community-proof",
        support::mint_test_coin(support::default_creation_bond() + 25, ctx),
        &test_clock,
        ctx,
    );

    assert!(pm_market::state(&market) == pm_rules::state_resolution_pending(), 0);
    assert!(pm_market::community_resolution_bond_amount(&market) == support::default_creation_bond(), 1);
    assert!(pm_market::creation_bond_amount(&market) == support::default_creation_bond(), 2);

    clock::increment_for_testing(&mut test_clock, support::default_dispute_window_ms() + 1);
    pm_resolution::finalize_resolution(&mut market, &test_clock, ctx);

    assert!(pm_market::state(&market) == pm_rules::state_resolved(), 3);
    assert!(pm_market::community_resolution_bond_amount(&market) == 0, 4);
    assert!(pm_market::creation_bond_amount(&market) == support::default_creation_bond() / 2, 5);

    destroy(market);
    destroy(policy);
    destroy(resolver_policy);
    destroy(admin);
    destroy(config);
    destroy(registry);
    clock::destroy_for_testing(test_clock);
    ts::end(scenario);
}
