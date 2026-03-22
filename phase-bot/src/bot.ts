import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Transaction } from "@mysten/sui/transactions";

const PHASE_COMMIT = 0;
const PHASE_REVEAL = 1;
const PHASE_TALLY = 2;
const PHASE_SETTLED = 3;
const CLOCK_ID = "0x6";
const DEADLINE_BUFFER_MS = 30_000n;

export interface PhaseTransitionBotConfig {
  rpcUrl: string;
  botKeypair: string;
  pmPackageId: string;
  collateralCoinType: string;
  stakingPoolId: string;
  pollIntervalMs?: number;
}

export interface TrackedRound {
  roundId: string;
  disputeId: string;
  roundNumber: number;
  phase: number;
  commitDeadline: bigint;
  revealDeadline: bigint;
  hardDeadline: bigint;
  expedited: boolean;
  lastChecked: bigint;
  lastAttemptAt?: bigint;
  lastAttemptStatus?: "success" | "failure" | "idempotent";
  consecutiveFailures: number;
}

export interface HealthStatus {
  status: "healthy" | "degraded" | "critical";
  activeRounds: number;
  pendingTransitions: number;
  lastPollAt: string;
  lastTransitionAt?: string;
  consecutiveFailures: number;
  alertsTriggered: string[];
  uptime: number;
}

type QueryEventsPage = {
  data?: Array<Record<string, unknown>>;
  nextCursor?: unknown;
  hasNextPage?: boolean;
};

type GetObjectResponse = {
  data?: {
    content?: {
      type?: string;
      fields?: Record<string, unknown>;
    };
  };
};

export class PhaseTransitionBot {
  private readonly suiClient: SuiJsonRpcClient;
  private readonly botKeypair: Ed25519Keypair;
  private readonly pmPackageId: string;
  private readonly collateralCoinType: string;
  private readonly stakingPoolId: string;
  private readonly trackedRounds = new Map<string, TrackedRound>();
  private readonly errorLog: string[] = [];
  private readonly pollIntervalMs: number;
  private createdEventCursor: unknown | undefined;
  private lastPollAt = 0n;
  private lastTransitionAt = 0n;
  private pollTimer?: NodeJS.Timeout;
  private isPolling = false;

  constructor(config: PhaseTransitionBotConfig) {
    this.suiClient = new SuiJsonRpcClient({
      url: config.rpcUrl,
      network: "testnet",
    } as never);
    const { secretKey } = decodeSuiPrivateKey(config.botKeypair);
    this.botKeypair = Ed25519Keypair.fromSecretKey(secretKey);
    this.pmPackageId = config.pmPackageId;
    this.collateralCoinType = config.collateralCoinType;
    this.stakingPoolId = config.stakingPoolId;
    this.pollIntervalMs = config.pollIntervalMs ?? 60_000;

    const botAddress = this.botKeypair.getPublicKey().toSuiAddress();
    console.log(`[phase-bot] initialized with address ${botAddress}`);
  }

  async start(): Promise<void> {
    console.log("[phase-bot] bootstrapping tracked rounds from chain...");
    await this.bootstrapFromChain();
    this.startPolling();
    console.log(`[phase-bot] ready. tracking ${this.trackedRounds.size} active round(s)`);
  }

  async shutdown(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
    console.log("[phase-bot] shutdown complete");
  }

  getStatus(): HealthStatus {
    const now = BigInt(Date.now());
    const alerts: string[] = [];

    if (this.lastPollAt === 0n) {
      alerts.push("No successful poll has completed yet.");
    } else {
      const msSinceLastPoll = Number(now - this.lastPollAt);
      if (msSinceLastPoll > this.pollIntervalMs * 3) {
        alerts.push(`Last poll was ${Math.floor(msSinceLastPoll / 1000)}s ago.`);
      }
    }

    for (const round of this.trackedRounds.values()) {
      if (round.consecutiveFailures >= 3) {
        alerts.push(`Round ${round.roundId} has ${round.consecutiveFailures} consecutive failures.`);
      }
      if (now > round.hardDeadline && round.phase < PHASE_SETTLED) {
        alerts.push(`Round ${round.roundId} is past its hard deadline in phase ${round.phase}.`);
      }
    }

    const recentErrors = this.errorLog.slice(-5);
    const allAlerts = [...alerts, ...recentErrors];
    let status: "healthy" | "degraded" | "critical" = "healthy";
    if (allAlerts.length >= 2) {
      status = "degraded";
    }
    if (allAlerts.length >= 4) {
      status = "critical";
    }

    return {
      status,
      activeRounds: this.trackedRounds.size,
      pendingTransitions: this.countPendingTransitions(now),
      lastPollAt: this.lastPollAt === 0n ? new Date(0).toISOString() : new Date(Number(this.lastPollAt)).toISOString(),
      lastTransitionAt: this.lastTransitionAt > 0n ? new Date(Number(this.lastTransitionAt)).toISOString() : undefined,
      consecutiveFailures: Math.max(...Array.from(this.trackedRounds.values()).map((round) => round.consecutiveFailures), 0),
      alertsTriggered: allAlerts,
      uptime: process.uptime(),
    };
  }

