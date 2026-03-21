/// SUFFER Decentralized Voting Module (SDVM) — permissionless, two-level commit-reveal voting.
/// Implements D3 (owned commits, shared round), D4 (BCS hash), D5 (12h/12h default),
/// D8 (decreasing GAT), D9 (permissionless transitions + reward), D10 (multisig emergency).
///
/// Objects:
/// - SDVMVoteRound (shared): dispute voting round state
/// - SDVMCommitRecord (owned): per-voter commitment record
/// - VoteReveal (store): aggregated reveal data within round
/// - SDVMEmergencyInvalidationCap (2-of-3 multisig): emergency invalidation capability
module prediction_market::pm_sdvm;

use sui::{
    balance::{Self, Balance},
    clock::Clock,
    coin::{Self, Coin},
    event,
    hash,
    object::{Self, UID, ID},
    transfer,
    tx_context::{Self, TxContext},
    vec_set,
};
use prediction_market::{
    pm_rules,
    pm_staking::{Self, SufferStakePool, SufferStakePosition, SDVMAdminCap},
    suffer::SUFFER,
};
use std::string::String;

// ═══════════════════════════════════════════════════════════════
// Error Codes (range 400-450 per spec)
// ═══════════════════════════════════════════════════════════════

#[error(code = 400)]
const EInvalidPhase: vector<u8> = b"Invalid phase for operation";

#[error(code = 401)]
const EDeadlineNotReached: vector<u8> = b"Phase deadline not reached";

#[error(code = 402)]
const EAlreadyCommitted: vector<u8> = b"Already committed vote";

#[error(code = 403)]
const ECommitNotFound: vector<u8> = b"Commit record not found";

#[error(code = 404)]
const EHashMismatch: vector<u8> = b"Commitment hash does not match revealed vote";

#[error(code = 405)]
const EInvalidOutcome: vector<u8> = b"Invalid outcome";

#[error(code = 406)]
const ENotVoter: vector<u8> = b"Not a committed voter";

#[error(code = 407)]
const EGATNotMet: vector<u8> = b"Quorum (GAT) not met";

#[error(code = 408)]
const ENoWinner: vector<u8> = b"No outcome reached supermajority (SPAT)";

#[error(code = 409)]
const EMaxRollsExceeded: vector<u8> = b"Maximum number of rolls exceeded";

#[error(code = 410)]
const EHardDeadlineExceeded: vector<u8> = b"Hard 7-day deadline exceeded";

#[error(code = 411)]
const EInvalidCommitRecord: vector<u8> = b"Invalid or expired commit record";

#[error(code = 412)]
const EAbstainVoteInvalid: vector<u8> = b"Cannot vote for outcome = ABSTAIN value";

#[error(code = 413)]
const EZeroStake: vector<u8> = b"Voter stake must be non-zero";

#[error(code = 414)]
const EAlreadyRevealed: vector<u8> = b"Already revealed";

#[error(code = 415)]
const EInvalidRound: vector<u8> = b"Invalid round number";


#[error(code = 417)]
const ERoundAlreadySettled: vector<u8> = b"Round already settled";

#[error(code = 418)]
const EInsufficientParticipation: vector<u8> = b"Insufficient participation";

#[error(code = 419)]
const EAlreadyClaimed: vector<u8> = b"Voter has already claimed reward for this round";

#[error(code = 420)]
const EAlreadySlashed: vector<u8> = b"Voter has already been slashed for this round";

#[error(code = 421)]
const EWrongRound: vector<u8> = b"Commit record belongs to a different round";

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const DEFAULT_COMMIT_DURATION_MS: u64 = 12 * 60 * 60 * 1000; // 12 hours
const DEFAULT_REVEAL_DURATION_MS: u64 = 12 * 60 * 60 * 1000; // 12 hours
const EXPEDITED_DURATION_MS: u64 = 4 * 60 * 60 * 1000; // 4 hours
const HARD_DEADLINE_MS: u64 = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_ROLLS_TESTNET: u8 = 2;
const MAX_ROLLS_MAINNET: u8 = 3;

// Quorum thresholds (basis points of total staked)
const GAT_ROUND_1_BPS: u64 = 500; // 5%
const GAT_ROUND_2_BPS: u64 = 300; // 3%
const GAT_ROUND_3_BPS: u64 = 100; // 1%
const SPAT_BPS: u64 = 6500; // 65%

const BASIS_POINTS: u64 = 10000;
const TALLY_CALLER_REWARD_BPS: u64 = 10; // 0.1% of slash pool

// ═══════════════════════════════════════════════════════════════
// Events
// ═══════════════════════════════════════════════════════════════

public struct VoteCommittedEvent has copy, drop {
    round_id: ID,
    dispute_id: ID,
    voter: address,
    stake_weight: u64,
}

public struct VoteRevealedEvent has copy, drop {
    round_id: ID,
    dispute_id: ID,
    voter: address,
    voted_outcome: u16,
    stake_weight: u64,
}

public struct VoteAbstainedEvent has copy, drop {
    round_id: ID,
    dispute_id: ID,
    voter: address,
    stake_weight: u64,
}

public struct PhaseTransitionEvent has copy, drop {
    round_id: ID,
    dispute_id: ID,
    new_phase: u8,
    timestamp_ms: u64,
}

// RT5-CRIT-001: Event emitted when SDVMVoteRound is created
// Allows frontend and bot to discover round ID from chain events
public struct SDVMVoteRoundCreatedEvent has copy, drop {
    round_id: ID,
    dispute_id: ID,
    expedited: bool,
    timestamp_ms: u64,
}

public struct TallyCompletedEvent has copy, drop {
    round_id: ID,
    dispute_id: ID,
    winning_outcome: u16,
    total_votes: u64,
    total_weight: u64,
    participation_rate_bps: u64,
}

public struct RoundRolledEvent has copy, drop {
    dispute_id: ID,
    new_round_number: u8,
    reason: vector<u8>,
}

public struct AdminResolveEvent has copy, drop {
    round_id: ID,
    dispute_id: ID,
    resolved_outcome: u16,
    admin: address,
}

public struct AdminPhaseAdvanceEvent has copy, drop {
    round_id: ID,
    dispute_id: ID,
    new_phase: u8,
    admin: address,
}

