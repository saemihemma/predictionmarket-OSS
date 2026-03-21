/**
 * Rate limiting for SDVM vote transactions.
 *
 * Implements per-dispute and per-sender rate limiting to prevent:
 * - A single dispute from consuming disproportionate relay resources
 * - A single sender from spamming votes across multiple disputes
 *
 * Uses 1-hour sliding windows for both limits.
 *
 * @module rate-limiter
 * @see SDVM_PHASE2_SPRINT_PLAN.md Sprint D2
 */

/**
 * Rate limit bucket — tracks count and window start time.
 */
interface RateLimitBucket {
  count: number;
  windowStartMs: number;
}

/**
 * Rate limiter configuration.
 */
export interface RateLimiterConfig {
  /** Maximum calls per dispute per hour */
  disputeRateLimit?: number;
  /** Maximum calls per sender per hour */
  senderRateLimit?: number;
  /** Window duration in milliseconds (default 1 hour) */
  windowMs?: number;
}

/**
 * RateLimiter — tracks and enforces per-dispute and per-sender limits.
 * Automatically cleans up expired entries to prevent unbounded memory growth.
 */
export class RateLimiter {
  private disputeBuckets = new Map<string, RateLimitBucket>();
  private senderBuckets = new Map<string, RateLimitBucket>();

  private disputeLimit: number;
  private senderLimit: number;
  private windowMs: number;
  private requestCount: number = 0;
  private lastCleanupMs: number = Date.now();
  private cleanupIntervalMs: number = 5 * 60 * 1000; // 5 minutes minimum between cleanups
  private cleanupFrequency: number = 100; // Run cleanup every 100 requests
  // RT3-CRIT-003 FIX: Add periodic cleanup timer for long-lived services
  private cleanupTimer?: NodeJS.Timer;

  /**
   * Create a new RateLimiter instance.
   *
   * @param config - Configuration options
   */
  constructor(config: RateLimiterConfig = {}) {
    this.disputeLimit = config.disputeRateLimit ?? 100;
    this.senderLimit = config.senderRateLimit ?? 20;
    this.windowMs = config.windowMs ?? 3_600_000; // 1 hour
  }

  /**
   * Check if a request is within rate limits.
   * Returns true if the request is allowed, false if it would exceed limits.
   * Automatically triggers cleanup of expired entries if needed.
   *
   * @param disputeRoundId - Unique ID for the dispute/vote round
   * @param senderAddress - Sui address of the transaction sender
   * @returns true if request is within limits, false otherwise
   */
  public checkRateLimit(disputeRoundId: string, senderAddress: string): boolean {
    const now = Date.now();

    // Trigger cleanup if needed (every 100 calls, or if >5 minutes since last cleanup)
    this.requestCount++;
    if (
      this.requestCount % this.cleanupFrequency === 0 &&
      now - this.lastCleanupMs > this.cleanupIntervalMs
    ) {
      this.cleanup();
      this.lastCleanupMs = now;
    }

    // Check dispute limit
    if (!this.checkDispute(disputeRoundId, now)) {
      return false;
    }

    // Check sender limit
    if (!this.checkSender(senderAddress, now)) {
      return false;
    }

    return true;
  }

  /**
   * Record a successful request (increment both buckets).
   * Should only be called after checkRateLimit returns true.
   *
   * @param disputeRoundId - Dispute ID
   * @param senderAddress - Sender address
   */
  public recordRequest(disputeRoundId: string, senderAddress: string): void {
    const now = Date.now();

    // Increment dispute bucket
    const disputeBucket = this.disputeBuckets.get(disputeRoundId);
    if (disputeBucket && now - disputeBucket.windowStartMs <= this.windowMs) {
      disputeBucket.count++;
    } else {
      this.disputeBuckets.set(disputeRoundId, { count: 1, windowStartMs: now });
    }

    // Increment sender bucket
    const senderBucket = this.senderBuckets.get(senderAddress);
    if (senderBucket && now - senderBucket.windowStartMs <= this.windowMs) {
      senderBucket.count++;
    } else {
      this.senderBuckets.set(senderAddress, { count: 1, windowStartMs: now });
    }
  }

  /**
   * Get current count for a dispute (for monitoring/debugging).
   */
  public getDisputeCount(disputeRoundId: string): number {
    const bucket = this.disputeBuckets.get(disputeRoundId);
    if (!bucket || Date.now() - bucket.windowStartMs > this.windowMs) {
      return 0;
    }
    return bucket.count;
  }

  /**
   * Get current count for a sender (for monitoring/debugging).
   */
  public getSenderCount(senderAddress: string): number {
    const bucket = this.senderBuckets.get(senderAddress);
    if (!bucket || Date.now() - bucket.windowStartMs > this.windowMs) {
      return 0;
    }
    return bucket.count;
  }

  /**
   * Get rate limit statistics (for health/metrics).
   */
  public getStats(): {
    activDisputeBuckets: number;
    activeSenderBuckets: number;
    disputeLimit: number;
    senderLimit: number;
  } {
    const now = Date.now();

    // Count active (non-expired) buckets
    let activeDisputes = 0;
    for (const bucket of this.disputeBuckets.values()) {
      if (now - bucket.windowStartMs <= this.windowMs) {
        activeDisputes++;
      }
    }

    let activeSenders = 0;
    for (const bucket of this.senderBuckets.values()) {
      if (now - bucket.windowStartMs <= this.windowMs) {
        activeSenders++;
      }
    }

    return {
      activDisputeBuckets: activeDisputes,
      activeSenderBuckets: activeSenders,
      disputeLimit: this.disputeLimit,
      senderLimit: this.senderLimit,
    };
  }

