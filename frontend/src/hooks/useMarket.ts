/**
 * Fetches a single market by ID with 10s polling.
 * Detects state changes for edge cases A-E (close, resolution, dispute, invalid, emergency).
 */

import { useQuery } from "@tanstack/react-query";
import { suiClient } from "../lib/client";
import { type Market, parseMarketFromSuiObject } from "../lib/market-types";
import { POLL_INTERVAL_ACTIVE_MS, STALE_TIME_ACTIVE_MS } from "../lib/polling-constants";

async function fetchMarket(id: string): Promise<Market | null> {
  const obj = await suiClient.getObject({
    id,
    options: { showContent: true },
  });
  return parseMarketFromSuiObject(obj);
}

export function useMarket(id: string | undefined) {
  return useQuery({
    queryKey: ["market", id],
    queryFn: () => fetchMarket(id!),
    enabled: Boolean(id),
    refetchInterval: POLL_INTERVAL_ACTIVE_MS,
    staleTime: STALE_TIME_ACTIVE_MS,
  });
}
