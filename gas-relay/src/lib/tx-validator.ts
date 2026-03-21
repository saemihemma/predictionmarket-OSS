/**
 * Validate that a transaction only targets the allowed prediction market package.
 * This prevents the relay from being used as a general-purpose gas sponsor.
 *
 * Defense layers:
 * 1. Byte size + gas budget sanity checks
 * 2. Full BCS deserialization of TransactionKind
 * 3. Whitelist: every MoveCall must target PM_PACKAGE_ID
 * 4. Deny: no Publish, no Upgrade, no TransferObjects to non-sender
 * 5. Rate limiting: per-dispute and per-sender limits (Sprint D2)
 */

import { Transaction } from "@mysten/sui/transactions";
import { RateLimiter, extractDisputeRoundId } from "./rate-limiter.js";

const PM_PACKAGE_ID = process.env.PM_PACKAGE_ID ?? "0x0";
const MAX_GAS_BUDGET = parseInt(process.env.MAX_GAS_BUDGET ?? "50000000", 10);

// Rate limiter instance (singleton) — start periodic cleanup to prevent memory growth
const rateLimiter = new RateLimiter({
  disputeRateLimit: parseInt(process.env.DISPUTE_RATE_LIMIT ?? "100", 10),
  senderRateLimit: parseInt(process.env.SENDER_RATE_LIMIT ?? "20", 10),
  windowMs: 3_600_000, // 1 hour
});
rateLimiter.startPeriodicCleanup?.();

// Whitelist of PM modules that can be called via sponsored relay.
// pm_admin is intentionally EXCLUDED — emergency ops should not be sponsored.
const ALLOWED_MODULES = new Set([
  "pm_trading",
  "pm_resolution",
  "pm_dispute",
  "pm_staking",    // Staking: stake, initiate_unstake, complete_unstake (NOT emergency_unstake)
  "pm_sdvm",       // SDVM voting: commit_vote, reveal_vote, explicit_abstain
]);

/**
 * SPONSORED FUNCTIONS PER MODULE (gas relay covers costs):
 *
 * pm_trading:
 *   - create_market
 *   - place_bid
 *   - place_ask
 *   - cancel_bid / cancel_ask
 *
 * pm_resolution:
 *   - resolve_market (automated resolution)
 *
 * pm_dispute:
 *   - file_dispute
 *   - (dispute voting is now handled by pm_sdvm)
 *
 * pm_staking:
 *   - stake: User stakes SUFFER to become a voter
 *   - initiate_unstake: User initiates unstake cooldown (begins 48h countdown)
 *   - complete_unstake: User completes unstake after cooldown expires
 *   NOT SPONSORED: emergency_unstake (5% penalty) — user pays own gas for emergency operations
 *   NOT SPONSORED: admin functions — admin pays own gas for privileged operations
 *
 * pm_sdvm:
 *   - commit_vote: User commits vote hash + salt (vote is locked in)
 *   - reveal_vote: User reveals vote outcome + salt (hash verified, vote tallied)
 *   - explicit_abstain: User explicitly abstains (no slash, no reward, counts toward GAT)
 *   NOT SPONSORED: advance_to_reveal_phase (permissionless, called by bot/community)
 *   NOT SPONSORED: tally_votes (permissionless, caller earns 0.1% of slash pool)
 *   NOT SPONSORED: admin functions — admin pays own gas for emergency actions
 *
 * RATIONALE:
 * - Voting (pm_sdvm) is user-initiated and time-sensitive, justified for sponsorship
 * - Staking base operations (stake, unstake) are user-initiated participation, justified
 * - Phase transitions (advance_to_reveal, tally) are incentivized (bot earns rewards)
 *   and permissionless, so they should not be subsidized by relay
 * - Emergency operations and admin functions should never be subsidized
 */

/**
 * Per-dispute and per-market rate limiting:
 *
 * Per-dispute rate limiting is implemented in Layer 5 below (checkRateLimit on dispute_round_id).
 * Per-sender rate limiting also implemented (20 calls/hour per address).
 *
 * Per-MARKET limiting is deferred: at testnet scale, per-dispute limits (100/hour) combined with
 * per-sender limits (20/hour) provide sufficient protection. A single market at 500+ disputes/hour
 * would trigger the need for market-level quotas. Revisit if production shows market saturation.
 */

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validate transaction bytes before sponsoring.
 * Performs full deserialization, package whitelist check, and rate limiting.
 *
 * @param txKindBytes - Serialized transaction kind bytes
 * @param sender - Sui address of transaction sender
 * @param gasBudget - Optional gas budget (for sanity check)
 * @returns ValidationResult with valid flag and optional reason for rejection
 */
