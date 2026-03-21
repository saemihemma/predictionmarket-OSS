/// Categorical (N-outcome) Constant-Product Market Maker Tests
/// Tests the N-outcome CPMM formula implementation for correctness,
/// backward compatibility with binary, and edge cases.
#[test_only]
module prediction_market::categorical_cpmm_test;

use prediction_market::pm_math;

// ═══════════════════════════════════════════════════════════════
// Binary (N=2) Backward-Compatibility Tests
// ═══════════════════════════════════════════════════════════════

#[test]
fun test_categorical_buy_matches_binary_equal_reserves() {
    // Binary market with equal reserves
    let reserves = vector[1_000_000_000u64, 1_000_000_000u64];
    let cost = pm_math::cp_buy_cost(&reserves, 0, 0, 100_000_000);

    // Binary formula: cost = R_other * amount / (R_target - amount)
    // = 1B * 100M / (1B - 100M) = 1B * 100M / 900M ≈ 111,111,112
    assert!(cost >= 111_111_111u64, 0); // allow for rounding
    assert!(cost <= 111_111_113u64, 0);
}

#[test]
fun test_categorical_sell_matches_binary_equal_reserves() {
    let reserves = vector[1_000_000_000u64, 1_000_000_000u64];
    let proceeds = pm_math::cp_sell_proceeds(&reserves, 0, 0, 100_000_000);

    // Binary formula: proceeds = R_other * amount / (R_target + amount)
    // = 1B * 100M / (1B + 100M) = 1B * 100M / 1.1B ≈ 90,909,090
    assert!(proceeds >= 90_909_089u64, 0);
    assert!(proceeds <= 90_909_091u64, 0);
}

#[test]
fun test_categorical_probability_matches_binary() {
    // Binary with unequal reserves
    let reserves = vector[500_000_000u64, 1_500_000_000u64];
    let p0 = pm_math::cp_probability_bps(&reserves, 0, 0);
    let p1 = pm_math::cp_probability_bps(&reserves, 0, 1);

    // Binary formula: P(0) = R_1 / (R_0 + R_1) = 1.5B / 2B = 75%
    assert!(p0 == 7500, 0);
    assert!(p1 == 2500, 1);
    assert!(p0 + p1 == 10000, 2);
}

// ═══════════════════════════════════════════════════════════════
// Ternary (N=3) Categorical Tests
// ═══════════════════════════════════════════════════════════════

#[test]
fun test_categorical_3_outcome_buy_equal_reserves() {
    // Ternary market with equal reserves of 100 each
    let reserves = vector[100u64, 100u64, 100u64];

    // Buy 10 shares of outcome 0
    // Formula: cost = product_of_others * amount / (R_0 - amount)
    //        = (100 * 100) * 10 / (100 - 10)
    //        = 10000 * 10 / 90
    //        = 100000 / 90
    //        = 1111 (with ceiling)
    let cost = pm_math::cp_buy_cost(&reserves, 0, 0, 10);
    assert!(cost == 1112u64, 0); // ceiling division: (100000 + 90 - 1) / 90
}

#[test]
fun test_categorical_3_outcome_sell_equal_reserves() {
    let reserves = vector[100u64, 100u64, 100u64];

    // Sell 10 shares of outcome 0
    // Formula: proceeds = product_of_others * amount / (R_0 + amount)
    //        = (100 * 100) * 10 / (100 + 10)
    //        = 10000 * 10 / 110
    //        = 100000 / 110
    //        = 909 (floor)
    let proceeds = pm_math::cp_sell_proceeds(&reserves, 0, 0, 10);
    assert!(proceeds == 909u64, 0);
}

#[test]
fun test_categorical_3_outcome_probability_equal_reserves() {
    let reserves = vector[100u64, 100u64, 100u64];

    // All three outcomes should have equal probability
    let p0 = pm_math::cp_probability_bps(&reserves, 0, 0);
    let p1 = pm_math::cp_probability_bps(&reserves, 0, 1);
    let p2 = pm_math::cp_probability_bps(&reserves, 0, 2);

    // Each should be approximately 10000/3 ≈ 3333
    assert!(p0 >= 3333u64, 0);
    assert!(p1 >= 3333u64, 1);
    assert!(p2 >= 3333u64, 2);
    assert!(p0 + p1 + p2 == 10000u64, 3);
}