public struct AdminQuorumOverrideEvent has copy, drop {
    round_id: ID,
    dispute_id: ID,
    new_gat_bps: u64,
    admin: address,
}

public struct OrphanedCommitCleanedEvent has copy, drop {
    round_id: ID,
    dispute_id: ID,
}

// ═══════════════════════════════════════════════════════════════
// Objects
// ═══════════════════════════════════════════════════════════════

/// A voting round for a single dispute (shared object).
/// Read during commit (immutable ref), written during reveal + tally.
/// D3: Only written to during reveal and tally, never during commit.
public struct SDVMVoteRound has key {
    id: UID,
    dispute_id: ID,
    round_number: u8,
    phase: u8, // COMMIT=0, REVEAL=1, TALLY=2, SETTLED=3
    commit_deadline_ms: u64,
    reveal_deadline_ms: u64,
    total_staked_snapshot: u64,
    total_committed_weight: u64,
    total_revealed_weight: u64,
    expedited: bool,
    hard_deadline_ms: u64,
    reveals: vector<VoteReveal>,
    tally_caller_reward: Balance<SUFFER>,
    outcome_count: u16,
    gat_override_bps: Option<u64>,
    is_admin_resolved: bool,
    admin_resolved_outcome: Option<u16>,
    max_rolls: u8,
    claimed_voters: vec_set::VecSet<address>,
    slashed_voters: vec_set::VecSet<address>,
}

/// Per-voter commitment record (owned object).
/// D3: Created by commit_vote(), consumed by reveal_vote() or explicit_abstain().
/// No contention during commit phase.
public struct SDVMCommitRecord has key, store {
    id: UID,
    voter: address,
    round_id: ID,
    // RT3-CRIT-002 FIX: Track round number to prevent salt reuse across rounds that reuse the same ID
    round_number: u8,
    commitment_hash: vector<u8>,
    stake_weight: u64,
}

/// A revealed vote (aggregated in SDVMVoteRound).
/// No copy or drop — once revealed, it stays revealed.
public struct VoteReveal has store {
    voter: address,
    voted_outcome: u16,
    salt: vector<u8>,
    stake_weight: u64,
}

/// Emergency invalidation capability (2-of-3 multisig).
/// Each of the 3 holders can trigger, but requires 2 to actually execute.
/// V1: On-chain counter for audit trail.
public struct SDVMEmergencyInvalidationCap has key, store {
    id: UID,
    holder_index: u8, // 0, 1, or 2 (identifies which of the 3 holders)
}

/// God Lever Usage Tracker — audits admin actions for removal eligibility.
/// Removal criteria: "used in fewer than 5 of the last 50 disputes"
/// Each admin action increments the relevant counter and emits an event with the new count.
/// Queries: `sui client objects --filter '{contains: "SDVMGovernanceTracker"}' | jq '.admin_resolve_count'`
public struct SDVMGovernanceTracker has key {
    id: UID,
    /// Number of times AdminResolve god lever has been invoked
    admin_resolve_count: u64,
    /// Number of times AdminSlashOverride god lever has been invoked
    admin_slash_override_count: u64,
    /// Number of times AdminQuorumOverride god lever has been invoked
    admin_quorum_override_count: u64,
    /// Number of times AdminPauseStaking god lever has been invoked
    admin_pause_staking_count: u64,
    /// Number of times AdminPhaseAdvance god lever has been invoked
    admin_phase_advance_count: u64,
    /// Total number of disputes that reached SETTLED or INVALID state
    total_disputes_resolved: u64,
    /// Total number of disputes that rolled (reached max_rolls and became INVALID)
    total_disputes_rolled: u64,
    /// Last update timestamp (ms)
    last_updated_ms: u64,
}

// ═══════════════════════════════════════════════════════════════
// Round Initialization
// ═══════════════════════════════════════════════════════════════

/// Create a new voting round for a dispute.
/// Returns the shared object (must be transferred to be shared).
public fun create_vote_round(
    dispute_id: ID,
    outcome_count: u16,
    total_staked: u64,
    expedited: bool,
    clock: &Clock,
    ctx: &mut TxContext,
): SDVMVoteRound {
    let current_time = sui::clock::timestamp_ms(clock);

    let (commit_dur, reveal_dur) = if (expedited) {
        (EXPEDITED_DURATION_MS, EXPEDITED_DURATION_MS)
    } else {
        (DEFAULT_COMMIT_DURATION_MS, DEFAULT_REVEAL_DURATION_MS)
    };

    let commit_deadline = current_time + commit_dur;
    let reveal_deadline = commit_deadline + reveal_dur;
    let hard_deadline = current_time + HARD_DEADLINE_MS;

    let vote_round = SDVMVoteRound {
        id: object::new(ctx),
        dispute_id,
        round_number: 1,
        phase: pm_rules::vote_phase_commit(),
        commit_deadline_ms: commit_deadline,
        reveal_deadline_ms: reveal_deadline,
        total_staked_snapshot: total_staked,
        total_committed_weight: 0,
        total_revealed_weight: 0,
        expedited,
        hard_deadline_ms: hard_deadline,
        reveals: vector::empty(),
        tally_caller_reward: balance::zero<SUFFER>(),
        outcome_count,
        gat_override_bps: option::none(),
        is_admin_resolved: false,
        admin_resolved_outcome: option::none(),
        max_rolls: MAX_ROLLS_TESTNET,
        claimed_voters: vec_set::empty(),
        slashed_voters: vec_set::empty(),
    };

    // RT5-CRIT-001: Emit event with round ID so frontend and bot can discover it
    event::emit(SDVMVoteRoundCreatedEvent {
        round_id: object::id(&vote_round),
        dispute_id,
        expedited,
        timestamp_ms: current_time,
    });

    vote_round
}

// ═══════════════════════════════════════════════════════════════
// Voting Operations
// ═══════════════════════════════════════════════════════════════

