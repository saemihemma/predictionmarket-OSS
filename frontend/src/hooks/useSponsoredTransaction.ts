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
import { rpcWriteClient } from "../lib/client";
import {
  sponsorTransaction,
  executeSponsored as executeRelay,
  checkRelayHealth,
  RelayApiError,
} from "../lib/gas-relay-client";

export interface SponsoredResult {
  digest: string;
  effects?: unknown;
  events?: unknown;
}

function extractErrorDetail(error: unknown): string {
  const queue: unknown[] = [error];
  const seen = new Set<unknown>();
  const messages: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current == null || seen.has(current)) {
      continue;
    }
    seen.add(current);

    if (typeof current === "string") {
      if (current.trim()) {
        messages.push(current.trim());
      }
      continue;
    }

    if (current instanceof Error) {
      if (current.message?.trim()) {
        messages.push(current.message.trim());
      }
      queue.push((current as Error & { cause?: unknown }).cause);
      queue.push((current as Error & { executionError?: unknown }).executionError);
    }

    if (typeof current !== "object") {
      continue;
    }

    const record = current as Record<string, unknown>;
    for (const key of ["message", "error", "reason", "executionErrorSource"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) {
        messages.push(value.trim());
      }
    }

    for (const key of ["cause", "executionError", "status", "FailedTransaction", "Transaction"]) {
      if (key in record) {
        queue.push(record[key]);
      }
    }
  }

  const uniqueMessages = [...new Set(messages.filter(Boolean))];
  return uniqueMessages.join(": ") || "Unknown error";
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

function shouldTripRelayHealth(error: unknown): boolean {
  if (error instanceof RelayApiError) {
    if (
      error.code === "frontier_character_required" ||
      error.code === "eligibility_unavailable" ||
      error.code === "campaign_ended"
    ) {
      return false;
    }

    return error.status >= 500;
  }

  return true;
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
          let kindBytes: Uint8Array;
          try {
            kindBytes = await tx.build({
              client: rpcWriteClient,
              onlyTransactionKind: true,
            });
          } catch (err) {
            throw new Error(`Local transaction build failed: ${extractErrorDetail(err)}`);
          }
          const kindB64 = btoa(String.fromCharCode(...kindBytes));

          let sponsored;
          try {
            // Step 1: Get sponsored tx bytes from relay
            sponsored = await sponsorTransaction(kindB64, sender);
          } catch (err) {
            if (shouldTripRelayHealth(err)) {
              relayHealthy.current = false;
              throw new Error(
                `Sponsored execution unavailable: ${extractErrorDetail(err)}`,
              );
            }

            throw new Error(`Relay sponsor failed: ${extractErrorDetail(err)}`);
          }

          let signed;
          try {
            // Step 2: Rehydrate the sponsored bytes into a Transaction before signing.
            // Wallet bridges such as Slush/Web Wallet forward transaction.toJSON() through
            // a popup channel, and the structured Transaction form is more widely compatible
            // there than a raw base64 BCS string.
            signed = await dappKit.signTransaction({
              transaction: Transaction.from(sponsored.txBytes),
            });
          } catch (err) {
            if (isWalletApprovalCancelled(err)) {
              throw new Error("Wallet approval was cancelled.");
            }
            throw new Error(`Wallet signing failed: ${extractErrorDetail(err)}`);
          }

          try {
            // Step 3: Send the exact wallet-signed bytes back to the relay for co-signing and execution
            const result = await executeRelay(signed.bytes, signed.signature, sponsored.gasCoinId);
            return {
              digest: result.digest,
              effects: result.effects,
              events: result.events,
            };
          } catch (err) {
            if (shouldTripRelayHealth(err)) {
              relayHealthy.current = false;
              throw new Error(
                `Sponsored execution unavailable: ${extractErrorDetail(err)}`,
              );
            }

            throw new Error(`Relay execute failed: ${extractErrorDetail(err)}`);
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