  async pollRounds(): Promise<void> {
    if (this.isPolling) {
      return;
    }

    this.isPolling = true;
    this.lastPollAt = BigInt(Date.now());

    try {
      await this.syncNewRounds();
      for (const roundId of [...this.trackedRounds.keys()]) {
        await this.driveRound(roundId);
      }
    } finally {
      this.isPolling = false;
    }
  }

  private async bootstrapFromChain(): Promise<void> {
    this.lastPollAt = BigInt(Date.now());
    await this.syncNewRounds();
    for (const roundId of [...this.trackedRounds.keys()]) {
      await this.refreshAndStoreRound(roundId);
    }
  }

  private startPolling(): void {
    this.pollTimer = setInterval(() => {
      void this.pollRounds().catch((err) => {
        this.addError(`poll failed: ${err instanceof Error ? err.message : String(err)}`);
      });
    }, this.pollIntervalMs);
  }

  private async syncNewRounds(): Promise<void> {
    let cursor = this.createdEventCursor;
    let hasNextPage = true;

    while (hasNextPage) {
      const page = (await this.suiClient.queryEvents({
        query: {
          MoveModule: {
            package: this.pmPackageId,
            module: "pm_sdvm",
          },
        } as never,
        cursor: cursor as never,
        limit: 50,
      })) as QueryEventsPage;

      const events = page.data ?? [];
      for (const event of events) {
        const eventType = this.readString(event.type);
        if (!eventType || !this.isVoteRoundCreatedEvent(eventType)) {
          continue;
        }

        const parsed = this.readRecord(event.parsedJson);
        const roundId = this.readString(parsed?.round_id);
        if (roundId) {
          await this.refreshAndStoreRound(roundId);
        }
      }

      if (page.nextCursor !== undefined) {
        cursor = page.nextCursor;
        this.createdEventCursor = page.nextCursor;
      }

      hasNextPage = Boolean(page.hasNextPage);
    }
  }

  private async driveRound(roundId: string): Promise<void> {
    const now = BigInt(Date.now());
    const current = await this.refreshAndStoreRound(roundId);
    if (!current) {
      return;
    }

    if (current.phase === PHASE_SETTLED) {
      this.trackedRounds.delete(roundId);
      return;
    }

    if (now > current.hardDeadline && current.phase < PHASE_SETTLED) {
      this.addError(`round ${roundId} is past hard deadline in phase ${current.phase}`);
      return;
    }

    if (current.phase === PHASE_COMMIT && now >= current.commitDeadline + DEADLINE_BUFFER_MS) {
      const afterReveal = await this.attemptTransition(
        current,
        "advance_to_reveal_phase",
        "advance_to_reveal_phase",
        (tx) => [tx.object(current.roundId), tx.object(CLOCK_ID)],
        (refreshed) => refreshed.phase >= PHASE_REVEAL,
      );
      if (!afterReveal) {
        return;
      }
    }

    const afterCommit = await this.refreshAndStoreRound(roundId);
    if (!afterCommit) {
      return;
    }

    if (afterCommit.phase === PHASE_REVEAL && now >= afterCommit.revealDeadline + DEADLINE_BUFFER_MS) {
      const afterTallyAdvance = await this.attemptTransition(
        afterCommit,
        "advance_to_tally_phase",
        "advance_to_tally_phase",
        (tx) => [tx.object(afterCommit.roundId), tx.object(CLOCK_ID)],
        (refreshed) => refreshed.phase >= PHASE_TALLY,
      );
      if (!afterTallyAdvance) {
        return;
      }
    }

    const afterReveal = await this.refreshAndStoreRound(roundId);
    if (!afterReveal) {
      return;
    }

    if (afterReveal.phase === PHASE_TALLY) {
      await this.attemptTransition(
        afterReveal,
        "tally_votes",
        "tally_votes",
        (tx) => [tx.object(afterReveal.roundId), tx.object(this.stakingPoolId), tx.object(CLOCK_ID)],
        (refreshed) => refreshed.phase === PHASE_SETTLED || refreshed.roundNumber > afterReveal.roundNumber,
      );
    }
  }

