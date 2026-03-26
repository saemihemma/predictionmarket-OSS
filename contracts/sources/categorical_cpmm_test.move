/// Categorical (N-outcome) constant-product market maker tests.
/// These cover the active symmetric reserve-adjustment implementation in
/// `pm_math`, plus binary compatibility and basic invariant expectations.
#[test_only]
module prediction_market::categorical_cpmm_test;

use prediction_market::pm_math;

// Binary compatibility

#[test]
fun test_categorical_buy_matches_binary_equal_reserves() {
    let reserves = vector[1_000_000_000u64, 1_000_000_000u64];
    let cost = pm_math::cp_buy_cost(&reserves, 0, 0, 100_000_000);

    assert!(cost >= 111_111_111u64, 0);
    assert!(cost <= 111_111_113u64, 1);
}

#[test]
fun test_categorical_sell_matches_binary_equal_reserves() {
    let reserves = vector[1_000_000_000u64, 1_000_000_000u64];
    let proceeds = pm_math::cp_sell_proceeds(&reserves, 0, 0, 100_000_000);

    assert!(proceeds >= 90_909_089u64, 0);
    assert!(proceeds <= 90_909_091u64, 1);
}

#[test]
fun test_categorical_probability_matches_binary() {
    let reserves = vector[500_000_000u64, 1_500_000_000u64];
    let p0 = pm_math::cp_probability_bps(&reserves, 0, 0);
    let p1 = pm_math::cp_probability_bps(&reserves, 0, 1);

    assert!(p0 == 7500, 0);
    assert!(p1 == 2500, 1);
    assert!(p0 + p1 == 10000, 2);
}

// Ternary categorical cases

#[test]
fun test_categorical_3_outcome_buy_equal_reserves() {
    let reserves = vector[100u64, 100u64, 100u64];
    let cost = pm_math::cp_buy_cost(&reserves, 0, 0, 10);

    // The active categorical CPMM finds the smallest symmetric increment on the
    // non-target outcomes that restores the original reserve product.
    assert!(cost == 6u64, 0);
}

#[test]
fun test_categorical_3_outcome_sell_equal_reserves() {
    let reserves = vector[100u64, 100u64, 100u64];
    let proceeds = pm_math::cp_sell_proceeds(&reserves, 0, 0, 10);

    assert!(proceeds == 4u64, 0);
}

#[test]
fun test_categorical_3_outcome_probability_equal_reserves() {
    let reserves = vector[100u64, 100u64, 100u64];

    let p0 = pm_math::cp_probability_bps(&reserves, 0, 0);
    let p1 = pm_math::cp_probability_bps(&reserves, 0, 1);
    let p2 = pm_math::cp_probability_bps(&reserves, 0, 2);

    assert!(p0 >= 3333u64, 0);
    assert!(p1 >= 3333u64, 1);
    assert!(p2 >= 3333u64, 2);
    let total = p0 + p1 + p2;
    assert!(total >= 9999u64 && total <= 10000u64, 3);
}

#[test]
fun test_categorical_3_outcome_probability_unequal_reserves() {
    let reserves = vector[100u64, 200u64, 300u64];

    let p0 = pm_math::cp_probability_bps(&reserves, 0, 0);
    let p1 = pm_math::cp_probability_bps(&reserves, 0, 1);
    let p2 = pm_math::cp_probability_bps(&reserves, 0, 2);

    let total = p0 + p1 + p2;
    assert!(total >= 9999u64 && total <= 10000u64, 0);
    assert!(p0 > p1, 1);
    assert!(p1 > p2, 2);
}

#[test]
fun test_categorical_3_outcome_buy_then_sell() {
    let reserves = vector[1000u64, 1000u64, 1000u64];
    let amount = 100u64;

    let cost = pm_math::cp_buy_cost(&reserves, 1, 0, amount);
    let proceeds = pm_math::cp_sell_proceeds(&reserves, 1, 0, amount);

    assert!(cost == 55u64, 0);
    assert!(proceeds == 46u64, 1);
    assert!(cost > proceeds, 2);
}

// Higher outcome counts

