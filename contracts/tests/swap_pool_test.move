/// SwapPool tests — covers pool creation, swaps in both directions,
/// fee accrual, slippage protection, pause/resume, k-invariant,
/// liquidity management, and round-trip loss.
#[test_only]
module prediction_market::swap_pool_test;

use sui::test_scenario::{Self as ts};
use std::unit_test::destroy;
use sui::coin;
use sui::sui::SUI;
use prediction_market::{
    suffer::SUFFER,
    pm_registry,
    swap_pool::{Self, SwapPool},
};

// ── Constants ──
// Pool seeded with 1 SUI (10^9 MIST) and 10,000 SUFFER base units (100 SFR)
const INIT_SUI: u64 = 1_000_000_000;
const INIT_SUFFER: u64 = 10_000;
const FEE_BPS: u64 = 30; // 0.3%

// ── Helpers ──

fun setup(ctx: &mut TxContext): pm_registry::PMAdminCap {
    let (_registry, _config, admin) = pm_registry::create_registry(
        100, 50, 0, 0, 0, 0, 1,
        86_400_000, 172_800_000, 259_200_000,
        3_600_000, 7_776_000_000, 16, 1_000_000_000, ctx,
    );
    destroy(_registry);
    destroy(_config);
    admin
}

fun create_test_pool(admin: &pm_registry::PMAdminCap, ctx: &mut TxContext): SwapPool {
    let sui_coin = coin::mint_for_testing<SUI>(INIT_SUI, ctx);
    let suffer_coin = coin::mint_for_testing<SUFFER>(INIT_SUFFER, ctx);
    // We can't use create_pool directly since it shares — use a workaround
    // by calling create_pool and retrieving from scenario.
    // Instead, build the pool inline for unit tests.
    swap_pool::create_pool(admin, sui_coin, suffer_coin, FEE_BPS, ctx);
    // Pool is shared, so we need scenario to retrieve it.
    // For simplicity, we'll use test_scenario pattern.
    abort 0 // placeholder — tests below use scenario pattern
}

// ── Tests ──

#[test]
fun test_pool_creation() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let admin = setup(ctx);

    let sui_coin = coin::mint_for_testing<SUI>(INIT_SUI, ctx);
    let suffer_coin = coin::mint_for_testing<SUFFER>(INIT_SUFFER, ctx);
    swap_pool::create_pool(&admin, sui_coin, suffer_coin, FEE_BPS, ctx);

    ts::next_tx(&mut scenario, @0x1);
    let pool = ts::take_shared<SwapPool>(&scenario);

    assert!(swap_pool::reserve_sui(&pool) == INIT_SUI, 0);
    assert!(swap_pool::reserve_suffer(&pool) == INIT_SUFFER, 1);
    assert!(swap_pool::fee_bps(&pool) == FEE_BPS, 2);
    assert!(!swap_pool::is_paused(&pool), 3);
    assert!(swap_pool::accrued_fee_sui(&pool) == 0, 4);
    assert!(swap_pool::accrued_fee_suffer(&pool) == 0, 5);

    ts::return_shared(pool);
    destroy(admin);
    ts::end(scenario);
}

