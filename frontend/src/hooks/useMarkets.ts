/**
 * Fetches the list of prediction markets.
 * Data flow: queryEvents(MarketCreated) → extract market IDs → multiGetObjects → parse.
 *
 * Pagination caveat: queryEvents returns a cursor-based window, not global completeness.
 * Market ranking surfaces must tolerate partial data. "Top markets" shows "top of what
 * we've fetched," not "globally ranked."
 */

import { useQuery } from "@tanstack/react-query";
import { suiClient } from "../lib/client";
import { EVENT_MARKET_CREATED } from "../lib/market-constants";
import { type Market, parseMarketFromSuiObject } from "../lib/market-types";
import type { EventId } from "@mysten/sui/jsonRpc";
import { POLL_INTERVAL_LIST_MS, STALE_TIME_LIST_MS } from "../lib/polling-constants";

const PAGE_SIZE = 20;

async function fetchMarkets(cursor: EventId | null): Promise<{
  markets: Market[];
  nextCursor: EventId | null;
  hasNextPage: boolean;
}> {
  // Step 1: query MarketCreatedEvent to get market IDs
  const eventsResult = await suiClient.queryEvents({
    query: { MoveEventType: EVENT_MARKET_CREATED },
    limit: PAGE_SIZE,
    cursor: cursor ?? undefined,
    order: "descending",
  });

  if (!eventsResult.data || eventsResult.data.length === 0) {
    return { markets: [], nextCursor: null, hasNextPage: false };
  }

  // Step 2: extract market IDs from event data
  const marketIds = eventsResult.data
    .map((e) => {
      const parsed = e.parsedJson as { market_id?: string } | undefined;
      return parsed?.market_id;
    })
    .filter((id): id is string => Boolean(id));

  if (marketIds.length === 0) {
    return {
      markets: [],
      nextCursor: eventsResult.nextCursor ?? null,
      hasNextPage: eventsResult.hasNextPage,
    };
  }

  // Step 3: fetch full market objects
  const objects = await suiClient.multiGetObjects({
    ids: marketIds,
    options: { showContent: true },
  });

  // Step 4: parse
  const markets = objects
    .map((obj) => parseMarketFromSuiObject(obj))
    .filter((m): m is Market => m !== null);

  return {
    markets,
    nextCursor: eventsResult.nextCursor ?? null,
    hasNextPage: eventsResult.hasNextPage,
  };
}

export function useMarkets(cursor: EventId | null = null) {
  return useQuery({
    queryKey: ["markets", cursor],
    queryFn: () => fetchMarkets(cursor),
    refetchInterval: POLL_INTERVAL_LIST_MS,
    staleTime: STALE_TIME_LIST_MS,
  });
}
