#[test_only]
module prediction_market::test_support;

use std::string;
use sui::{
    balance::Balance,
    clock::Clock,
    coin::{Self, Coin},
};
use prediction_market::{
    pm_market::{Self, PMMarket},
    pm_policy::{Self, PMMarketTypePolicy, PMResolverPolicy},
    pm_registry::{Self, PMAdminCap, PMConfig, PMRegistry},
    pm_rules,
    pm_source::{Self, SourceDeclaration},
};

const DEFAULT_TRADING_FEE_BPS: u64 = 100;
const DEFAULT_SETTLEMENT_FEE_BPS: u64 = 50;
const DEFAULT_CREATION_BOND: u64 = 100;
const DEFAULT_DISPUTE_BOND: u64 = 50;
const DEFAULT_DISPUTE_WINDOW_MS: u64 = 5_000;
const DEFAULT_MIN_DURATION_MS: u64 = 1_000;
const DEFAULT_MAX_DURATION_MS: u64 = 10_000_000;
const DEFAULT_CREATOR_PRIORITY_WINDOW_MS: u64 = 1_000;
const DEFAULT_LIQUIDITY_PARAM: u64 = 1_000;

public struct TEST_COLLATERAL has drop {}
public struct ALT_COLLATERAL has drop {}

public fun default_creation_bond(): u64 { DEFAULT_CREATION_BOND }
public fun default_dispute_bond(): u64 { DEFAULT_DISPUTE_BOND }
public fun default_dispute_window_ms(): u64 { DEFAULT_DISPUTE_WINDOW_MS }

public fun mint_test_coin(amount: u64, ctx: &mut TxContext): Coin<TEST_COLLATERAL> {
    coin::mint_for_testing<TEST_COLLATERAL>(amount, ctx)
}

public fun mint_test_balance(amount: u64, ctx: &mut TxContext): Balance<TEST_COLLATERAL> {
    coin::into_balance(mint_test_coin(amount, ctx))
}

public fun mint_alt_coin(amount: u64, ctx: &mut TxContext): Coin<ALT_COLLATERAL> {
    coin::mint_for_testing<ALT_COLLATERAL>(amount, ctx)
}

public fun mint_alt_balance(amount: u64, ctx: &mut TxContext): Balance<ALT_COLLATERAL> {
    coin::into_balance(mint_alt_coin(amount, ctx))
}

public fun create_core_bundle<Collateral>(
    ctx: &mut TxContext,
): (PMRegistry<Collateral>, PMConfig<Collateral>, PMAdminCap<Collateral>) {
    pm_registry::create_registry<Collateral>(
        DEFAULT_TRADING_FEE_BPS,
        DEFAULT_SETTLEMENT_FEE_BPS,
        DEFAULT_CREATION_BOND,
        DEFAULT_CREATION_BOND,
        DEFAULT_CREATION_BOND,
        DEFAULT_CREATION_BOND,
        DEFAULT_DISPUTE_BOND,
        DEFAULT_DISPUTE_WINDOW_MS,
        DEFAULT_DISPUTE_WINDOW_MS,
        DEFAULT_DISPUTE_WINDOW_MS,
        DEFAULT_MIN_DURATION_MS,
        DEFAULT_MAX_DURATION_MS,
        8,
        DEFAULT_CREATOR_PRIORITY_WINDOW_MS,
        DEFAULT_LIQUIDITY_PARAM,
        ctx,
    )
}

public fun create_creator_policy<Collateral>(
    admin: &PMAdminCap<Collateral>,
    ctx: &mut TxContext,
): (PMMarketTypePolicy<Collateral>, PMResolverPolicy<Collateral>) {
    let market_type_policy = pm_policy::create_market_type_policy(
        admin,
        string::utf8(b"Creator Binary"),
        pm_rules::trust_tier_creator_resolved(),
        pm_rules::market_type_binary(),
        pm_rules::resolution_class_creator_proposed(),
        2,
        2,
        pm_rules::source_class_public_doc(),
        pm_rules::evidence_format_screenshot_hash(),
        ctx,
    );

    let resolver_policy = pm_policy::create_resolver_policy(
        admin,
        DEFAULT_DISPUTE_WINDOW_MS,
        DEFAULT_DISPUTE_WINDOW_MS,
        DEFAULT_DISPUTE_WINDOW_MS,
        DEFAULT_DISPUTE_WINDOW_MS,
        ctx,
    );

    (market_type_policy, resolver_policy)
}

