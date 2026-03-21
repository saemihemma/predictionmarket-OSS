/// Trading integration tests — exercises the full lifecycle:
/// create market → buy → sell → resolve → claim / invalidate → refund
/// Verifies: fee accrual, net_cost_basis tracking, collateral accounting.
/// Pool reserves start at 100 per outcome (1 SFR = 100 base units, 2 decimals).
#[test_only]
module prediction_market::trading_integration_test;

use sui::test_scenario::{Self as ts};
use std::unit_test::destroy;
use sui::balance;
use sui::coin;
use prediction_market::{
    suffer::SUFFER,
    pm_rules,
    pm_math,
    pm_market::{Self, PMMarket},
    pm_position::{Self, PMPosition},
    pm_registry::{Self, PMRegistry, PMConfig, PMAdminCap},
    pm_policy::{Self, PMMarketTypePolicy, PMResolverPolicy},
    pm_trading,
    pm_treasury::{Self, PMTreasury},
    pm_source,
};

// ── Constants ──
// Pool starts at 100 per outcome (1 SFR each side)
const POOL_INIT: u64 = 100;

// ── Helpers ──

fun setup(ctx: &mut TxContext): (PMRegistry, PMConfig, PMAdminCap, PMMarketTypePolicy, PMResolverPolicy, PMTreasury) {
    let (registry, config, admin) = pm_registry::create_registry(
        100, 50, 0, 0, 0, 0, 1,  // fee bps=100(1%), settlement=50(0.5%), bonds=0, dispute_bond=1
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

fun create_market(
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

fun mint_test_coin(amount: u64, ctx: &mut TxContext): coin::Coin<SUFFER> {
    coin::mint_for_testing<SUFFER>(amount, ctx)
}

// ═══════════════════════════════════════════════════════════════
// Basic buy test — verifies position creation and pool update
// Pool starts at [100, 100]. Buy 10 of outcome 0.
// cost = 100*10/(100-10) = 11. After: [90, 111]
// ═══════════════════════════════════════════════════════════════

#[test]
fun test_buy_creates_position() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let (mut registry, config, admin, policy, resolver_policy, treasury) = setup(ctx);
    let mut market_clock = sui::clock::create_for_testing(ctx);
    sui::clock::increment_for_testing(&mut market_clock, 1_000_000);
    let mut market = create_market(&mut registry, &config, &policy, &resolver_policy, &market_clock, ctx);
    destroy(market_clock);

    let buy_amount = 10u64;
    let cost = pm_math::compute_buy_cost(
        pm_market::outcome_quantities(&market),
        0, // liquidity_param ignored by CP
        0,
        buy_amount,
    );
    let fee_bps = 100u64;
    let fee_raw = (((cost as u128) * (fee_bps as u128)) / 10_000u128) as u64;
    let fee = if (cost > 0 && fee_raw == 0) { 1 } else { fee_raw };
    let total_payment = cost + fee + 100; // buffer

    let payment = mint_test_coin(total_payment, ctx);
    let clock = sui::clock::create_for_testing(ctx);

    let position = pm_trading::buy(
        &mut market, &config, &clock, 0, buy_amount, payment, ctx,
    );

    // Verify position
    assert!(pm_position::quantity(&position) == buy_amount, 0);
    assert!(pm_position::outcome_index(&position) == 0, 1);
    assert!(pm_position::net_cost_basis(&position) == cost, 2);

    // Verify pool updated: reserve[0] = 100-10=90, reserve[1] = 100+cost
    let quantities = pm_market::outcome_quantities(&market);
    assert!(*vector::borrow(quantities, 0) == POOL_INIT - buy_amount, 3);
    assert!(*vector::borrow(quantities, 1) == POOL_INIT + cost, 4);

    // Verify frozen
    assert!(pm_market::is_frozen(&market), 5);

    destroy(position);
    destroy(market);
    destroy(registry);
    destroy(config);
    destroy(admin);
    destroy(policy);
    destroy(resolver_policy);
    destroy(treasury);
    sui::clock::destroy_for_testing(clock);
    ts::end(scenario);
}

// ═══════════════════════════════════════════════════════════════
// Buy + sell — verifies net_cost_basis tracking
// Buy 20 of outcome 0, sell 10 back.
// ═══════════════════════════════════════════════════════════════

#[test]
fun test_buy_then_partial_sell() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let (mut registry, config, admin, policy, resolver_policy, treasury) = setup(ctx);
    let mut market_clock = sui::clock::create_for_testing(ctx);
    sui::clock::increment_for_testing(&mut market_clock, 1_000_000);
    let mut market = create_market(&mut registry, &config, &policy, &resolver_policy, &market_clock, ctx);
    destroy(market_clock);

    let clock = sui::clock::create_for_testing(ctx);

    // Buy 20 YES
    let buy_amount = 20u64;
    let cost = pm_math::compute_buy_cost(
        pm_market::outcome_quantities(&market), 0, 0, buy_amount,
    );
    let fee_raw = (((cost as u128) * 100u128) / 10_000u128) as u64;
    let fee = if (cost > 0 && fee_raw == 0) { 1 } else { fee_raw };
    let payment = mint_test_coin(cost + fee + 100, ctx);

    let mut position = pm_trading::buy(
        &mut market, &config, &clock, 0, buy_amount, payment, ctx,
    );

    let initial_cost_basis = pm_position::net_cost_basis(&position);
    assert!(initial_cost_basis == cost, 0);

    // Sell half (10)
    pm_trading::sell(&mut market, &config, &clock, &mut position, 10, ctx);

    // Position should have 10 remaining
    assert!(pm_position::quantity(&position) == 10, 1);

    // net_cost_basis halved (allow ±1 for integer division rounding)
    let reduced_cost = pm_position::net_cost_basis(&position);
    let expected_half = initial_cost_basis / 2;
    let diff = if (reduced_cost >= expected_half) { reduced_cost - expected_half } else { expected_half - reduced_cost };
    assert!(diff <= 1, 2);

    // Pool: after buy 20 → reserve[0]=80. After sell 10 → reserve[0]=80+10=90
    let quantities = pm_market::outcome_quantities(&market);
    assert!(*vector::borrow(quantities, 0) == 90, 3);

    destroy(position);
    destroy(market);
    destroy(registry);
    destroy(config);
    destroy(admin);
    destroy(policy);
    destroy(resolver_policy);
    destroy(treasury);
    sui::clock::destroy_for_testing(clock);
    ts::end(scenario);
}

// ═══════════════════════════════════════════════════════════════
// Fee accrual test
// ═══════════════════════════════════════════════════════════════

#[test]
fun test_fees_accrue_in_market() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let (mut registry, config, admin, policy, resolver_policy, mut treasury) = setup(ctx);
    let mut market_clock = sui::clock::create_for_testing(ctx);
    sui::clock::increment_for_testing(&mut market_clock, 1_000_000);
    let mut market = create_market(&mut registry, &config, &policy, &resolver_policy, &market_clock, ctx);
    destroy(market_clock);

    let clock = sui::clock::create_for_testing(ctx);

    let buy_amount = 10u64;
    let cost = pm_math::compute_buy_cost(
        pm_market::outcome_quantities(&market), 0, 0, buy_amount,
    );
    // Fee uses minimum-fee-of-1 rule: when cost > 0 and fee_bps > 0, fee = max(1, floor(cost * fee_bps / 10000))
    let fee_raw = (((cost as u128) * 100u128) / 10_000u128) as u64;
    let fee = if (cost > 0 && fee_raw == 0) { 1 } else { fee_raw };
    let payment = mint_test_coin(cost + fee + 100, ctx);

    let position = pm_trading::buy(
        &mut market, &config, &clock, 0, buy_amount, payment, ctx,
    );

    // Fees accrued in market
    let accrued = pm_market::accrued_fees(&market);
    assert!(accrued == fee, 0);

    // Treasury still zero
    assert!(pm_treasury::balance(&treasury) == 0, 1);

    // Sweep fees
    pm_trading::sweep_fees(&mut market, &mut treasury);
    assert!(pm_treasury::balance(&treasury) == fee, 2);
    assert!(pm_market::accrued_fees(&market) == 0, 3);

    destroy(position);
    destroy(market);
    destroy(registry);
    destroy(config);
    destroy(admin);
    destroy(policy);
    destroy(resolver_policy);
    destroy(treasury);
    sui::clock::destroy_for_testing(clock);
    ts::end(scenario);
}

