/**
 * Fetches the list of prediction markets via GraphQL.
 * Drop-in replacement for useMarkets (RPC-based version).
 *
 * Uses GraphQL event query with cursor-based pagination instead of
 * queryEvents + multiGetObjects pattern.
 *
 * Data flow:
 * 1. Query MarketCreatedEvent via GraphQL with cursor pagination
 * 2. Extract market IDs from event parsedJson
 * 3. Fetch each market object via GraphQL (cached/batched if possible)
 * 4. Parse Market struct from BCS/fields content
 *
 * NOTE: This is a transitional implementation. Eventually we may fetch
 * market details directly from events if the event payload is rich enough.
 */

import { useQuery } from "@tanstack/react-query";
import { graphqlQuery } from "../lib/graphql-client";
import { EVENT_MARKET_CREATED } from "../lib/market-constants";
import { type Market, parseMarketFromSuiObject } from "../lib/market-types";
import { MARKETS_QUERY, MARKET_DETAIL_QUERY } from "../lib/graphql-queries";
import { POLL_INTERVAL_LIST_MS, STALE_TIME_LIST_MS } from "../lib/polling-constants";

const PAGE_SIZE = 20;

interface MarketCreatedEvent {
  market_id?: string;
  market_number?: number;
}

interface MarketEdge {
  node: {
    eventBcs?: string;
    parsedJson?: MarketCreatedEvent;
    timestamp?: string;
    txDigest?: string;
    eventSeq?: string;
  };
  cursor?: string;
}

interface EventsConnectionResponse {
  events: {
    edges: MarketEdge[];
    pageInfo: {
      hasNextPage: boolean;
      endCursor?: string;
    };
  };
}

interface ObjectResponse {
  object: {
    address: string;
    asMoveObject?: {
      contents?: {
        fields?: Record<string, unknown>;
      };
    };
    // Shape will depend on actual Sui GraphQL response structure
    // This is a best-guess based on standard patterns
    [key: string]: unknown;
  };
}

async function fetchMarkets(cursor: string | null): Promise<{
  markets: Market[];
  nextCursor: string | null;
  hasNextPage: boolean;
}> {
  try {
    // Step 1: Query MarketCreatedEvent via GraphQL
    const eventsResponse = await graphqlQuery<EventsConnectionResponse>(MARKETS_QUERY, {
      eventType: EVENT_MARKET_CREATED,
      first: PAGE_SIZE,
      after: cursor ?? null,
    });

    const { edges, pageInfo } = eventsResponse.events;

    if (!edges || edges.length === 0) {
      return {
        markets: [],
        nextCursor: null,
        hasNextPage: false,
      };
    }

    // Step 2: Extract market IDs from events
    const marketIds = edges
      .map((edge) => edge.node?.parsedJson?.market_id)
      .filter((id): id is string => Boolean(id));

    if (marketIds.length === 0) {
      return {
        markets: [],
        nextCursor: pageInfo?.endCursor ?? null,
        hasNextPage: pageInfo?.hasNextPage ?? false,
      };
    }

    // Step 3: Fetch full market objects via GraphQL
    // NOTE: Ideally we'd batch these queries, but for now we'll fetch sequentially
    // A production implementation might use DataLoader or batch API if Sui supports it
    const marketPromises = marketIds.map((id) =>
      graphqlQuery<ObjectResponse>(MARKET_DETAIL_QUERY, { id }).catch(() => null),
    );

    const marketResponses = await Promise.all(marketPromises);

    // Step 4: Parse market objects
    const markets = marketResponses
      .filter((res): res is ObjectResponse => res !== null)
      .map((res) => {
        // Convert GraphQL response to shape compatible with parseMarketFromSuiObject
        const mockSuiObject = {
          data: {
            objectId: res.object.address,
            content: {
              fields: res.object.asMoveObject?.contents?.fields ?? {},
            },
          },
        };
        return parseMarketFromSuiObject(mockSuiObject);
      })
      .filter((m): m is Market => m !== null);

    return {
      markets,
      nextCursor: pageInfo?.endCursor ?? null,
      hasNextPage: pageInfo?.hasNextPage ?? false,
    };
  } catch (error) {
    console.error("Error fetching markets via GraphQL:", error);
    throw error;
  }
}

/**
 * Hook: Fetch markets via GraphQL with cursor pagination.
 *
 * @param cursor - Pagination cursor (null for initial page)
 * @returns Query result with markets[], nextCursor, hasNextPage
 */
export function useMarketsGraphQL(cursor: string | null = null) {
  return useQuery({
    queryKey: ["marketsGraphQL", cursor],
    queryFn: () => fetchMarkets(cursor),
    refetchInterval: POLL_INTERVAL_LIST_MS,
    staleTime: STALE_TIME_LIST_MS,
  });
}