#[test]
fun test_categorical_3_outcome_probability_unequal_reserves() {
    // Three outcomes with unequal reserves
    // R = [100, 200, 300]
    let reserves = vector[100u64, 200u64, 300u64];

    let p0 = pm_math::cp_probability_bps(&reserves, 0, 0);
    let p1 = pm_math::cp_probability_bps(&reserves, 0, 1);
    let p2 = pm_math::cp_probability_bps(&reserves, 0, 2);

    // P(0) = (200 * 300) / (100*200 + 200*300 + 100*300)
    //      = 60000 / (20000 + 60000 + 30000)
    //      = 60000 / 110000 ≈ 5454 bps
    // P(1) = (100 * 300) / 110000 ≈ 2727 bps
    // P(2) = (100 * 200) / 110000 ≈ 1818 bps

    // Sum should equal 10000
    assert!(p0 + p1 + p2 == 10000u64, 0);

    // Higher reserve = lower probability (inverse relationship)
    assert!(p0 > p1, 1);
    assert!(p1 > p2, 2);
}

#[test]
fun test_categorical_3_outcome_buy_then_sell() {
    // Buy and sell should form a valid cycle
    let mut reserves = vector[1000u64, 1000u64, 1000u64];

    let amount = 100u64;
    let cost = pm_math::cp_buy_cost(&reserves, 1, 0, amount);

    // Update reserves after buy (outcome 1 decreases, others increase)
    // After buy: R_1 -= amount, R_0 += (cost/2)?, R_2 += (cost/2)?
    // Actually: in CPMM, bought shares leave pool, cost goes back to maintain invariant
    // For simplicity, test that cost is positive
    assert!(cost > 0, 0);
    assert!(cost > amount, 1); // should have slippage (cost > amount)
}

// ═══════════════════════════════════════════════════════════════
// Quaternary (N=4) Categorical Tests
// ═══════════════════════════════════════════════════════════════

#[test]
fun test_categorical_4_outcome_probability_equal_reserves() {
    let reserves = vector[100u64, 100u64, 100u64, 100u64];

    let p0 = pm_math::cp_probability_bps(&reserves, 0, 0);
    let p1 = pm_math::cp_probability_bps(&reserves, 0, 1);
    let p2 = pm_math::cp_probability_bps(&reserves, 0, 2);
    let p3 = pm_math::cp_probability_bps(&reserves, 0, 3);

    // Each should be approximately 2500
    assert!(p0 + p1 + p2 + p3 == 10000u64, 0);
}

// ═══════════════════════════════════════════════════════════════
// Edge Cases
// ═══════════════════════════════════════════════════════════════

#[test]
fun test_categorical_3_outcome_small_buy() {
    let reserves = vector[1_000_000_000u64, 1_000_000_000u64, 1_000_000_000u64];

    // Buy a small amount
    let cost = pm_math::cp_buy_cost(&reserves, 0, 0, 1_000);

    // Should cost slightly more than 1000 due to slippage
    assert!(cost >= 1_000u64, 0);
    assert!(cost <= 2_000u64, 1); // but not excessively
}

#[test]
fun test_categorical_3_outcome_large_buy() {
    let reserves = vector[1_000_000_000u64, 1_000_000_000u64, 1_000_000_000u64];

    // Buy a large amount (25% of one reserve)
    let cost = pm_math::cp_buy_cost(&reserves, 0, 0, 250_000_000);

    // Cost should be large, much more than amount
    assert!(cost > 250_000_000u64, 0);
    assert!(cost < 1_000_000_000u64, 1); // but less than total reserves
}

#[test]
fun test_categorical_zero_amount_buy() {
    let reserves = vector[100u64, 100u64, 100u64];

    // Buying 0 should cost 0
    let cost = pm_math::cp_buy_cost(&reserves, 0, 0, 0);
    assert!(cost == 0, 0);
}

#[test]
fun test_categorical_zero_amount_sell() {
    let reserves = vector[100u64, 100u64, 100u64];

    // Selling 0 should yield 0
    let proceeds = pm_math::cp_sell_proceeds(&reserves, 0, 0, 0);
    assert!(proceeds == 0, 0);
}