#[test]
fun test_swap_sui_for_suffer() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let admin = setup(ctx);

    let sui_coin = coin::mint_for_testing<SUI>(INIT_SUI, ctx);
    let suffer_coin = coin::mint_for_testing<SUFFER>(INIT_SUFFER, ctx);
    swap_pool::create_pool(&admin, sui_coin, suffer_coin, FEE_BPS, ctx);

    ts::next_tx(&mut scenario, @0x1);
    let mut pool = ts::take_shared<SwapPool>(&scenario);

    // Swap 100M MIST (0.1 SUI) for SUFFER
    let swap_amount: u64 = 100_000_000;
    let sui_in = coin::mint_for_testing<SUI>(swap_amount, ts::ctx(&mut scenario));

    // Compute expected output
    let fee = (((swap_amount as u128) * (FEE_BPS as u128)) / 10_000u128) as u64;
    let effective = swap_amount - fee;
    let expected_out = (((INIT_SUFFER as u128) * (effective as u128)) / ((INIT_SUI + effective) as u128)) as u64;

    let suffer_out = swap_pool::swap_sui_for_suffer(&mut pool, sui_in, 0, ts::ctx(&mut scenario));
    assert!(coin::value(&suffer_out) == expected_out, 0);

    // Verify reserves updated
    assert!(swap_pool::reserve_sui(&pool) == INIT_SUI + effective, 1);
    assert!(swap_pool::reserve_suffer(&pool) == INIT_SUFFER - expected_out, 2);

    // Verify fee accrued
    assert!(swap_pool::accrued_fee_sui(&pool) == fee, 3);

    // Verify k preserved (k' >= k)
    let new_k = (swap_pool::reserve_sui(&pool) as u128) * (swap_pool::reserve_suffer(&pool) as u128);
    let old_k = (INIT_SUI as u128) * (INIT_SUFFER as u128);
    assert!(new_k >= old_k, 4);

    destroy(suffer_out);
    ts::return_shared(pool);
    destroy(admin);
    ts::end(scenario);
}

#[test]
fun test_swap_suffer_for_sui() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let admin = setup(ctx);

    let sui_coin = coin::mint_for_testing<SUI>(INIT_SUI, ctx);
    let suffer_coin = coin::mint_for_testing<SUFFER>(INIT_SUFFER, ctx);
    swap_pool::create_pool(&admin, sui_coin, suffer_coin, FEE_BPS, ctx);

    ts::next_tx(&mut scenario, @0x1);
    let mut pool = ts::take_shared<SwapPool>(&scenario);

    // Swap 1000 SUFFER base units for SUI
    let swap_amount: u64 = 1_000;
    let suffer_in = coin::mint_for_testing<SUFFER>(swap_amount, ts::ctx(&mut scenario));

    let fee = (((swap_amount as u128) * (FEE_BPS as u128)) / 10_000u128) as u64;
    let effective = swap_amount - fee;
    let expected_out = (((INIT_SUI as u128) * (effective as u128)) / ((INIT_SUFFER + effective) as u128)) as u64;

    let sui_out = swap_pool::swap_suffer_for_sui(&mut pool, suffer_in, 0, ts::ctx(&mut scenario));
    assert!(coin::value(&sui_out) == expected_out, 0);

    // Verify fee accrued in SUFFER
    assert!(swap_pool::accrued_fee_suffer(&pool) == fee, 1);

    // k preserved
    let new_k = (swap_pool::reserve_sui(&pool) as u128) * (swap_pool::reserve_suffer(&pool) as u128);
    let old_k = (INIT_SUI as u128) * (INIT_SUFFER as u128);
    assert!(new_k >= old_k, 2);

    destroy(sui_out);
    ts::return_shared(pool);
    destroy(admin);
    ts::end(scenario);
}

#[test]
#[expected_failure(abort_code = swap_pool::ESlippageExceeded)]
fun test_slippage_protection() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let admin = setup(ctx);

    let sui_coin = coin::mint_for_testing<SUI>(INIT_SUI, ctx);
    let suffer_coin = coin::mint_for_testing<SUFFER>(INIT_SUFFER, ctx);
    swap_pool::create_pool(&admin, sui_coin, suffer_coin, FEE_BPS, ctx);

    ts::next_tx(&mut scenario, @0x1);
    let mut pool = ts::take_shared<SwapPool>(&scenario);

    let sui_in = coin::mint_for_testing<SUI>(100_000_000, ts::ctx(&mut scenario));
    // Set min_out impossibly high
    let _out = swap_pool::swap_sui_for_suffer(&mut pool, sui_in, 999_999, ts::ctx(&mut scenario));

    destroy(_out);
    ts::return_shared(pool);
    destroy(admin);
    ts::end(scenario);
}

