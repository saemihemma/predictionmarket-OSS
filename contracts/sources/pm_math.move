/// AMM pricing math for the active constant-product market maker.
/// Binary markets keep the exact closed-form xy=k paths.
/// N-outcome categorical markets use the same reserve invariant, but solve
/// the symmetric reserve adjustment with binary search.
module prediction_market::pm_math;

/// Compute cost to buy `amount` shares of `outcome_index`.
public fun compute_buy_cost(
    outcome_quantities: &vector<u64>,
    liquidity_param: u64,
    outcome_index: u16,
    amount: u64,
): u64 {
    cp_buy_cost(outcome_quantities, liquidity_param, outcome_index, amount)
}

/// Compute proceeds from selling `amount` shares of `outcome_index`.
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

/// Buy cost for the active CPMM.
/// Binary markets use the exact closed-form formula.
/// N>2 markets solve for the smallest symmetric reserve increment across the
/// non-target outcomes that preserves the full reserve product.
public fun cp_buy_cost(
    outcome_quantities: &vector<u64>,
    _liquidity_param: u64,
    outcome_index: u16,
    amount: u64,
): u64 {
    let n = vector::length(outcome_quantities);
    assert!(n >= 2, 0);
    assert!((outcome_index as u64) < n, 0);
    if (amount == 0) { return 0 };

    if (n == 2) {
        return cp_buy_cost_binary(outcome_quantities, outcome_index, amount)
    };

    let reserve_target = *vector::borrow(outcome_quantities, outcome_index as u64);
    assert!(reserve_target > amount, 0);

    let original_product = compute_full_product(outcome_quantities);
    let mut low = 0u64;
    let mut high = 1u64;
    while (!buy_invariant_holds(outcome_quantities, outcome_index, amount, high, original_product)) {
        assert!(high <= 9223372036854775807u64, 2);
        high = high * 2;
    };

    while (low < high) {
        let mid = low + ((high - low) / 2);
        if (buy_invariant_holds(outcome_quantities, outcome_index, amount, mid, original_product)) {
            high = mid;
        } else {
            low = mid + 1;
        };
    };

    low
}

/// Sell proceeds for the active CPMM.
/// Binary markets use the exact closed-form formula.
/// N>2 markets solve for the largest symmetric reserve decrement across the
/// non-target outcomes that keeps the full reserve product at or above the
/// pre-trade invariant.
public fun cp_sell_proceeds(
    outcome_quantities: &vector<u64>,
    _liquidity_param: u64,
    outcome_index: u16,
    amount: u64,
): u64 {
    let n = vector::length(outcome_quantities);
    assert!(n >= 2, 0);
    assert!((outcome_index as u64) < n, 0);
    if (amount == 0) { return 0 };

    if (n == 2) {
        return cp_sell_proceeds_binary(outcome_quantities, outcome_index, amount)
    };

    let original_product = compute_full_product(outcome_quantities);
    let mut low = 0u64;
    let mut high = min_other_reserve(outcome_quantities, outcome_index);

    while (low < high) {
        let mid = low + ((high - low + 1) / 2);
        if (sell_invariant_holds(outcome_quantities, outcome_index, amount, mid, original_product)) {
            low = mid;
        } else {
            high = mid - 1;
        };
    };

    low
}

/// Implied probability for constant-product N-outcome model.
/// Binary: P(i) = R_other / (R_0 + R_1)
/// Categorical: P(j) = product_of_others / sum_of_all_products
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

        let other = if (outcome_index == 0) { r1 } else { r0 };
        ((other * 10000) / total) as u64
    } else {
        let prod_j = compute_product_except_iterative(outcome_quantities, outcome_index);

        let mut sum_prods: u128 = 0;
        let mut i = 0u64;
        while (i < n) {
            let prod_i = compute_product_except_iterative(outcome_quantities, i as u16);
            sum_prods = sum_prods + prod_i;
            i = i + 1;
        };

        if (sum_prods == 0) {
            (10000 / (n as u64))
        } else {
            ((prod_j * 10000) / sum_prods) as u64
        }
    }
}

fun compute_product_except_iterative(quantities: &vector<u64>, exclude_index: u16): u128 {
    let n = vector::length(quantities);
    let mut product: u128 = 1;
    let mut i = 0u64;
    while (i < n) {
        if (i != (exclude_index as u64)) {
            let reserve = *vector::borrow(quantities, i) as u128;
            product = product * reserve;
        };
        i = i + 1;
    };
    product
}

fun compute_full_product(quantities: &vector<u64>): u128 {
    let n = vector::length(quantities);
    let mut product: u128 = 1;
    let mut i = 0u64;
    while (i < n) {
        let reserve = *vector::borrow(quantities, i) as u128;
        product = product * reserve;
        i = i + 1;
    };
    product
}

fun cp_buy_cost_binary(
    outcome_quantities: &vector<u64>,
    outcome_index: u16,
    amount: u64,
): u64 {
    let reserve_target = *vector::borrow(outcome_quantities, outcome_index as u64);
    assert!(reserve_target > amount, 0);
    let denominator = (reserve_target - amount) as u128;
    let product_others = compute_product_except_iterative(outcome_quantities, outcome_index);
    let amount_u128 = amount as u128;
    assert!(product_others <= 340282366920938463463374607431768211455u128 / amount_u128, 2);
    let numerator = product_others * amount_u128;
    ((numerator + denominator - 1) / denominator) as u64
}

fun cp_sell_proceeds_binary(
    outcome_quantities: &vector<u64>,
    outcome_index: u16,
    amount: u64,
): u64 {
    let reserve_target = *vector::borrow(outcome_quantities, outcome_index as u64);
    let denominator = (reserve_target + amount) as u128;
    let product_others = compute_product_except_iterative(outcome_quantities, outcome_index);
    let amount_u128 = amount as u128;
    assert!(product_others <= 340282366920938463463374607431768211455u128 / amount_u128, 2);
    ((product_others * amount_u128) / denominator) as u64
}

fun buy_invariant_holds(
    quantities: &vector<u64>,
    outcome_index: u16,
    amount: u64,
    increment: u64,
    original_product: u128,
): bool {
    let n = vector::length(quantities);
    let mut product: u128 = 1;
    let mut i = 0u64;
    while (i < n) {
        let reserve = *vector::borrow(quantities, i);
        let adjusted = if (i == (outcome_index as u64)) {
            reserve - amount
        } else {
            reserve + increment
        };
        product = product * (adjusted as u128);
        i = i + 1;
    };
    product >= original_product
}

fun sell_invariant_holds(
    quantities: &vector<u64>,
    outcome_index: u16,
    amount: u64,
    decrement: u64,
    original_product: u128,
): bool {
    let n = vector::length(quantities);
    let mut product: u128 = 1;
    let mut i = 0u64;
    while (i < n) {
        let reserve = *vector::borrow(quantities, i);
        let adjusted = if (i == (outcome_index as u64)) {
            reserve + amount
        } else {
            if (reserve < decrement) {
                return false
            };
            reserve - decrement
        };
        product = product * (adjusted as u128);
        i = i + 1;
    };
    product >= original_product
}

fun min_other_reserve(quantities: &vector<u64>, outcome_index: u16): u64 {
    let n = vector::length(quantities);
    let mut min_reserve = 18446744073709551615u64;
    let mut i = 0u64;
    while (i < n) {
        if (i != (outcome_index as u64)) {
            let reserve = *vector::borrow(quantities, i);
            if (reserve < min_reserve) {
                min_reserve = reserve;
            };
        };
        i = i + 1;
    };
    min_reserve
}
