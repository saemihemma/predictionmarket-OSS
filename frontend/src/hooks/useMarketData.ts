/**
 * Data hooks — unified interface for market and position data.
 *
 * When ENABLE_MOCK_DATA is true (see lib/mock/config.ts), returns sample data.
 * When false (default), fetches from Sui GraphQL.
 * See USE_MOCK_DATA.md for details.
 *
 * Pages consume these hooks and never import mock data directly.
 */

import { useState, useEffect, useCallback } from "react";
import { Market } from "../lib/market-types";
import { parseMarketFromSuiObject } from "../lib/market-types";
import { ENABLE_MOCK_DATA } from "../lib/mock/config";
import { getMockMarket, mockMarkets } from "../lib/mock/markets";
import { mockPositions as MOCK_POSITIONS } from "../lib/mock/positions";
import { graphqlQuery } from "../lib/graphql-client";
import { MARKETS_QUERY, MARKET_DETAIL_QUERY, OWNER_OBJECTS_QUERY } from "../lib/graphql-queries";
import { EVENT_MARKET_CREATED, PM_MARKET_TYPE } from "../lib/market-constants";

export interface Position {
  marketId: string;
  marketTitle: string;
  outcome: string;
  shares: bigint;
  value: bigint;
  pnl: bigint;
  state: "open" | "resolved" | "claimable";
}

const POLL_INTERVAL_MS = 30_000;

// ── useAllMarkets ──────────────────────────────────────────────────────

