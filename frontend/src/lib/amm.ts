/**
 * Client-side AMM math — Constant-Product Market Maker (N-outcome support).
 *
 * Matches pm_math.move cp_buy_cost / cp_sell_proceeds exactly:
 *   buy cost  = ⌈Π(R_i for i≠j) × Δ / (R_j - Δ)⌉  [ceiling division]
 *   sell proceeds = ⌊Π(R_i for i≠j) × Δ / (R_j + Δ)⌋  [floor division]
 *
 * Uses direct product formula. BigInt has unlimited precision (no overflow unlike Move u128).
 * Move has u128 overflow risk for N>8 with large reserves — frontend always matches Move
 * because the formula is identical, but TypeScript won't abort on overflow.
 *
 * outcome_quantities are POOL RESERVES (not shares outstanding).
 * All arithmetic uses BigInt to match Move's integer math.
 */

/** Whether the current AMM implementation is a placeholder. */
export const isPlaceholder = false;

/**
 * Compute the cost of buying `quantity` outcome tokens for `outcomeIndex`.
 *
 * Formula: cost = ⌈Π(R_i for i≠j) × quantity / (R_j - quantity)⌉
 * Ceiling division ensures buyer never underpays, preserving k invariant.
 * Throws if quantity >= reserve_target (would drain the pool).
 */
export function computeBuyCost(
  outcomeQuantities: bigint[],
  outcomeIndex: number,
  quantity: bigint,
): bigint {
  if (quantity <= 0n) return 0n;
  const n = outcomeQuantities.length;
  if (n < 2) return 0n;
  if (outcomeIndex < 0 || outcomeIndex >= n) return 0n;

  const rTarget = outcomeQuantities[outcomeIndex];
  if (quantity >= rTarget) {
    throw new Error("AMM: quantity exceeds pool reserve");
  }

  const denominator = rTarget - quantity;

  // Direct product of all OTHER reserves (BigInt — no overflow)
  let productOthers = 1n;
  for (let i = 0; i < n; i++) {
    if (i !== outcomeIndex) {
      productOthers *= outcomeQuantities[i];
    }
  }

  // cost = ⌈productOthers × quantity / denominator⌉
  const numerator = productOthers * quantity;
  const cost = (numerator + denominator - 1n) / denominator;

  return cost > 0n ? cost : 1n;
}

/**
 * Compute the proceeds from selling `quantity` outcome tokens for `outcomeIndex`.
 *
 * Formula: proceeds = ⌊Π(R_i for i≠j) × quantity / (R_j + quantity)⌋
 * Floor division — seller gets slightly less, protects remaining holders.
 */
export function computeSellProceeds(
  outcomeQuantities: bigint[],
  outcomeIndex: number,
  quantity: bigint,
): bigint {
  if (quantity <= 0n) return 0n;
  const n = outcomeQuantities.length;
  if (n < 2) return 0n;
  if (outcomeIndex < 0 || outcomeIndex >= n) return 0n;

  const rTarget = outcomeQuantities[outcomeIndex];
  const denominator = rTarget + quantity;

  // Direct product of all OTHER reserves (BigInt — no overflow)
  let productOthers = 1n;
  for (let i = 0; i < n; i++) {
    if (i !== outcomeIndex) {
      productOthers *= outcomeQuantities[i];
    }
  }

  // proceeds = ⌊productOthers × quantity / denominator⌋
  const numerator = productOthers * quantity;
  return numerator / denominator;
}

/**
 * Compute probability (in basis points, 0–10000) for each outcome.
 *
 * Matches pm_math::cp_probability_bps:
 *   Binary: P(i) = R_other / (R_0 + R_1) — lower reserve = higher probability
 *   N>2:    P(j) = product_of_others / sum_of_all_products
 */
export function outcomeProbabilityBps(outcomeQuantities: bigint[]): number[] {
  const n = outcomeQuantities.length;
  if (n === 0) return [];
  if (n === 1) return [10000];

  if (n === 2) {
    const [r0, r1] = outcomeQuantities;
    const total = r0 + r1;
    if (total === 0n) return [5000, 5000];
    // P(0) = R_1 / total, P(1) = R_0 / total (matches Move)
    const bps0 = Number((r1 * 10000n) / total);
    const bps1 = 10000 - bps0;
    return [bps0, bps1];
  }

  // N > 2: P(j) = product_of_others / sum_of_all_products
  // Use iterative helper to compute products safely
  const products = outcomeQuantities.map((_, j) =>
    computeProductExceptIterative(outcomeQuantities, j)
  );
  const sumProducts = products.reduce((acc, p) => acc + p, 0n);

  if (sumProducts === 0n) {
    // Uniform fallback if all reserves are zero
    const base = Math.floor(10000 / n);
    const rem = 10000 - base * n;
    return outcomeQuantities.map((_, i) => base + (i < rem ? 1 : 0));
  }

  // Compute each probability
  const probs = products.map((prod) => Number((prod * 10000n) / sumProducts));

  // Adjust for rounding to ensure sum equals 10000
  const sum = probs.reduce((a, b) => a + b, 0);
  const diff = 10000 - sum;
  if (diff !== 0) {
    probs[0] += diff;
  }

  return probs;
}

