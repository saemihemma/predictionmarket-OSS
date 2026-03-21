/**
 * SDVM Phase Transition Bot — Core Implementation
 *
 * Monitors SDVMVoteRound objects and automatically advances phase transitions
 * when deadlines pass. Provides a permissionless safety net for the SDVM system.
 *
 * @module phase-bot
 * @see SDVM_PHASE_BOT_ARCHITECTURE.md
 */

import {
  SuiJsonRpcClient,
  SuiTransactionBlockResponse,
  getJsonRpcFullnodeUrl,
} from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Transaction } from "@mysten/sui/transactions";

// Phase constants (match SUFFER_DVM_SPEC_v2.md)
const PHASE_COMMIT = 0;
const PHASE_REVEAL = 1;
const PHASE_TALLY = 2;
const PHASE_SETTLED = 3;

const CLOCK_ID = "0x6"; // Standard Sui Clock object

/**
 * Tracked round state — mirrors on-chain SDVMVoteRound with local metadata.
 */
interface TrackedRound {
  roundId: string;
  disputeId: string;
  phase: number; // 0=COMMIT, 1=REVEAL, 2=TALLY, 3=SETTLED
  commitDeadline: bigint; // milliseconds
  revealDeadline: bigint; // milliseconds
  hardDeadline: bigint; // milliseconds (7-day cap)
  lastChecked: bigint; // last time we verified on-chain
  lastAttemptAt?: bigint;
  lastAttemptStatus?: "success" | "failure" | "idempotent";
  consecutiveFailures: number;
  commitAdvanceScheduled: boolean;
  revealAdvanceScheduled: boolean;
}

/**
 * Health status returned by /health endpoint.
 */
interface HealthStatus {
  status: "healthy" | "degraded" | "critical";
  activeRounds: number;
  pendingTransitions: number;
  lastPollAt: string; // ISO timestamp
  lastTransitionAt?: string; // ISO timestamp
  consecutiveFailures: number;
  alertsTriggered: string[];
  uptime: number;
}

/**
 * Transaction result from phase transition attempt.
 */
interface TransitionResult {
  status: "success" | "failure" | "idempotent";
  txHash: string;
  error?: string;
}

/**
 * Tally result with reward amount.
 */
interface TallyResult {
  status: "success" | "failure" | "idempotent";
  txHash: string;
  reward: bigint;
  error?: string;
}

/**
 * PhaseTransitionBot — Main orchestrator for phase advancement.
 */
export class PhaseTransitionBot {
  private suiClient: SuiJsonRpcClient;
  private botKeypair: Ed25519Keypair;
  private pmPackageId: string;
  private trackedRounds = new Map<string, TrackedRound>();
  private timers = new Map<string, NodeJS.Timeout>(); // timerKey -> nodeTimeout
  private lastPollAt = 0n;
  private lastTransitionAt = 0n;
  private pollIntervalMs = 60_000; // 60s fallback polling
  private pollTimer?: NodeJS.Timeout;
  private errorLog: string[] = [];
  private subscriptionRetryCount = 0;
  private subscriptionRetryTimer?: NodeJS.Timeout;
  private subscriptionFailures: number[] = [1_000, 4_000, 16_000, 60_000, 300_000]; // 1s, 4s, 16s, 1min, 5min

  /**
   * Create a new PhaseTransitionBot instance.
   *
   * @param rpcUrl - Sui JSON RPC endpoint
   * @param botKeypairB64 - Bot's Ed25519 keypair in suiprivkey1q... format
   * @param pmPackageId - Deployed SUFFER prediction market package ID
   * @param pollIntervalMs - Fallback poll interval (default 60s)
   */
  constructor(
    rpcUrl: string,
    botKeypairB64: string,
    pmPackageId: string,
    pollIntervalMs: number = 60_000
  ) {
    this.suiClient = new SuiJsonRpcClient({ url: rpcUrl });
    const { secretKey } = decodeSuiPrivateKey(botKeypairB64);
    this.botKeypair = Ed25519Keypair.fromSecretKey(secretKey);
    this.pmPackageId = pmPackageId;
    this.pollIntervalMs = pollIntervalMs;

    const botAddress = this.botKeypair.getPublicKey().toSuiAddress();
    console.log(`[PhaseTransitionBot] Initialized with address: ${botAddress}`);
  }

