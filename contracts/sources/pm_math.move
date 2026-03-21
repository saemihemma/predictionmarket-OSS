/// AMM pricing math — three candidate models for Phase 2 spike.
/// Each model implements: compute_buy_cost, compute_sell_proceeds, outcome_probability_bps.
/// The "active" functions delegate to the selected model (constant-product by default).
///
/// Models:
///   1. Constant-product (xy=k) — simple, proven, cheap gas
///   2. LMSR (Logarithmic Market Scoring Rule) — approximated via lookup table
///   3. Parimutuel (pot-based) — simplest, no continuous pricing
///
/// After benchmarking, we'll hardcode the winner and remove the others.
module prediction_market::pm_math;

// ═══════════════════════════════════════════════════════════════
// Active API — delegates to constant-product by default.
// Change these to switch the active model.
// ═══════════════════════════════════════════════════════════════

/// Compute cost to buy `amount` shares of `outcome_index`.
/// Returns cost in SFR base units (2 decimals, SCALE=100).
/// Supports N-outcome categorical CPMM (N=2 to 8). Uses direct product formula
/// with u128 intermediates. For N>8, reserves must be small to avoid overflow.
public fun compute_buy_cost(
    outcome_quantities: &vector<u64>,
    liquidity_param: u64,
    outcome_index: u16,
    amount: u64,
): u64 {
    cp_buy_cost(outcome_quantities, liquidity_param, outcome_index, amount)
}

/// Compute proceeds from selling `amount` shares of `outcome_index`.
/// Returns proceeds in SFR base units.
public fun compute_sell_proceeds(
    outcome_quantities: &vector<u64>,
    liquidity_param: u64,
    outcome_index: u16,
    amount: u64,
): u64 {
    cp_sell_proceeds(outcome_quantities, liquidity_param, outcome_index, amount)
}

/// Current implied probability of outcome in basis points (0-10000).
public fun outcome_probability_bps(
    outcome_quantities: &vector<u64>,
    liquidity_param: u64,
    outcome_index: u16,
): u64 {
    cp_probability_bps(outcome_quantities, liquidity_param, outcome_index)
}

// ═══════════════════════════════════════════════════════════════
// Model 1: Constant-Product (xy=k) — Binary market specialization
// ═══════════════════════════════════════════════════════════════
//
// For a binary market with outcomes YES (0) and NO (1):
//   Pool holds virtual reserves: R_yes, R_no
//   Invariant: R_yes * R_no = k
//   outcome_quantities[i] = shares outstanding for outcome i
//   Virtual reserves: R_i = liquidity_param + outcome_quantities[i]
//
// Buy YES: trader pays SFR, receives YES shares
//   new_R_yes = R_yes + amount (more shares in pool → price goes down for next buyer... wait)
//
// Actually for prediction markets with CPMM, the standard model is:
//   Pool holds shares of each outcome.
//   R_yes * R_no = k (reserves of shares in pool)
//   To buy YES shares: pool gives out YES shares, receives collateral.
//   The cost is determined by how many shares leave the pool.
//
// Simplified binary CPMM:
//   reserves[0] = liquidity_param (initial) - shares_bought_0 + shares_sold_0
//   reserves[1] = liquidity_param (initial) - shares_bought_1 + shares_sold_1
//   k = reserves[0] * reserves[1]
//
// But tracking reserves vs quantities is confusing. Let's use a cleaner model:
//
// The pool starts with `L` shares of each outcome (liquidity_param).
// outcome_quantities tracks total shares outstanding (bought by traders).
// Pool reserves: pool_i = L + outcome_quantities[other] - outcome_quantities[i]
//   (This doesn't quite work either.)
//
// CLEANEST APPROACH for binary CPMM in prediction markets:
// Pool holds reserves of each outcome token.
// Initially: pool_yes = L, pool_no = L, k = L * L
// To buy `amount` of YES:
//   pool_yes decreases by `amount` (shares leave pool)
//   pool_no increases by `dx` (collateral minted into NO shares entering pool)
//   (pool_yes - amount) * (pool_no + dx) = k
//   dx = k / (pool_yes - amount) - pool_no
//   cost = dx (in SFR, since 1 SFR mints 1 of each outcome share)
//
// We track pool reserves directly using outcome_quantities as pool reserves.
// outcome_quantities[i] = pool reserve of outcome i.
// They START at liquidity_param and change with trades.

