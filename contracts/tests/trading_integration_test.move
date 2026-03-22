#[test_only]
module prediction_market::trading_integration_test;

use std::{string, unit_test::destroy};
use sui::{clock::{Self as clock, Clock}, test_scenario::{Self as ts}};
use prediction_market::{
    pm_market,
    pm_position,
    pm_resolution,
    pm_rules,
    pm_trading,
    pm_treasury,
    test_support::{Self as support, TEST_COLLATERAL},
};

fun setup_creator_market(
    ctx: &mut TxContext,
    test_clock: &Clock,
): (
    prediction_market::pm_registry::PMRegistry<TEST_COLLATERAL>,
    prediction_market::pm_registry::PMConfig<TEST_COLLATERAL>,
    prediction_market::pm_registry::PMAdminCap<TEST_COLLATERAL>,
    prediction_market::pm_policy::PMMarketTypePolicy<TEST_COLLATERAL>,
    prediction_market::pm_policy::PMResolverPolicy<TEST_COLLATERAL>,
    prediction_market::pm_treasury::PMTreasury<TEST_COLLATERAL>,
    prediction_market::pm_market::PMMarket<TEST_COLLATERAL>,
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

    (registry, config, admin, policy, resolver_policy, treasury, market)
}

fun setup_creator_categorical_market(
    ctx: &mut TxContext,
    test_clock: &Clock,
): (
    prediction_market::pm_registry::PMRegistry<TEST_COLLATERAL>,
    prediction_market::pm_registry::PMConfig<TEST_COLLATERAL>,
    prediction_market::pm_registry::PMAdminCap<TEST_COLLATERAL>,
    prediction_market::pm_policy::PMMarketTypePolicy<TEST_COLLATERAL>,
    prediction_market::pm_policy::PMResolverPolicy<TEST_COLLATERAL>,
    prediction_market::pm_market::PMMarket<TEST_COLLATERAL>,
) {
    let (mut registry, config, admin) = support::create_core_bundle<TEST_COLLATERAL>(ctx);
    let (policy, resolver_policy) = support::create_categorical_policy(&admin, ctx);
    let market = support::create_categorical_market(
        &mut registry,
        &config,
        &policy,
        &resolver_policy,
        support::mint_test_balance(support::default_creation_bond(), ctx),
        10_000,
        20_000,
        vector[
            string::utf8(b"ALPHA"),
            string::utf8(b"BETA"),
            string::utf8(b"GAMMA"),
        ],
        test_clock,
        ctx,
    );

    (registry, config, admin, policy, resolver_policy, market)
}

fun reserve_product(market: &pm_market::PMMarket<TEST_COLLATERAL>): u128 {
    let quantities = pm_market::outcome_quantities(market);
    let n = vector::length(quantities);
    let mut product = 1u128;
    let mut i = 0u64;
    while (i < n) {
        product = product * (*vector::borrow(quantities, i) as u128);
        i = i + 1;
    };
    product
}

#[test]
fun test_generic_buy_sell_and_fee_sweep() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let test_clock = clock::create_for_testing(ctx);
    let (registry, config, admin, policy, resolver_policy, mut treasury, mut market) =
        setup_creator_market(ctx, &test_clock);

    let mut position = pm_trading::buy(
        &mut market,
        &config,
        &test_clock,
        0,
        20,
        500,
        50_000,
        support::mint_test_coin(500, ctx),
        ctx,
    );

    assert!(pm_position::quantity(&position) == 20, 0);
    assert!(pm_market::is_frozen(&market), 1);
    assert!(pm_market::total_collateral(&market) > 0, 2);

    pm_trading::sell(
        &mut market,
        &config,
        &test_clock,
        &mut position,
        10,
        0,
        50_000,
        ctx,
    );

    assert!(pm_position::quantity(&position) == 10, 3);
    assert!(pm_market::accrued_fees(&market) > 0, 4);

    pm_trading::sweep_fees(&mut market, &mut treasury);
    assert!(pm_market::accrued_fees(&market) == 0, 5);
    assert!(pm_treasury::balance(&treasury) > 0, 6);

    destroy(position);
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
fun test_generic_claim_after_finalized_resolution() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let mut test_clock = clock::create_for_testing(ctx);
    let (registry, config, admin, policy, resolver_policy, treasury, mut market) =
        setup_creator_market(ctx, &test_clock);

    let position = pm_trading::buy(
        &mut market,
        &config,
        &test_clock,
        0,
        10,
        500,
        50_000,
        support::mint_test_coin(500, ctx),
        ctx,
    );

    let collateral_before_claim = pm_market::total_collateral(&market);
    clock::increment_for_testing(&mut test_clock, 11_000);
    pm_resolution::propose_resolution(
        &mut market,
        0,
        b"creator-resolution",
        &test_clock,
        ctx,
    );
    clock::increment_for_testing(&mut test_clock, support::default_dispute_window_ms() + 1);
    pm_resolution::finalize_resolution(&mut market, &test_clock, ctx);

    assert!(pm_market::state(&market) == pm_rules::state_resolved(), 0);

    pm_trading::claim(&mut market, &config, position, ctx);

    assert!(pm_market::total_collateral(&market) < collateral_before_claim, 1);

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
fun test_generic_invalid_refund_after_deadline_expiry() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let mut test_clock = clock::create_for_testing(ctx);
    let (registry, config, admin, policy, resolver_policy, mut treasury, mut market) =
        setup_creator_market(ctx, &test_clock);

    let position = pm_trading::buy(
        &mut market,
        &config,
        &test_clock,
        0,
        12,
        500,
        50_000,
        support::mint_test_coin(500, ctx),
        ctx,
    );

    clock::increment_for_testing(&mut test_clock, 25_000);
    pm_resolution::invalidate_deadline_expired(&mut market, &mut treasury, &test_clock);

    let snapshot = pm_market::invalidation_snapshot_collateral(&market);
    assert!(pm_market::state(&market) == pm_rules::state_invalid(), 0);
    assert!(option::is_some(&snapshot), 1);

    pm_trading::refund_invalid(&mut market, position, ctx);
    assert!(pm_treasury::balance(&treasury) >= support::default_creation_bond(), 2);

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
fun test_categorical_buy_sell_preserves_reserve_model_without_round_trip_arbitrage() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let test_clock = clock::create_for_testing(ctx);
    let (registry, config, admin, policy, resolver_policy, mut market) =
        setup_creator_categorical_market(ctx, &test_clock);

    let initial_product = reserve_product(&market);
    let initial_collateral = pm_market::total_collateral(&market);

    let mut position = pm_trading::buy(
        &mut market,
        &config,
        &test_clock,
        0,
        100,
        10_000,
        50_000,
        support::mint_test_coin(10_000, ctx),
        ctx,
    );

    let after_buy = pm_market::outcome_quantities(&market);
    assert!(*vector::borrow(after_buy, 0) == 900, 10);
    assert!(*vector::borrow(after_buy, 1) > 1000, 11);
    assert!(*vector::borrow(after_buy, 1) == *vector::borrow(after_buy, 2), 12);
    assert!(reserve_product(&market) >= initial_product, 13);

    pm_trading::sell(
        &mut market,
        &config,
        &test_clock,
        &mut position,
        100,
        0,
        50_000,
        ctx,
    );

    assert!(pm_market::total_collateral(&market) >= initial_collateral, 14);
    assert!(pm_position::quantity(&position) == 0, 15);

    destroy(position);
    destroy(market);
    destroy(policy);
    destroy(resolver_policy);
    destroy(admin);
    destroy(config);
    destroy(registry);
    clock::destroy_for_testing(test_clock);
    ts::end(scenario);
}