// ═══════════════════════════════════════════════════════════════
// Full lifecycle: buy → resolve → claim
// ═══════════════════════════════════════════════════════════════

#[test]
fun test_full_lifecycle_buy_resolve_claim() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let (mut registry, config, admin, policy, resolver_policy, treasury) = setup(ctx);
    let mut market_clock = sui::clock::create_for_testing(ctx);
    sui::clock::increment_for_testing(&mut market_clock, 1_000_000);
    let mut market = create_market(&mut registry, &config, &policy, &resolver_policy, &market_clock, ctx);
    destroy(market_clock);

    let clock = sui::clock::create_for_testing(ctx);

    let buy_amount = 10u64;
    let cost = pm_math::compute_buy_cost(
        pm_market::outcome_quantities(&market), 0, 0, buy_amount,
    );
    let fee_raw = (((cost as u128) * 100u128) / 10_000u128) as u64;
    let fee = if (cost > 0 && fee_raw == 0) { 1 } else { fee_raw };
    let payment = mint_test_coin(cost + fee + 100, ctx);

    let position = pm_trading::buy(
        &mut market, &config, &clock, 0, buy_amount, payment, ctx,
    );

    // Close + resolve YES (outcome 0)
    pm_market::transition_to_closed(&mut market, 100_000_000);
    let record = pm_market::new_resolution_record(0, 0, @0x0, vector::empty(), 100_000_000, 200_000_000);
    pm_market::transition_to_resolution_pending(&mut market, record);
    pm_market::transition_to_resolved(&mut market);

    let collateral_before = pm_market::total_collateral(&market);
    pm_trading::claim(&mut market, &config, position, ctx);
    let collateral_after = pm_market::total_collateral(&market);

    assert!(collateral_after < collateral_before, 0);

    destroy(market);
    destroy(registry);
    destroy(config);
    destroy(admin);
    destroy(policy);
    destroy(resolver_policy);
    destroy(treasury);
    sui::clock::destroy_for_testing(clock);
    ts::end(scenario);
}