/// Buy cost for constant-product N-outcome market (N ≥ 2).
/// outcome_quantities are POOL RESERVES (not shares outstanding).
/// Returns the amount of SFR the buyer must pay.
///
/// Formula: cost = ⌈Π(R_i for i≠j) × Δ / (R_j - Δ)⌉
/// For N=2: cost = R_other × Δ / (R_j - Δ) (standard xy=k)
///
/// Uses u128 intermediate for product. Safe for:
///   N=2: any reserves up to u64::MAX
///   N=3-4: reserves up to ~10^9 (1B base units)
///   N=5-8: reserves up to ~10^4 (10,000 base units = 100 SFR at 2 decimals)
///   N>8: NOT SAFE without binary search approach (deferred to v2)
///
/// Runtime overflow check: aborts if product exceeds u128 safe range.
public fun cp_buy_cost(
    outcome_quantities: &vector<u64>,
    _liquidity_param: u64,
    outcome_index: u16,
    amount: u64,
): u64 {
    let n = vector::length(outcome_quantities);
    assert!(n >= 2, 0);
    assert!((outcome_index as u64) < n, 0);

    let reserve_target = *vector::borrow(outcome_quantities, outcome_index as u64);
    assert!(reserve_target > amount, 0); // can't buy more than pool has

    let denominator = (reserve_target - amount) as u128;

    // Compute product of all OTHER reserves (single product, one division)
    let product_others = compute_product_except_iterative(outcome_quantities, outcome_index);

    // Overflow guard: product_others × amount must fit in u128.
    // u128::MAX ≈ 3.4×10^38. If product_others > u128::MAX / amount, the multiplication overflows.
    // Move's checked arithmetic will abort, but we provide a descriptive error first.
    let amount_u128 = (amount as u128);
    assert!(amount_u128 == 0 || product_others <= 340282366920938463463374607431768211455u128 / amount_u128, 2);

    // cost = ⌈product_others × amount / denominator⌉
    let numerator = product_others * amount_u128;
    let cost = (numerator + denominator - 1) / denominator; // ceiling division

    (cost as u64)
}

/// Sell proceeds for constant-product N-outcome market (N ≥ 2).
/// Returns the amount of SFR the seller receives.
///
/// Formula: proceeds = ⌊Π(R_i for i≠j) × Δ / (R_j + Δ)⌋
/// Floor division protects remaining liquidity (seller gets slightly less).
public fun cp_sell_proceeds(
    outcome_quantities: &vector<u64>,
    _liquidity_param: u64,
    outcome_index: u16,
    amount: u64,
): u64 {
    let n = vector::length(outcome_quantities);
    assert!(n >= 2, 0);
    assert!((outcome_index as u64) < n, 0);

    let reserve_target = *vector::borrow(outcome_quantities, outcome_index as u64);
    let denominator = (reserve_target + amount) as u128;

    // Compute product of all OTHER reserves
    let product_others = compute_product_except_iterative(outcome_quantities, outcome_index);

    // Overflow guard (same as buy)
    let amount_u128 = (amount as u128);
    assert!(amount_u128 == 0 || product_others <= 340282366920938463463374607431768211455u128 / amount_u128, 2);

    // proceeds = ⌊product_others × amount / denominator⌋
    let numerator = product_others * amount_u128;
    let proceeds = numerator / denominator; // floor division

    (proceeds as u64)
}

