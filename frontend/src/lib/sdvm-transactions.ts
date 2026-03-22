/**
 * SDVM Transaction Builders
 *
 * Constructs Sui Move call transactions for all SDVM operations:
 * - commit_vote, reveal_vote, explicit_abstain
 * - stake, initiate_unstake, complete_unstake
 * - claim_reward (Phase 2 deferred)
 *
 * Follows patterns from market-transactions.ts.
 * Uses @mysten/sui/transactions Transaction builder API.
 *
 * IMPORTANT: All hex values (outcome, salt, hashes) are passed as vector<u8> to Move.
 * BCS serialization is handled client-side via vote-hash.ts.
 */

import { Transaction } from "@mysten/sui/transactions";

/** Sui shared clock object ID */
const SUI_CLOCK_OBJECT_ID = "0x6";

/**
 * Convert Uint8Array to vector<u8> arguments for Move.
 * Returns the array for tx.pure.vector.
 *
 * @param bytes - Uint8Array to convert
 * @returns Array of numbers (0-255) suitable for Move vector<u8>
 */
function bytesToU8Vec(bytes: Uint8Array): number[] {
  return Array.from(bytes);
}

function mergeCoinInputs(tx: Transaction, coinObjectIds: string[]) {
  if (coinObjectIds.length === 0) {
    throw new Error("No collateral coin objects were provided.");
  }

  const primary = tx.object(coinObjectIds[0]);
  if (coinObjectIds.length > 1) {
    tx.mergeCoins(
      primary,
      coinObjectIds.slice(1).map((coinObjectId) => tx.object(coinObjectId)),
    );
  }

  return primary;
}

// ───────────────────────────────────────────────────────────────
// Staking Operations
// ───────────────────────────────────────────────────────────────

/**
 * Build a stake transaction.
 *
 * Move: pm_staking::stake(stake_pool, coin, stake_epoch, ctx)
 * Returns: SufferStakePosition (owned object sent to sender)
 *
 * @param params.poolId - Shared object ID of SufferStakePool
 * @param params.paymentCoinIds - Coin object IDs available for staking
 * @param params.amount - Amount in base units to stake
 * @param params.packageId - SDVM package ID
 * @returns Transaction ready to sign and submit
 *
 * @example
 * const tx = buildStakeTransaction({
 *   poolId: "0xabc...",
 *   coinObjectId: "0xdef...",
 *   amount: BigInt(1e9) * BigInt(100), // 100 SUFFER
 *   stakeEpoch: 10,
 *   packageId: "0x123..."
 * });
 */
export function buildStakeTransaction(params: {
  poolId: string;
  paymentCoinIds: string[];
  amount: bigint;
  packageId: string;
}): Transaction {
  const tx = new Transaction();
  const merged = mergeCoinInputs(tx, params.paymentCoinIds);
  const [stakeCoin] = tx.splitCoins(merged, [tx.pure.u64(params.amount)]);

  tx.moveCall({
    target: `${params.packageId}::pm_staking::stake`,
    arguments: [
      tx.object(params.poolId),
      stakeCoin,
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });

  return tx;
}

/**
 * Build an initiate_unstake transaction.
 *
 * Move: pm_staking::initiate_unstake(stake_position, ctx)
 *
 * Sets unstake_initiated_at_ms = now().
 * Voter must wait 48h before completing unstake.
 * Stake remains slashable during cooldown for disputes filed before initiate.
 *
 * @param params.stakePositionId - Owned object ID of SufferStakePosition
 * @param params.packageId - SDVM package ID
 * @returns Transaction
 */
export function buildInitiateUnstakeTransaction(params: {
  stakePositionId: string;
  packageId: string;
}): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${params.packageId}::pm_staking::initiate_unstake`,
    arguments: [tx.object(params.stakePositionId), tx.object(SUI_CLOCK_OBJECT_ID)],
  });

  return tx;
}

/**
 * Build a complete_unstake transaction.
 *
 * Move: pm_staking::complete_unstake(stake_pool, stake_position, clock, ctx)
 * Returns: Coin<SUFFER> with updated balance (after slashing)
 *
 * Requires:
 * - 48h have elapsed since initiate_unstake()
 * - No pending disputes filed before unstake was initiated
 *
 * @param params.poolId - Shared object ID of SufferStakePool
 * @param params.stakePositionId - Owned object ID of SufferStakePosition
 * @param params.packageId - SDVM package ID
 * @returns Transaction
 */
export function buildCompleteUnstakeTransaction(params: {
  poolId: string;
  stakePositionId: string;
  packageId: string;
}): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${params.packageId}::pm_staking::complete_unstake`,
    arguments: [
      tx.object(params.poolId),
      tx.object(params.stakePositionId),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });

  return tx;
}