#[test]
fun test_fee_accrual_and_withdrawal() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let admin = setup(ctx);

    let sui_coin = coin::mint_for_testing<SUI>(INIT_SUI, ctx);
    let suffer_coin = coin::mint_for_testing<SUFFER>(INIT_SUFFER, ctx);
    swap_pool::create_pool(&admin, sui_coin, suffer_coin, FEE_BPS, ctx);

    ts::next_tx(&mut scenario, @0x1);
    let mut pool = ts::take_shared<SwapPool>(&scenario);

    // Do a SUI→SUFFER swap
    let sui_in = coin::mint_for_testing<SUI>(100_000_000, ts::ctx(&mut scenario));
    let suffer_out = swap_pool::swap_sui_for_suffer(&mut pool, sui_in, 0, ts::ctx(&mut scenario));
    let fee_sui = swap_pool::accrued_fee_sui(&pool);
    assert!(fee_sui > 0, 0);
    destroy(suffer_out);

    // Do a SUFFER→SUI swap
    let suffer_in = coin::mint_for_testing<SUFFER>(500, ts::ctx(&mut scenario));
    let sui_out = swap_pool::swap_suffer_for_sui(&mut pool, suffer_in, 0, ts::ctx(&mut scenario));
    let fee_suffer = swap_pool::accrued_fee_suffer(&pool);
    assert!(fee_suffer > 0, 1);
    destroy(sui_out);

    // Withdraw fees
    swap_pool::withdraw_fees(&mut pool, &admin, @0x99, ts::ctx(&mut scenario));
    assert!(swap_pool::accrued_fee_sui(&pool) == 0, 2);
    assert!(swap_pool::accrued_fee_suffer(&pool) == 0, 3);

    ts::return_shared(pool);
    destroy(admin);
    ts::end(scenario);
}

#[test]
#[expected_failure(abort_code = swap_pool::EZeroInput)]
fun test_zero_input_rejected() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let admin = setup(ctx);

    let sui_coin = coin::mint_for_testing<SUI>(INIT_SUI, ctx);
    let suffer_coin = coin::mint_for_testing<SUFFER>(INIT_SUFFER, ctx);
    swap_pool::create_pool(&admin, sui_coin, suffer_coin, FEE_BPS, ctx);

    ts::next_tx(&mut scenario, @0x1);
    let mut pool = ts::take_shared<SwapPool>(&scenario);

    let zero_coin = coin::mint_for_testing<SUI>(0, ts::ctx(&mut scenario));
    let _out = swap_pool::swap_sui_for_suffer(&mut pool, zero_coin, 0, ts::ctx(&mut scenario));

    destroy(_out);
    ts::return_shared(pool);
    destroy(admin);
    ts::end(scenario);
}

#[test]
fun test_pause_and_resume() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let admin = setup(ctx);

    let sui_coin = coin::mint_for_testing<SUI>(INIT_SUI, ctx);
    let suffer_coin = coin::mint_for_testing<SUFFER>(INIT_SUFFER, ctx);
    swap_pool::create_pool(&admin, sui_coin, suffer_coin, FEE_BPS, ctx);

    ts::next_tx(&mut scenario, @0x1);
    let mut pool = ts::take_shared<SwapPool>(&scenario);

    // Pause
    swap_pool::pause(&mut pool, &admin);
    assert!(swap_pool::is_paused(&pool), 0);

    // Resume
    swap_pool::resume(&mut pool, &admin);
    assert!(!swap_pool::is_paused(&pool), 1);

    // Swap works after resume
    let sui_in = coin::mint_for_testing<SUI>(10_000_000, ts::ctx(&mut scenario));
    let out = swap_pool::swap_sui_for_suffer(&mut pool, sui_in, 0, ts::ctx(&mut scenario));
    assert!(coin::value(&out) > 0, 2);

    destroy(out);
    ts::return_shared(pool);
    destroy(admin);
    ts::end(scenario);
}