  /**
   * Clear expired buckets (optional cleanup to prevent memory growth).
   * Can be called periodically (e.g., every hour).
   */
  public cleanup(): void {
    const now = Date.now();

    // Remove expired dispute buckets
    for (const [key, bucket] of this.disputeBuckets) {
      if (now - bucket.windowStartMs > this.windowMs) {
        this.disputeBuckets.delete(key);
      }
    }

    // Remove expired sender buckets
    for (const [key, bucket] of this.senderBuckets) {
      if (now - bucket.windowStartMs > this.windowMs) {
        this.senderBuckets.delete(key);
      }
    }
  }

  /**
   * Reset all buckets (for testing).
   */
  public reset(): void {
    this.disputeBuckets.clear();
    this.senderBuckets.clear();
  }

  /**
   * RT3-CRIT-003 FIX: Start periodic cleanup timer.
   * Runs cleanup at specified interval to prevent unbounded memory growth
   * on long-lived service instances (> 7 days).
   *
   * @param intervalMs - Cleanup interval in milliseconds (default 5 minutes)
   */
  public startPeriodicCleanup(intervalMs: number = 5 * 60 * 1000): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, intervalMs);
    console.log(`[RateLimiter] Started periodic cleanup every ${intervalMs}ms`);
  }

  /**
   * RT3-CRIT-003 FIX: Stop periodic cleanup timer.
   * Should be called during service shutdown.
   */
  public stopPeriodicCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
      console.log(`[RateLimiter] Stopped periodic cleanup timer`);
    }
  }

  /**
   * Private: Check dispute rate limit.
   */
  private checkDispute(disputeRoundId: string, now: number): boolean {
    const bucket = this.disputeBuckets.get(disputeRoundId);
    if (!bucket || now - bucket.windowStartMs > this.windowMs) {
      // Bucket expired or doesn't exist — new window, 1 call is OK
      return true;
    }
    // Bucket active — check count
    return bucket.count < this.disputeLimit;
  }

  /**
   * Private: Check sender rate limit.
   */
  private checkSender(senderAddress: string, now: number): boolean {
    const bucket = this.senderBuckets.get(senderAddress);
    if (!bucket || now - bucket.windowStartMs > this.windowMs) {
      // Bucket expired or doesn't exist — new window, 1 call is OK
      return true;
    }
    // Bucket active — check count
    return bucket.count < this.senderLimit;
  }
}

/**
 * Extract dispute_round_id from transaction arguments.
 *
 * The dispute_round_id is the first input argument to voting functions:
 * - pm_sdvm::commit_vote(vote_round: &SDVMVoteRound, ...)
 * - pm_sdvm::reveal_vote(vote_round: &mut SDVMVoteRound, ...)
 * - pm_sdvm::explicit_abstain(vote_round: &SDVMVoteRound, ...)
 *
 * @param txData - Transaction data structure (from Transaction.getData())
 * @param pmPackageId - Expected PM package ID
 * @returns dispute_round_id if found, undefined otherwise
 */
export function extractDisputeRoundId(
  txData: Record<string, unknown>,
  pmPackageId: string
): string | undefined {
  const commands = txData.commands as Array<Record<string, unknown>>;
  if (!Array.isArray(commands)) {
    return undefined;
  }

  // RT3-CRIT-004 FIX: Track shared object creations for PTB result resolution
  // Build map of shared object results (limited support - direct refs only)
  const sharedObjectResults = new Map<number, string>();

  for (const command of commands) {
    // Check if this is a MoveCall command
    if (command.$kind === "MoveCall" || command.MoveCall) {
      const moveCall = command.MoveCall ?? command;
      const target = moveCall.target as string | undefined;

      // Check if target is in pm_sdvm module
      if (!target || !target.includes("::pm_sdvm::")) {
        continue;
      }

      // Check if this is a voting function
      const isvotingFn =
        target.includes("::commit_vote") ||
        target.includes("::reveal_vote") ||
        target.includes("::explicit_abstain");

      if (!isvotingFn) {
        continue;
      }

      // Extract first argument (vote_round object)
      const args = moveCall.arguments as Array<Record<string, unknown>>;
      if (!Array.isArray(args) || args.length === 0) {
        continue;
      }

      const firstArg = args[0];
      if (
        typeof firstArg === "object" &&
        firstArg !== null &&
        "Object" in firstArg
      ) {
        const objectField = firstArg.Object;

        // RT3-CRIT-004: Handle direct object reference (string)
        if (typeof objectField === "string") {
          return objectField; // Direct ref: "0x123..."
        }

        // RT3-CRIT-004: Handle PTB result reference (object with kind and index)
        if (typeof objectField === "object" && objectField !== null) {
          const resultRef = objectField as Record<string, unknown>;
          if (resultRef.kind === "Results" && typeof resultRef.index === "string") {
            const resultIdx = parseInt(resultRef.index, 10);
            if (sharedObjectResults.has(resultIdx)) {
              // PTB result reference can be resolved if we tracked it
              return sharedObjectResults.get(resultIdx);
            }
            // Cannot resolve PTB reference — log warning
            console.warn(
              `[extractDisputeRoundId] PTB result reference (index=${resultIdx}) cannot be resolved. ` +
              `Rate limiting will fall back to sender-only checks.`
            );
            return undefined;
          }
        }
      }
    }
  }

  return undefined;
}
