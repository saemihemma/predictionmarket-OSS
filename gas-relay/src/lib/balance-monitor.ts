import { suiClient, getSponsorAddress } from "./sui-client.js";

const MIN_BALANCE = BigInt(process.env.MIN_SPONSOR_BALANCE ?? "1000000000"); // 1 SUI default
const LOW_BALANCE_THRESHOLD = BigInt(process.env.LOW_BALANCE_THRESHOLD ?? "10000000000"); // 10 SUI default

/**
 * Check relay sponsor balance and log warnings when threshold is breached.
 *
 * The MIN_BALANCE is the absolute minimum needed to continue sponsoring transactions.
 * The LOW_BALANCE_THRESHOLD (default 10 SUI) triggers a WARNING before critical state.
 *
 * @returns Promise with balance in MIST and healthy boolean flag
 */
export async function checkBalance(): Promise<{ balance: bigint; healthy: boolean }> {
  const address = getSponsorAddress();
  const { totalBalance } = await suiClient.getBalance({ owner: address });
  const balance = BigInt(totalBalance);
  const healthy = balance >= MIN_BALANCE;

  if (!healthy) {
    console.warn(
      `[gas-relay] CRITICAL WARNING: Sponsor balance critically low! ${balance} MIST (min: ${MIN_BALANCE} MIST). ` +
      `Address: ${address}`
    );
  } else if (balance < LOW_BALANCE_THRESHOLD) {
    console.warn(
      `[gas-relay] WARNING: Sponsor balance low! ${balance} MIST (${Number(balance) / 1e9} SUI). ` +
      `Below low-balance threshold (${Number(LOW_BALANCE_THRESHOLD) / 1e9} SUI). ` +
      `Address: ${address}`
    );
  } else {
    console.log(`[gas-relay] Sponsor balance: ${balance} MIST (${Number(balance) / 1e9} SUI)`);
  }

  return { balance, healthy };
}
