/**
 * Hook to fetch the connected wallet's total SFR (Suffer) coin balance via GraphQL.
 * Drop-in replacement for useSfrBalance (RPC-based version).
 *
 * Uses GraphQL coinConnection or coins query instead of RPC getCoins.
 * Polls every 15s when wallet is connected, disabled otherwise.
 */

import { useQuery } from "@tanstack/react-query";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { graphqlQuery } from "../lib/graphql-client";
import { SUFFER_COIN_TYPE } from "../lib/market-constants";
import { COIN_BALANCE_QUERY } from "../lib/graphql-queries";
import { POLL_INTERVAL_LIST_MS, STALE_TIME_LIST_MS } from "../lib/polling-constants";

export interface SfrBalanceResult {
  /** Total balance in base units (2 decimals). */
  totalBalance: bigint;
  /** Number of coin objects (relevant for merging). */
  coinCount: number;
  isLoading: boolean;
  refetch: () => void;
}

interface CoinNode {
  address: string;
  balance?: string | number;
  coinObjectCount?: number;
}

interface CoinEdge {
  node: CoinNode;
  cursor?: string;
}

interface CoinBalanceResponse {
  coinConnection: {
    totalBalance?: string;
    edges?: CoinEdge[];
  };
}

async function fetchSfrBalance(owner: string): Promise<{ totalBalance: bigint; coinCount: number }> {
  try {
    const response = await graphqlQuery<CoinBalanceResponse>(COIN_BALANCE_QUERY, {
      owner,
      coinType: SUFFER_COIN_TYPE,
    });

    const coinData = response?.coinConnection;
    if (!coinData) {
      return { totalBalance: 0n, coinCount: 0 };
    }

    // Try to get totalBalance from the coinConnection response
    let totalBalance = 0n;
    if (coinData.totalBalance) {
      totalBalance = BigInt(coinData.totalBalance);
    } else if (coinData.edges) {
      // Fallback: sum individual coin balances
      for (const edge of coinData.edges) {
        if (edge.node?.balance) {
          totalBalance += BigInt(String(edge.node.balance));
        }
      }
    }

    const coinCount =
      coinData.edges?.length ??
      (coinData.edges?.[0]?.node?.coinObjectCount ?? 0);

    return { totalBalance, coinCount };
  } catch (error) {
    console.error("Error fetching SFR balance via GraphQL:", error);
    return { totalBalance: 0n, coinCount: 0 };
  }
}

/**
 * Hook: Fetch SFR balance for connected wallet via GraphQL.
 *
 * @returns SfrBalanceResult with totalBalance, coinCount, isLoading, refetch
 */
export function useSfrBalanceGraphQL(): SfrBalanceResult {
  const account = useCurrentAccount();
  const owner = account?.address;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["sfrBalanceGraphQL", owner],
    queryFn: () => fetchSfrBalance(owner!),
    enabled: Boolean(owner),
    refetchInterval: POLL_INTERVAL_LIST_MS,
    staleTime: STALE_TIME_LIST_MS,
  });

  return {
    totalBalance: data?.totalBalance ?? 0n,
    coinCount: data?.coinCount ?? 0,
    isLoading,
    refetch,
  };
}