#[test]
fun test_categorical_4_outcome_probability_equal_reserves() {
    let reserves = vector[100u64, 100u64, 100u64, 100u64];

    let p0 = pm_math::cp_probability_bps(&reserves, 0, 0);
    let p1 = pm_math::cp_probability_bps(&reserves, 0, 1);
    let p2 = pm_math::cp_probability_bps(&reserves, 0, 2);
    let p3 = pm_math::cp_probability_bps(&reserves, 0, 3);

    assert!(p0 + p1 + p2 + p3 == 10000u64, 0);
}

#[test]
fun test_categorical_16_outcome_equal_reserves() {
    let reserves = vector[
        100u64, 100u64, 100u64, 100u64,
        100u64, 100u64, 100u64, 100u64,
        100u64, 100u64, 100u64, 100u64,
        100u64, 100u64, 100u64, 100u64,
    ];

    let p0 = pm_math::cp_probability_bps(&reserves, 0, 0);
    let p8 = pm_math::cp_probability_bps(&reserves, 0, 8);
    let p15 = pm_math::cp_probability_bps(&reserves, 0, 15);

    assert!(p0 >= 620u64, 0);
    assert!(p8 >= 620u64, 1);
    assert!(p15 >= 620u64, 2);
}

#[test]
fun test_categorical_8_outcome_buy() {
    let reserves = vector[
        100u64, 100u64, 100u64, 100u64,
        100u64, 100u64, 100u64, 100u64,
    ];

    let cost = pm_math::cp_buy_cost(&reserves, 0, 0, 10);

    assert!(cost > 0, 0);
}

// Edge cases

#[test]
fun test_categorical_3_outcome_small_buy() {
    let reserves = vector[1_000_000_000u64, 1_000_000_000u64, 1_000_000_000u64];
    let cost = pm_math::cp_buy_cost(&reserves, 0, 0, 1_000);

    assert!(cost == 501u64, 0);
}

#[test]
fun test_categorical_3_outcome_large_buy() {
    let reserves = vector[1_000_000_000u64, 1_000_000_000u64, 1_000_000_000u64];
    let cost = pm_math::cp_buy_cost(&reserves, 0, 0, 250_000_000);

    assert!(cost == 154_700_539u64, 0);
}

#[test]
fun test_categorical_zero_amount_buy() {
    let reserves = vector[100u64, 100u64, 100u64];
    let cost = pm_math::cp_buy_cost(&reserves, 0, 0, 0);
    assert!(cost == 0, 0);
}

#[test]
fun test_categorical_zero_amount_sell() {
    let reserves = vector[100u64, 100u64, 100u64];
    let proceeds = pm_math::cp_sell_proceeds(&reserves, 0, 0, 0);
    assert!(proceeds == 0, 0);
}

// Invariant and slippage

#[test]
fun test_categorical_3_outcome_buy_invariant() {
    let reserves = vector[1000u64, 1000u64, 1000u64];
    let cost = pm_math::cp_buy_cost(&reserves, 0, 0, 100u64);

    assert!(cost > 0, 0);
}

#[test]
fun test_categorical_3_outcome_slippage_increases_with_size() {
    let reserves = vector[10_000u64, 10_000u64, 10_000u64];

    let small_buy = pm_math::cp_buy_cost(&reserves, 0, 0, 100);
    let medium_buy = pm_math::cp_buy_cost(&reserves, 0, 0, 500);
    let large_buy = pm_math::cp_buy_cost(&reserves, 0, 0, 1_000);

    assert!(medium_buy * 100 > small_buy * 500, 0);
    assert!(large_buy * 500 > medium_buy * 1_000, 1);
}

// Outcome selection

#[test]
fun test_categorical_3_outcome_different_indices() {
    let reserves = vector[100u64, 200u64, 300u64];

    let cost0 = pm_math::cp_buy_cost(&reserves, 0, 0, 10);
    let cost1 = pm_math::cp_buy_cost(&reserves, 0, 1, 10);
    let cost2 = pm_math::cp_buy_cost(&reserves, 0, 2, 10);

    assert!(cost2 < cost1, 0);
    assert!(cost1 < cost0, 1);
}