/// Commit a vote (D3: creates owned SDVMCommitRecord, no shared object write).
/// Hash = sha3_256(bcs::to_bytes(&outcome) ++ salt).
/// Takes mutable reference to position to register the dispute.
/// Requires the voter has a stake position with non-zero weight.
public fun commit_vote(
    round: &SDVMVoteRound,
    _pool: &SufferStakePool,
    position: &mut SufferStakePosition,
    commitment_hash: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
): SDVMCommitRecord {
    let current_time = sui::clock::timestamp_ms(clock);

    // Check phase and deadline
    assert!(round.phase == pm_rules::vote_phase_commit(), EInvalidPhase);
    assert!(current_time <= round.commit_deadline_ms, EDeadlineNotReached);

    // Check voter has stake
    let stake_weight = pm_staking::position_net_stake(position);
    assert!(stake_weight > 0, EZeroStake);

    let voter = tx_context::sender(ctx);
    assert!(pm_staking::position_owner(position) == voter, ENotVoter);

    // FIX (RT5-Integration): Register this dispute on the staker's position.
    // This prevents the staker from unstaking while the dispute is pending.
    // Unregister happens in tally_votes() after dispute is settled.
    let round_id = object::id(round);
    pm_staking::register_dispute(position, round_id);

    let record = SDVMCommitRecord {
        id: object::new(ctx),
        voter,
        round_id,
        // RT3-CRIT-002 FIX: Store round number to validate reveal happens on same round
        round_number: round.round_number,
        commitment_hash,
        stake_weight,
    };

    event::emit(VoteCommittedEvent {
        round_id,
        dispute_id: round.dispute_id,
        voter,
        stake_weight,
    });

    record
}

/// Reveal a vote (D4: BCS hash verification, D1: opt-in slash only).
/// Takes mutable reference to round (writes reveal to vector).
/// Consumes the commit record. Verifies hash match.
pub fun reveal_vote(
    round: &mut SDVMVoteRound,
    commit_record: SDVMCommitRecord,
    position: &SufferStakePosition,
    voted_outcome: u16,
    salt: vector<u8>,
    clock: &Clock,
    _ctx: &TxContext,
) {
    let current_time = sui::clock::timestamp_ms(clock);

    // Check phase and deadline
    assert!(round.phase == pm_rules::vote_phase_reveal(), EInvalidPhase);
    assert!(current_time <= round.reveal_deadline_ms, EDeadlineNotReached);

    // Validate outcome is not ABSTAIN
    assert!(voted_outcome != pm_rules::sdvm_outcome_abstain(), EAbstainVoteInvalid);
    assert!((voted_outcome as u64) < (round.outcome_count as u64), EInvalidOutcome);

    let SDVMCommitRecord {
        id: record_id,
        voter,
        round_id: commit_round_id,
        // RT3-CRIT-002 FIX: Validate round number matches to prevent salt reuse
        round_number: commit_round_number,
        commitment_hash: committed_hash,
        stake_weight,
    } = commit_record;

    object::delete(record_id);

    // CRITICAL: Ensure commit belongs to this round (MP-001)
    assert!(commit_round_id == object::id(round), EWrongRound);
    // RT3-CRIT-002 FIX: Ensure round hasn't rolled (same round_number)
    assert!(commit_round_number == round.round_number, EWrongRound);

    // Verify stake hasn't changed (must be same as at commit time)
    let current_weight = pm_staking::position_net_stake(position);
    assert!(current_weight == stake_weight, EInvalidCommitRecord);

    // D4: Verify hash = sha3_256(bcs::to_bytes(&outcome) ++ salt)
    // CRITICAL: BCS serialization uses LITTLE-ENDIAN byte order for u16.
    // Outcome 256 = 0x0100 serializes as [0x00, 0x01] (low byte first).
    // This MUST match TypeScript serialization in vote-hash.ts (@suffer/vote-hash).
    // See SDVM_SALT_MANAGEMENT.md Appendix for cross-platform test vectors.
    let preimage = bcs::to_bytes(&voted_outcome);
    let mut full_preimage = preimage;
    vector::append(&mut full_preimage, salt);
    let computed_hash = hash::sha3_256(full_preimage);

    assert!(computed_hash == committed_hash, EHashMismatch);

    // Record the reveal
    let reveal = VoteReveal {
        voter,
        voted_outcome,
        salt,
        stake_weight,
    };

    vector::push_back(&mut round.reveals, reveal);
    round.total_revealed_weight = round.total_revealed_weight + stake_weight;

    event::emit(VoteRevealedEvent {
        round_id: object::id(round),
        dispute_id: round.dispute_id,
        voter,
        voted_outcome,
        stake_weight,
    });
}

/// Explicit abstain (D1: commit ABSTAIN hash, no slash, no reward).
/// Uses special outcome value 0xFFFF (65535).
pub fun explicit_abstain(
    round: &mut SDVMVoteRound,
    commit_record: SDVMCommitRecord,
    position: &SufferStakePosition,
    salt: vector<u8>,
    clock: &Clock,
    _ctx: &TxContext,
) {
    let current_time = sui::clock::timestamp_ms(clock);

    // Check phase and deadline
    assert!(round.phase == pm_rules::vote_phase_reveal(), EInvalidPhase);
    assert!(current_time <= round.reveal_deadline_ms, EDeadlineNotReached);

    let SDVMCommitRecord {
        id: record_id,
        voter,
        round_id: commit_round_id,
        // RT3-CRIT-002 FIX: Validate round number matches
        round_number: commit_round_number,
        commitment_hash: committed_hash,
        stake_weight,
    } = commit_record;

    object::delete(record_id);

    // CRITICAL: Ensure commit belongs to this round (MP-001)
    assert!(commit_round_id == object::id(round), EWrongRound);
    // RT3-CRIT-002 FIX: Ensure round hasn't rolled
    assert!(commit_round_number == round.round_number, EWrongRound);

    // Verify stake
    let current_weight = pm_staking::position_net_stake(position);
    assert!(current_weight == stake_weight, EInvalidCommitRecord);

    // D4: Verify hash = sha3_256(bcs::to_bytes(&ABSTAIN) ++ salt)
    let abstain_outcome = pm_rules::sdvm_outcome_abstain();
    let preimage = bcs::to_bytes(&abstain_outcome);
    let mut full_preimage = preimage;
    vector::append(&mut full_preimage, salt);
    let computed_hash = hash::sha3_256(full_preimage);

    assert!(computed_hash == committed_hash, EHashMismatch);

    // Record the abstain vote (outcome = 0xFFFF)
    let reveal = VoteReveal {
        voter,
        voted_outcome: abstain_outcome,
        salt,
        stake_weight,
    };

    vector::push_back(&mut round.reveals, reveal);
    // NOTE: abstains do NOT count toward total_revealed_weight (D1: no reward, no slash)

    event::emit(VoteAbstainedEvent {
        round_id: object::id(round),
        dispute_id: round.dispute_id,
        voter,
        stake_weight,
    });
}