/**
 * Build an emergency_unstake transaction.
 *
 * Move: pm_staking::emergency_unstake(stake_pool, stake_position, clock, ctx)
 * Returns: Coin<SUFFER> with 95% of balance (5% penalty deducted)
 *
 * Immediate withdrawal, no 48h cooldown.
 * Stake remains slashable for disputes filed before emergency_unstake() call.
 *
 * @param params.poolId - Shared object ID of SufferStakePool
 * @param params.stakePositionId - Owned object ID of SufferStakePosition
 * @param params.packageId - SDVM package ID
 * @returns Transaction
 */
export function buildEmergencyUnstakeTransaction(params: {
  poolId: string;
  stakePositionId: string;
  packageId: string;
}): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${params.packageId}::pm_staking::emergency_unstake`,
    arguments: [
      tx.object(params.poolId),
      tx.object(params.stakePositionId),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });

  return tx;
}

// ───────────────────────────────────────────────────────────────
// Commit-Reveal Voting
// ───────────────────────────────────────────────────────────────

/**
 * Build a commit_vote transaction.
 *
 * Move: pm_sdvm::commit_vote(vote_round, stake_pool, stake_position, commitment_hash, clock, ctx)
 * Returns: SDVMCommitRecord (owned object, voter holds it until reveal)
 *
 * Commit phase:
 * - Voter submits hash(outcome || salt)
 * - Salt is kept private (not revealed yet)
 * - Prevents voter from changing their vote during reveal
 *
 * @param params.roundId - Shared object ID of SDVMVoteRound
 * @param params.stakePoolId - Shared object ID of SufferStakePool
 * @param params.stakePositionId - Owned object ID of SufferStakePosition
 * @param params.commitHash - 32-byte commitment hash (from buildCommitHash)
 * @param params.packageId - SDVM package ID
 * @returns Transaction
 *
 * @example
 * const hash = buildCommitHash(outcome, salt);
 * const tx = buildCommitVoteTransaction({
 *   roundId: "0xvote_round...",
 *   stakePoolId: "0xpool...",
 *   stakePositionId: "0xposition...",
 *   commitHash: hash,
 *   packageId: "0x123..."
 * });
 */
export function buildCommitVoteTransaction(params: {
  roundId: string;
  stakePoolId: string;
  stakePositionId: string;
  commitHash: Uint8Array;
  packageId: string;
}): Transaction {
  if (params.commitHash.length !== 32) {
    throw new Error(`Commitment hash must be 32 bytes, got ${params.commitHash.length}`);
  }

  const tx = new Transaction();

  tx.moveCall({
    target: `${params.packageId}::pm_sdvm::commit_vote`,
    arguments: [
      tx.object(params.roundId),
      tx.object(params.stakePoolId),
      tx.object(params.stakePositionId),
      tx.pure.vector("u8", bytesToU8Vec(params.commitHash)),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });

  return tx;
}

/**
 * Build an explicit_abstain transaction.
 *
 * Move: pm_sdvm::explicit_abstain(vote_round, stake_pool, stake_position, salt, clock, ctx)
 * Returns: SDVMCommitRecord with outcome = 0xFFFF (65535)
 *
 * For disputed outcomes where the voter abstains from voting.
 * Explicitly abstaining voters are never slashed and never rewarded.
 *
 * @param params.roundId - Shared object ID of SDVMVoteRound
 * @param params.stakePoolId - Shared object ID of SufferStakePool
 * @param params.stakePositionId - Owned object ID of SufferStakePosition
 * @param params.salt - 32-byte salt (part of commitment)
 * @param params.packageId - SDVM package ID
 * @returns Transaction
 */
export function buildExplicitAbstainTransaction(params: {
  roundId: string;
  commitRecordId: string;
  stakePositionId: string;
  salt: Uint8Array;
  packageId: string;
}): Transaction {
  if (params.salt.length !== 32) {
    throw new Error(`Salt must be 32 bytes, got ${params.salt.length}`);
  }

  const tx = new Transaction();

  tx.moveCall({
    target: `${params.packageId}::pm_sdvm::explicit_abstain`,
    arguments: [
      tx.object(params.roundId),
      tx.object(params.commitRecordId),
      tx.object(params.stakePositionId),
      tx.pure.vector("u8", bytesToU8Vec(params.salt)),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });

  return tx;
}

/**
 * Build a reveal_vote transaction.
 *
 * Move: pm_sdvm::reveal_vote(vote_round, stake_position, voted_outcome, salt, commit_record, clock)
 *
 * Reveal phase:
 * - Voter submits outcome + salt
 * - Move verifies: hash(outcome || salt) == stored commitment_hash
 * - If correct: vote is added to tally, commit_record is consumed
 * - If incorrect: vote is invalid, voter is slashed
 *
 * @param params.roundId - Shared object ID of SDVMVoteRound
 * @param params.stakePositionId - Owned object ID of SufferStakePosition (immutable ref)
 * @param params.commitRecordId - Owned object ID of SDVMCommitRecord (consumed)
 * @param params.votedOutcome - Outcome value (u16, 0-65535)
 * @param params.salt - 32-byte salt from commit phase
 * @param params.packageId - SDVM package ID
 * @returns Transaction
 */
export function buildRevealVoteTransaction(params: {
  roundId: string;
  stakePositionId: string;
  commitRecordId: string;
  votedOutcome: number;
  salt: Uint8Array;
  packageId: string;
}): Transaction {
  if (params.votedOutcome < 0 || params.votedOutcome > 65535) {
    throw new Error(`Voted outcome must be u16 (0-65535), got ${params.votedOutcome}`);
  }

  if (params.salt.length !== 32) {
    throw new Error(`Salt must be 32 bytes, got ${params.salt.length}`);
  }

  const tx = new Transaction();

  tx.moveCall({
    target: `${params.packageId}::pm_sdvm::reveal_vote`,
    arguments: [
      tx.object(params.roundId),
      tx.object(params.commitRecordId),
      tx.object(params.stakePositionId),
      tx.pure.u16(params.votedOutcome),
      tx.pure.vector("u8", bytesToU8Vec(params.salt)),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });

  return tx;
}

// ───────────────────────────────────────────────────────────────
// Phase Transitions (Permissionless)
// ───────────────────────────────────────────────────────────────

/**
 * Build an advance_to_reveal_phase transaction.
 *
 * Move: pm_sdvm::advance_to_reveal_phase(vote_round, clock)
 *
 * Permissionless. Anyone can call.
 * Transitions SDVMVoteRound phase from COMMIT (0) to REVEAL (1).
 * Only succeeds if commit_deadline_ms has passed.
 *
 * @param params.roundId - Shared object ID of SDVMVoteRound
 * @param params.packageId - SDVM package ID
 * @returns Transaction
 */
export function buildAdvanceToRevealPhaseTransaction(params: {
  roundId: string;
  packageId: string;
}): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${params.packageId}::pm_sdvm::advance_to_reveal_phase`,
    arguments: [tx.object(params.roundId), tx.object(SUI_CLOCK_OBJECT_ID)],
  });

  return tx;
}

