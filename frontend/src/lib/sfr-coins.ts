/**
 * SFR (Suffer) coin utilities — formatting, parsing, and PTB coin preparation.
 *
 * SFR has 2 decimals (SCALE = 100). 1 SFR = 100 base units.
 */

import { Transaction } from "@mysten/sui/transactions";
import { suiClient } from "./client";
import { SUFFER_COIN_TYPE } from "./market-constants";

/** SFR decimals (matches suffer.move DECIMALS constant). */
export const SFR_DECIMALS = 2;
export const SFR_SCALE = 100n;

/**
 * Format a base-unit SFR amount as a human-readable string with 2 decimals.
 * Example: 1234n → "12.34", 100n → "1.00", 5n → "0.05"
 */
export function formatSfr(amount: bigint): string {
  const isNeg = amount < 0n;
  const abs = isNeg ? -amount : amount;
  const whole = abs / SFR_SCALE;
  const frac = abs % SFR_SCALE;
  const fracStr = frac.toString().padStart(SFR_DECIMALS, "0");
  return `${isNeg ? "-" : ""}${whole.toLocaleString()}.${fracStr}`;
}

/**
 * Parse a user-entered SFR string to base units.
 * Accepts: "12.34", "12", ".5", "0.05"
 * Returns: bigint in base units (e.g. "12.34" → 1234n)
 */
export function parseSfr(input: string): bigint {
  const trimmed = input.trim();
  if (!trimmed || trimmed === ".") return 0n;

  const parts = trimmed.split(".");
  const wholePart = parts[0] || "0";
  let fracPart = parts[1] || "";

  // Truncate to SFR_DECIMALS
  fracPart = fracPart.slice(0, SFR_DECIMALS).padEnd(SFR_DECIMALS, "0");

  const whole = BigInt(wholePart) * SFR_SCALE;
  const frac = BigInt(fracPart);
  return whole + frac;
}

/**
 * Fetch and merge user's SFR coins into a single coin within a PTB.
 * Returns the transaction argument for the merged coin.
 *
 * The Move entry point (e.g. pm_trading::buy) accepts Coin<SUFFER>,
 * splits the exact amount needed, and returns change to the sender.
 *
 * RT-026: Balance cross-tab staleness — when using balance for validation,
 * ensure it was fetched within the last 10 seconds. This prevents stale
 * balance from another tab from causing rejected transactions.
 * See useMarketBalance hook for implementation details.
 */
export async function prepareSfrCoin(
  tx: Transaction,
  owner: string,
): Promise<ReturnType<Transaction["object"]>> {
  const coins = await suiClient.getCoins({ owner, coinType: SUFFER_COIN_TYPE });

  if (coins.data.length === 0) {
    throw new Error("No SFR coins found in wallet.");
  }

  const primary = tx.object(coins.data[0].coinObjectId);

  if (coins.data.length > 1) {
    const toMerge = coins.data.slice(1).map((c) => tx.object(c.coinObjectId));
    tx.mergeCoins(primary, toMerge);
  }

  return primary;
}