// ═══════════════════════════════════════════════════════════════
// Phase Transitions (Permissionless, D9)
// ═══════════════════════════════════════════════════════════════

/// Permissionless phase advance from COMMIT to REVEAL.
/// Idempotent: can be called multiple times, only transitions once.
public fun advance_to_reveal_phase(
    round: &mut SDVMVoteRound,
    clock: &Clock,
) {
    let current_time = sui::clock::timestamp_ms(clock);

    if (round.phase == pm_rules::vote_phase_commit()) {
        assert!(current_time >= round.commit_deadline_ms, EDeadlineNotReached);
        round.phase = pm_rules::vote_phase_reveal();

        event::emit(PhaseTransitionEvent {
            round_id: object::id(round),
            dispute_id: round.dispute_id,
            new_phase: round.phase,
            timestamp_ms: current_time,
        });
    }
}

/// Permissionless phase advance from REVEAL to TALLY.
/// Idempotent.
public fun advance_to_tally_phase(
    round: &mut SDVMVoteRound,
    clock: &Clock,
) {
    let current_time = sui::clock::timestamp_ms(clock);

    if (round.phase == pm_rules::vote_phase_reveal()) {
        assert!(current_time >= round.reveal_deadline_ms, EDeadlineNotReached);
        round.phase = pm_rules::vote_phase_tally();

        event::emit(PhaseTransitionEvent {
            round_id: object::id(round),
            dispute_id: round.dispute_id,
            new_phase: round.phase,
            timestamp_ms: current_time,
        });
    }
}

// ═══════════════════════════════════════════════════════════════
// Tally and Distribution (Permissionless, D9)
// ═══════════════════════════════════════════════════════════════