// ═══════════════════════════════════════════════════════════════
// Invalid refund — verifies net_cost_basis refund
// ═══════════════════════════════════════════════════════════════

#[test]
fun test_invalid_refund_returns_net_cost_basis() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let (mut registry, config, admin, policy, resolver_policy, treasury) = setup(ctx);
    let mut market_clock = sui::clock::create_for_testing(ctx);
    sui::clock::increment_for_testing(&mut market_clock, 1_000_000);
    let mut market = create_market(&mut registry, &config, &policy, &resolver_policy, &market_clock, ctx);
    destroy(market_clock);

    let clock = sui::clock::create_for_testing(ctx);

    let buy_amount = 10u64;
    let cost = pm_math::compute_buy_cost(
        pm_market::outcome_quantities(&market), 0, 0, buy_amount,
    );
    let fee_raw = (((cost as u128) * 100u128) / 10_000u128) as u64;
    let fee = if (cost > 0 && fee_raw == 0) { 1 } else { fee_raw };
    let payment = mint_test_coin(cost + fee + 100, ctx);

    let position = pm_trading::buy(
        &mut market, &config, &clock, 0, buy_amount, payment, ctx,
    );

    let net_cost = pm_position::net_cost_basis(&position);
    let collateral_before = pm_market::total_collateral(&market);

    pm_market::transition_to_closed(&mut market, 100_000_000);
    pm_market::transition_to_invalid(&mut market, pm_rules::invalid_reason_deadline_expired());

    pm_trading::refund_invalid(&mut market, position, ctx);

    let collateral_after = pm_market::total_collateral(&market);
    let refunded = collateral_before - collateral_after;
    assert!(refunded == net_cost, 0);

    destroy(market);
    destroy(registry);
    destroy(config);
    destroy(admin);
    destroy(policy);
    destroy(resolver_policy);
    destroy(treasury);
    sui::clock::destroy_for_testing(clock);
    ts::end(scenario);
}