#[test]
#[expected_failure(abort_code = swap_pool::EPoolPaused)]
fun test_swap_blocked_when_paused() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let admin = setup(ctx);

    let sui_coin = coin::mint_for_testing<SUI>(INIT_SUI, ctx);
    let suffer_coin = coin::mint_for_testing<SUFFER>(INIT_SUFFER, ctx);
    swap_pool::create_pool(&admin, sui_coin, suffer_coin, FEE_BPS, ctx);

    ts::next_tx(&mut scenario, @0x1);
    let mut pool = ts::take_shared<SwapPool>(&scenario);

    swap_pool::pause(&mut pool, &admin);

    let sui_in = coin::mint_for_testing<SUI>(10_000_000, ts::ctx(&mut scenario));
    let _out = swap_pool::swap_sui_for_suffer(&mut pool, sui_in, 0, ts::ctx(&mut scenario));

    destroy(_out);
    ts::return_shared(pool);
    destroy(admin);
    ts::end(scenario);
}

#[test]
fun test_k_invariant_multiple_swaps() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let admin = setup(ctx);

    let sui_coin = coin::mint_for_testing<SUI>(INIT_SUI, ctx);
    let suffer_coin = coin::mint_for_testing<SUFFER>(INIT_SUFFER, ctx);
    swap_pool::create_pool(&admin, sui_coin, suffer_coin, FEE_BPS, ctx);

    ts::next_tx(&mut scenario, @0x1);
    let mut pool = ts::take_shared<SwapPool>(&scenario);
    let initial_k = (INIT_SUI as u128) * (INIT_SUFFER as u128);

    // Multiple swaps in both directions
    let sui1 = coin::mint_for_testing<SUI>(50_000_000, ts::ctx(&mut scenario));
    let out1 = swap_pool::swap_sui_for_suffer(&mut pool, sui1, 0, ts::ctx(&mut scenario));
    destroy(out1);

    let sfr1 = coin::mint_for_testing<SUFFER>(500, ts::ctx(&mut scenario));
    let out2 = swap_pool::swap_suffer_for_sui(&mut pool, sfr1, 0, ts::ctx(&mut scenario));
    destroy(out2);

    let sui2 = coin::mint_for_testing<SUI>(200_000_000, ts::ctx(&mut scenario));
    let out3 = swap_pool::swap_sui_for_suffer(&mut pool, sui2, 0, ts::ctx(&mut scenario));
    destroy(out3);

    let sfr2 = coin::mint_for_testing<SUFFER>(2000, ts::ctx(&mut scenario));
    let out4 = swap_pool::swap_suffer_for_sui(&mut pool, sfr2, 0, ts::ctx(&mut scenario));
    destroy(out4);

    // k must have grown (fees + rounding favor pool)
    let final_k = (swap_pool::reserve_sui(&pool) as u128) * (swap_pool::reserve_suffer(&pool) as u128);
    assert!(final_k >= initial_k, 0);

    ts::return_shared(pool);
    destroy(admin);
    ts::end(scenario);
}

#[test]
fun test_add_and_withdraw_liquidity() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let admin = setup(ctx);

    let sui_coin = coin::mint_for_testing<SUI>(INIT_SUI, ctx);
    let suffer_coin = coin::mint_for_testing<SUFFER>(INIT_SUFFER, ctx);
    swap_pool::create_pool(&admin, sui_coin, suffer_coin, FEE_BPS, ctx);

    ts::next_tx(&mut scenario, @0x1);
    let mut pool = ts::take_shared<SwapPool>(&scenario);

    // Add liquidity
    let more_sui = coin::mint_for_testing<SUI>(500_000_000, ts::ctx(&mut scenario));
    let more_suffer = coin::mint_for_testing<SUFFER>(5_000, ts::ctx(&mut scenario));
    swap_pool::add_liquidity(&mut pool, &admin, more_sui, more_suffer);

    assert!(swap_pool::reserve_sui(&pool) == INIT_SUI + 500_000_000, 0);
    assert!(swap_pool::reserve_suffer(&pool) == INIT_SUFFER + 5_000, 1);

    // Withdraw some (leave above MIN_RESERVE)
    swap_pool::withdraw_liquidity(
        &mut pool, &admin, 200_000_000, 2_000, @0x99, ts::ctx(&mut scenario),
    );

    assert!(swap_pool::reserve_sui(&pool) == INIT_SUI + 500_000_000 - 200_000_000, 2);
    assert!(swap_pool::reserve_suffer(&pool) == INIT_SUFFER + 5_000 - 2_000, 3);

    ts::return_shared(pool);
    destroy(admin);
    ts::end(scenario);
}

