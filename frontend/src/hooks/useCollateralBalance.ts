import { useQuery } from "@tanstack/react-query";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { fetchCollateralCoins } from "../lib/collateral";
import { POLL_INTERVAL_LIST_MS, STALE_TIME_LIST_MS } from "../lib/polling-constants";

const BALANCE_CACHE_TTL_MS = 10000;

export interface CollateralBalanceResult {
  totalBalance: bigint;
  coinCount: number;
  isLoading: boolean;
  refetch: () => void;
  lastFetchedAt?: number;
}

async function fetchBalance(owner: string): Promise<{
  totalBalance: bigint;
  coinCount: number;
  fetchedAt: number;
}> {
  const inventory = await fetchCollateralCoins(owner);
  return {
    totalBalance: inventory.totalBalance,
    coinCount: inventory.coinCount,
    fetchedAt: Date.now(),
  };
}

export function useCollateralBalance(): CollateralBalanceResult {
  const account = useCurrentAccount();
  const owner = account?.address;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["collateralBalance", owner],
    queryFn: () => fetchBalance(owner!),
    enabled: Boolean(owner),
    refetchInterval: POLL_INTERVAL_LIST_MS,
    staleTime: STALE_TIME_LIST_MS,
  });

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