// ═══════════════════════════════════════════════════════════════
// Buy merge — verifies position merging
// Buy 10 + buy 5 into same position.
// ═══════════════════════════════════════════════════════════════

#[test]
fun test_buy_merge_adds_to_existing_position() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let (mut registry, config, admin, policy, resolver_policy, treasury) = setup(ctx);
    let mut market_clock = sui::clock::create_for_testing(ctx);
    sui::clock::increment_for_testing(&mut market_clock, 1_000_000);
    let mut market = create_market(&mut registry, &config, &policy, &resolver_policy, &market_clock, ctx);
    destroy(market_clock);

    let clock = sui::clock::create_for_testing(ctx);

    // First buy: 10 YES
    let buy1 = 10u64;
    let cost1 = pm_math::compute_buy_cost(
        pm_market::outcome_quantities(&market), 0, 0, buy1,
    );
    let fee1_raw = (((cost1 as u128) * 100u128) / 10_000u128) as u64;
    let fee1 = if (cost1 > 0 && fee1_raw == 0) { 1 } else { fee1_raw };
    let payment1 = mint_test_coin(cost1 + fee1 + 100, ctx);

    let mut position = pm_trading::buy(
        &mut market, &config, &clock, 0, buy1, payment1, ctx,
    );

    let cost_after_first = pm_position::net_cost_basis(&position);

    // Second buy: merge 5 more
    let buy2 = 5u64;
    let cost2 = pm_math::compute_buy_cost(
        pm_market::outcome_quantities(&market), 0, 0, buy2,
    );
    let fee2_raw = (((cost2 as u128) * 100u128) / 10_000u128) as u64;
    let fee2 = if (cost2 > 0 && fee2_raw == 0) { 1 } else { fee2_raw };
    let payment2 = mint_test_coin(cost2 + fee2 + 100, ctx);

    pm_trading::buy_merge(
        &mut market, &config, &clock, 0, buy2, payment2, &mut position, ctx,
    );

    // Position: 15 total
    assert!(pm_position::quantity(&position) == 15, 0);

    // net_cost_basis = sum
    assert!(pm_position::net_cost_basis(&position) == cost_after_first + cost2, 1);

    // Pool: 100-10=90, then 90-5=85
    let quantities = pm_market::outcome_quantities(&market);
    assert!(*vector::borrow(quantities, 0) == 85, 2);

    destroy(position);
    destroy(market);
    destroy(registry);
    destroy(config);
    destroy(admin);
    destroy(policy);
    destroy(resolver_policy);
    destroy(treasury);
    sui::clock::destroy_for_testing(clock);
    ts::end(scenario);
}

// ═══════════════════════════════════════════════════════════════
// AMM pricing sanity — buy cost increases with pool imbalance
// ═══════════════════════════════════════════════════════════════

