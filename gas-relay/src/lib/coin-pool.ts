/**
 * Gas coin pool — prevents equivocation when concurrent requests
 * try to use the same sponsor SUI coin.
 *
 * On startup, fetches all sponsor SUI coins. Each sponsor request
 * leases a coin from the pool. After the transaction completes
 * (success or failure), the coin is returned to the pool.
 *
 * Security features:
 * - Per-sender lease tracking: max 1 active lease per Sui address
 * - Lease auto-timeout: coins auto-return after LEASE_AUTO_TIMEOUT_MS
 *   even if /execute is never called (prevents DoS via lease hoarding)
 * - Queue with timeout for burst handling
 * - Periodic version refresh from chain
 */

import { suiClient, getSponsorAddress } from "./sui-client.js";

interface GasCoinRef {
  objectId: string;
  version: string;
  digest: string;
}

interface PoolEntry {
  coin: GasCoinRef;
  inUse: boolean;
  /** Sui address that leased this coin (null if free) */
  leasedBy: string | null;
  /** Auto-return timer handle (null if free) */
  leaseTimer: ReturnType<typeof setTimeout> | null;
}

let pool: PoolEntry[] = [];
let initialized = false;
const waiters: Array<{ resolve: (coin: GasCoinRef) => void; sender: string }> = [];

/** Track which sender has an active lease */
const activeLeaseBySender = new Map<string, string>(); // sender → coinObjectId

const LEASE_TIMEOUT_MS = 10_000;        // 10s max wait for a coin in queue
const LEASE_AUTO_TIMEOUT_MS = 30_000;   // 30s auto-return if /execute never called
const REFRESH_INTERVAL_MS = 60_000;     // refresh versions every 60s
const MIN_COINS = 5;

/**
 * Initialize the coin pool from on-chain state.
 * Should be called once on server startup.
 */
export async function initCoinPool(): Promise<void> {
  const address = getSponsorAddress();
  const coins = await suiClient.getCoins({
    owner: address,
    coinType: "0x2::sui::SUI",
    limit: 50,
  });

  pool = (coins.data as Array<{ coinObjectId: string; version: string; digest: string }>).map((c): PoolEntry => ({
    coin: {
      objectId: c.coinObjectId,
      version: c.version,
      digest: c.digest,
    },
    inUse: false,
    leasedBy: null,
    leaseTimer: null,
  }));

  initialized = true;
  console.log(`[coin-pool] Initialized with ${pool.length} SUI coins`);

  if (pool.length < MIN_COINS) {
    console.warn(
      `[coin-pool] WARNING: Only ${pool.length} gas coins available. ` +
        `Split sponsor SUI into at least ${MIN_COINS} coins for concurrency. ` +
        `Use: sui client split-coin --coin-id <COIN> --amounts 100000000 100000000 ...`,
    );
  }

  // Periodic refresh to recover from stale versions
  setInterval(() => refreshPool().catch(console.error), REFRESH_INTERVAL_MS);
}

/**
 * Refresh coin versions from chain (recovers from equivocation failures).
 */
async function refreshPool(): Promise<void> {
  const address = getSponsorAddress();
  const coins = await suiClient.getCoins({
    owner: address,
    coinType: "0x2::sui::SUI",
    limit: 50,
  });

  const freshMap = new Map<string, GasCoinRef>(
    (coins.data as Array<{ coinObjectId: string; version: string; digest: string }>).map((c) => [
      c.coinObjectId,
      { objectId: c.coinObjectId, version: c.version, digest: c.digest },
    ]),
  );

  // Update versions for existing coins, mark removed coins as gone
  pool = pool
    .filter((entry) => freshMap.has(entry.coin.objectId) || entry.inUse)
    .map((entry): PoolEntry => {
      const fresh = freshMap.get(entry.coin.objectId);
      if (fresh && !entry.inUse) {
        return { ...entry, coin: fresh };
      }
      return entry;
    });

  // Add any new coins not in pool
  for (const [objectId, coin] of freshMap) {
    if (!pool.some((e) => e.coin.objectId === objectId)) {
      pool.push({ coin, inUse: false, leasedBy: null, leaseTimer: null });
    }
  }
}