export async function validateTransactionRequest(
  txKindBytes: string,
  sender: string,
  gasBudget?: number,
): Promise<ValidationResult> {
  // ── Layer 1: Sanity checks ──
  if (gasBudget && gasBudget > MAX_GAS_BUDGET) {
    return { valid: false, reason: `Gas budget ${gasBudget} exceeds maximum ${MAX_GAS_BUDGET}` };
  }

  if (!txKindBytes || txKindBytes.length < 10) {
    return { valid: false, reason: "Transaction bytes missing or too short" };
  }

  if (txKindBytes.length > 100_000) {
    return { valid: false, reason: "Transaction bytes too large" };
  }

  // ── Layer 2: Deserialize and inspect ──
  let tx: Transaction;
  let txData: Record<string, unknown>;

  try {
    tx = Transaction.fromKind(txKindBytes);
    // Build with a dummy sender to get the transaction data we can inspect
    // We use getData() to inspect the commands without building
    txData = tx.getData();

    if (!txData.commands || txData.commands.length === 0) {
      return { valid: false, reason: "Transaction has no commands" };
    }

    if (txData.commands.length > 10) {
      return { valid: false, reason: `Too many commands (${txData.commands.length}). Max 10.` };
    }
  } catch (err) {
    return {
      valid: false,
      reason: `Failed to deserialize transaction: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // ── Layer 3: Whitelist MoveCall targets and extract dispute_round_id ──
  let disputeRoundId: string | undefined;

  for (const command of txData.commands) {
    if (command.$kind === "MoveCall" || command.MoveCall) {
      const moveCall = command.MoveCall ?? command;
      const target = moveCall.package ?? moveCall.target?.split("::")[0];
      const module = moveCall.module ?? moveCall.target?.split("::")[1];

      // Normalize package ID (strip leading zeros after 0x)
      const normalizeAddr = (addr: string) =>
        "0x" + addr.replace(/^0x/, "").replace(/^0+/, "");

      if (!target || normalizeAddr(target) !== normalizeAddr(PM_PACKAGE_ID)) {
        return {
          valid: false,
          reason: `MoveCall targets package ${target}, not allowed. Only ${PM_PACKAGE_ID} is permitted.`,
        };
      }

      if (!module || module.trim() === "") {
        return {
          valid: false,
          reason: "MoveCall has missing or empty module name",
        };
      }
      if (!ALLOWED_MODULES.has(module)) {
        return {
          valid: false,
          reason: `MoveCall targets module ${module}, not allowed. Allowed: ${[...ALLOWED_MODULES].join(", ")}`,
        };
      }

      // Try to extract dispute_round_id from pm_sdvm voting calls
      if (module === "pm_sdvm" && !disputeRoundId) {
        disputeRoundId = extractDisputeRoundId(txData, PM_PACKAGE_ID);
      }
    }

    // ── Layer 4: Deny dangerous command types ──
    else if (command.$kind === "Publish" || command.Publish) {
      return { valid: false, reason: "Publish commands not allowed" };
    } else if (command.$kind === "Upgrade" || command.Upgrade) {
      return { valid: false, reason: "Upgrade commands not allowed" };
    } else if (command.$kind === "TransferObjects" || command.TransferObjects) {
      return { valid: false, reason: "TransferObjects commands not allowed in sponsored tx" };
    } else if (command.$kind === "MakeMoveVec" || command.MakeMoveVec) {
      // MakeMoveVec is ok — used in PTB composition
    } else if (command.$kind === "SplitCoins" || command.SplitCoins) {
      return { valid: false, reason: "SplitCoins commands not allowed in sponsored tx" };
    } else if (command.$kind === "MergeCoins" || command.MergeCoins) {
      return { valid: false, reason: "MergeCoins commands not allowed in sponsored tx" };
    }
    // Allow: MoveCall (checked above), MakeMoveVec
  }

  // ── Layer 5: Rate limiting ──
  // If this is a vote transaction, check per-dispute and per-sender limits
  if (disputeRoundId) {
    if (!rateLimiter.checkRateLimit(disputeRoundId, sender)) {
      const disputeCount = rateLimiter.getDisputeCount(disputeRoundId);
      const senderCount = rateLimiter.getSenderCount(sender);
      const stats = rateLimiter.getStats();

      return {
        valid: false,
        reason:
          `Rate limit exceeded: dispute_round_id=${disputeRoundId} has ${disputeCount} calls ` +
          `(limit: 100/hr), sender=${sender} has ${senderCount} calls (limit: 20/hr). ` +
          `Active disputes: ${stats.activDisputeBuckets}, active senders: ${stats.activeSenderBuckets}`,
      };
    }

    // Record the successful rate limit check
    rateLimiter.recordRequest(disputeRoundId, sender);
  } else {
    // Non-vote transaction (e.g., pm_staking::stake) — only check sender limit
    if (!rateLimiter.checkRateLimit("_global", sender)) {
      const senderCount = rateLimiter.getSenderCount(sender);
      return {
        valid: false,
        reason:
          `Rate limit exceeded: sender=${sender} has ${senderCount} calls (limit: 20/hr)`,
      };
    }
    rateLimiter.recordRequest("_global", sender);
  }

  return { valid: true };
}