  private async attemptTransition(
    round: TrackedRound,
    label: string,
    functionName: string,
    buildArguments: (tx: Transaction) => unknown[],
    successPredicate: (refreshed: TrackedRound) => boolean,
  ): Promise<TrackedRound | null> {
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${this.pmPackageId}::pm_sdvm::${functionName}`,
        arguments: buildArguments(tx) as never[],
      });

      const result = await this.suiClient.signAndExecuteTransaction({
        transaction: tx,
        signer: this.botKeypair,
        options: {
          showEffects: true,
          showEvents: true,
        },
      } as never);

      const status = (result as { effects?: { status?: { status?: string; error?: string | null } } }).effects?.status;
      if (status?.status !== "success") {
        throw new Error(status?.error ?? `${label} transaction failed`);
      }

      const refreshed = await this.refreshAndStoreRound(round.roundId);
      if (refreshed && successPredicate(refreshed)) {
        this.markAttempt(refreshed, "success");
        this.lastTransitionAt = BigInt(Date.now());
        console.log(`[phase-bot] ${label} succeeded for ${round.roundId} via ${(result as { digest?: string }).digest ?? "unknown-tx"}`);
        return refreshed;
      }

      throw new Error(`${label} submitted but round did not reach the expected state`);
    } catch (err) {
      const refreshed = await this.refreshAndStoreRound(round.roundId);
      if (refreshed && successPredicate(refreshed)) {
        this.markAttempt(refreshed, "idempotent");
        return refreshed;
      }

      this.markAttempt(round, "failure");
      this.addError(`${label} failed for ${round.roundId}: ${err instanceof Error ? err.message : String(err)}`);
      return refreshed;
    }
  }

  private async refreshAndStoreRound(roundId: string): Promise<TrackedRound | null> {
    const refreshed = await this.fetchRound(roundId);
    if (!refreshed) {
      this.trackedRounds.delete(roundId);
      return null;
    }

    const previous = this.trackedRounds.get(roundId);
    if (previous) {
      refreshed.lastAttemptAt = previous.lastAttemptAt;
      refreshed.lastAttemptStatus = previous.lastAttemptStatus;
      refreshed.consecutiveFailures = previous.consecutiveFailures;
    }

    if (refreshed.phase === PHASE_SETTLED) {
      this.trackedRounds.delete(roundId);
      return refreshed;
    }

    this.trackedRounds.set(roundId, refreshed);
    return refreshed;
  }

  private async fetchRound(roundId: string): Promise<TrackedRound | null> {
    const response = (await this.suiClient.getObject({
      id: roundId,
      options: {
        showContent: true,
      },
    })) as GetObjectResponse;

    const content = response.data?.content;
    if (!content?.fields || !content.type?.includes("::pm_sdvm::SDVMVoteRound<")) {
      return null;
    }

    if (!content.type.includes(`<${this.collateralCoinType}>`)) {
      return null;
    }

    const fields = content.fields;
    return {
      roundId,
      disputeId: this.readId(fields.dispute_id),
      roundNumber: this.readNumber(fields.round_number),
      phase: this.readNumber(fields.phase),
      commitDeadline: this.readBigInt(fields.commit_deadline_ms),
      revealDeadline: this.readBigInt(fields.reveal_deadline_ms),
      hardDeadline: this.readBigInt(fields.hard_deadline_ms),
      expedited: this.readBoolean(fields.expedited),
      lastChecked: BigInt(Date.now()),
      consecutiveFailures: 0,
    };
  }

  private isVoteRoundCreatedEvent(eventType: string): boolean {
    return (
      eventType.startsWith(`${this.pmPackageId}::pm_sdvm::SDVMVoteRoundCreatedEvent<`) &&
      eventType.includes(`<${this.collateralCoinType}>`)
    );
  }

  private countPendingTransitions(now: bigint): number {
    let count = 0;
    for (const round of this.trackedRounds.values()) {
      if (round.phase === PHASE_COMMIT && now >= round.commitDeadline + DEADLINE_BUFFER_MS) {
        count += 1;
      } else if (round.phase === PHASE_REVEAL && now >= round.revealDeadline + DEADLINE_BUFFER_MS) {
        count += 1;
      } else if (round.phase === PHASE_TALLY) {
        count += 1;
      }
    }
    return count;
  }

  private markAttempt(round: TrackedRound, status: "success" | "failure" | "idempotent"): void {
    round.lastAttemptAt = BigInt(Date.now());
    round.lastAttemptStatus = status;
    round.consecutiveFailures = status === "failure" ? round.consecutiveFailures + 1 : 0;
    this.trackedRounds.set(round.roundId, round);
  }

  private addError(message: string): void {
    const formatted = `${new Date().toISOString()}: ${message}`;
    console.warn(`[phase-bot] ${formatted}`);
    this.errorLog.push(formatted);
    if (this.errorLog.length > 100) {
      this.errorLog.shift();
    }
  }

  private readRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
  }

  private readString(value: unknown): string | null {
    return typeof value === "string" ? value : null;
  }

  private readBoolean(value: unknown): boolean {
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "string") {
      return value.toLowerCase() === "true";
    }
    return Boolean(value);
  }

  private readBigInt(value: unknown): bigint {
    if (typeof value === "bigint") {
      return value;
    }
    if (typeof value === "number") {
      return BigInt(value);
    }
    if (typeof value === "string") {
      return BigInt(value);
    }
    throw new Error(`Expected bigint-compatible field, received ${String(value)}`);
  }

  private readNumber(value: unknown): number {
    if (typeof value === "number") {
      return value;
    }
    if (typeof value === "string") {
      return Number(value);
    }
    if (typeof value === "bigint") {
      return Number(value);
    }
    throw new Error(`Expected numeric field, received ${String(value)}`);
  }

  private readId(value: unknown): string {
    if (typeof value === "string") {
      return value;
    }
    const record = this.readRecord(value);
    const nestedId = record?.id;
    if (typeof nestedId === "string") {
      return nestedId;
    }
    throw new Error(`Expected ID field, received ${String(value)}`);
  }
}