#[test]
fun test_amm_price_impact() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let (mut registry, config, admin, policy, resolver_policy, treasury) = setup(ctx);
    let mut market_clock = sui::clock::create_for_testing(ctx);
    sui::clock::increment_for_testing(&mut market_clock, 1_000_000);
    let mut market = create_market(&mut registry, &config, &policy, &resolver_policy, &market_clock, ctx);
    destroy(market_clock);

    let clock = sui::clock::create_for_testing(ctx);

    // First buy: 10 at balanced pool → cost = 100*10/90 = 11
    let cost1 = pm_math::compute_buy_cost(
        pm_market::outcome_quantities(&market), 0, 0, 10,
    );
    let fee1_raw = (((cost1 as u128) * 100u128) / 10_000u128) as u64;
    let fee1 = if (cost1 > 0 && fee1_raw == 0) { 1 } else { fee1_raw };
    let payment1 = mint_test_coin(cost1 + fee1 + 100, ctx);

    let pos1 = pm_trading::buy(
        &mut market, &config, &clock, 0, 10, payment1, ctx,
    );

    // Second buy: 10 at imbalanced pool → more expensive
    let cost2 = pm_math::compute_buy_cost(
        pm_market::outcome_quantities(&market), 0, 0, 10,
    );

    assert!(cost2 > cost1, 0);

    let fee2_raw = (((cost2 as u128) * 100u128) / 10_000u128) as u64;
    let fee2 = if (cost2 > 0 && fee2_raw == 0) { 1 } else { fee2_raw };
    let payment2 = mint_test_coin(cost2 + fee2 + 100, ctx);

    let pos2 = pm_trading::buy(
        &mut market, &config, &clock, 0, 10, payment2, ctx,
    );

    destroy(pos1);
    destroy(pos2);
    destroy(market);
    destroy(registry);
    destroy(config);
    destroy(admin);
    destroy(policy);
    destroy(resolver_policy);
    destroy(treasury);
    sui::clock::destroy_for_testing(clock);
    ts::end(scenario);
}

// ═══════════════════════════════════════════════════════════════
// Losing position claim — verifies no payout
// ═══════════════════════════════════════════════════════════════

#[test]
fun test_losing_position_claim_no_payout() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let (mut registry, config, admin, policy, resolver_policy, treasury) = setup(ctx);
    let mut market_clock = sui::clock::create_for_testing(ctx);
    sui::clock::increment_for_testing(&mut market_clock, 1_000_000);
    let mut market = create_market(&mut registry, &config, &policy, &resolver_policy, &market_clock, ctx);
    destroy(market_clock);

    let clock = sui::clock::create_for_testing(ctx);

    // Buy NO (outcome 1)
    let buy_amount = 10u64;
    let cost = pm_math::compute_buy_cost(
        pm_market::outcome_quantities(&market), 0, 1, buy_amount,
    );
    let fee_raw = (((cost as u128) * 100u128) / 10_000u128) as u64;
    let fee = if (cost > 0 && fee_raw == 0) { 1 } else { fee_raw };
    let payment = mint_test_coin(cost + fee + 100, ctx);

    let position = pm_trading::buy(
        &mut market, &config, &clock, 1, buy_amount, payment, ctx,
    );

    // Close + resolve YES wins
    pm_market::transition_to_closed(&mut market, 100_000_000);
    let record = pm_market::new_resolution_record(0, 0, @0x0, vector::empty(), 100_000_000, 200_000_000);
    pm_market::transition_to_resolution_pending(&mut market, record);
    pm_market::transition_to_resolved(&mut market);

    let collateral_before = pm_market::total_collateral(&market);
    pm_trading::claim(&mut market, &config, position, ctx);
    let collateral_after = pm_market::total_collateral(&market);

    // Losing position: no payout
    assert!(collateral_after == collateral_before, 0);

    destroy(market);
    destroy(registry);
    destroy(config);
    destroy(admin);
    destroy(policy);
    destroy(resolver_policy);
    destroy(treasury);
    sui::clock::destroy_for_testing(clock);
    ts::end(scenario);
}
