/**
 * Fetches user's PMPosition objects for a given market.
 * Enabled only when wallet is connected.
 */

import { useQuery } from "@tanstack/react-query";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { suiClient } from "../lib/client";
import { PM_POSITION_TYPE } from "../lib/market-constants";
import { type Position } from "../lib/market-types";
import { POLL_INTERVAL_ACTIVE_MS, STALE_TIME_ACTIVE_MS } from "../lib/polling-constants";

function parsePosition(obj: unknown): Position | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const o = obj as any;
    const fields = o?.data?.content?.fields;
    if (!fields) return null;

    return {
      id: o.data.objectId ?? fields.id?.id ?? "",
      marketId: String(fields.market_id ?? ""),
      owner: String(fields.owner ?? ""),
      outcomeIndex: Number(fields.outcome_index ?? 0),
      quantity: BigInt(fields.quantity ?? 0),
      netCostBasis: BigInt(fields.net_cost_basis ?? 0),
      createdAtMs: Number(fields.created_at_ms ?? 0),
    };
  } catch {
    return null;
  }
}

async function fetchPositions(owner: string, marketId?: string): Promise<Position[]> {
  const result = await suiClient.getOwnedObjects({
    owner,
    filter: { StructType: PM_POSITION_TYPE },
    options: { showContent: true },
  });

  const positions = (result.data ?? [])
    .map((obj) => parsePosition(obj))
    .filter((p): p is Position => p !== null);

  if (marketId) {
    return positions.filter((p) => p.marketId === marketId);
  }
  return positions;
}

export function useMarketPositions(marketId?: string) {
  const account = useCurrentAccount();
  const owner = account?.address;

  return useQuery({
    queryKey: ["positions", owner, marketId],
    queryFn: () => fetchPositions(owner!, marketId),
    enabled: Boolean(owner),
    refetchInterval: POLL_INTERVAL_ACTIVE_MS,
    staleTime: STALE_TIME_ACTIVE_MS,
  });
}