interface MarketsQueryResponse {
  events: {
    edges: Array<{
      node: { parsedJson: any; timestamp: string };
      cursor: string;
    }>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
}

export function useAllMarkets() {
  const [markets, setMarkets] = useState<Market[]>(ENABLE_MOCK_DATA ? (mockMarkets as Market[]) : []);
  const [isLoading, setIsLoading] = useState(!ENABLE_MOCK_DATA);
  const [error, setError] = useState<Error | null>(null);

  const fetchMarkets = useCallback(async () => {
    if (ENABLE_MOCK_DATA) return;
    try {
      // Step 1: Query MarketCreatedEvent events to discover market IDs
      const data = await graphqlQuery<MarketsQueryResponse>(MARKETS_QUERY, {
        eventType: EVENT_MARKET_CREATED,
        first: 100,
      });

      const marketIds = data.events.edges
        .map((e) => e.node.parsedJson?.market_id)
        .filter(Boolean) as string[];

      if (marketIds.length === 0) {
        setMarkets([]);
        setError(null);
        return;
      }

      // Step 2: Batch fetch market objects via individual GraphQL queries
      // (multiGetObjects not available in GraphQL — fetch individually and parse)
      const marketPromises = marketIds.map((id) =>
        graphqlQuery<{ object: any }>(MARKET_DETAIL_QUERY, { id }).catch(() => null)
      );
      const results = await Promise.all(marketPromises);

      const parsed = results
        .filter(Boolean)
        .map((r) => {
          try {
            return parseMarketFromSuiObject(r!.object);
          } catch {
            return null;
          }
        })
        .filter(Boolean) as Market[];

      setMarkets(parsed);
      setError(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMarkets();
    if (!ENABLE_MOCK_DATA) {
      const id = setInterval(fetchMarkets, POLL_INTERVAL_MS);
      return () => clearInterval(id);
    }
  }, [fetchMarkets]);

  return { markets, isLoading, error, refetch: fetchMarkets };
}

// ── useMarketData ──────────────────────────────────────────────────────

export function useMarketData(id: string) {
  const [market, setMarket] = useState<(Market & { creatorPriorityDeadlineMs: number; timeUntilCommunityCanProposeMs: number; resolveDeadlineMs: number }) | undefined>(() => {
    if (!ENABLE_MOCK_DATA) return undefined;
    const m = getMockMarket(id);
    return m ? enrichMarket(m) : undefined;
  });
  const [isLoading, setIsLoading] = useState(!ENABLE_MOCK_DATA);
  const [error, setError] = useState<Error | null>(null);

  const fetchMarket = useCallback(async () => {
    if (ENABLE_MOCK_DATA) return;
    try {
      const data = await graphqlQuery<{ object: any }>(MARKET_DETAIL_QUERY, { id });
      const parsed = parseMarketFromSuiObject(data.object);
      if (parsed) {
        setMarket(enrichMarket(parsed));
      }
      setError(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchMarket();
    if (!ENABLE_MOCK_DATA) {
      const interval = setInterval(fetchMarket, POLL_INTERVAL_MS);
      return () => clearInterval(interval);
    }
  }, [fetchMarket]);

  return { market, isLoading, error, refetch: fetchMarket };
}

function enrichMarket(m: Market) {
  const creatorPriorityDeadlineMs = m.closeTimeMs + (m.creatorPriorityWindowMs || 86400000);
  const timeUntilCommunityCanProposeMs = Math.max(0, creatorPriorityDeadlineMs - Date.now());
  const resolveDeadlineMs = m.closeTimeMs + (72 * 60 * 60 * 1000);
  return { ...m, creatorPriorityDeadlineMs, timeUntilCommunityCanProposeMs, resolveDeadlineMs } as Market & {
    creatorPriorityDeadlineMs: number;
    timeUntilCommunityCanProposeMs: number;
    resolveDeadlineMs: number;
  };
}

// ── usePortfolio ───────────────────────────────────────────────────────

interface PositionQueryResponse {
  objects: {
    edges: Array<{
      node: {
        address: string;
        asMoveObject: {
          contents: {
            fields: Record<string, any>;
          };
        };
      };
      cursor: string;
    }>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
}

export function usePortfolio(userAddress?: string) {
  const [positions, setPositions] = useState<Position[]>(ENABLE_MOCK_DATA ? MOCK_POSITIONS : []);
  const [isLoading, setIsLoading] = useState(!ENABLE_MOCK_DATA && !!userAddress);
  const [error, setError] = useState<Error | null>(null);

  const fetchPositions = useCallback(async () => {
    if (ENABLE_MOCK_DATA || !userAddress) return;
    try {
      const data = await graphqlQuery<PositionQueryResponse>(OWNER_OBJECTS_QUERY, {
        owner: userAddress,
        filter: { type: PM_MARKET_TYPE.replace("PMMarket", "PMPosition") },
        first: 50,
      });

      // Parse position objects — each needs parent market context for title/outcome
      // For now, return raw position data; market enrichment happens when useAllMarkets is available
      const parsed: Position[] = data.objects.edges.map((edge) => {
        const f = edge.node.asMoveObject?.contents?.fields ?? {};
        return {
          marketId: f.marketId ?? "",
          marketTitle: f.marketId ?? "", // enriched later when market data available
          outcome: String(f.outcomeIndex ?? 0),
          shares: BigInt(f.quantity ?? 0),
          value: 0n, // computed from pool state
          pnl: 0n, // computed from cost basis
          state: "open" as const,
        };
      });

      setPositions(parsed);
      setError(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      setIsLoading(false);
    }
  }, [userAddress]);

  useEffect(() => {
    fetchPositions();
    if (!ENABLE_MOCK_DATA && userAddress) {
      const id = setInterval(fetchPositions, POLL_INTERVAL_MS);
      return () => clearInterval(id);
    }
  }, [fetchPositions]);

  return { positions, isLoading, error, refetch: fetchPositions };
}

// ── useMarketStats ─────────────────────────────────────────────────────

export function useMarketStats() {
  const { markets, isLoading, error } = useAllMarkets();

  if (markets.length === 0 && !ENABLE_MOCK_DATA) {
    return {
      totalMarkets: 0,
      totalVolume: "0",
      activeTraders: 0,
      network: "TESTNET",
      isLoading,
      error,
    };
  }

  const uniqueCreators = new Set(markets.map((m) => m.creator).filter(Boolean));
  const totalVolume = markets.reduce((sum, m) => sum + m.totalCollateral, 0n);

  return {
    totalMarkets: markets.length,
    totalVolume: Number(totalVolume).toLocaleString(),
    activeTraders: uniqueCreators.size,
    network: "TESTNET",
    isLoading,
    error,
  };
}
