import { useState, useEffect, useCallback } from "react";
import { Market, MarketState, parseMarketFromSuiObject } from "../lib/market-types";
import { PM_POSITION_TYPE } from "../lib/market-constants";
import { fetchProtocolRuntimeConfig } from "../lib/protocol-runtime";
import { protocolReadTransport } from "../lib/client";

export interface Position {
  positionId: string;
  marketId: string;
  marketTitle: string;
  outcome: string;
  outcomeIndex: number;
  shares: bigint;
  value: bigint;
  pnl: bigint;
  netCostBasis: bigint;
  claimableValue: bigint;
  claimAction: "claim" | "refund_invalid" | null;
  state: "open" | "resolved" | "claimable";
}

const POLL_INTERVAL_MS = 30_000;
const MARKET_BATCH_SIZE = 50;

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function fetchMarketObjects(marketIds: string[]): Promise<Market[]> {
  const uniqueMarketIds = [...new Set(marketIds.filter(Boolean))];
  if (uniqueMarketIds.length === 0) {
    return [];
  }

  const marketBatches = chunkArray(uniqueMarketIds, MARKET_BATCH_SIZE);
  const batchResults = await Promise.all(
    marketBatches.map((ids) => protocolReadTransport.getObjects(ids)),
  );

  return batchResults
    .flat()
    .map((result) => parseMarketFromSuiObject(result))
    .filter((market): market is Market => market !== null);
}