/// Tally votes (D8: decreasing GAT per round, D7: no tie-breaker, D1: opt-in slash).
/// Permissionless. Caller receives 0.1% of slash pool as reward.
/// Returns the winning outcome (u16::MAX on roll, outcome on settle).
///
/// IMPORTANT: This function counts votes and determines the outcome, but does NOT
/// directly apply slashes/rewards to individual SufferStakePosition objects (owned).
/// Instead, it records slash/reward amounts in the round for later claiming/application:
/// - Correct voters call claim_voter_reward() to claim their reward share
/// - Admin or bot calls apply_voter_slash() per incorrect voter to apply slash
/// This is the Sui-idiomatic Option A: allows concurrent processing post-tally.
public fun tally_votes(
    round: &mut SDVMVoteRound,
    pool: &mut SufferStakePool,
    clock: &Clock,
    ctx: &mut TxContext,
): u16 {
    let current_time = sui::clock::timestamp_ms(clock);

    assert!(round.phase == pm_rules::vote_phase_tally(), EInvalidPhase);
    assert!(!round.is_admin_resolved, ERoundAlreadySettled);

    // Check hard deadline
    assert!(current_time < round.hard_deadline_ms, EHardDeadlineExceeded);

    // Count votes by outcome (excluding abstains)
    let mut outcome_votes: vector<u64> = vector::empty();
    let mut i: u16 = 0;
    while (i < round.outcome_count) {
        vector::push_back(&mut outcome_votes, 0);
        i = i + 1;
    };

    let total_revealed = round.total_revealed_weight;
    let len = vector::length(&round.reveals);
    let mut idx = 0u64;
    while (idx < len) {
        let reveal = vector::borrow(&round.reveals, idx);
        if (reveal.voted_outcome != pm_rules::sdvm_outcome_abstain()) {
            let outcome_idx = (reveal.voted_outcome as u64);
            let vote_count = vector::borrow_mut(&mut outcome_votes, outcome_idx);
            *vote_count = *vote_count + reveal.stake_weight;
        };
        idx = idx + 1;
    };

    // Find maximum votes per outcome
    let mut max_votes: u64 = 0;
    let mut max_outcome: u16 = 0;
    let mut has_tie = false;
    let mut outcome_idx: u16 = 0;
    while (outcome_idx < round.outcome_count) {
        let outcome_vote_count = *vector::borrow(&outcome_votes, outcome_idx as u64);
        if (outcome_vote_count > max_votes) {
            max_votes = outcome_vote_count;
            max_outcome = outcome_idx;
            has_tie = false;
        } else if (outcome_vote_count == max_votes && outcome_vote_count > 0) {
            has_tie = true;
        };
        outcome_idx = outcome_idx + 1;
    };

    // D8: Determine GAT based on round number
    let gat_bps = if (option::is_some(&round.gat_override_bps)) {
        *option::borrow(&round.gat_override_bps)
    } else {
        match (round.round_number) {
            1 => GAT_ROUND_1_BPS,
            2 => GAT_ROUND_2_BPS,
            3 => GAT_ROUND_3_BPS,
            _ => GAT_ROUND_3_BPS, // Fallback to round 3 rate
        }
    };

    let min_participation = (round.total_staked_snapshot * gat_bps) / BASIS_POINTS;

    // D1: Only count revealed votes (not commits without reveals)
    if (total_revealed < min_participation) {
        assert!(round.round_number < round.max_rolls, EMaxRollsExceeded);
        // Roll to next round
        round.round_number = round.round_number + 1;
        round.phase = pm_rules::vote_phase_commit();
        round.reveals = vector::empty();
        round.total_committed_weight = 0;
        round.total_revealed_weight = 0;
        round.gat_override_bps = option::none();

        // Reset deadlines
        let (commit_dur, reveal_dur) = if (round.expedited) {
            (EXPEDITED_DURATION_MS, EXPEDITED_DURATION_MS)
        } else {
            (DEFAULT_COMMIT_DURATION_MS, DEFAULT_REVEAL_DURATION_MS)
        };

        round.commit_deadline_ms = current_time + commit_dur;
        round.reveal_deadline_ms = round.commit_deadline_ms + reveal_dur;

        event::emit(RoundRolledEvent {
            dispute_id: round.dispute_id,
            new_round_number: round.round_number,
            reason: b"Insufficient participation".to_vec(),
        });

        return u16::MAX // Sentinel value indicating roll
    };

    // D7: No tie-breaker; if tie, must roll
    if (has_tie && max_votes > 0) {
        assert!(round.round_number < round.max_rolls, EMaxRollsExceeded);
        round.round_number = round.round_number + 1;
        round.phase = pm_rules::vote_phase_commit();
        round.reveals = vector::empty();
        round.total_committed_weight = 0;
        round.total_revealed_weight = 0;
        round.gat_override_bps = option::none();

        let (commit_dur, reveal_dur) = if (round.expedited) {
            (EXPEDITED_DURATION_MS, EXPEDITED_DURATION_MS)
        } else {
            (DEFAULT_COMMIT_DURATION_MS, DEFAULT_REVEAL_DURATION_MS)
        };

        round.commit_deadline_ms = current_time + commit_dur;
        round.reveal_deadline_ms = round.commit_deadline_ms + reveal_dur;

        event::emit(RoundRolledEvent {
            dispute_id: round.dispute_id,
            new_round_number: round.round_number,
            reason: b"Tie detected".to_vec(),
        });

        return u16::MAX
    };

    // Check SPAT (65% supermajority)
    if (total_revealed > 0) {
        let spat_threshold = (total_revealed * SPAT_BPS) / BASIS_POINTS;
        if (max_votes < spat_threshold) {
            // No outcome reached SPAT; must roll
            assert!(round.round_number < round.max_rolls, EMaxRollsExceeded);
            round.round_number = round.round_number + 1;
            round.phase = pm_rules::vote_phase_commit();
            round.reveals = vector::empty();
            round.total_committed_weight = 0;
            round.total_revealed_weight = 0;
            round.gat_override_bps = option::none();

            let (commit_dur, reveal_dur) = if (round.expedited) {
                (EXPEDITED_DURATION_MS, EXPEDITED_DURATION_MS)
            } else {
                (DEFAULT_COMMIT_DURATION_MS, DEFAULT_REVEAL_DURATION_MS)
            };

            round.commit_deadline_ms = current_time + commit_dur;
            round.reveal_deadline_ms = round.commit_deadline_ms + reveal_dur;

            event::emit(RoundRolledEvent {
                dispute_id: round.dispute_id,
                new_round_number: round.round_number,
                reason: b"No supermajority (SPAT)".to_vec(),
            });

            return u16::MAX
        }
    };

    // Reached consensus: settle round
    round.phase = pm_rules::vote_phase_settled();
    round.is_admin_resolved = true;
    option::fill(&mut round.admin_resolved_outcome, max_outcome);

    // D1: Calculate slash/reward amounts for later claiming/application
    // - Correct voters: eligible for reward (pro-rata from slash pool)
    // - Incorrect voters: eligible for slash
    // - Non-reveals: 10x slash penalty
    // - Abstains: no slash, no reward

    let mut correct_voter_weight: u64 = 0;
    let mut incorrect_voter_weight: u64 = 0;

    let reveals_len = vector::length(&round.reveals);
    let mut rev_idx = 0u64;
    while (rev_idx < reveals_len) {
        let reveal = vector::borrow(&round.reveals, rev_idx);
        if (reveal.voted_outcome == pm_rules::sdvm_outcome_abstain()) {
            // No slash, no reward (D1)
        } else if (reveal.voted_outcome == max_outcome) {
            // Correct vote: eligible for reward
            correct_voter_weight = correct_voter_weight + reveal.stake_weight;
        } else {
            // Incorrect vote: eligible for slash at base rate
            incorrect_voter_weight = incorrect_voter_weight + reveal.stake_weight;
        };
        rev_idx = rev_idx + 1;
    };

    // Tally caller reward (D9: 0.1% of slash pool)
    let slash_pool_balance = pm_staking::pool_pending_slash(pool);
    let tally_reward = (slash_pool_balance * TALLY_CALLER_REWARD_BPS) / BASIS_POINTS;
    if (tally_reward > 0) {
        let reward_coin = pm_staking::withdraw_pending_slash(pool, tally_reward, ctx);
        transfer::public_transfer(reward_coin, tx_context::sender(ctx));
    };

    // NOTE (RT-Timing): Tally caller reward extracted from *pre-tally* slash pool balance,
    // before individual voter slashes are finalized. This is a known timing issue flagged
    // in RT-003 (RT1) and RT6 (Integration). Documented for Phase 2 refinement.
    // Current behavior: caller reward = 0.1% of slash_pool at tally time.
    // Phase 2 option: extract reward AFTER individual slashes, or use fixed floor from treasury.

    event::emit(TallyCompletedEvent {
        round_id: object::id(round),
        dispute_id: round.dispute_id,
        winning_outcome: max_outcome,
        total_votes: total_revealed,
        total_weight: round.total_staked_snapshot,
        participation_rate_bps: (total_revealed * BASIS_POINTS) / round.total_staked_snapshot,
    });

    max_outcome
}

// ═══════════════════════════════════════════════════════════════
// Admin Operations (God Levers)
// ═══════════════════════════════════════════════════════════════

/// Admin: Force-resolve a dispute to a specific outcome (god lever).
public fun admin_resolve_dispute(
    _: &SDVMAdminCap,
    round: &mut SDVMVoteRound,
    winning_outcome: u16,
    ctx: &TxContext,
) {
    assert!(winning_outcome < round.outcome_count || winning_outcome == pm_rules::sdvm_outcome_abstain(), EInvalidOutcome);

    round.is_admin_resolved = true;
    option::fill(&mut round.admin_resolved_outcome, winning_outcome);
    round.phase = pm_rules::vote_phase_settled();

    event::emit(AdminResolveEvent {
        round_id: object::id(round),
        dispute_id: round.dispute_id,
        resolved_outcome: winning_outcome,
        admin: tx_context::sender(ctx),
    });
}