public fun create_deterministic_policy<Collateral>(
    admin: &PMAdminCap<Collateral>,
    ctx: &mut TxContext,
): (PMMarketTypePolicy<Collateral>, PMResolverPolicy<Collateral>) {
    let market_type_policy = pm_policy::create_market_type_policy(
        admin,
        string::utf8(b"Deterministic Binary"),
        pm_rules::trust_tier_canonical(),
        pm_rules::market_type_binary(),
        pm_rules::resolution_class_deterministic(),
        2,
        2,
        pm_rules::source_class_onchain_state(),
        pm_rules::evidence_format_tx_hash(),
        ctx,
    );

    let resolver_policy = pm_policy::create_resolver_policy(
        admin,
        DEFAULT_DISPUTE_WINDOW_MS,
        DEFAULT_DISPUTE_WINDOW_MS,
        DEFAULT_DISPUTE_WINDOW_MS,
        DEFAULT_DISPUTE_WINDOW_MS,
        ctx,
    );

    (market_type_policy, resolver_policy)
}

public fun create_categorical_policy<Collateral>(
    admin: &PMAdminCap<Collateral>,
    ctx: &mut TxContext,
): (PMMarketTypePolicy<Collateral>, PMResolverPolicy<Collateral>) {
    let market_type_policy = pm_policy::create_market_type_policy(
        admin,
        string::utf8(b"Creator Categorical"),
        pm_rules::trust_tier_creator_resolved(),
        pm_rules::market_type_categorical(),
        pm_rules::resolution_class_creator_proposed(),
        0,
        8,
        pm_rules::source_class_public_doc(),
        pm_rules::evidence_format_screenshot_hash(),
        ctx,
    );

    let resolver_policy = pm_policy::create_resolver_policy(
        admin,
        DEFAULT_DISPUTE_WINDOW_MS,
        DEFAULT_DISPUTE_WINDOW_MS,
        DEFAULT_DISPUTE_WINDOW_MS,
        DEFAULT_DISPUTE_WINDOW_MS,
        ctx,
    );

    (market_type_policy, resolver_policy)
}

public fun create_binary_market<Collateral>(
    registry: &mut PMRegistry<Collateral>,
    config: &PMConfig<Collateral>,
    policy: &PMMarketTypePolicy<Collateral>,
    resolver_policy: &PMResolverPolicy<Collateral>,
    creation_bond: Balance<Collateral>,
    close_time_ms: u64,
    resolve_deadline_ms: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): PMMarket<Collateral> {
    create_market(
        registry,
        config,
        policy,
        resolver_policy,
        creation_bond,
        close_time_ms,
        resolve_deadline_ms,
        2,
        vector[string::utf8(b"YES"), string::utf8(b"NO")],
        clock,
        ctx,
    )
}

public fun create_categorical_market<Collateral>(
    registry: &mut PMRegistry<Collateral>,
    config: &PMConfig<Collateral>,
    policy: &PMMarketTypePolicy<Collateral>,
    resolver_policy: &PMResolverPolicy<Collateral>,
    creation_bond: Balance<Collateral>,
    close_time_ms: u64,
    resolve_deadline_ms: u64,
    labels: vector<std::string::String>,
    clock: &Clock,
    ctx: &mut TxContext,
): PMMarket<Collateral> {
    let outcome_count = vector::length(&labels) as u16;
    create_market(
        registry,
        config,
        policy,
        resolver_policy,
        creation_bond,
        close_time_ms,
        resolve_deadline_ms,
        outcome_count,
        labels,
        clock,
        ctx,
    )
}

fun create_market<Collateral>(
    registry: &mut PMRegistry<Collateral>,
    config: &PMConfig<Collateral>,
    policy: &PMMarketTypePolicy<Collateral>,
    resolver_policy: &PMResolverPolicy<Collateral>,
    creation_bond: Balance<Collateral>,
    close_time_ms: u64,
    resolve_deadline_ms: u64,
    outcome_count: u16,
    outcome_labels: vector<std::string::String>,
    clock: &Clock,
    ctx: &mut TxContext,
): PMMarket<Collateral> {
    let source = source_for_policy(policy);
    let creator_influence = pm_market::new_creator_influence(
        0,
        false,
        string::utf8(b"none"),
    );

    pm_market::create_market<Collateral>(
        registry,
        config,
        policy,
        resolver_policy,
        string::utf8(b"Generic Test Market"),
        string::utf8(b"Collateral family test market"),
        string::utf8(b"Outcome settles to yes or no"),
        outcome_count,
        outcome_labels,
        source,
        creator_influence,
        close_time_ms,
        resolve_deadline_ms,
        creation_bond,
        clock,
        ctx,
    )
}

fun source_for_policy<Collateral>(policy: &PMMarketTypePolicy<Collateral>): SourceDeclaration {
    let source_class = pm_policy::policy_required_source_class(policy);
    let evidence_format = pm_policy::policy_required_evidence_format(policy);

    if (source_class == pm_rules::source_class_onchain_state() &&
        evidence_format == pm_rules::evidence_format_tx_hash()) {
        pm_source::deterministic_default()
    } else {
        pm_source::new(
            source_class,
            string::utf8(b"https://example.com/source"),
            string::utf8(b"Test source declaration"),
            evidence_format,
            false,
            false,
            false,
            pm_rules::fallback_invalid(),
        )
    }
}
