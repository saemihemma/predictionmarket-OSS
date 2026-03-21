/**
 * Pure computation hook — computes price preview from market state + trade params.
 * Calls amm.ts, recomputes on quantity change. No network calls.
 */

import { useMemo } from "react";
import { type TradeDirection, TradeDirection as TD } from "../lib/market-types";
import {
  computeBuyCost,
  computeSellProceeds,
  computePriceImpactBps,
  computeAveragePrice,
  isPlaceholder,
} from "../lib/amm";

interface PricePreview {
  cost: bigint;
  averagePrice: number;
  impactBps: number;
  isPlaceholder: boolean;
}

export function useMarketPrice(
  outcomeQuantities: bigint[],
  outcomeIndex: number,
  quantity: bigint,
  direction: TradeDirection,
): PricePreview {
  return useMemo(() => {
    if (quantity <= 0n || outcomeQuantities.length === 0) {
      return { cost: 0n, averagePrice: 0, impactBps: 0, isPlaceholder };
    }

    const cost =
      direction === TD.BUY
        ? computeBuyCost(outcomeQuantities, outcomeIndex, quantity)
        : computeSellProceeds(outcomeQuantities, outcomeIndex, quantity);

    const averagePrice = computeAveragePrice(outcomeQuantities, outcomeIndex, quantity);
    const impactBps = computePriceImpactBps(outcomeQuantities, outcomeIndex, quantity);

    return { cost, averagePrice, impactBps, isPlaceholder };
  }, [outcomeQuantities, outcomeIndex, quantity, direction]);
}