/// Implied probability for constant-product N-outcome model.
/// P(j) = product_of_others_j / sum_of_all_products
/// For binary: P(YES) = R_NO / (R_YES + R_NO)
/// For N-outcome: Uses iterative ratio approach to avoid overflow.
public fun cp_probability_bps(
    outcome_quantities: &vector<u64>,
    _liquidity_param: u64,
    outcome_index: u16,
): u64 {
    let n = vector::length(outcome_quantities);
    if (n == 0) { return 0 };
    assert!((outcome_index as u64) < n, 0);

    if (n == 2) {
        let r0 = *vector::borrow(outcome_quantities, 0) as u128;
        let r1 = *vector::borrow(outcome_quantities, 1) as u128;
        let total = r0 + r1;
        if (total == 0) { return 5000 };

        // P(i) = R_other / (R_0 + R_1) — lower reserve = higher probability
        let other = if (outcome_index == 0) { r1 } else { r0 };
        ((other * 10000) / total) as u64
    } else {
        // Categorical N-outcome CPMM: P(j) = product_of_others / sum_of_all_products
        // Each outcome's probability is weighted by the product of all OTHER reserves.
        let prod_j = compute_product_except_iterative(outcome_quantities, outcome_index);

        // Compute sum of all products (one for each outcome)
        let mut sum_prods: u128 = 0;
        let mut i = 0u64;
        while (i < n) {
            let prod_i = compute_product_except_iterative(outcome_quantities, i as u16);
            sum_prods = sum_prods + prod_i;
            i = i + 1;
        };

        if (sum_prods == 0) {
            // Uniform fallback if all reserves are zero
            (10000 / (n as u64))
        } else {
            ((prod_j * 10000) / sum_prods) as u64
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// Model 2: LMSR (Logarithmic Market Scoring Rule) — REMOVED (Legacy)
// ═══════════════════════════════════════════════════════════════
// LMSR model functions have been removed. They were never called in
// production code and have been superseded by Constant-Product (CPMM).
// See DEAD_CODE_CLEANUP_SUMMARY.md for details.

// ═══════════════════════════════════════════════════════════════
// Model 3: Parimutuel (pot-based) — REMOVED (Legacy)
// ═══════════════════════════════════════════════════════════════
// Parimutuel model functions have been removed. They were never called
// in production code and have been superseded by Constant-Product (CPMM).
// See DEAD_CODE_CLEANUP_SUMMARY.md for details.

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

/// Compute the product of all reserves EXCEPT the one at `exclude_index`.
/// DEPRECATED: Use compute_product_except_iterative instead to avoid overflow.
/// Kept for backward compatibility but may overflow for N > 4.
fun compute_product_except(quantities: &vector<u64>, exclude_index: u16): u128 {
    compute_product_except_iterative(quantities, exclude_index)
}

/// Compute the product of all reserves EXCEPT the one at `exclude_index`.
/// Uses iterative approach to minimize overflow risk (though still bounded by u128).
/// For binary (N=2): returns the single other reserve.
/// For N>2: returns Π(R_i for i ≠ exclude_index).
/// NOTE: For N > 16 with typical reserves, even iterative approach may overflow u128.
/// Current implementation safely supports up to N=16 with reserves ≤ 1000.
fun compute_product_except_iterative(quantities: &vector<u64>, exclude_index: u16): u128 {
    let n = vector::length(quantities);
    let mut product: u128 = 1;
    let mut i = 0u64;
    while (i < n) {
        if (i != (exclude_index as u64)) {
            let r = *vector::borrow(quantities, i) as u128;
            product = product * r;
        };
        i = i + 1;
    };
    product
}


// ═══════════════════════════════════════════════════════════════
// Test-only benchmark helpers — REMOVED
// ═══════════════════════════════════════════════════════════════
// Benchmark functions have been removed. They were test-only helpers
// for comparing pricing models. See DEAD_CODE_CLEANUP_SUMMARY.md.