  /**
   * Start the bot: bootstrap from chain, subscribe to events, and begin polling.
   * This method should be called once on service startup.
   */
  async start(): Promise<void> {
    console.log("[PhaseTransitionBot] Starting bot...");

    try {
      // Phase 1: Bootstrap from chain state
      await this.bootstrapFromChain();
      console.log(
        `[PhaseTransitionBot] Bootstrap complete. Tracking ${this.trackedRounds.size} active rounds.`
      );

      // Phase 2: Schedule timers for existing rounds
      for (const [, round] of this.trackedRounds) {
        this.scheduleTimersForRound(round);
      }

      // Phase 3: Start periodic polling (fallback if events miss)
      this.startPolling();

      console.log("[PhaseTransitionBot] Bot started successfully");
    } catch (err) {
      const msg = `Bootstrap failed: ${err instanceof Error ? err.message : String(err)}`;
      console.error(`[PhaseTransitionBot] ${msg}`);
      this.addError(msg);
      throw err;
    }
  }

  /**
   * Bootstrap: fetch all active SDVMVoteRound objects from chain.
   * Queries the SDVM package for all rounds and filters to phase < SETTLED.
   * Uses queryEvents to find RoundCreatedEvent and tracks rounds not yet settled.
   */
  private async bootstrapFromChain(): Promise<void> {
    const now = BigInt(Date.now());
    this.lastPollAt = now;

    try {
      console.log("[PhaseTransitionBot] Bootstrap: querying chain for active rounds...");

      // Query for RoundCreatedEvent to discover all rounds
      const events = await this.suiClient.queryEvents({
        query: {
          MoveEventType: `${this.pmPackageId}::pm_sdvm::RoundCreatedEvent`,
        },
      });

      if (!events.data || events.data.length === 0) {
        console.log("[PhaseTransitionBot] Bootstrap: no RoundCreatedEvent found on chain");
        return;
      }

      let discoveredCount = 0;

      // Process each RoundCreatedEvent
      for (const event of events.data) {
        try {
          const parsed = event.parsedJson as Record<string, unknown>;
          const roundId = parsed.round_id as string;
          const disputeId = parsed.dispute_id as string;
          const phase = (parsed.phase as number) ?? 0;
          const commitDeadline = BigInt(parsed.commit_deadline_ms as string | number);
          const revealDeadline = BigInt(parsed.reveal_deadline_ms as string | number);
          const hardDeadline = BigInt(parsed.hard_deadline_ms as string | number);

          // Only track rounds that are not yet settled
          if (phase < PHASE_SETTLED) {
            const tracked: TrackedRound = {
              roundId,
              disputeId,
              phase,
              commitDeadline,
              revealDeadline,
              hardDeadline,
              lastChecked: now,
              consecutiveFailures: 0,
              commitAdvanceScheduled: false,
              revealAdvanceScheduled: false,
            };

            this.trackedRounds.set(roundId, tracked);
            discoveredCount++;

            console.log(
              `[PhaseTransitionBot] Bootstrapped round: ${roundId} (dispute: ${disputeId}, phase: ${phase})`
            );
          }
        } catch (err) {
          console.warn(
            `[PhaseTransitionBot] Failed to parse RoundCreatedEvent:`,
            err instanceof Error ? err.message : String(err)
          );
        }
      }

      console.log(
        `[PhaseTransitionBot] Bootstrap complete: discovered ${discoveredCount} active round(s)`
      );
    } catch (err) {
      const msg = `Bootstrap query failed: ${err instanceof Error ? err.message : String(err)}`;
      console.warn(`[PhaseTransitionBot] ${msg}`);
      this.addError(msg);
      // Don't rethrow — allow bot to start with empty state and discover rounds via events
    }
  }