/**
 * Compute price impact in basis points for a given buy trade.
 *
 * Impact = (execution_price - spot_price) / spot_price * 10000
 */
function computeSpotPrice(outcomeQuantities: bigint[], outcomeIndex: number): number {
  const n = outcomeQuantities.length;
  if (n < 2 || outcomeIndex < 0 || outcomeIndex >= n) return 0;

  const probBps = outcomeProbabilityBps(outcomeQuantities);
  return probBps[outcomeIndex] / 10000;
}

export function computeBuyPriceImpactBps(
  outcomeQuantities: bigint[],
  outcomeIndex: number,
  quantity: bigint,
): number {
  if (quantity <= 0n) return 0;
  const n = outcomeQuantities.length;
  if (n < 2 || outcomeIndex < 0 || outcomeIndex >= n) return 0;

  const rTarget = outcomeQuantities[outcomeIndex];
  if (quantity >= rTarget) return 10000;

  const spotPrice = computeSpotPrice(outcomeQuantities, outcomeIndex);
  if (spotPrice <= 0) return 0;

  const cost = computeBuyCost(outcomeQuantities, outcomeIndex, quantity);
  const execPrice = Number(cost) / Number(quantity);

  const impact = ((execPrice - spotPrice) / spotPrice) * 10000;
  return Math.round(Math.max(0, impact));
}

export function computeSellPriceImpactBps(
  outcomeQuantities: bigint[],
  outcomeIndex: number,
  quantity: bigint,
): number {
  if (quantity <= 0n) return 0;
  const n = outcomeQuantities.length;
  if (n < 2 || outcomeIndex < 0 || outcomeIndex >= n) return 0;

  const spotPrice = computeSpotPrice(outcomeQuantities, outcomeIndex);
  if (spotPrice <= 0) return 0;

  const proceeds = computeSellProceeds(outcomeQuantities, outcomeIndex, quantity);
  const execPrice = Number(proceeds) / Number(quantity);

  const impact = ((spotPrice - execPrice) / spotPrice) * 10000;
  return Math.round(Math.max(0, impact));
}

export function computePriceImpactBps(
  outcomeQuantities: bigint[],
  outcomeIndex: number,
  quantity: bigint,
): number {
  return computeBuyPriceImpactBps(outcomeQuantities, outcomeIndex, quantity);
}

/**
 * Compute the average execution price for a buy trade.
 * Returns cost / quantity as a float.
 */
export function computeAveragePrice(
  outcomeQuantities: bigint[],
  outcomeIndex: number,
  quantity: bigint,
): number {
  if (quantity <= 0n) return 0;
  const cost = computeBuyCost(outcomeQuantities, outcomeIndex, quantity);
  return Number(cost) / Number(quantity);
}

// ── Internal helpers ──

/**
 * Compute the product of all reserves EXCEPT the one at excludeIndex.
 * DEPRECATED: Use computeProductExceptIterative instead.
 * Kept for backward compatibility.
 */
export function computeProductExcept(quantities: bigint[], excludeIndex: number): bigint {
  return computeProductExceptIterative(quantities, excludeIndex);
}

/**
 * Compute the product of all reserves EXCEPT the one at excludeIndex.
 * Uses iterative approach (computes product sequentially).
 * For binary (N=2): returns the single other reserve.
 * For N>2: returns Π(R_i for i ≠ excludeIndex).
 * NOTE: For N > 16 with typical reserves, may overflow BigInt (though BigInt is unbounded, product computation is slow).
 * Current implementation safely supports up to N=16 with reserves ≤ 1000.
 */
function computeProductExceptIterative(quantities: bigint[], excludeIndex: number): bigint {
  let product = 1n;
  for (let i = 0; i < quantities.length; i++) {
    if (i !== excludeIndex) {
      product = product * quantities[i];
    }
  }
  return product;
}

export function computeAvgOtherReserves(quantities: bigint[], excludeIndex: number): bigint {
  let sum = 0n;
  let count = 0;
  for (let i = 0; i < quantities.length; i++) {
    if (i !== excludeIndex) {
      sum += quantities[i];
      count++;
    }
  }
  if (count === 0) return 0n;
  return sum / BigInt(count);
}

/**
 * RT-020: Fee cap for small trades.
 * When fee calculation is added, ensure: if (fee > cost) fee = cost;
 * This prevents fees from exceeding the trade amount (dust protection).
 */

/**
 * RT-023: Refund integer division precision.
 * For pro-rata refunds on invalidated markets:
 *   refund = (myCostBasis * snapshotCollateral) / totalCostBasisSum
 * IMPORTANT: Multiply BEFORE dividing to avoid precision loss with integer division.
 * This matches the Move contract's u128 intermediate calculation.
 */

/**
 * RT-041: Scientific notation display guard.
 * BigInt.toString() does not produce scientific notation, so this is safe.
 * When displaying amounts, use toLocaleString() if needed for readability,
 * but scientific notation is not a concern with BigInt arithmetic.
 */
