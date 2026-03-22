#[test_only]
module prediction_market::swap_pool_test;

use std::unit_test::destroy;
use sui::{
    coin,
    sui::SUI,
    test_scenario::{Self as ts},
};
use prediction_market::{
    swap_pool::{Self, SwapPool},
    test_support::{Self as support, TEST_COLLATERAL},
};

const INIT_SUI: u64 = 1_000_000_000;
const INIT_COLLATERAL: u64 = 10_000;
const FEE_BPS: u64 = 30;

#[test]
fun test_generic_swap_pool_quotes_and_swaps() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let (_registry, _config, admin) = support::create_core_bundle<TEST_COLLATERAL>(ctx);
    swap_pool::create_pool(
        &admin,
        coin::mint_for_testing<SUI>(INIT_SUI, ctx),
        support::mint_test_coin(INIT_COLLATERAL, ctx),
        FEE_BPS,
        ctx,
    );

    ts::next_tx(&mut scenario, @0x1);
    let mut pool = ts::take_shared<SwapPool<TEST_COLLATERAL>>(&scenario);
    let ctx = ts::ctx(&mut scenario);

    let (quoted_out, quoted_fee) = swap_pool::quote_sui_to_collateral(&pool, 100_000_000);
    let collateral_out = swap_pool::swap_sui_for_collateral(
        &mut pool,
        coin::mint_for_testing<SUI>(100_000_000, ctx),
        0,
        ctx,
    );

    assert!(coin::value(&collateral_out) == quoted_out, 0);
    assert!(quoted_fee > 0, 1);
    assert!(swap_pool::reserve_sui(&pool) > INIT_SUI, 2);
    assert!(swap_pool::reserve_collateral(&pool) < INIT_COLLATERAL, 3);
    assert!(swap_pool::accrued_fee_sui(&pool) == quoted_fee, 4);

    destroy(collateral_out);
    ts::return_shared(pool);
    destroy(admin);
    destroy(_config);
    destroy(_registry);
    ts::end(scenario);
}

#[test]
fun test_generic_swap_pool_withdraws_collateral_fees() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let (_registry, _config, admin) = support::create_core_bundle<TEST_COLLATERAL>(ctx);
    swap_pool::create_pool(
        &admin,
        coin::mint_for_testing<SUI>(INIT_SUI, ctx),
        support::mint_test_coin(INIT_COLLATERAL, ctx),
        FEE_BPS,
        ctx,
    );

    ts::next_tx(&mut scenario, @0x1);
    let mut pool = ts::take_shared<SwapPool<TEST_COLLATERAL>>(&scenario);
    let ctx = ts::ctx(&mut scenario);

    let (quoted_sui_out, _) = swap_pool::quote_collateral_to_sui(&pool, 1_000);
    let sui_out = swap_pool::swap_collateral_for_sui(
        &mut pool,
        support::mint_test_coin(1_000, ctx),
        0,
        ctx,
    );

    assert!(coin::value(&sui_out) == quoted_sui_out, 0);
    assert!(swap_pool::accrued_fee_collateral(&pool) > 0, 1);

    swap_pool::withdraw_fees(&mut pool, &admin, @0x9, ctx);
    assert!(swap_pool::accrued_fee_collateral(&pool) == 0, 2);
    assert!(swap_pool::accrued_fee_sui(&pool) == 0, 3);

    destroy(sui_out);
    ts::return_shared(pool);
    destroy(admin);
    destroy(_config);
    destroy(_registry);
    ts::end(scenario);
}
