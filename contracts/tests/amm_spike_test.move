/// AMM Constant-Product Tests
/// Validates CPMM correctness: buy/sell symmetry, probability sums, slippage behavior.
/// LMSR and Parimutuel models were removed (dead code cleanup, 2026-03-18).
#[test_only]
module prediction_market::amm_spike_test;

use prediction_market::pm_math;

// ═══════════════════════════════════════════════════════════════
// Constant-Product Tests
// ═══════════════════════════════════════════════════════════════

#[test]
fun test_cp_buy_basic() {
    // Binary market, equal reserves of 1M each
    let reserves = vector[1_000_000_000u64, 1_000_000_000u64]; // 1 PMKT each
    let cost = pm_math::cp_buy_cost(&reserves, 0, 0, 100_000_000); // buy 0.1 worth of YES

    // With equal reserves, buying YES should cost:
    // R_no * amount / (R_yes - amount) = 1B * 100M / (1B - 100M) = 1B * 100M / 900M ≈ 111M
    assert!(cost > 100_000_000, 0); // should cost more than amount (slippage)
    assert!(cost < 200_000_000, 1); // but not unreasonably more
}

#[test]
fun test_cp_sell_basic() {
    let reserves = vector[1_000_000_000u64, 1_000_000_000u64];
    let proceeds = pm_math::cp_sell_proceeds(&reserves, 0, 0, 100_000_000);

    // Selling into equal reserves:
    // R_no * amount / (R_yes + amount) = 1B * 100M / (1B + 100M) ≈ 90.9M
    assert!(proceeds > 80_000_000, 0);
    assert!(proceeds < 100_000_000, 1); // proceeds < amount (slippage)
}

#[test]
fun test_cp_probability_equal() {
    let reserves = vector[1_000_000_000u64, 1_000_000_000u64];
    let p0 = pm_math::cp_probability_bps(&reserves, 0, 0);
    let p1 = pm_math::cp_probability_bps(&reserves, 0, 1);

    assert!(p0 == 5000, 0); // 50%
    assert!(p1 == 5000, 1); // 50%
}

#[test]
fun test_cp_probability_unequal() {
    // Lower reserve = higher probability in CPMM
    let reserves = vector[500_000_000u64, 1_500_000_000u64];
    let p0 = pm_math::cp_probability_bps(&reserves, 0, 0);
    let p1 = pm_math::cp_probability_bps(&reserves, 0, 1);

    // P(YES) = R_NO / (R_YES + R_NO) = 1.5B / 2B = 75%
    assert!(p0 == 7500, 0);
    assert!(p1 == 2500, 1);
    assert!(p0 + p1 == 10000, 2); // probabilities sum to 100%
}

#[test]
fun test_cp_buy_sell_symmetry() {
    // Buy then sell same amount should approximately return to original cost
    let reserves = vector[1_000_000_000u64, 1_000_000_000u64];
    let buy_cost = pm_math::cp_buy_cost(&reserves, 0, 0, 50_000_000);

    // After buy: reserves change. New reserves:
    // R_yes decreased by 50M (shares left pool), R_no increased by buy_cost
    let new_reserves = vector[950_000_000u64, 1_000_000_000 + buy_cost];
    let sell_proceeds = pm_math::cp_sell_proceeds(&new_reserves, 0, 0, 50_000_000);

    // sell_proceeds should be close to buy_cost (spread)
    // Allow 5% difference due to integer rounding
    let diff = if (buy_cost > sell_proceeds) { buy_cost - sell_proceeds } else { sell_proceeds - buy_cost };
    assert!(diff * 100 / buy_cost < 5, 0); // < 5% spread
}

#[test]
fun test_cp_large_buy() {
    // Buying a large fraction of the pool should be expensive (high slippage)
    let reserves = vector[1_000_000_000u64, 1_000_000_000u64];
    let small_cost = pm_math::cp_buy_cost(&reserves, 0, 0, 10_000_000);  // 1% of pool
    let large_cost = pm_math::cp_buy_cost(&reserves, 0, 0, 500_000_000); // 50% of pool

    // Large buy should have much higher average cost per share
    let small_avg = small_cost * 1000 / 10_000_000;
    let large_avg = large_cost * 1000 / 500_000_000;
    assert!(large_avg > small_avg, 0); // higher slippage on large trades
}

// LMSR and Parimutuel tests removed (dead code cleanup, 2026-03-18).
// Those pricing models were superseded by Constant-Product (CPMM).
// See DEAD_CODE_CLEANUP_SUMMARY.md for details.