#[test]
#[expected_failure(abort_code = swap_pool::EBelowMinReserve)]
fun test_withdraw_below_min_reserve() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let admin = setup(ctx);

    let sui_coin = coin::mint_for_testing<SUI>(100, ctx);
    let suffer_coin = coin::mint_for_testing<SUFFER>(100, ctx);
    swap_pool::create_pool(&admin, sui_coin, suffer_coin, FEE_BPS, ctx);

    ts::next_tx(&mut scenario, @0x1);
    let mut pool = ts::take_shared<SwapPool>(&scenario);

    // Try to withdraw everything — should fail (below MIN_RESERVE=1)
    swap_pool::withdraw_liquidity(&mut pool, &admin, 100, 100, @0x99, ts::ctx(&mut scenario));

    ts::return_shared(pool);
    destroy(admin);
    ts::end(scenario);
}

#[test]
fun test_update_fee() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let admin = setup(ctx);

    let sui_coin = coin::mint_for_testing<SUI>(INIT_SUI, ctx);
    let suffer_coin = coin::mint_for_testing<SUFFER>(INIT_SUFFER, ctx);
    swap_pool::create_pool(&admin, sui_coin, suffer_coin, FEE_BPS, ctx);

    ts::next_tx(&mut scenario, @0x1);
    let mut pool = ts::take_shared<SwapPool>(&scenario);

    // Update fee to 1%
    swap_pool::update_fee(&mut pool, &admin, 100);
    assert!(swap_pool::fee_bps(&pool) == 100, 0);

    // Swap with new fee — verify higher fee accrual
    let sui_in = coin::mint_for_testing<SUI>(100_000_000, ts::ctx(&mut scenario));
    let out = swap_pool::swap_sui_for_suffer(&mut pool, sui_in, 0, ts::ctx(&mut scenario));

    // Fee should be 1% of 100M = 1M
    let expected_fee = (((100_000_000u128) * 100u128) / 10_000u128) as u64;
    assert!(swap_pool::accrued_fee_sui(&pool) == expected_fee, 1);

    destroy(out);
    ts::return_shared(pool);
    destroy(admin);
    ts::end(scenario);
}

#[test]
fun test_quote_matches_swap() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let admin = setup(ctx);

    let sui_coin = coin::mint_for_testing<SUI>(INIT_SUI, ctx);
    let suffer_coin = coin::mint_for_testing<SUFFER>(INIT_SUFFER, ctx);
    swap_pool::create_pool(&admin, sui_coin, suffer_coin, FEE_BPS, ctx);

    ts::next_tx(&mut scenario, @0x1);
    let mut pool = ts::take_shared<SwapPool>(&scenario);

    let swap_amount = 100_000_000u64;

    // Get quote
    let (quoted_out, quoted_fee) = swap_pool::quote_sui_to_suffer(&pool, swap_amount);

    // Do actual swap
    let sui_in = coin::mint_for_testing<SUI>(swap_amount, ts::ctx(&mut scenario));
    let suffer_out = swap_pool::swap_sui_for_suffer(&mut pool, sui_in, 0, ts::ctx(&mut scenario));

    // Quote must match actual
    assert!(coin::value(&suffer_out) == quoted_out, 0);
    assert!(swap_pool::accrued_fee_sui(&pool) == quoted_fee, 1);

    destroy(suffer_out);
    ts::return_shared(pool);
    destroy(admin);
    ts::end(scenario);
}

