/**
 * Fetches a single market by ID via GraphQL.
 * Drop-in replacement for useMarket (RPC-based version).
 *
 * Uses GraphQL object query instead of RPC getObject.
 * Detects state changes for edge cases (close, resolution, dispute, invalid, emergency).
 */

import { useQuery } from "@tanstack/react-query";
import { graphqlQuery } from "../lib/graphql-client";
import { type Market, parseMarketFromSuiObject } from "../lib/market-types";
import { MARKET_DETAIL_QUERY } from "../lib/graphql-queries";
import { POLL_INTERVAL_ACTIVE_MS, STALE_TIME_ACTIVE_MS } from "../lib/polling-constants";

interface ObjectResponse {
  object: {
    address: string;
    version?: string;
    digest?: string;
    asMoveObject?: {
      contents?: {
        type?: {
          repr?: string;
        };
        fields?: Record<string, unknown>;
      };
    };
    [key: string]: unknown;
  };
}

async function fetchMarket(id: string): Promise<Market | null> {
  try {
    const response = await graphqlQuery<ObjectResponse>(MARKET_DETAIL_QUERY, { id });

    if (!response?.object) {
      return null;
    }

    // Convert GraphQL response to shape compatible with parseMarketFromSuiObject
    const mockSuiObject = {
      data: {
        objectId: response.object.address,
        content: {
          fields: response.object.asMoveObject?.contents?.fields ?? {},
        },
      },
    };

    return parseMarketFromSuiObject(mockSuiObject);
  } catch (error) {
    console.error("Error fetching market via GraphQL:", error);
    return null;
  }
}

/**
 * Hook: Fetch a single market by ID via GraphQL.
 *
 * @param id - Market object ID (enables hook when provided)
 * @returns Query result with Market object or null
 */
export function useMarketGraphQL(id: string | undefined) {
  return useQuery({
    queryKey: ["marketGraphQL", id],
    queryFn: () => fetchMarket(id!),
    enabled: Boolean(id),
    refetchInterval: POLL_INTERVAL_ACTIVE_MS,
    staleTime: STALE_TIME_ACTIVE_MS,
  });
}