/**
 * Build an advance_to_tally_phase transaction.
 *
 * Move: pm_sdvm::advance_to_tally_phase(vote_round, clock)
 *
 * Permissionless. Anyone can call.
 * Transitions SDVMVoteRound phase from REVEAL (1) to TALLY (2).
 * Only succeeds if reveal_deadline_ms has passed.
 *
 * @param params.roundId - Shared object ID of SDVMVoteRound
 * @param params.packageId - SDVM package ID
 * @returns Transaction
 */
export function buildAdvanceToTallyPhaseTransaction(params: {
  roundId: string;
  packageId: string;
}): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${params.packageId}::pm_sdvm::advance_to_tally_phase`,
    arguments: [tx.object(params.roundId), tx.object(SUI_CLOCK_OBJECT_ID)],
  });

  return tx;
}

// ───────────────────────────────────────────────────────────────
// Tally & Rewards (Phase 2)
// ───────────────────────────────────────────────────────────────

/**
 * Build a tally_votes transaction.
 *
 * Move: pm_sdvm::tally_votes(vote_round, stake_pool, clock, ctx)
 *
 * Permissionless. Anyone can call.
 * Phase 2: Implements slash/reward distribution.
 * Phase 1: Placeholder that returns TallyResult but does not transfer tokens.
 *
 * @param params.roundId - Shared object ID of SDVMVoteRound
 * @param params.poolId - Shared object ID of SufferStakePool
 * @param params.packageId - SDVM package ID
 * @returns Transaction
 */
export function buildTallyVotesTransaction(params: {
  roundId: string;
  poolId: string;
  packageId: string;
}): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${params.packageId}::pm_sdvm::tally_votes`,
    arguments: [tx.object(params.roundId), tx.object(params.poolId), tx.object(SUI_CLOCK_OBJECT_ID)],
  });

  return tx;
}