/// Admin: Force phase transition (god lever).
public fun admin_advance_phase(
    _: &SDVMAdminCap,
    round: &mut SDVMVoteRound,
    ctx: &TxContext,
) {
    let old_phase = round.phase;
    if (round.phase == pm_rules::vote_phase_commit()) {
        round.phase = pm_rules::vote_phase_reveal();
    } else if (round.phase == pm_rules::vote_phase_reveal()) {
        round.phase = pm_rules::vote_phase_tally();
    } else if (round.phase == pm_rules::vote_phase_tally()) {
        round.phase = pm_rules::vote_phase_settled();
    };

    if (old_phase != round.phase) {
        event::emit(AdminPhaseAdvanceEvent {
            round_id: object::id(round),
            dispute_id: round.dispute_id,
            new_phase: round.phase,
            admin: tx_context::sender(ctx),
        });
    }
}

/// Admin: Override GAT for a specific dispute (god lever).
public fun admin_quorum_override(
    _: &SDVMAdminCap,
    round: &mut SDVMVoteRound,
    new_gat_bps: u64,
    ctx: &TxContext,
) {
    assert!(new_gat_bps <= BASIS_POINTS, EInvalidOutcome);
    // RT2-HIGH-004 FIX: Check if override already set before filling to prevent panic
    assert!(option::is_none(&round.gat_override_bps), EInvalidOutcome);
    option::fill(&mut round.gat_override_bps, new_gat_bps);

    event::emit(AdminQuorumOverrideEvent {
        round_id: object::id(round),
        dispute_id: round.dispute_id,
        new_gat_bps,
        admin: tx_context::sender(ctx),
    });
}

// ═══════════════════════════════════════════════════════════════
// Cleanup Operations
// ═══════════════════════════════════════════════════════════════

/// Self-service: clear a settled dispute from a staker's pending list.
/// Staker calls this with both the round (to prove it's SETTLED) and their position.
/// Prevents permanent lock if pm_sdvm's tally path failed to call unregister_dispute().
/// Permissionless — any party can call on behalf of the staker.
public fun clear_settled_dispute_verified(
    round: &SDVMVoteRound,
    position: &mut SufferStakePosition,
) {
    assert!(round.phase == pm_rules::vote_phase_settled(), EInvalidPhase);
    pm_staking::unregister_dispute(position, object::id(round));
}

/// Cleanup orphaned SDVMCommitRecords after a round settles.
/// If a voter committed but never revealed (or tx failed), the owned commit record
/// remains on-chain as an orphan. Anyone can call this after the round is SETTLED
/// to delete the orphaned record and reclaim storage.
/// The commit_record must belong to the given round (verified by round_id).
public fun cleanup_orphaned_commit(
    round: &SDVMVoteRound,
    commit_record: SDVMCommitRecord,
) {
    // Round must be settled (all votes counted, slashes applied)
    assert!(round.phase == pm_rules::vote_phase_settled(), EInvalidPhase);

    // Verify the commit belongs to this round
    let SDVMCommitRecord {
        id: record_id,
        voter: _,
        round_id: commit_round_id,
        // RT3-CRIT-002 FIX: Also validate round number
        round_number: commit_round_number,
        commitment_hash: _,
        stake_weight: _,
    } = commit_record;

    assert!(commit_round_id == object::id(round), EWrongRound);
    // RT3-CRIT-002 FIX: Ensure it matches the current round number
    assert!(commit_round_number == round.round_number, EWrongRound);

    // Delete the orphaned record, reclaiming storage
    object::delete(record_id);

    event::emit(OrphanedCommitCleanedEvent {
        round_id: object::id(round),
        dispute_id: round.dispute_id,
    });
}

// ═══════════════════════════════════════════════════════════════
// Read Accessors
// ═══════════════════════════════════════════════════════════════

public fun round_dispute_id(r: &SDVMVoteRound): ID { r.dispute_id }
public fun round_number(r: &SDVMVoteRound): u8 { r.round_number }
public fun round_phase(r: &SDVMVoteRound): u8 { r.phase }
public fun round_commit_deadline_ms(r: &SDVMVoteRound): u64 { r.commit_deadline_ms }
public fun round_reveal_deadline_ms(r: &SDVMVoteRound): u64 { r.reveal_deadline_ms }
public fun round_total_staked_snapshot(r: &SDVMVoteRound): u64 { r.total_staked_snapshot }
public fun round_total_committed_weight(r: &SDVMVoteRound): u64 { r.total_committed_weight }
public fun round_total_revealed_weight(r: &SDVMVoteRound): u64 { r.total_revealed_weight }
public fun round_expedited(r: &SDVMVoteRound): bool { r.expedited }
public fun round_outcome_count(r: &SDVMVoteRound): u16 { r.outcome_count }
public fun round_reveal_count(r: &SDVMVoteRound): u64 { vector::length(&r.reveals) }
public fun round_is_settled(r: &SDVMVoteRound): bool {
    r.phase == pm_rules::vote_phase_settled()
}
public fun round_admin_resolved_outcome(r: &SDVMVoteRound): Option<u16> {
    r.admin_resolved_outcome
}

public fun commit_record_voter(c: &SDVMCommitRecord): address { c.voter }
public fun commit_record_stake_weight(c: &SDVMCommitRecord): u64 { c.stake_weight }

// ═══════════════════════════════════════════════════════════════
// Reward & Slash Application (Post-Tally, Option A: Sui-Native)
// ═══════════════════════════════════════════════════════════════

