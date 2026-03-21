/**
 * Fetches trade events for a market and reconstructs price history.
 * Queries TradeExecutedEvent, computes probabilities from pool state.
 */

import { useQuery } from "@tanstack/react-query";
import { suiClient } from "../lib/client";
import { EVENT_TRADE_EXECUTED } from "../lib/market-constants";
import { outcomeProbabilityBps } from "../lib/amm";
import { POLL_INTERVAL_BACKGROUND_MS, STALE_TIME_BACKGROUND_MS } from "../lib/polling-constants";

export interface PricePoint {
  timestamp: number;
  probabilities: number[];
}

async function fetchMarketHistory(marketId: string): Promise<PricePoint[]> {
  try {
    // Query all trade events for this market
    const result = await suiClient.queryEvents({
      query: {
        MoveEventType: EVENT_TRADE_EXECUTED,
      },
      limit: 1000,
      order: "ascending",
    });

    if (!result.data || result.data.length === 0) {
      return [];
    }

    const pricePoints: PricePoint[] = [];

    // Parse each trade event to extract price history
    for (const event of result.data) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fields = (event.parsedJson as any)?.fields;
        if (!fields) continue;

        // Filter by market ID
        const eventMarketId = String(fields.market_id ?? "");
        if (eventMarketId !== marketId) continue;

        const timestamp = Number(fields.timestamp_ms ?? event.timestampMs ?? 0);

        // Extract outcome quantities (pool reserves) from event
        const outcomeQuantities = Array.isArray(fields.outcome_quantities)
          ? fields.outcome_quantities.map((q: string | number) => BigInt(q))
          : [];

        if (outcomeQuantities.length > 0) {
          const probabilities = outcomeProbabilityBps(outcomeQuantities).map(
            (bps) => bps / 10000, // Convert basis points to [0, 1]
          );

          pricePoints.push({
            timestamp,
            probabilities,
          });
        }
      } catch {
        // Skip malformed events
        continue;
      }
    }

    return pricePoints;
  } catch {
    return [];
  }
}

export function useMarketHistory(marketId: string) {
  return useQuery({
    queryKey: ["marketHistory", marketId],
    queryFn: () => fetchMarketHistory(marketId),
    refetchInterval: POLL_INTERVAL_BACKGROUND_MS,
    staleTime: STALE_TIME_BACKGROUND_MS,
    enabled: Boolean(marketId),
  });
}