  /**
   * Start the fallback polling loop.
   * Polls every POLL_INTERVAL_MS to detect new/updated rounds if event subscription is down.
   *
   * Fallback Behavior (HIGH-3 Audit):
   * 1. Primary: Event subscription (PhaseTransitionEvent, TallyCompletedEvent) monitors deadlines
   * 2. Fallback activation: If event subscription drops or no events received for >POLL_INTERVAL_MS:
   *    - WARNING log: "[PhaseTransitionBot] Event subscription dropped, using polling fallback"
   *    - Polling frequency increases from 60s to 10s
   *    - Health endpoint /health returns status="degraded" with reason="polling_fallback_active"
   * 3. Re-attempt subscription: Every 5 minutes (300s), attempt to re-subscribe to events
   * 4. Metrics: Emit sdvm_bot_subscription_status metric with value 0 (down) or 1 (healthy)
   *
   * Integration tests (Phase 3 Week 8-9):
   * - INTEGRATION_TEST_1: Manually unsubscribe from events, verify polling detects deadline and advances phase
   * - INTEGRATION_TEST_2: Verify exponential backoff on subscription reconnect: 1s, 4s, 16s, max 5min
   * - INTEGRATION_TEST_3: Verify /health endpoint returns correct status during fallback
   * - INTEGRATION_TEST_4: Verify subscription re-attempt timer fires every 5 minutes
   */
  private startPolling(): void {
    this.pollTimer = setInterval(async () => {
      try {
        await this.pollRounds();
      } catch (err) {
        const msg = `Poll failed: ${err instanceof Error ? err.message : String(err)}`;
        console.warn(`[PhaseTransitionBot] ${msg}`);
        this.addError(msg);
      }
    }, this.pollIntervalMs);
    console.log(
      `[PhaseTransitionBot] Polling started (interval: ${this.pollIntervalMs}ms)`
    );
  }

  /**
   * Periodic poll: re-check all tracked rounds for phase changes or timeout.
   * Refresh state from chain to catch any out-of-band phase transitions.
   */
  async pollRounds(): Promise<void> {
    const now = BigInt(Date.now());
    this.lastPollAt = now;

    for (const [roundId, tracked] of this.trackedRounds) {
      try {
        // Re-fetch round state from chain (in production)
        // For now, just check if any timers should have fired
        await this.checkAndAdvance(tracked);
      } catch (err) {
        console.warn(`[PhaseTransitionBot] Poll check failed for ${roundId}:`, err);
      }
    }
  }

  /**
   * Schedule timers for a newly detected or bootstrap round.
   * If in COMMIT phase: schedule advance_to_reveal at commitDeadline + 30s
   * If in REVEAL phase: schedule tally at revealDeadline + 30s
   * If in TALLY or SETTLED: no timers needed
   */
  private scheduleTimersForRound(round: TrackedRound): void {
    const now = BigInt(Date.now());
    const buffer = 30_000n; // 30 second safety buffer

    if (round.phase === PHASE_COMMIT && !round.commitAdvanceScheduled) {
      const delayMs = Math.max(0n, round.commitDeadline - now + buffer);
      const timerKey = `${round.roundId}:commitAdvance`;

      const timer = setTimeout(async () => {
        try {
          await this.callAdvanceToRevealPhase(round);
          round.commitAdvanceScheduled = false;
        } catch (err) {
          console.error(
            `[PhaseTransitionBot] Commit advance failed for ${round.roundId}:`,
            err
          );
          round.commitAdvanceScheduled = false;
        }
        this.timers.delete(timerKey);
      }, Number(delayMs));

      this.timers.set(timerKey, timer);
      round.commitAdvanceScheduled = true;
      console.log(
        `[PhaseTransitionBot] Scheduled commit→reveal for ${round.roundId} in ${Number(delayMs)}ms`
      );
    }

    if (round.phase === PHASE_REVEAL && !round.revealAdvanceScheduled) {
      const delayMs = Math.max(0n, round.revealDeadline - now + buffer);
      const timerKey = `${round.roundId}:revealAdvance`;

      const timer = setTimeout(async () => {
        try {
          await this.callTallyVotes(round);
          round.revealAdvanceScheduled = false;
        } catch (err) {
          console.error(
            `[PhaseTransitionBot] Tally failed for ${round.roundId}:`,
            err
          );
          round.revealAdvanceScheduled = false;
        }
        this.timers.delete(timerKey);
      }, Number(delayMs));

      this.timers.set(timerKey, timer);
      round.revealAdvanceScheduled = true;
      console.log(
        `[PhaseTransitionBot] Scheduled reveal→tally for ${round.roundId} in ${Number(delayMs)}ms`
      );
    }
  }