/// Voter claims their reward for voting correctly in a settled round.
/// Rewards are pro-rata from the slash pool:
/// voter_reward = (voter_stake / total_correct_stake) * total_available_rewards
///
/// REQUIRES:
/// - Round must be SETTLED
/// - Voter must have been revealed in the reveals vector
/// - Voter must have voted for max_outcome (winning outcome)
/// - Voter must not have already claimed reward for this round
/// - Uses u128 intermediates to prevent overflow per spec
public fun claim_voter_reward(
    round: &mut SDVMVoteRound,
    position: &mut SufferStakePosition,
    pool: &mut SufferStakePool,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(round.phase == pm_rules::vote_phase_settled(), EInvalidPhase);
    assert!(option::is_some(&round.admin_resolved_outcome), EInvalidPhase);

    let voter = pm_staking::position_owner(position);

    // Check that this voter has not already claimed reward
    assert!(!vec_set::contains(&round.claimed_voters, &voter), EAlreadyClaimed);

    let winning_outcome = *option::borrow(&round.admin_resolved_outcome);

    // Find this voter's reveal
    let reveals_len = vector::length(&round.reveals);
    let mut found_reveal = option::none<&VoteReveal>();
    let mut idx = 0u64;
    while (idx < reveals_len) {
        let reveal = vector::borrow(&round.reveals, idx);
        if (reveal.voter == pm_staking::position_owner(position) &&
            reveal.voted_outcome == winning_outcome) {
            found_reveal = option::some(reveal);
            break
        };
        idx = idx + 1;
    };

    assert!(option::is_some(&found_reveal), ENotVoter);
    let voter_reveal = option::extract(&mut found_reveal);

    // Calculate correct voters' total weight (for pro-rata calculation)
    let mut total_correct_weight: u64 = 0;
    let mut idx2 = 0u64;
    while (idx2 < reveals_len) {
        let reveal = vector::borrow(&round.reveals, idx2);
        if (reveal.voted_outcome == winning_outcome) {
            total_correct_weight = total_correct_weight + reveal.stake_weight;
        };
        idx2 = idx2 + 1;
    };

    // CRITICAL FIX (RT-002): Explicit guard for zero correct voters.
    // This prevents division by zero and catches state corruption.
    // SPAT check during tally prevents reaching here with zero correct voters,
    // but we make the check explicit for safety.
    assert!(total_correct_weight > 0, EZeroStake);

    // Calculate reward using u128 to prevent overflow.
    // Rewards come from pool.pending_slash (funded by slashing incorrect voters).
    let available_rewards = pm_staking::pool_pending_slash(pool);
    let voter_stake_u128 = (voter_reveal.stake_weight as u128);
    let total_correct_u128 = (total_correct_weight as u128);
    let available_rewards_u128 = (available_rewards as u128);

    let reward_amount_u128 = (voter_stake_u128 * available_rewards_u128) / total_correct_u128;
    let reward_amount = (reward_amount_u128 as u64);

    // Mark voter as having claimed reward before transfer (prevent reentrancy)
    vec_set::insert(&mut round.claimed_voters, voter);

    if (reward_amount > 0) {
        // ACTUAL TOKEN TRANSFER: withdraw from pool.pending_slash and send to voter.
        // This is the economic incentive — correct voters receive slashed SUFFER.
        let reward_coin = pm_staking::withdraw_pending_slash(pool, reward_amount, ctx);
        transfer::public_transfer(reward_coin, voter);

        // Track cumulative rewards on position for display/auditing
        pm_staking::apply_reward(position, reward_amount);

        event::emit(RewardClaimedEvent {
            round_id: object::id(round),
            dispute_id: round.dispute_id,
            voter,
            reward_amount,
        });
    };

    // Unregister this dispute from voter's position (frees unstake if no other disputes pending)
    pm_staking::unregister_dispute(position, object::id(round));
}

/// Public struct for reward claim event.
public struct RewardClaimedEvent has copy, drop {
    round_id: ID,
    dispute_id: ID,
    voter: address,
    reward_amount: u64,
}

/// Permissionless slash application: any bot/user can apply slash to incorrect or non-reveal voters.
/// Slash calculation:
/// - If voted incorrectly (voted != winning): slash = voter_stake * slash_rate_bps / 10000
/// - If never revealed (committed but no reveal): slash = voter_stake * slash_rate_bps * 10 / 10000
/// - If abstained: no slash
///
/// The slash is applied to the voter's cumulative_slash counter.
/// Voter can only be slashed once per round (tracked in slashed_voters set).
///
/// For Phase 2 Testnet, slash_rate_bps comes from the caller (typically from pool config).
/// Default: 10 bps (0.1% on mainnet), 0% on T1, 5% on T2, 10% on T3.
public fun apply_voter_slash(
    round: &mut SDVMVoteRound,
    pool: &mut SufferStakePool,
    position: &mut SufferStakePosition,
    slash_rate_bps: u64,
) {
    assert!(round.phase == pm_rules::vote_phase_settled(), EInvalidPhase);
    assert!(option::is_some(&round.admin_resolved_outcome), EInvalidPhase);

    let winning_outcome = *option::borrow(&round.admin_resolved_outcome);
    let voter = pm_staking::position_owner(position);

    // Check that this voter has not already been slashed
    assert!(!vec_set::contains(&round.slashed_voters, &voter), EAlreadySlashed);

    // Find this voter's reveal (if any)
    let reveals_len = vector::length(&round.reveals);
    let mut found_reveal = option::none<&VoteReveal>();
    let mut idx = 0u64;
    while (idx < reveals_len) {
        let reveal = vector::borrow(&round.reveals, idx);
        if (reveal.voter == voter) {
            found_reveal = option::some(reveal);
            break
        };
        idx = idx + 1;
    };

    if (option::is_none(&found_reveal)) {
        // Voter committed but never revealed: 10x penalty
        // RT2-CRITICAL-004: Use u128 to prevent overflow in slash calculation
        let stake = pm_staking::position_net_stake(position);
        let stake_u128 = (stake as u128);
        let slash_rate_u128 = (slash_rate_bps as u128);
        let penalty_multiplier = 10u128;
        let slash_amount_u128 = (stake_u128 * slash_rate_u128 * penalty_multiplier) / (BASIS_POINTS as u128);
        let slash_amount = (slash_amount_u128 as u64);
        let capped_slash = if (slash_amount > stake) { stake } else { slash_amount };

        // Mark voter as slashed before applying (prevent reentrancy)
        vec_set::insert(&mut round.slashed_voters, voter);

        pm_staking::apply_slash(
            pool,
            position,
            capped_slash,
            b"Non-reveal 10x penalty".to_vec(),
        );

        event::emit(VoterSlashedEvent {
            round_id: object::id(round),
            dispute_id: round.dispute_id,
            voter,
            slash_amount: capped_slash,
            reason: b"Non-reveal".to_vec(),
        });
    } else {
        let voter_reveal = option::borrow(&found_reveal);

        // Check if voted correctly (abstention is never slashed)
        if (voter_reveal.voted_outcome == pm_rules::sdvm_outcome_abstain()) {
            // Abstain: no slash, no reward (D1)
            return
        };

        if (voter_reveal.voted_outcome != winning_outcome) {
            // Voted incorrectly: standard slash rate
            // RT2-CRITICAL-004: Use u128 to prevent overflow
            let stake = pm_staking::position_net_stake(position);
            let stake_u128 = (stake as u128);
            let slash_rate_u128 = (slash_rate_bps as u128);
            let slash_amount_u128 = (stake_u128 * slash_rate_u128) / (BASIS_POINTS as u128);
            let slash_amount = (slash_amount_u128 as u64);
            let capped_slash = if (slash_amount > stake) { stake } else { slash_amount };

            // Mark voter as slashed before applying (prevent reentrancy)
            vec_set::insert(&mut round.slashed_voters, voter);

            pm_staking::apply_slash(
                pool,
                position,
                capped_slash,
                b"Incorrect vote".to_vec(),
            );

            event::emit(VoterSlashedEvent {
                round_id: object::id(round),
                dispute_id: round.dispute_id,
                voter,
                slash_amount: capped_slash,
                reason: b"Incorrect vote".to_vec(),
            });
        };
    };

    // Unregister this dispute from voter's position (frees unstake if no other disputes pending)
    pm_staking::unregister_dispute(position, object::id(round));
}