/**
 * Check if a sender already has an active lease.
 */
export function hasActiveLease(sender: string): boolean {
  return activeLeaseBySender.has(sender);
}

/**
 * Lease a gas coin from the pool. Returns when a coin is available.
 * Throws if no coin becomes available within LEASE_TIMEOUT_MS.
 *
 * @param sender - Sui address requesting the lease (for per-sender tracking)
 */
export async function leaseCoin(sender: string): Promise<GasCoinRef> {
  if (!initialized) {
    await initCoinPool();
  }

  // Try to find a free coin immediately
  const free = pool.find((e) => !e.inUse);
  if (free) {
    markLeased(free, sender);
    return free.coin;
  }

  // Queue and wait for a coin to be returned
  return new Promise<GasCoinRef>((resolve, reject) => {
    const timer = setTimeout(() => {
      const idx = waiters.findIndex((w) => w.resolve === resolve);
      if (idx >= 0) waiters.splice(idx, 1);
      reject(
        new Error(
          `No gas coins available (pool size: ${pool.length}, all in use). ` +
            `Wait timed out after ${LEASE_TIMEOUT_MS}ms.`,
        ),
      );
    }, LEASE_TIMEOUT_MS);

    waiters.push({
      resolve: (coin) => {
        clearTimeout(timer);
        resolve(coin);
      },
      sender,
    });
  });
}

/**
 * Return a leased coin to the pool.
 * Call this in a finally block after transaction completes.
 */
export function returnCoin(objectId: string): void {
  const entry = pool.find((e) => e.coin.objectId === objectId);
  if (!entry) return;

  // Clear lease tracking
  if (entry.leaseTimer) {
    clearTimeout(entry.leaseTimer);
    entry.leaseTimer = null;
  }
  if (entry.leasedBy) {
    activeLeaseBySender.delete(entry.leasedBy);
    entry.leasedBy = null;
  }
  entry.inUse = false;

  // If someone is waiting, give them this coin
  if (waiters.length > 0) {
    const waiter = waiters.shift()!;
    markLeased(entry, waiter.sender);
    waiter.resolve(entry.coin);
  }
}

/**
 * Mark a pool entry as leased by a specific sender.
 * Sets up auto-return timer.
 */
function markLeased(entry: PoolEntry, sender: string): void {
  entry.inUse = true;
  entry.leasedBy = sender;
  activeLeaseBySender.set(sender, entry.coin.objectId);

  // B-3: Auto-return after timeout — prevents DoS via lease hoarding
  entry.leaseTimer = setTimeout(() => {
    console.warn(
      `[coin-pool] Auto-returning coin ${entry.coin.objectId} leased by ${sender} ` +
        `after ${LEASE_AUTO_TIMEOUT_MS}ms timeout (execute never called)`,
    );
    returnCoin(entry.coin.objectId);
  }, LEASE_AUTO_TIMEOUT_MS);
}

/**
 * Update a coin's version after successful transaction.
 * The chain returns new version info in transaction effects.
 */
export function updateCoinVersion(
  objectId: string,
  newVersion: string,
  newDigest: string,
): void {
  const entry = pool.find((e) => e.coin.objectId === objectId);
  if (entry) {
    entry.coin.version = newVersion;
    entry.coin.digest = newDigest;
  }
}

export async function refreshCoinVersionFromChain(objectId: string): Promise<void> {
  const response = await suiClient.getObject({
    id: objectId,
    options: {
      showType: true,
      showOwner: true,
    },
  } as never);

  const data = (response as { data?: { version?: string | number; digest?: string } }).data;
  if (!data?.version || !data.digest) {
    return;
  }

  updateCoinVersion(objectId, data.version.toString(), data.digest);
}

export function poolStats(): {
  total: number;
  available: number;
  inUse: number;
  activeSenders: number;
} {
  const inUse = pool.filter((e) => e.inUse).length;
  return {
    total: pool.length,
    available: pool.length - inUse,
    inUse,
    activeSenders: activeLeaseBySender.size,
  };
}
