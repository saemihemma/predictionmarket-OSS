import { type Request, type Response } from "express";
import { Transaction } from "@mysten/sui/transactions";
import { suiClient, getSponsorKeypair, getSponsorAddress } from "../lib/sui-client.js";
import { validateTransactionRequest } from "../lib/tx-validator.js";
import { leaseCoin, returnCoin, hasActiveLease, refreshCoinVersionFromChain } from "../lib/coin-pool.js";
import { getFrontierEligibility } from "../lib/frontier-eligibility.js";

/**
 * POST /v1/sponsor
 *
 * Request body:
 * {
 *   txBytes: string,        // Base64-encoded TransactionKind bytes
 *   sender: string,         // User's Sui address
 *   gasBudget?: number,     // Optional gas budget override
 * }
 *
 * Response:
 * {
 *   txBytes: string,        // Base64 full transaction bytes with gas sponsor set
 *   sponsorAddress: string,
 *   gasCoinId: string,      // Leased coin ID (client must pass back in /execute)
 * }
 */
export async function sponsorRoute(req: Request, res: Response): Promise<void> {
  let leasedCoinId: string | null = null;

  try {
    const { txBytes, sender, gasBudget } = req.body as {
      txBytes?: string;
      sender?: string;
      gasBudget?: number;
    };

    if (!txBytes || !sender) {
      res.status(400).json({ error: "Missing txBytes or sender" });
      return;
    }

    // B-2: Per-sender concurrency limit — max 1 active lease per address
    if (hasActiveLease(sender)) {
      res.status(429).json({
        error: "You already have a pending sponsored transaction. Wait for it to complete.",
      });
      return;
    }

    // B-1: Full transaction validation — deserialize + package whitelist
    const validation = await validateTransactionRequest(txBytes, sender, gasBudget);
    if (!validation.valid) {
      res.status(400).json({ error: validation.reason });
      return;
    }
    if (validation.faucetClaim) {
      const eligibility = await getFrontierEligibility(sender);
      if (eligibility.status === "no_character") {
        res.status(403).json({
          error: "Frontier character required",
          code: "frontier_character_required",
          reason: eligibility.reason,
        });
        return;
      }

      if (eligibility.status === "unavailable") {
        res.status(503).json({
          error: "Frontier eligibility unavailable",
          code: "eligibility_unavailable",
          reason: eligibility.reason,
        });
        return;
      }
    }

    const sponsorAddress = getSponsorAddress();

    // Lease a gas coin from the pool (waits if all in use)
    const gasCoin = await leaseCoin(sender);
    leasedCoinId = gasCoin.objectId;

    // Build sponsored transaction
    const tx = Transaction.fromKind(txBytes);
    tx.setSender(sender);
    tx.setGasOwner(sponsorAddress);

    if (gasBudget) {
      tx.setGasBudget(gasBudget);
    }

    tx.setGasPayment([gasCoin]);

    const builtBytes = await tx.build({ client: suiClient });

    res.json({
      txBytes: Buffer.from(builtBytes).toString("base64"),
      sponsorAddress,
      gasCoinId: leasedCoinId,
    });

    // Note: coin stays leased until /execute returns it
  } catch (err) {
    // Return coin on error
    if (leasedCoinId) returnCoin(leasedCoinId);

    console.error("[gas-relay] sponsor error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Internal sponsor error",
    });
  }
}

/**
 * POST /v1/execute
 *
 * Request body:
 * {
 *   txBytes: string,          // Base64 full tx bytes (from /sponsor)
 *   userSignature: string,    // User's signature (base64)
 *   gasCoinId: string,        // Leased coin ID (from /sponsor response)
 * }
 *
 * The relay co-signs and submits. Always returns the leased coin to the pool.
 */
export async function executeRoute(req: Request, res: Response): Promise<void> {
  const { txBytes, userSignature, gasCoinId } = req.body as {
    txBytes?: string;
    userSignature?: string;
    gasCoinId?: string;
  };

  try {
    if (!txBytes || !userSignature) {
      res.status(400).json({ error: "Missing txBytes or userSignature" });
      return;
    }

    if (!gasCoinId) {
      res.status(400).json({ error: "Missing gasCoinId" });
      return;
    }

    const sponsorKeypair = getSponsorKeypair();
    const txBytesArray = Buffer.from(txBytes, "base64");

    // Sponsor signs the same transaction bytes
    const sponsorSignature = (
      await sponsorKeypair.signTransaction(txBytesArray)
    ).signature;

    // Execute with both signatures
    const result = await suiClient.executeTransactionBlock({
      transactionBlock: txBytes,
      signature: [userSignature, sponsorSignature],
      options: {
        showEffects: true,
        showEvents: true,
      },
    });

    res.json({
      digest: result.digest,
      effects: result.effects,
      events: result.events,
    });
  } catch (err) {
    console.error("[gas-relay] execute error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Internal execution error",
    });
  } finally {
    // ALWAYS return the leased coin, success or failure
    if (gasCoinId) {
      try {
        await refreshCoinVersionFromChain(gasCoinId);
      } catch (err) {
        console.warn(`[gas-relay] failed to refresh gas coin ${gasCoinId}:`, err);
      }
      returnCoin(gasCoinId);
    }
  }
}

export async function faucetEligibilityRoute(req: Request, res: Response): Promise<void> {
  const sender = typeof req.query.sender === "string" ? req.query.sender : "";
  if (!sender.trim()) {
    res.status(400).json({ error: "Missing sender" });
    return;
  }

  const eligibility = await getFrontierEligibility(sender);
  res.json(eligibility);
}