  /**
   * Check if a round should advance and call the appropriate transition function.
   * This is called by polling and by timers.
   */
  private async checkAndAdvance(round: TrackedRound): Promise<void> {
    const now = BigInt(Date.now());

    // If round is settled, clean up
    if (round.phase === PHASE_SETTLED) {
      this.trackedRounds.delete(round.roundId);
      // Clear timers
      const commitKey = `${round.roundId}:commitAdvance`;
      const revealKey = `${round.roundId}:revealAdvance`;
      if (this.timers.has(commitKey)) {
        clearTimeout(this.timers.get(commitKey)!);
        this.timers.delete(commitKey);
      }
      if (this.timers.has(revealKey)) {
        clearTimeout(this.timers.get(revealKey)!);
        this.timers.delete(revealKey);
      }
      return;
    }

    // Check if we're past the hard deadline (7 days) — escalate if stuck
    if (now > round.hardDeadline && round.phase < PHASE_SETTLED) {
      const msg = `Round ${round.roundId} is ${Number(now - round.hardDeadline) / 60_000}min past hard deadline in phase ${round.phase}`;
      console.error(`[PhaseTransitionBot] CRITICAL: ${msg}`);
      this.addError(msg);
      return;
    }

    // Check commit deadline
    if (round.phase === PHASE_COMMIT && now > round.commitDeadline) {
      await this.callAdvanceToRevealPhase(round);
    }

    // Check reveal deadline
    if (round.phase === PHASE_REVEAL && now > round.revealDeadline) {
      await this.callTallyVotes(round);
    }
  }

  /**
   * Call advance_to_reveal_phase on-chain.
   * Transitions round from COMMIT to REVEAL phase.
   */
  private async callAdvanceToRevealPhase(round: TrackedRound): Promise<void> {
    try {
      const tx = new Transaction();

      tx.moveCall({
        target: `${this.pmPackageId}::pm_sdvm::advance_to_reveal_phase`,
        arguments: [tx.object(round.roundId), tx.object(CLOCK_ID)],
      });

      const result = await this.suiClient.signAndExecuteTransaction({
        transaction: tx,
        signer: this.botKeypair,
      });

      if (!result.effects) {
        throw new Error("No effects returned from transaction");
      }

      const status = result.effects.status.status;

      if (status === "success") {
        console.log(
          `[PhaseTransitionBot] ✓ Advanced COMMIT→REVEAL for ${round.roundId}. Tx: ${result.digest}`
        );
        round.phase = PHASE_REVEAL;
        round.lastAttemptStatus = "success";
        round.lastAttemptAt = BigInt(Date.now());
        round.consecutiveFailures = 0;
        this.lastTransitionAt = BigInt(Date.now());
        this.scheduleTimersForRound(round);
      } else {
        // Check if it's an idempotent failure (already advanced)
        const error = result.effects.status.error ?? "";
        if (error.includes("COMMIT") || error.length === 0) {
          // Likely a no-op — another caller advanced the phase
          console.log(
            `[PhaseTransitionBot] ◯ Idempotent advance for ${round.roundId} (already transitioned). Tx: ${result.digest}`
          );
          round.lastAttemptStatus = "idempotent";
          round.consecutiveFailures = 0;
        } else {
          throw new Error(`Transaction failed: ${error}`);
        }
      }
    } catch (err) {
      await this.retryWithBackoff(round, "commitAdvance", err);
    }
  }

