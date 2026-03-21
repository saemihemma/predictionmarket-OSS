/**
 * CPMM parity tests — proves amm.ts matches pm_math.move for identical inputs.
 * Consumes shared test vectors from amm-test-vectors.json.
 *
 * Run: npx vitest run src/lib/amm.test.ts
 */
import { describe, it, expect } from "vitest";
import { computeBuyCost, computeSellProceeds, outcomeProbabilityBps } from "./amm";
import vectors from "./amm-test-vectors.json";

describe("CPMM parity: computeBuyCost matches pm_math::cp_buy_cost", () => {
  for (const v of vectors.buy) {
    it(v.label, () => {
      const reserves = v.reserves.map(BigInt);
      const cost = computeBuyCost(reserves, v.outcomeIndex, BigInt(v.amount));
      expect(cost).toBe(BigInt(v.expectedCost));
    });
  }
});

describe("CPMM parity: computeSellProceeds matches pm_math::cp_sell_proceeds", () => {
  for (const v of vectors.sell) {
    it(v.label, () => {
      const reserves = v.reserves.map(BigInt);
      const proceeds = computeSellProceeds(reserves, v.outcomeIndex, BigInt(v.amount));
      expect(proceeds).toBe(BigInt(v.expectedProceeds));
    });
  }
});

describe("CPMM parity: outcomeProbabilityBps matches pm_math::cp_probability_bps", () => {
  for (const v of vectors.probability) {
    it(v.label, () => {
      const reserves = v.reserves.map(BigInt);
      const bps = outcomeProbabilityBps(reserves);
      expect(bps).toEqual(v.expectedBps);
    });
  }
});

describe("CPMM edge cases", () => {
  it("zero quantity returns zero cost", () => {
    expect(computeBuyCost([1000n, 1000n], 0, 0n)).toBe(0n);
  });

  it("zero quantity returns zero proceeds", () => {
    expect(computeSellProceeds([1000n, 1000n], 0, 0n)).toBe(0n);
  });

  it("quantity >= reserve throws", () => {
    expect(() => computeBuyCost([1000n, 1000n], 0, 1000n)).toThrow("exceeds pool reserve");
    expect(() => computeBuyCost([1000n, 1000n], 0, 1001n)).toThrow("exceeds pool reserve");
  });

  it("out of bounds index returns 0", () => {
    expect(computeBuyCost([1000n, 1000n], 5, 100n)).toBe(0n);
    expect(computeSellProceeds([1000n, 1000n], -1, 100n)).toBe(0n);
  });

  it("single outcome returns empty/zero", () => {
    expect(computeBuyCost([1000n], 0, 100n)).toBe(0n);
    expect(outcomeProbabilityBps([1000n])).toEqual([10000]);
  });

  it("buy/sell round-trip spread is bounded", () => {
    const reserves = [1_000_000_000n, 1_000_000_000n];
    const amount = 50_000_000n;
    const buyCost = computeBuyCost(reserves, 0, amount);

    // After buy: reserve[0] decreases, reserve[1] increases
    const newReserves = [reserves[0] - amount, reserves[1] + buyCost];
    const sellProceeds = computeSellProceeds(newReserves, 0, amount);

    // Spread should be < 5% (matches Move test_cp_buy_sell_symmetry)
    const diff = buyCost > sellProceeds ? buyCost - sellProceeds : sellProceeds - buyCost;
    expect(diff * 100n / buyCost).toBeLessThan(5n);
  });

  // RT-027: Additional edge case tests for max_u64 and reserve bounds
  it("quantity = max_u64 throws or handles gracefully", () => {
    const max_u64 = BigInt("18446744073709551615");
    // Should either throw or cap gracefully
    expect(() => computeBuyCost([max_u64, max_u64], 0, max_u64)).toThrow();
  });

  it("all reserves equal returns uniform probability", () => {
    const reserves = [1_000_000_000n, 1_000_000_000n];
    const bps = outcomeProbabilityBps(reserves);
    // With equal reserves: P(0) = R1 / (R0 + R1) = 50%, P(1) = R0 / (R0 + R1) = 50%
    expect(bps[0]).toBe(5000);
    expect(bps[1]).toBe(5000);
  });

  it("one reserve equals zero is handled gracefully", () => {
    const reserves = [1_000_000_000n, 0n];
    const bps = outcomeProbabilityBps(reserves);
    // Reserve is zero: undefined state, but should not crash
    expect(bps).toBeDefined();
    expect(bps.length).toBe(2);
  });
});
