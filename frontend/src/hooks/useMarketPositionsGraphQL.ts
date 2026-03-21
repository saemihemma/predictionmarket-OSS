/**
 * Fetches user's PMPosition objects for a given market via GraphQL.
 * Drop-in replacement for useMarketPositions (RPC-based version).
 *
 * Uses GraphQL object query filtered by owner and struct type.
 * Enabled only when wallet is connected.
 */

import { useQuery } from "@tanstack/react-query";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { graphqlQuery } from "../lib/graphql-client";
import { PM_POSITION_TYPE } from "../lib/market-constants";
import { type Position } from "../lib/market-types";
import { OWNER_OBJECTS_QUERY } from "../lib/graphql-queries";
import { POLL_INTERVAL_ACTIVE_MS, STALE_TIME_ACTIVE_MS } from "../lib/polling-constants";

interface PositionFields {
  id?: { id?: string };
  market_id?: string;
  owner?: string;
  outcome_index?: number;
  quantity?: string | number;
  net_cost_basis?: string | number;
  created_at_ms?: string | number;
}

interface PositionNode {
  address: string;
  asMoveObject?: {
    contents?: {
      type?: { repr?: string };
      fields?: PositionFields;
    };
  };
  [key: string]: unknown;
}

interface PositionEdge {
  node: PositionNode;
  cursor?: string;
}

interface ObjectsResponse {
  objects: {
    edges: PositionEdge[];
    pageInfo: {
      hasNextPage: boolean;
      endCursor?: string;
    };
  };
}

function parsePosition(fields: PositionFields | undefined, address: string): Position | null {
  if (!fields) return null;

  try {
    return {
      id: address,
      marketId: String(fields.market_id ?? ""),
      owner: String(fields.owner ?? ""),
      outcomeIndex: Number(fields.outcome_index ?? 0),
      quantity: BigInt(String(fields.quantity ?? 0)),
      netCostBasis: BigInt(String(fields.net_cost_basis ?? 0)),
      createdAtMs: Number(fields.created_at_ms ?? 0),
    };
  } catch {
    return null;
  }
}

async function fetchPositions(owner: string, marketId?: string): Promise<Position[]> {
  try {
    // Note: This query pattern assumes Sui GraphQL supports filtering by StructType.
    // The exact filter structure may vary depending on Sui's actual GraphQL schema.
    // Adjust the filter object as needed based on real schema.
    const response = await graphqlQuery<ObjectsResponse>(OWNER_OBJECTS_QUERY, {
      owner,
      filter: {
        StructType: PM_POSITION_TYPE,
      },
      first: 100, // Reasonable upper limit for a user's positions
      after: null,
    });

    const positions = (response?.objects?.edges ?? [])
      .map((edge) => {
        const fields = edge.node?.asMoveObject?.contents?.fields;
        return parsePosition(fields, edge.node?.address);
      })
      .filter((p): p is Position => p !== null);

    if (marketId) {
      return positions.filter((p) => p.marketId === marketId);
    }

    return positions;
  } catch (error) {
    console.error("Error fetching positions via GraphQL:", error);
    return [];
  }
}

/**
 * Hook: Fetch user's market positions via GraphQL.
 *
 * @param marketId - Optional market filter (returns all if not provided)
 * @returns Query result with Position[] array
 */
export function useMarketPositionsGraphQL(marketId?: string) {
  const account = useCurrentAccount();
  const owner = account?.address;

  return useQuery({
    queryKey: ["positionsGraphQL", owner, marketId],
    queryFn: () => fetchPositions(owner!, marketId),
    enabled: Boolean(owner),
    refetchInterval: POLL_INTERVAL_ACTIVE_MS,
    staleTime: STALE_TIME_ACTIVE_MS,
  });
}