/// Public struct for voter slash event.
public struct VoterSlashedEvent has copy, drop {
    round_id: ID,
    dispute_id: ID,
    voter: address,
    slash_amount: u64,
    reason: vector<u8>,
}

// ═══════════════════════════════════════════════════════════════
// God Lever Audit Tracking
// ═══════════════════════════════════════════════════════════════

/// Initialize the governance tracker. Called once at module deployment.
public fun create_governance_tracker(
    clock: &Clock,
    ctx: &mut TxContext,
): SDVMGovernanceTracker {
    SDVMGovernanceTracker {
        id: object::new(ctx),
        admin_resolve_count: 0,
        admin_slash_override_count: 0,
        admin_quorum_override_count: 0,
        admin_pause_staking_count: 0,
        admin_phase_advance_count: 0,
        total_disputes_resolved: 0,
        total_disputes_rolled: 0,
        last_updated_ms: sui::clock::timestamp_ms(clock),
    }
}

/// Increment admin_resolve counter. Call before each AdminResolve action.
public fun increment_admin_resolve(
    tracker: &mut SDVMGovernanceTracker,
    clock: &Clock,
) {
    tracker.admin_resolve_count += 1;
    tracker.last_updated_ms = sui::clock::timestamp_ms(clock);
}

/// Increment admin_slash_override counter. Call before each AdminSlashOverride action.
public fun increment_admin_slash_override(
    tracker: &mut SDVMGovernanceTracker,
    clock: &Clock,
) {
    tracker.admin_slash_override_count += 1;
    tracker.last_updated_ms = sui::clock::timestamp_ms(clock);
}

/// Increment admin_quorum_override counter. Call before each AdminQuorumOverride action.
public fun increment_admin_quorum_override(
    tracker: &mut SDVMGovernanceTracker,
    clock: &Clock,
) {
    tracker.admin_quorum_override_count += 1;
    tracker.last_updated_ms = sui::clock::timestamp_ms(clock);
}

/// Increment admin_pause_staking counter. Call before each AdminPauseStaking action.
public fun increment_admin_pause_staking(
    tracker: &mut SDVMGovernanceTracker,
    clock: &Clock,
) {
    tracker.admin_pause_staking_count += 1;
    tracker.last_updated_ms = sui::clock::timestamp_ms(clock);
}

/// Increment admin_phase_advance counter. Call before each AdminPhaseAdvance action.
public fun increment_admin_phase_advance(
    tracker: &mut SDVMGovernanceTracker,
    clock: &Clock,
) {
    tracker.admin_phase_advance_count += 1;
    tracker.last_updated_ms = sui::clock::timestamp_ms(clock);
}

/// Increment total_disputes_resolved counter after a dispute is SETTLED.
public fun increment_disputes_resolved(
    tracker: &mut SDVMGovernanceTracker,
    clock: &Clock,
) {
    tracker.total_disputes_resolved += 1;
    tracker.last_updated_ms = sui::clock::timestamp_ms(clock);
}

/// Increment total_disputes_rolled counter after a dispute ROLLS (exceeds max_rolls → INVALID).
public fun increment_disputes_rolled(
    tracker: &mut SDVMGovernanceTracker,
    clock: &Clock,
) {
    tracker.total_disputes_rolled += 1;
    tracker.last_updated_ms = sui::clock::timestamp_ms(clock);
}

// ── Read accessors ──

/// Query: total AdminResolve usage count.
public fun read_admin_resolve_count(tracker: &SDVMGovernanceTracker): u64 {
    tracker.admin_resolve_count
}

/// Query: total AdminSlashOverride usage count.
public fun read_admin_slash_override_count(tracker: &SDVMGovernanceTracker): u64 {
    tracker.admin_slash_override_count
}

/// Query: total AdminQuorumOverride usage count.
public fun read_admin_quorum_override_count(tracker: &SDVMGovernanceTracker): u64 {
    tracker.admin_quorum_override_count
}

/// Query: total AdminPauseStaking usage count.
public fun read_admin_pause_staking_count(tracker: &SDVMGovernanceTracker): u64 {
    tracker.admin_pause_staking_count
}

/// Query: total AdminPhaseAdvance usage count.
public fun read_admin_phase_advance_count(tracker: &SDVMGovernanceTracker): u64 {
    tracker.admin_phase_advance_count
}

/// Query: total disputes resolved (SETTLED or INVALID).
public fun read_total_disputes_resolved(tracker: &SDVMGovernanceTracker): u64 {
    tracker.total_disputes_resolved
}

/// Query: total disputes rolled (exceeded max_rolls).
public fun read_total_disputes_rolled(tracker: &SDVMGovernanceTracker): u64 {
    tracker.total_disputes_rolled
}

/// Query: last update timestamp (ms).
public fun read_last_updated_ms(tracker: &SDVMGovernanceTracker): u64 {
    tracker.last_updated_ms
}