#[test]
fun test_round_trip_loss() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let admin = setup(ctx);

    let sui_coin = coin::mint_for_testing<SUI>(INIT_SUI, ctx);
    let suffer_coin = coin::mint_for_testing<SUFFER>(INIT_SUFFER, ctx);
    swap_pool::create_pool(&admin, sui_coin, suffer_coin, FEE_BPS, ctx);

    ts::next_tx(&mut scenario, @0x1);
    let mut pool = ts::take_shared<SwapPool>(&scenario);

    let start_sui = 100_000_000u64;

    // SUI → SUFFER
    let sui_in = coin::mint_for_testing<SUI>(start_sui, ts::ctx(&mut scenario));
    let suffer_mid = swap_pool::swap_sui_for_suffer(&mut pool, sui_in, 0, ts::ctx(&mut scenario));

    // SUFFER → SUI
    let sui_back = swap_pool::swap_suffer_for_sui(&mut pool, suffer_mid, 0, ts::ctx(&mut scenario));

    // Must get back less than started (fee + rounding)
    assert!(coin::value(&sui_back) < start_sui, 0);

    destroy(sui_back);
    ts::return_shared(pool);
    destroy(admin);
    ts::end(scenario);
}

#[test]
fun test_large_swap_high_slippage() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let admin = setup(ctx);

    let sui_coin = coin::mint_for_testing<SUI>(INIT_SUI, ctx);
    let suffer_coin = coin::mint_for_testing<SUFFER>(INIT_SUFFER, ctx);
    swap_pool::create_pool(&admin, sui_coin, suffer_coin, FEE_BPS, ctx);

    ts::next_tx(&mut scenario, @0x1);
    let mut pool = ts::take_shared<SwapPool>(&scenario);

    // Swap 90% of SUI reserve equivalent — massive slippage
    let large_amount = 9_000_000_000u64; // 9 SUI
    let sui_in = coin::mint_for_testing<SUI>(large_amount, ts::ctx(&mut scenario));
    let out = swap_pool::swap_sui_for_suffer(&mut pool, sui_in, 0, ts::ctx(&mut scenario));

    // Should get SUFFER but far less than proportional (high slippage)
    // Proportional would be ~90,000 but pool only has 10,000 total
    // Output should be close to but less than 10,000
    assert!(coin::value(&out) > 0, 0);
    assert!(coin::value(&out) < INIT_SUFFER, 1);

    destroy(out);
    ts::return_shared(pool);
    destroy(admin);
    ts::end(scenario);
}

#[test]
fun test_price_functions() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let admin = setup(ctx);

    let sui_coin = coin::mint_for_testing<SUI>(INIT_SUI, ctx);
    let suffer_coin = coin::mint_for_testing<SUFFER>(INIT_SUFFER, ctx);
    swap_pool::create_pool(&admin, sui_coin, suffer_coin, FEE_BPS, ctx);

    ts::next_tx(&mut scenario, @0x1);
    let pool = ts::take_shared<SwapPool>(&scenario);

    // With 1B MIST SUI and 10K SUFFER base units:
    // price_suffer_per_sui = 10000 * 10^9 / 10^9 = 10000
    let sfr_per_sui = swap_pool::price_suffer_per_sui(&pool);
    assert!(sfr_per_sui == 10_000, 0);

    // price_sui_per_suffer = 10^9 * 100 / 10000 = 10_000_000
    let sui_per_sfr = swap_pool::price_sui_per_suffer(&pool);
    assert!(sui_per_sfr == 10_000_000, 1);

    ts::return_shared(pool);
    destroy(admin);
    ts::end(scenario);
}