/**
 * Build a claim_reward transaction.
 *
 * Move: pm_sdvm::claim_reward(vote_round, stake_position, stake_pool, clock, ctx)
 * Returns: Coin<SUFFER> with reward amount
 *
 * DEFERRED TO PHASE 2 (Weeks 5-6)
 *
 * Called after tally, by voters who voted correctly.
 * Transfers reward from stake_pool.pending_rewards to voter's coin.
 *
 * @param params.roundId - Shared object ID of SDVMVoteRound
 * @param params.stakePositionId - Owned object ID of SufferStakePosition
 * @param params.poolId - Shared object ID of SufferStakePool
 * @param params.packageId - SDVM package ID
 * @returns Transaction
 *
 * @remarks Phase 2 implementation deferred. The Move contract stub exists but reward
 * distribution logic will be implemented in Weeks 5-6.
 */
export function buildClaimRewardTransaction(params: {
  roundId: string;
  stakePositionId: string;
  poolId: string;
  packageId: string;
}): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${params.packageId}::pm_sdvm::claim_voter_reward`,
    arguments: [
      tx.object(params.roundId),
      tx.object(params.stakePositionId),
      tx.object(params.poolId),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });

  return tx;
}

// ───────────────────────────────────────────────────────────────
// Cleanup (Permissionless)
// ───────────────────────────────────────────────────────────────

/**
 * Build a cleanup_orphaned_commit transaction.
 *
 * Move: pm_sdvm::cleanup_orphaned_commit(vote_round, commit_record, ctx)
 *
 * Permissionless. Anyone can call.
 * Deletes unrevealed SDVMCommitRecord after round is SETTLED or hard deadline exceeded.
 * Caller earns storage rebate.
 *
 * @param params.roundId - Shared object ID of SDVMVoteRound
 * @param params.commitRecordId - Owned object ID of SDVMCommitRecord (to be deleted)
 * @param params.packageId - SDVM package ID
 * @returns Transaction
 */
export function buildCleanupOrphanedCommitTransaction(params: {
  roundId: string;
  commitRecordId: string;
  packageId: string;
}): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${params.packageId}::pm_sdvm::cleanup_orphaned_commit`,
    arguments: [tx.object(params.roundId), tx.object(params.commitRecordId)],
  });

  return tx;
}
