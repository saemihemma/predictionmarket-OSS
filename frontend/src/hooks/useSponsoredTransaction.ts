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

function isWalletApprovalCancelled(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return (
    normalized.includes("reject") ||
    normalized.includes("cancel") ||
    normalized.includes("declin") ||
    normalized.includes("denied")
  );
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

          let sponsored;
          try {
            // Step 1: Get sponsored tx bytes from relay
            sponsored = await sponsorTransaction(kindB64, sender);
          } catch (err) {
            relayHealthy.current = false;
            throw new Error(
              `Sponsored execution unavailable: ${err instanceof Error ? err.message : String(err)}`,
            );
          }

          let signed;
          try {
            // Step 2: User signs the full sponsored tx returned by the relay.
            // Using a Transaction object keeps one signing path while giving wallets
            // the structured payload they expect for simulation and review.
            signed = await dappKit.signTransaction({
              transaction: Transaction.from(sponsored.txBytes),
            });
          } catch (err) {
            if (isWalletApprovalCancelled(err)) {
              throw new Error("Wallet approval was cancelled.");
            }
            throw err;
          }

          try {
            // Step 3: Send the exact wallet-signed bytes back to the relay for co-signing and execution
            const result = await executeRelay(signed.bytes, signed.signature, sponsored.gasCoinId);
            return { digest: result.digest };
          } catch (err) {
            relayHealthy.current = false;
            throw new Error(
              `Sponsored execution unavailable: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        } catch (err) {
          console.warn("[sponsored-tx] Relay execution failed:", err);
          throw err instanceof Error ? err : new Error(String(err));
        }
      }

      throw new Error("Sponsored execution unavailable: gas relay is not healthy or not configured.");
    },
    [dappKit, account, ensureHealthChecked],
  );

  return { executeSponsoredTx };
}