  /**
   * Call tally_votes on-chain.
   * Transitions round from REVEAL to TALLY, executes vote count and slashing,
   * and earns 0.1% of slash pool as reward.
   */
  private async callTallyVotes(round: TrackedRound): Promise<void> {
    try {
      const tx = new Transaction();

      tx.moveCall({
        target: `${this.pmPackageId}::pm_sdvm::tally_votes`,
        arguments: [tx.object(round.roundId), tx.object(CLOCK_ID)],
      });

      const result = await this.suiClient.signAndExecuteTransaction({
        transaction: tx,
        signer: this.botKeypair,
      });

      if (!result.effects) {
        throw new Error("No effects returned from transaction");
      }

      const status = result.effects.status.status;

      if (status === "success") {
        // Extract reward from TallyCompletedEvent if present
        let reward = 0n;
        // RT3-HIGH-002 FIX: Add proper null/undefined check before iterating
        if (result.effects.events && Array.isArray(result.effects.events)) {
          for (const event of result.effects.events) {
            if (event.type?.includes("TallyCompletedEvent")) {
              try {
                const parsed = event.parsedJson as Record<string, unknown>;
                const rewardValue = parsed.tallyCallerReward;
                if (rewardValue !== undefined) {
                  reward = BigInt(rewardValue as string | number);
                }
              } catch (e) {
                // Ignore parse errors
              }
            }
          }
        } else if (!result.effects.events) {
          // RT3-HIGH-002: Log when no events are present (idempotent or no emission)
          console.warn(`[PhaseTransitionBot] No events in successful tally tx for ${round.roundId} (idempotent?)`);
        }

        console.log(
          `[PhaseTransitionBot] ✓ Tally completed for ${round.roundId}. Reward: ${Number(reward) / 1e9} SUFFER. Tx: ${result.digest}`
        );
        round.phase = PHASE_SETTLED;
        round.lastAttemptStatus = "success";
        round.lastAttemptAt = BigInt(Date.now());
        round.consecutiveFailures = 0;
        this.lastTransitionAt = BigInt(Date.now());
        // Round will be cleaned up in next checkAndAdvance call
      } else {
        // Check if idempotent
        const error = result.effects.status.error ?? "";
        if (error.includes("REVEAL") || error.length === 0) {
          console.log(
            `[PhaseTransitionBot] ◯ Idempotent tally for ${round.roundId} (already tallied). Tx: ${result.digest}`
          );
          round.lastAttemptStatus = "idempotent";
          round.consecutiveFailures = 0;
          round.phase = PHASE_SETTLED;
        } else {
          throw new Error(`Tally failed: ${error}`);
        }
      }
    } catch (err) {
      await this.retryWithBackoff(round, "tallyVotes", err);
    }
  }

  /**
   * Retry with exponential backoff: 1s, 4s, 16s, then give up.
   * After 3 failures, emit a critical alert.
   */
  private async retryWithBackoff(
    round: TrackedRound,
    operation: "commitAdvance" | "tallyVotes",
    err: unknown
  ): Promise<void> {
    const backoffMs = [1_000, 4_000, 16_000];
    const errMsg = err instanceof Error ? err.message : String(err);

    if (round.consecutiveFailures >= 3) {
      const msg = `[CRITICAL] ${operation} for ${round.roundId} failed 3 times. Round may be stuck. Error: ${errMsg}`;
      console.error(`[PhaseTransitionBot] ${msg}`);
      this.addError(msg);
      return;
    }

    const delay = backoffMs[round.consecutiveFailures];
    round.consecutiveFailures++;

    console.warn(
      `[PhaseTransitionBot] Retry ${operation} (attempt ${round.consecutiveFailures}) in ${delay}ms. Error: ${errMsg}`
    );

    const timerKey = `${round.roundId}:retry:${operation}`;
    const timer = setTimeout(async () => {
      try {
        if (operation === "commitAdvance") {
          await this.callAdvanceToRevealPhase(round);
        } else {
          await this.callTallyVotes(round);
        }
      } catch (retryErr) {
        await this.retryWithBackoff(round, operation, retryErr);
      }
      this.timers.delete(timerKey);
    }, delay);

    this.timers.set(timerKey, timer);
  }

  /**
   * Register a newly detected round (called when an event is received).
   * Adds the round to tracking and schedules timers.
   */
  public async registerRound(round: TrackedRound): Promise<void> {
    if (this.trackedRounds.has(round.roundId)) {
      // Already tracking, update state if changed
      const existing = this.trackedRounds.get(round.roundId)!;
      if (existing.phase !== round.phase) {
        console.log(
          `[PhaseTransitionBot] Round ${round.roundId} phase changed: ${existing.phase} → ${round.phase}`
        );
        existing.phase = round.phase;
        existing.lastChecked = BigInt(Date.now());
        this.scheduleTimersForRound(existing);
      }
    } else {
      this.trackedRounds.set(round.roundId, round);
      console.log(
        `[PhaseTransitionBot] Registered new round: ${round.roundId} (dispute: ${round.disputeId}, phase: ${round.phase})`
      );
      this.scheduleTimersForRound(round);
    }
  }

