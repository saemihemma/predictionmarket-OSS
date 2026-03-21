/**
 * Hook to fetch the connected wallet's total SFR (Suffer) coin balance.
 * Polls every 15s when wallet is connected, disabled otherwise.
 *
 * RT-026: Cache TTL check — prevents stale balance from another tab.
 * If balance was fetched more than 10 seconds ago, refetch before using.
 */

import { useQuery } from "@tanstack/react-query";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { suiClient } from "../lib/client";
import { SUFFER_COIN_TYPE } from "../lib/market-constants";
import { POLL_INTERVAL_LIST_MS, STALE_TIME_LIST_MS } from "../lib/polling-constants";

/** Cache TTL in milliseconds to detect stale balance from other tabs. */
const BALANCE_CACHE_TTL_MS = 10000;

interface SfrBalanceResult {
  /** Total balance in base units (2 decimals). */
  totalBalance: bigint;
  /** Number of coin objects (relevant for merging). */
  coinCount: number;
  isLoading: boolean;
  refetch: () => void;
  /** Timestamp when balance was last fetched (for RT-026 staleness check). */
  lastFetchedAt?: number;
}

async function fetchSfrBalance(owner: string): Promise<{ totalBalance: bigint; coinCount: number; fetchedAt: number }> {
  const coins = await suiClient.getCoins({ owner, coinType: SUFFER_COIN_TYPE });
  let total = 0n;
  for (const coin of coins.data) {
    total += BigInt(coin.balance);
  }
  return { totalBalance: total, coinCount: coins.data.length, fetchedAt: Date.now() };
}

export function useSfrBalance(): SfrBalanceResult {
  const account = useCurrentAccount();
  const owner = account?.address;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["sfrBalance", owner],
    queryFn: () => fetchSfrBalance(owner!),
    enabled: Boolean(owner),
    refetchInterval: POLL_INTERVAL_LIST_MS,
    staleTime: STALE_TIME_LIST_MS,
  });

  // RT-026: Detect stale balance (e.g., from another browser tab)
  // If balance was fetched more than 10 seconds ago, trigger refetch
  const isStaleBeyondTTL = data?.fetchedAt && Date.now() - data.fetchedAt > BALANCE_CACHE_TTL_MS;
  if (isStaleBeyondTTL) {
    refetch();
  }

  return {
    totalBalance: data?.totalBalance ?? 0n,
    coinCount: data?.coinCount ?? 0,
    isLoading,
    refetch,
    lastFetchedAt: data?.fetchedAt,
  };
}
