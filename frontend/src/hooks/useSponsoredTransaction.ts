/**
 * Hook for executing sponsored transactions via the gas relay.
 * Live-beta sponsored flows fail closed if the relay is unavailable.
 *
 * Usage:
 *   const { executeSponsoredTx } = useSponsoredTransaction();
 *   const tx = new Transaction();
 *   tx.moveCall(...);
 *   const result = await executeSponsoredTx(tx);
 */

import { useCallback, useRef, useEffect } from "react";
import { useDAppKit, useCurrentAccount } from "@mysten/dapp-kit-react";
import { Transaction } from "@mysten/sui/transactions";
import { suiClient } from "../lib/client";
import {
  sponsorTransaction,
  executeSponsored as executeRelay,
  checkRelayHealth,
} from "../lib/gas-relay-client";

interface SponsoredResult {
  digest: string;
}

export function useSponsoredTransaction() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dappKit = useDAppKit() as any;
  const account = useCurrentAccount();
  const relayHealthy = useRef<boolean | null>(null);

  // RT-013: Reset relay health check when wallet changes
  useEffect(() => {
    relayHealthy.current = null;
  }, [account?.address]);

  // Check relay health on first use
  const ensureHealthChecked = useCallback(async () => {
    if (relayHealthy.current === null) {
      const health = await checkRelayHealth();
      relayHealthy.current = health.healthy;
    }
    return relayHealthy.current;
  }, []);

  const executeSponsoredTx = useCallback(
    async (tx: Transaction): Promise<SponsoredResult> => {
      const sender = account?.address;
      if (!sender) throw new Error("Wallet not connected");

      const isRelayUp = await ensureHealthChecked();

      if (isRelayUp) {
        try {
          // Build TransactionKind (commands only, no gas)
          const kindBytes = await tx.build({
            client: suiClient,
            onlyTransactionKind: true,
          });
          const kindB64 = btoa(String.fromCharCode(...kindBytes));

          // Step 1: Get sponsored tx bytes from relay
          const sponsored = await sponsorTransaction(kindB64, sender);

          // Step 2: User signs the sponsored tx bytes
          const txBytesArray = Uint8Array.from(atob(sponsored.txBytes), (c) => c.charCodeAt(0));
          const { signature } = await dappKit.signTransaction({
            transaction: txBytesArray,
          });

          // Step 3: Send to relay for co-signing and execution (return leased coin)
          const result = await executeRelay(sponsored.txBytes, signature, sponsored.gasCoinId);
          return { digest: result.digest };
        } catch (err) {
          console.warn("[sponsored-tx] Relay execution failed:", err);
          relayHealthy.current = false;
          throw new Error(
            `Sponsored execution unavailable: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      throw new Error("Sponsored execution unavailable: gas relay is not healthy or not configured.");
    },
    [dappKit, account, ensureHealthChecked],
  );

  return { executeSponsoredTx };
}