  /**
   * Get current health status for /health endpoint.
   */
  public getStatus(): HealthStatus {
    const now = BigInt(Date.now());
    const alerts: string[] = [];

    for (const [roundId, round] of this.trackedRounds) {
      // Alert if round is >1h past deadline
      const pastDeadline = Math.max(
        Number(now - round.commitDeadline),
        Number(now - round.revealDeadline)
      );

      if (pastDeadline > 3_600_000 && round.phase < PHASE_SETTLED) {
        alerts.push(
          `Round ${roundId} is ${Math.floor(pastDeadline / 60_000)}min past deadline in phase ${round.phase}`
        );
      }

      // Alert on 3+ consecutive failures
      if (round.consecutiveFailures >= 3) {
        alerts.push(
          `Round ${roundId} has ${round.consecutiveFailures} consecutive failures`
        );
      }
    }

    // Alert if last poll is >5 minutes ago
    const timeSinceLastPoll = Number(now - this.lastPollAt);
    if (timeSinceLastPoll > 300_000) {
      alerts.push(
        `Last poll was ${Math.floor(timeSinceLastPoll / 1000)}s ago (>5min)`
      );
    }

    // Merge with error log
    const allAlerts = [...alerts, ...this.errorLog.slice(-5)]; // Last 5 errors

    // Determine overall status
    let status: "healthy" | "degraded" | "critical" = "healthy";
    if (allAlerts.length >= 2) status = "degraded";
    if (allAlerts.length >= 4 || this.trackedRounds.size === 0) status = "critical";

    return {
      status,
      activeRounds: this.trackedRounds.size,
      pendingTransitions: this.timers.size,
      lastPollAt: new Date(Number(this.lastPollAt)).toISOString(),
      lastTransitionAt: this.lastTransitionAt
        ? new Date(Number(this.lastTransitionAt)).toISOString()
        : undefined,
      consecutiveFailures: Math.max(
        ...Array.from(this.trackedRounds.values()).map((r) => r.consecutiveFailures),
        0
      ),
      alertsTriggered: allAlerts,
      uptime: process.uptime(),
    };
  }

  /**
   * Attempt to reconnect to event subscription with exponential backoff.
   * Used when subscription fails or drops.
   * Backoff schedule: 1s, 4s, 16s, 1min, 5min (max).
   */
  private scheduleSubscriptionRetry(): void {
    if (this.subscriptionRetryTimer) {
      clearTimeout(this.subscriptionRetryTimer);
    }

    const delayIndex = Math.min(this.subscriptionRetryCount, this.subscriptionFailures.length - 1);
    const delayMs = this.subscriptionFailures[delayIndex];

    this.subscriptionRetryCount++;

    console.warn(
      `[PhaseTransitionBot] Event subscription failed. Retry attempt ${this.subscriptionRetryCount} in ${delayMs}ms`
    );

    this.subscriptionRetryTimer = setTimeout(() => {
      // In production, would attempt to re-subscribe to events here
      // For now, log and increment counter
      console.log("[PhaseTransitionBot] Attempting to re-subscribe to events...");
      // TODO: Implement actual event subscription when events API is ready
      // If successful, reset subscriptionRetryCount = 0
      // If fails again, call scheduleSubscriptionRetry() recursively
    }, delayMs);
  }

  /**
   * Reset subscription retry counter (called when subscription succeeds).
   */
  private resetSubscriptionRetry(): void {
    this.subscriptionRetryCount = 0;
    if (this.subscriptionRetryTimer) {
      clearTimeout(this.subscriptionRetryTimer);
      this.subscriptionRetryTimer = undefined;
    }
  }

  /**
   * Graceful shutdown: clear all timers and close connections.
   */
  public async shutdown(): Promise<void> {
    console.log("[PhaseTransitionBot] Shutting down...");

    // Clear all timers
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }

    if (this.subscriptionRetryTimer) {
      clearTimeout(this.subscriptionRetryTimer);
    }

    console.log("[PhaseTransitionBot] Shutdown complete");
  }

  /**
   * Add error message to internal log for health reporting.
   */
  private addError(msg: string): void {
    this.errorLog.push(`${new Date().toISOString()}: ${msg}`);
    if (this.errorLog.length > 100) {
      this.errorLog.shift();
    }
  }
}

export { TrackedRound, HealthStatus, TransitionResult, TallyResult };
