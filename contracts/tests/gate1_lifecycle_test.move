#[test_only]
module prediction_market::gate1_lifecycle_test;

use std::unit_test::destroy;
use sui::{clock::{Self as clock}, test_scenario::{Self as ts}};
use prediction_market::{
    pm_market,
    pm_registry,
    pm_resolution,
    pm_rules,
    pm_source,
    test_support::{Self as support, ALT_COLLATERAL, TEST_COLLATERAL},
};

#[test]
fun test_collateral_families_bootstrap_independently() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let test_clock = clock::create_for_testing(ctx);

    let (mut test_registry, test_config, test_admin) = support::create_core_bundle<TEST_COLLATERAL>(ctx);
    let (test_policy, test_resolver_policy) = support::create_creator_policy(&test_admin, ctx);
    let test_market = support::create_binary_market(
        &mut test_registry,
        &test_config,
        &test_policy,
        &test_resolver_policy,
        support::mint_test_balance(support::default_creation_bond(), ctx),
        10_000,
        20_000,
        &test_clock,
        ctx,
    );

    let (alt_registry, alt_config, alt_admin) = support::create_core_bundle<ALT_COLLATERAL>(ctx);
    let (alt_policy, alt_resolver_policy) = support::create_creator_policy(&alt_admin, ctx);

    assert!(pm_registry::total_markets(&test_registry) == 1, 0);
    assert!(pm_registry::total_markets(&alt_registry) == 0, 1);
    assert!(pm_registry::config_id(&test_registry) != pm_registry::config_id(&alt_registry), 2);

    destroy(test_market);
    destroy(test_policy);
    destroy(test_resolver_policy);
    destroy(test_admin);
    destroy(test_config);
    destroy(test_registry);

    destroy(alt_policy);
    destroy(alt_resolver_policy);
    destroy(alt_admin);
    destroy(alt_config);
    destroy(alt_registry);

    clock::destroy_for_testing(test_clock);
    ts::end(scenario);
}

#[test]
fun test_deterministic_resolution_uses_generic_verifier_cap() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let mut test_clock = clock::create_for_testing(ctx);

    let (mut registry, config, admin) = support::create_core_bundle<TEST_COLLATERAL>(ctx);
    let (policy, resolver_policy) = support::create_deterministic_policy(&admin, ctx);
    let verifier_cap = pm_resolution::create_verifier_cap<TEST_COLLATERAL>(&admin, ctx);
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

    clock::increment_for_testing(&mut test_clock, 11_000);
    pm_resolution::resolve_deterministic(
        &mut market,
        &verifier_cap,
        1,
        b"oracle-proof",
        &test_clock,
        ctx,
    );

    assert!(pm_market::state(&market) == pm_rules::state_resolution_pending(), 0);

    clock::increment_for_testing(&mut test_clock, support::default_dispute_window_ms() + 1);
    pm_resolution::finalize_resolution(&mut market, &test_clock, ctx);

    let resolution = pm_market::resolution(&market);
    let record = option::borrow(resolution);
    assert!(pm_market::state(&market) == pm_rules::state_resolved(), 1);
    assert!(pm_market::resolution_outcome(record) == 1, 2);

    destroy(market);
    destroy(verifier_cap);
    destroy(policy);
    destroy(resolver_policy);
    destroy(admin);
    destroy(config);
    destroy(registry);
    clock::destroy_for_testing(test_clock);
    ts::end(scenario);
}

#[test, expected_failure(abort_code = 6)]
fun test_market_creation_rejects_mismatched_source_class() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let mut test_clock = clock::create_for_testing(ctx);

    let (mut registry, config, admin) = support::create_core_bundle<TEST_COLLATERAL>(ctx);
    let (policy, resolver_policy) = support::create_creator_policy(&admin, ctx);
    let creation_bond = support::mint_test_balance(support::default_creation_bond(), ctx);
    let source = pm_source::new(
        pm_rules::source_class_official_api(),
        std::string::utf8(b"https://example.com/source"),
        std::string::utf8(b"Test source declaration"),
        pm_rules::evidence_format_screenshot_hash(),
        false,
        false,
        false,
        pm_rules::fallback_invalid(),
    );
    let creator_influence = pm_market::new_creator_influence(0, false, std::string::utf8(b"none"));

    let _market = pm_market::create_market(
        &mut registry,
        &config,
        &policy,
        &resolver_policy,
        std::string::utf8(b"Mismatch Source Market"),
        std::string::utf8(b"Mismatch source class should abort"),
        std::string::utf8(b"Source class must match policy"),
        2,
        vector[std::string::utf8(b"YES"), std::string::utf8(b"NO")],
        source,
        creator_influence,
        10_000,
        20_000,
        creation_bond,
        &test_clock,
        ctx,
    );

    clock::destroy_for_testing(test_clock);
    ts::end(scenario);
}

#[test, expected_failure(abort_code = 7)]
fun test_market_creation_rejects_mismatched_evidence_format() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let mut test_clock = clock::create_for_testing(ctx);

    let (mut registry, config, admin) = support::create_core_bundle<TEST_COLLATERAL>(ctx);
    let (policy, resolver_policy) = support::create_creator_policy(&admin, ctx);
    let creation_bond = support::mint_test_balance(support::default_creation_bond(), ctx);
    let source = pm_source::new(
        pm_rules::source_class_public_doc(),
        std::string::utf8(b"https://example.com/source"),
        std::string::utf8(b"Test source declaration"),
        pm_rules::evidence_format_tx_hash(),
        false,
        false,
        false,
        pm_rules::fallback_invalid(),
    );
    let creator_influence = pm_market::new_creator_influence(0, false, std::string::utf8(b"none"));

    let _market = pm_market::create_market(
        &mut registry,
        &config,
        &policy,
        &resolver_policy,
        std::string::utf8(b"Mismatch Evidence Market"),
        std::string::utf8(b"Mismatch evidence format should abort"),
        std::string::utf8(b"Evidence format must match policy"),
        2,
        vector[std::string::utf8(b"YES"), std::string::utf8(b"NO")],
        source,
        creator_influence,
        10_000,
        20_000,
        creation_bond,
        &test_clock,
        ctx,
    );

    clock::destroy_for_testing(test_clock);
    ts::end(scenario);
}