export function useAllMarkets() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchMarkets = useCallback(async () => {
    try {
      const marketIds = await protocolReadTransport.listMarketIds();
      setMarkets(await fetchMarketObjects(marketIds));
      setError(null);
    } catch (fetchError) {
      setError(fetchError as Error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMarkets();
    const intervalId = setInterval(fetchMarkets, POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [fetchMarkets]);

  return { markets, isLoading, error, refetch: fetchMarkets };
}

function enrichMarket(market: Market, creatorPriorityWindowMs: number) {
  const creatorPriorityDeadlineMs = market.closeTimeMs + creatorPriorityWindowMs;
  const timeUntilCommunityCanProposeMs = Math.max(0, creatorPriorityDeadlineMs - Date.now());

  return {
    ...market,
    creatorPriorityWindowMs,
    creatorPriorityDeadlineMs,
    timeUntilCommunityCanProposeMs,
  } as Market & {
    creatorPriorityDeadlineMs: number;
    timeUntilCommunityCanProposeMs: number;
  };
}

export function useMarketData(id: string) {
  const [market, setMarket] = useState<
    (Market & { creatorPriorityDeadlineMs: number; timeUntilCommunityCanProposeMs: number }) | undefined
  >(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchMarket = useCallback(async () => {
    if (!id) {
      setMarket(undefined);
      setError(null);
      setIsLoading(false);
      return;
    }

    try {
      const [data, protocolConfig] = await Promise.all([
        protocolReadTransport.getObject(id),
        fetchProtocolRuntimeConfig(),
      ]);

      const parsed = parseMarketFromSuiObject(data);
      if (parsed) {
        setMarket(enrichMarket(parsed, protocolConfig.creatorPriorityWindowMs));
      } else {
        setMarket(undefined);
      }
      setError(null);
    } catch (fetchError) {
      setError(fetchError as Error);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchMarket();
    const intervalId = setInterval(fetchMarket, POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [fetchMarket]);

  return { market, isLoading, error, refetch: fetchMarket };
}

interface RawPosition {
  id: string;
  marketId: string;
  owner: string;
  outcomeIndex: number;
  quantity: bigint;
  netCostBasis: bigint;
  createdAtMs: number;
}

function parseOwnedPosition(entry: unknown): RawPosition | null {
  try {
    const item = entry as {
      data?: {
        objectId?: string;
        content?: {
          fields?: Record<string, unknown>;
        };
      };
    };
    const fields = item.data?.content?.fields;
    if (!fields) return null;

    return {
      id: item.data?.objectId ?? String((fields.id as { id?: string } | undefined)?.id ?? ""),
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

function applyFee(amount: bigint, feeBps: bigint): bigint {
  if (amount <= 0n || feeBps <= 0n) {
    return amount;
  }

  const fee = (amount * feeBps) / 10_000n;
  const normalizedFee = fee === 0n ? 1n : fee;
  return amount > normalizedFee ? amount - normalizedFee : 0n;
}

function computeInvalidRefund(position: RawPosition, market: Market): bigint {
  if (market.invalidationSnapshotCollateral == null || market.totalCostBasisSum <= 0n) {
    return 0n;
  }

  return (position.netCostBasis * market.invalidationSnapshotCollateral) / market.totalCostBasisSum;
}

function enrichPortfolioPosition(
  position: RawPosition,
  market: Market | null | undefined,
  settlementFeeBps: bigint,
): Position {
  if (!market) {
    return {
      positionId: position.id,
      marketId: position.marketId,
      marketTitle: position.marketId,
      outcome: `Outcome ${position.outcomeIndex}`,
      outcomeIndex: position.outcomeIndex,
      shares: position.quantity,
      value: position.quantity,
      pnl: 0n,
      netCostBasis: position.netCostBasis,
      claimableValue: 0n,
      claimAction: null,
      state: "open",
    };
  }

  let value = position.quantity;
  let pnl = 0n;
  let claimableValue = 0n;
  let claimAction: "claim" | "refund_invalid" | null = null;
  let state: Position["state"] = "open";

  if (market.state === MarketState.RESOLVED && market.resolution?.finalized) {
    state = "resolved";
    if (position.outcomeIndex === market.resolution.resolvedOutcome) {
      claimableValue = applyFee(position.quantity, settlementFeeBps);
      value = claimableValue;
      pnl = claimableValue - position.netCostBasis;
      claimAction = "claim";
      state = "claimable";
    } else {
      value = 0n;
      pnl = -position.netCostBasis;
    }
  } else if (market.state === MarketState.INVALID) {
    claimableValue = computeInvalidRefund(position, market);
    value = claimableValue;
    pnl = claimableValue - position.netCostBasis;
    claimAction = "refund_invalid";
    state = "claimable";
  }

  return {
    positionId: position.id,
    marketId: position.marketId,
    marketTitle: market.title || position.marketId,
    outcome: market.outcomeLabels[position.outcomeIndex] ?? `Outcome ${position.outcomeIndex}`,
    outcomeIndex: position.outcomeIndex,
    shares: position.quantity,
    value,
    pnl,
    netCostBasis: position.netCostBasis,
    claimableValue,
    claimAction,
    state,
  };
}

export function usePortfolio(userAddress?: string) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [isLoading, setIsLoading] = useState(!!userAddress);
  const [error, setError] = useState<Error | null>(null);

  const fetchPositions = useCallback(async () => {
    if (!userAddress) {
      setPositions([]);
      setIsLoading(false);
      return;
    }

    try {
      const [owned, protocolConfig] = await Promise.all([
        protocolReadTransport.listOwnedObjects({
          owner: userAddress,
          type: PM_POSITION_TYPE,
        }),
        fetchProtocolRuntimeConfig(),
      ]);

      const rawPositions = owned
        .map((entry) => parseOwnedPosition(entry))
        .filter((position): position is RawPosition => position !== null);

      const marketIds = [...new Set(rawPositions.map((position) => position.marketId).filter(Boolean))];
      const marketResults = await fetchMarketObjects(marketIds);

      const markets = new Map<string, Market>();
      marketResults.forEach((market) => {
        markets.set(market.id, market);
      });

      const settlementFeeBps = BigInt(protocolConfig.settlementFeeBps);
      setPositions(
        rawPositions.map((position) =>
          enrichPortfolioPosition(position, markets.get(position.marketId), settlementFeeBps),
        ),
      );
      setError(null);
    } catch (fetchError) {
      setError(fetchError as Error);
    } finally {
      setIsLoading(false);
    }
  }, [userAddress]);

  useEffect(() => {
    fetchPositions();
    if (!userAddress) {
      return;
    }
    const intervalId = setInterval(fetchPositions, POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [fetchPositions, userAddress]);

  return { positions, isLoading, error, refetch: fetchPositions };
}