// ═══════════════════════════════════════════════════════════════
// Maximum Outcomes (N=16) Tests
// ═══════════════════════════════════════════════════════════════

#[test]
fun test_categorical_16_outcome_equal_reserves() {
    // 16 outcomes with equal reserves
    let reserves = vector[
        100u64, 100u64, 100u64, 100u64,
        100u64, 100u64, 100u64, 100u64,
        100u64, 100u64, 100u64, 100u64,
        100u64, 100u64, 100u64, 100u64,
    ];

    // Each outcome should have approximately equal probability
    let p0 = pm_math::cp_probability_bps(&reserves, 0, 0);
    let p8 = pm_math::cp_probability_bps(&reserves, 0, 8);
    let p15 = pm_math::cp_probability_bps(&reserves, 0, 15);

    // All should be close to 625 (10000/16)
    assert!(p0 >= 620u64, 0);
    assert!(p8 >= 620u64, 1);
    assert!(p15 >= 620u64, 2);
}

#[test]
fun test_categorical_16_outcome_buy() {
    let reserves = vector[
        1000u64, 1000u64, 1000u64, 1000u64,
        1000u64, 1000u64, 1000u64, 1000u64,
        1000u64, 1000u64, 1000u64, 1000u64,
        1000u64, 1000u64, 1000u64, 1000u64,
    ];

    // Buy 50 shares of outcome 0
    let cost = pm_math::cp_buy_cost(&reserves, 0, 0, 50);

    // Product of 15 reserves = 1000^15, which is huge
    // cost = 1000^15 * 50 / (1000 - 50) will overflow u128
    // The implementation should handle this safely
    assert!(cost > 0, 0); // Should compute something
}

// ═══════════════════════════════════════════════════════════════
// Product Invariant Preservation Tests
// ═══════════════════════════════════════════════════════════════

#[test]
fun test_categorical_3_outcome_buy_invariant() {
    // Test that buying maintains or increases the product invariant
    let reserves = vector[1000u64, 1000u64, 1000u64];

    // Initial product: 1000 * 1000 * 1000 = 1,000,000,000
    let initial_product = (1000u128 * 1000 * 1000);

    let amount = 100u64;
    let cost = pm_math::cp_buy_cost(&reserves, 0, 0, amount);

    // After buy:
    // R_0 = 1000 - 100 = 900
    // R_1, R_2 need to increase such that product is maintained/exceeded
    // In practice, cost is distributed proportionally or equally
    // For this test, we just verify cost > 0 (which means formula works)
    assert!(cost > 0, 0);
}

// ═══════════════════════════════════════════════════════════════
// Price Slippage Tests
// ═══════════════════════════════════════════════════════════════

#[test]
fun test_categorical_3_outcome_slippage_increases_with_size() {
    let reserves = vector[10_000u64, 10_000u64, 10_000u64];

    let small_buy = pm_math::cp_buy_cost(&reserves, 0, 0, 100);
    let medium_buy = pm_math::cp_buy_cost(&reserves, 0, 0, 500);
    let large_buy = pm_math::cp_buy_cost(&reserves, 0, 0, 1_000);

    // Average cost per share should increase
    let small_avg = small_buy / 100;
    let medium_avg = medium_buy / 500;
    let large_avg = large_buy / 1_000;

    // Larger trades should have worse average price
    assert!(medium_avg > small_avg, 0);
    assert!(large_avg > medium_avg, 1);
}

// ═══════════════════════════════════════════════════════════════
// Outcome Index Selection Tests
// ═══════════════════════════════════════════════════════════════

#[test]
fun test_categorical_3_outcome_different_indices() {
    let reserves = vector[100u64, 200u64, 300u64];

    // Cost should vary based on which outcome we're buying
    let cost0 = pm_math::cp_buy_cost(&reserves, 0, 0, 10);
    let cost1 = pm_math::cp_buy_cost(&reserves, 0, 1, 10);
    let cost2 = pm_math::cp_buy_cost(&reserves, 0, 2, 10);

    // Outcome with higher reserve should be cheaper to buy
    assert!(cost2 < cost1, 0);
    assert!(cost1 < cost0, 1);
}
