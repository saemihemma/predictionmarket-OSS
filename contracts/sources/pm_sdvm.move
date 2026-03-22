/// PMSDVM — collateral-family dispute voting with commit/reveal rounds.
module prediction_market::pm_sdvm;

use std::bcs;
use sui::{
    balance::{Self, Balance},
    clock::Clock,
    event,
};
use std::hash;
use prediction_market::{
    pm_rules,
    pm_staking::{Self, PMStakePool, PMStakePosition, SDVMAdminCap},
};

#[error(code = 0)]
const EInvalidPhase: vector<u8> = b"Invalid phase";
#[error(code = 1)]
const EDeadlineNotReached: vector<u8> = b"Phase deadline not reached";
#[error(code = 2)]
const EAlreadyCommitted: vector<u8> = b"Already committed";
#[error(code = 3)]
const EHashMismatch: vector<u8> = b"Commitment hash mismatch";
#[error(code = 4)]
const EInvalidOutcome: vector<u8> = b"Invalid outcome";
#[error(code = 5)]
const ENotVoter: vector<u8> = b"Not a valid voter";
#[error(code = 6)]
const EAlreadyRevealed: vector<u8> = b"Already revealed";
#[error(code = 7)]
const EAlreadyClaimed: vector<u8> = b"Reward already claimed";
#[error(code = 8)]
const EAlreadySlashed: vector<u8> = b"Voter already slashed";
#[error(code = 9)]
const EWrongRound: vector<u8> = b"Commit record belongs to a different round";
#[error(code = 10)]
const EAbstainVoteInvalid: vector<u8> = b"Use explicit abstain";

const DEFAULT_COMMIT_DURATION_MS: u64 = 12 * 60 * 60 * 1000;
const DEFAULT_REVEAL_DURATION_MS: u64 = 12 * 60 * 60 * 1000;
const EXPEDITED_DURATION_MS: u64 = 4 * 60 * 60 * 1000;
const HARD_DEADLINE_MS: u64 = 7 * 24 * 60 * 60 * 1000;
const MAX_ROLLS: u8 = 3;
const GAT_ROUND_1_BPS: u64 = 500;
const GAT_ROUND_2_BPS: u64 = 300;
const GAT_ROUND_3_BPS: u64 = 100;
const BASIS_POINTS: u64 = 10_000;

public struct VoteCommittedEvent<phantom Collateral> has copy, drop {
    round_id: ID,
    dispute_id: ID,
    voter: address,
    stake_weight: u64,
}

public struct VoteRevealedEvent<phantom Collateral> has copy, drop {
    round_id: ID,
    dispute_id: ID,
    voter: address,
    voted_outcome: u16,
    stake_weight: u64,
}

public struct VoteAbstainedEvent<phantom Collateral> has copy, drop {
    round_id: ID,
    dispute_id: ID,
    voter: address,
    stake_weight: u64,
}

public struct PhaseTransitionEvent<phantom Collateral> has copy, drop {
    round_id: ID,
    dispute_id: ID,
    new_phase: u8,
    timestamp_ms: u64,
}

public struct SDVMVoteRoundCreatedEvent<phantom Collateral> has copy, drop {
    round_id: ID,
    dispute_id: ID,
    expedited: bool,
    timestamp_ms: u64,
}

public struct TallyCompletedEvent<phantom Collateral> has copy, drop {
    round_id: ID,
    dispute_id: ID,
    winning_outcome: u16,
    total_weight: u64,
    participation_rate_bps: u64,
}

public struct TallyIndeterminateEvent<phantom Collateral> has copy, drop {
    round_id: ID,
    dispute_id: ID,
    total_weight: u64,
    participation_rate_bps: u64,
    reason: vector<u8>,
}

public struct RoundRolledEvent<phantom Collateral> has copy, drop {
    dispute_id: ID,
    new_round_number: u8,
    reason: vector<u8>,
}

public struct AdminResolveEvent<phantom Collateral> has copy, drop {
    round_id: ID,
    dispute_id: ID,
    resolved_outcome: u16,
    admin: address,
}

public struct AdminPhaseAdvanceEvent<phantom Collateral> has copy, drop {
    round_id: ID,
    dispute_id: ID,
    new_phase: u8,
    admin: address,
}

public struct AdminQuorumOverrideEvent<phantom Collateral> has copy, drop {
    round_id: ID,
    dispute_id: ID,
    new_gat_bps: u64,
    admin: address,
}

public struct RewardClaimedEvent<phantom Collateral> has copy, drop {
    round_id: ID,
    dispute_id: ID,
    voter: address,
    reward_amount: u64,
}

public struct VoterSlashedEvent<phantom Collateral> has copy, drop {
    round_id: ID,
    dispute_id: ID,
    voter: address,
    slash_amount: u64,
    reason: vector<u8>,
}

public struct OrphanedCommitCleanedEvent<phantom Collateral> has copy, drop {
    round_id: ID,
    dispute_id: ID,
}

public struct VoteReveal has store, copy, drop {
    voter: address,
    voted_outcome: u16,
    stake_weight: u64,
}

public struct SDVMVoteRound<phantom Collateral> has key {
    id: UID,
    dispute_id: ID,
    round_number: u8,
    phase: u8,
    commit_deadline_ms: u64,
    reveal_deadline_ms: u64,
    total_staked_snapshot: u64,
    total_committed_weight: u64,
    total_revealed_weight: u64,
    expedited: bool,
    hard_deadline_ms: u64,
    reveals: vector<VoteReveal>,
    committed_voters: vector<address>,
    tally_caller_reward: Balance<Collateral>,
    outcome_count: u16,
    gat_override_bps: Option<u64>,
    is_admin_resolved: bool,
    admin_resolved_outcome: Option<u16>,
    max_rolls: u8,
    claimed_voters: vector<address>,
    slashed_voters: vector<address>,
}

public struct SDVMCommitRecord<phantom Collateral> has key, store {
    id: UID,
    voter: address,
    round_id: ID,
    round_number: u8,
    commitment_hash: vector<u8>,
    stake_weight: u64,
}

public struct SDVMGovernanceTracker<phantom Collateral> has key {
    id: UID,
    admin_resolve_count: u64,
    admin_slash_override_count: u64,
    admin_quorum_override_count: u64,
    admin_pause_staking_count: u64,
    admin_phase_advance_count: u64,
    total_disputes_resolved: u64,
    total_disputes_rolled: u64,
    last_updated_ms: u64,
}

fun current_gat_bps<Collateral>(round: &SDVMVoteRound<Collateral>): u64 {
    if (option::is_some(&round.gat_override_bps)) {
        *option::borrow(&round.gat_override_bps)
    } else if (round.round_number == 1) {
        GAT_ROUND_1_BPS
    } else if (round.round_number == 2) {
        GAT_ROUND_2_BPS
    } else {
        GAT_ROUND_3_BPS
    }
}

fun contains_address(addresses: &vector<address>, addr: address): bool {
    vector::contains(addresses, &addr)
}

fun emit_phase_transition<Collateral>(round: &SDVMVoteRound<Collateral>, timestamp_ms: u64) {
    event::emit(PhaseTransitionEvent<Collateral> {
        round_id: object::id(round),
        dispute_id: round.dispute_id,
        new_phase: round.phase,
        timestamp_ms,
    });
}

public fun create_vote_round<Collateral>(
    dispute_id: ID,
    outcome_count: u16,
    total_staked: u64,
    expedited: bool,
    clock: &Clock,
    ctx: &mut TxContext,
): SDVMVoteRound<Collateral> {
    let current_time = sui::clock::timestamp_ms(clock);
    let duration = if (expedited) { EXPEDITED_DURATION_MS } else { DEFAULT_COMMIT_DURATION_MS };
    let vote_round = SDVMVoteRound<Collateral> {
        id: object::new(ctx),
        dispute_id,
        round_number: 1,
        phase: pm_rules::vote_phase_commit(),
        commit_deadline_ms: current_time + duration,
        reveal_deadline_ms: current_time + duration + if (expedited) { EXPEDITED_DURATION_MS } else { DEFAULT_REVEAL_DURATION_MS },
        total_staked_snapshot: total_staked,
        total_committed_weight: 0,
        total_revealed_weight: 0,
        expedited,
        hard_deadline_ms: current_time + HARD_DEADLINE_MS,
        reveals: vector::empty(),
        committed_voters: vector::empty(),
        tally_caller_reward: balance::zero<Collateral>(),
        outcome_count,
        gat_override_bps: option::none(),
        is_admin_resolved: false,
        admin_resolved_outcome: option::none(),
        max_rolls: MAX_ROLLS,
        claimed_voters: vector::empty(),
        slashed_voters: vector::empty(),
    };

    event::emit(SDVMVoteRoundCreatedEvent<Collateral> {
        round_id: object::id(&vote_round),
        dispute_id,
        expedited,
        timestamp_ms: current_time,
    });

    vote_round
}

public fun share_vote_round<Collateral>(round: SDVMVoteRound<Collateral>) {
    transfer::share_object(round);
}

public fun commit_vote<Collateral>(
    round: &mut SDVMVoteRound<Collateral>,
    _pool: &PMStakePool<Collateral>,
    position: &mut PMStakePosition<Collateral>,
    commitment_hash: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
): SDVMCommitRecord<Collateral> {
    let current_time = sui::clock::timestamp_ms(clock);
    assert!(round.phase == pm_rules::vote_phase_commit(), EInvalidPhase);
    assert!(current_time <= round.commit_deadline_ms, EDeadlineNotReached);

    let voter = tx_context::sender(ctx);
    assert!(pm_staking::position_owner(position) == voter, ENotVoter);
    assert!(!contains_address(&round.committed_voters, voter), EAlreadyCommitted);

    let stake_weight = pm_staking::position_net_stake(position);
    assert!(stake_weight > 0, ENotVoter);
    pm_staking::register_dispute(position, object::id(round));
    vector::push_back(&mut round.committed_voters, voter);

    let record = SDVMCommitRecord<Collateral> {
        id: object::new(ctx),
        voter,
        round_id: object::id(round),
        round_number: round.round_number,
        commitment_hash,
        stake_weight,
    };

    event::emit(VoteCommittedEvent<Collateral> {
        round_id: object::id(round),
        dispute_id: round.dispute_id,
        voter,
        stake_weight,
    });

    record
}

fun reveal_internal<Collateral>(
    round: &mut SDVMVoteRound<Collateral>,
    commit_record: SDVMCommitRecord<Collateral>,
    position: &PMStakePosition<Collateral>,
    voted_outcome: u16,
    salt: vector<u8>,
    clock: &Clock,
    allow_abstain: bool,
) {
    let current_time = sui::clock::timestamp_ms(clock);
    assert!(round.phase == pm_rules::vote_phase_reveal(), EInvalidPhase);
    assert!(current_time <= round.reveal_deadline_ms, EDeadlineNotReached);
    if (!allow_abstain) {
        assert!(voted_outcome != pm_rules::sdvm_outcome_abstain(), EAbstainVoteInvalid);
    };
    if (voted_outcome != pm_rules::sdvm_outcome_abstain()) {
        assert!((voted_outcome as u64) < (round.outcome_count as u64), EInvalidOutcome);
    };

    let SDVMCommitRecord {
        id,
        voter,
        round_id,
        round_number,
        commitment_hash,
        stake_weight,
    } = commit_record;
    object::delete(id);

    assert!(round_id == object::id(round), EWrongRound);
    assert!(round_number == round.round_number, EWrongRound);
    assert!(pm_staking::position_owner(position) == voter, ENotVoter);
    assert!(pm_staking::position_net_stake(position) == stake_weight, ENotVoter);

    let mut preimage = bcs::to_bytes(&voted_outcome);
    vector::append(&mut preimage, salt);
    let computed_hash = hash::sha3_256(preimage);
    assert!(computed_hash == commitment_hash, EHashMismatch);

    let reveals_len = vector::length(&round.reveals);
    let mut i = 0u64;
    while (i < reveals_len) {
        let reveal = vector::borrow(&round.reveals, i);
        assert!(reveal.voter != voter, EAlreadyRevealed);
        i = i + 1;
    };

    vector::push_back(&mut round.reveals, VoteReveal {
        voter,
        voted_outcome,
        stake_weight,
    });
    round.total_revealed_weight = round.total_revealed_weight + stake_weight;
    round.total_committed_weight = round.total_committed_weight + stake_weight;

    if (voted_outcome == pm_rules::sdvm_outcome_abstain()) {
        event::emit(VoteAbstainedEvent<Collateral> {
            round_id: object::id(round),
            dispute_id: round.dispute_id,
            voter,
            stake_weight,
        });
    } else {
        event::emit(VoteRevealedEvent<Collateral> {
            round_id: object::id(round),
            dispute_id: round.dispute_id,
            voter,
            voted_outcome,
            stake_weight,
        });
    };
}

public fun reveal_vote<Collateral>(
    round: &mut SDVMVoteRound<Collateral>,
    commit_record: SDVMCommitRecord<Collateral>,
    position: &PMStakePosition<Collateral>,
    voted_outcome: u16,
    salt: vector<u8>,
    clock: &Clock,
    _ctx: &TxContext,
) {
    reveal_internal(round, commit_record, position, voted_outcome, salt, clock, false);
}

public fun explicit_abstain<Collateral>(
    round: &mut SDVMVoteRound<Collateral>,
    commit_record: SDVMCommitRecord<Collateral>,
    position: &PMStakePosition<Collateral>,
    salt: vector<u8>,
    clock: &Clock,
    _ctx: &TxContext,
) {
    reveal_internal(round, commit_record, position, pm_rules::sdvm_outcome_abstain(), salt, clock, true);
}

public fun advance_to_reveal_phase<Collateral>(round: &mut SDVMVoteRound<Collateral>, clock: &Clock) {
    let current_time = sui::clock::timestamp_ms(clock);
    assert!(round.phase == pm_rules::vote_phase_commit(), EInvalidPhase);
    assert!(current_time >= round.commit_deadline_ms, EDeadlineNotReached);
    round.phase = pm_rules::vote_phase_reveal();
    emit_phase_transition(round, current_time);
}

public fun advance_to_tally_phase<Collateral>(round: &mut SDVMVoteRound<Collateral>, clock: &Clock) {
    let current_time = sui::clock::timestamp_ms(clock);
    assert!(round.phase == pm_rules::vote_phase_reveal(), EInvalidPhase);
    assert!(current_time >= round.reveal_deadline_ms, EDeadlineNotReached);
    round.phase = pm_rules::vote_phase_tally();
    emit_phase_transition(round, current_time);
}

public fun tally_votes<Collateral>(
    round: &mut SDVMVoteRound<Collateral>,
    _pool: &mut PMStakePool<Collateral>,
    clock: &Clock,
    _ctx: &mut TxContext,
) {
    let current_time = sui::clock::timestamp_ms(clock);
    assert!(round.phase == pm_rules::vote_phase_tally(), EInvalidPhase);

    let participation_bps = if (round.total_staked_snapshot == 0) {
        0
    } else {
        (((round.total_revealed_weight as u128) * (BASIS_POINTS as u128)) / (round.total_staked_snapshot as u128)) as u64
    };

    if (participation_bps < current_gat_bps(round) && round.round_number < round.max_rolls && current_time < round.hard_deadline_ms) {
        let duration = if (round.expedited) { EXPEDITED_DURATION_MS } else { DEFAULT_COMMIT_DURATION_MS };
        round.round_number = round.round_number + 1;
        round.phase = pm_rules::vote_phase_commit();
        round.commit_deadline_ms = current_time + duration;
        round.reveal_deadline_ms = current_time + duration + if (round.expedited) { EXPEDITED_DURATION_MS } else { DEFAULT_REVEAL_DURATION_MS };
        round.total_committed_weight = 0;
        round.total_revealed_weight = 0;
        round.reveals = vector::empty();
        round.committed_voters = vector::empty();
        round.claimed_voters = vector::empty();
        round.slashed_voters = vector::empty();
        round.admin_resolved_outcome = option::none();
        round.is_admin_resolved = false;

        event::emit(RoundRolledEvent<Collateral> {
            dispute_id: round.dispute_id,
            new_round_number: round.round_number,
            reason: b"GAT not met",
        });
        return
    };

    let mut outcome_weights = vector::empty<u64>();
    let mut outcome_idx = 0u16;
    while (outcome_idx < round.outcome_count) {
        vector::push_back(&mut outcome_weights, 0);
        outcome_idx = outcome_idx + 1;
    };

    let reveals_len = vector::length(&round.reveals);
    let mut i = 0u64;
    while (i < reveals_len) {
        let reveal = vector::borrow(&round.reveals, i);
        if (reveal.voted_outcome != pm_rules::sdvm_outcome_abstain()) {
            let bucket = vector::borrow_mut(&mut outcome_weights, reveal.voted_outcome as u64);
            *bucket = *bucket + reveal.stake_weight;
        };
        i = i + 1;
    };

    let mut winning_outcome = 0u16;
    let mut max_weight = 0u64;
    let mut has_unique_winner = false;
    let mut j = 0u16;
    while (j < round.outcome_count) {
        let weight = *vector::borrow(&outcome_weights, j as u64);
        if (weight > max_weight) {
            max_weight = weight;
            winning_outcome = j;
            has_unique_winner = true;
        } else if (weight == max_weight && weight > 0) {
            has_unique_winner = false;
        };
        j = j + 1;
    };

    if (max_weight == 0 || !has_unique_winner) {
        round.admin_resolved_outcome = option::none();
        round.is_admin_resolved = false;
        round.phase = pm_rules::vote_phase_settled();
        emit_phase_transition(round, current_time);

        let reason = if (max_weight == 0) { b"No decisive votes" } else { b"Tied plurality" };
        event::emit(TallyIndeterminateEvent<Collateral> {
            round_id: object::id(round),
            dispute_id: round.dispute_id,
            total_weight: round.total_revealed_weight,
            participation_rate_bps: participation_bps,
            reason,
        });
        return
    };

    round.admin_resolved_outcome = option::some(winning_outcome);
    round.is_admin_resolved = false;
    round.phase = pm_rules::vote_phase_settled();
    emit_phase_transition(round, current_time);

    event::emit(TallyCompletedEvent<Collateral> {
        round_id: object::id(round),
        dispute_id: round.dispute_id,
        winning_outcome,
        total_weight: round.total_revealed_weight,
        participation_rate_bps: participation_bps,
    });
}

public fun claim_voter_reward<Collateral>(
    round: &mut SDVMVoteRound<Collateral>,
    position: &mut PMStakePosition<Collateral>,
    pool: &mut PMStakePool<Collateral>,
    _clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(round.phase == pm_rules::vote_phase_settled(), EInvalidPhase);
    assert!(option::is_some(&round.admin_resolved_outcome), EInvalidPhase);

    let voter = pm_staking::position_owner(position);
    assert!(!contains_address(&round.claimed_voters, voter), EAlreadyClaimed);

    let winning_outcome = *option::borrow(&round.admin_resolved_outcome);
    let mut found = false;
    let mut voter_weight = 0u64;
    let mut total_correct_weight = 0u64;
    let reveals_len = vector::length(&round.reveals);
    let mut i = 0u64;
    while (i < reveals_len) {
        let reveal = vector::borrow(&round.reveals, i);
        if (reveal.voted_outcome == winning_outcome) {
            total_correct_weight = total_correct_weight + reveal.stake_weight;
            if (reveal.voter == voter) {
                found = true;
                voter_weight = reveal.stake_weight;
            };
        };
        i = i + 1;
    };
    assert!(found, ENotVoter);

    let available_rewards = pm_staking::pool_pending_slash(pool);
    let reward_amount = if (available_rewards > 0 && total_correct_weight > 0) {
        (((voter_weight as u128) * (available_rewards as u128)) / (total_correct_weight as u128)) as u64
    } else {
        0
    };

    vector::push_back(&mut round.claimed_voters, voter);
    if (reward_amount > 0) {
        let reward_coin = pm_staking::withdraw_pending_slash(pool, reward_amount, ctx);
        transfer::public_transfer(reward_coin, voter);
        pm_staking::apply_reward(position, reward_amount);
    };
    pm_staking::unregister_dispute(position, object::id(round));

    event::emit(RewardClaimedEvent<Collateral> {
        round_id: object::id(round),
        dispute_id: round.dispute_id,
        voter,
        reward_amount,
    });
}

public fun apply_voter_slash<Collateral>(
    round: &mut SDVMVoteRound<Collateral>,
    pool: &mut PMStakePool<Collateral>,
    position: &mut PMStakePosition<Collateral>,
    slash_rate_bps: u64,
) {
    assert!(round.phase == pm_rules::vote_phase_settled(), EInvalidPhase);
    assert!(option::is_some(&round.admin_resolved_outcome), EInvalidPhase);

    let voter = pm_staking::position_owner(position);
    assert!(!contains_address(&round.slashed_voters, voter), EAlreadySlashed);

    let winning_outcome = *option::borrow(&round.admin_resolved_outcome);
    let reveals_len = vector::length(&round.reveals);
    let mut i = 0u64;
    let mut found = false;
    let mut voted_outcome = pm_rules::sdvm_outcome_abstain();
    while (i < reveals_len) {
        let reveal = vector::borrow(&round.reveals, i);
        if (reveal.voter == voter) {
            found = true;
            voted_outcome = reveal.voted_outcome;
            break
        };
        i = i + 1;
    };

    let stake = pm_staking::position_net_stake(position);
    let slash_amount = if (!found) {
        (((stake as u128) * (slash_rate_bps as u128) * 10u128) / (BASIS_POINTS as u128)) as u64
    } else if (voted_outcome == pm_rules::sdvm_outcome_abstain() || voted_outcome == winning_outcome) {
        0
    } else {
        (((stake as u128) * (slash_rate_bps as u128)) / (BASIS_POINTS as u128)) as u64
    };

    vector::push_back(&mut round.slashed_voters, voter);
    if (slash_amount > 0) {
        let reason = if (!found) { b"Non-reveal" } else { b"Incorrect vote" };
        pm_staking::apply_slash(pool, position, slash_amount, reason);
        event::emit(VoterSlashedEvent<Collateral> {
            round_id: object::id(round),
            dispute_id: round.dispute_id,
            voter,
            slash_amount,
            reason,
        });
    };
    pm_staking::unregister_dispute(position, object::id(round));
}

public fun admin_resolve_dispute<Collateral>(
    _admin: &SDVMAdminCap<Collateral>,
    round: &mut SDVMVoteRound<Collateral>,
    resolved_outcome: u16,
    ctx: &TxContext,
) {
    if (resolved_outcome != pm_rules::sdvm_outcome_abstain()) {
        assert!((resolved_outcome as u64) < (round.outcome_count as u64), EInvalidOutcome);
    };
    round.admin_resolved_outcome = option::some(resolved_outcome);
    round.is_admin_resolved = true;
    round.phase = pm_rules::vote_phase_settled();

    event::emit(AdminResolveEvent<Collateral> {
        round_id: object::id(round),
        dispute_id: round.dispute_id,
        resolved_outcome,
        admin: tx_context::sender(ctx),
    });
}

public fun admin_advance_phase<Collateral>(
    _admin: &SDVMAdminCap<Collateral>,
    round: &mut SDVMVoteRound<Collateral>,
    ctx: &TxContext,
) {
    if (round.phase == pm_rules::vote_phase_commit()) {
        round.phase = pm_rules::vote_phase_reveal();
    } else if (round.phase == pm_rules::vote_phase_reveal()) {
        round.phase = pm_rules::vote_phase_tally();
    } else if (round.phase == pm_rules::vote_phase_tally()) {
        round.phase = pm_rules::vote_phase_settled();
    };

    event::emit(AdminPhaseAdvanceEvent<Collateral> {
        round_id: object::id(round),
        dispute_id: round.dispute_id,
        new_phase: round.phase,
        admin: tx_context::sender(ctx),
    });
}

public fun admin_quorum_override<Collateral>(
    _admin: &SDVMAdminCap<Collateral>,
    round: &mut SDVMVoteRound<Collateral>,
    new_gat_bps: u64,
    ctx: &TxContext,
) {
    round.gat_override_bps = option::some(new_gat_bps);
    event::emit(AdminQuorumOverrideEvent<Collateral> {
        round_id: object::id(round),
        dispute_id: round.dispute_id,
        new_gat_bps,
        admin: tx_context::sender(ctx),
    });
}

public fun clear_settled_dispute_verified<Collateral>(
    round: &SDVMVoteRound<Collateral>,
    position: &mut PMStakePosition<Collateral>,
) {
    assert!(round.phase == pm_rules::vote_phase_settled(), EInvalidPhase);
    pm_staking::unregister_dispute(position, object::id(round));
}

public fun cleanup_orphaned_commit<Collateral>(
    round: &SDVMVoteRound<Collateral>,
    commit_record: SDVMCommitRecord<Collateral>,
) {
    assert!(round.phase == pm_rules::vote_phase_settled(), EInvalidPhase);
    let SDVMCommitRecord {
        id,
        voter: _,
        round_id,
        round_number,
        commitment_hash: _,
        stake_weight: _,
    } = commit_record;
    assert!(round_id == object::id(round), EWrongRound);
    assert!(round_number <= round.round_number, EWrongRound);
    object::delete(id);

    event::emit(OrphanedCommitCleanedEvent<Collateral> {
        round_id: object::id(round),
        dispute_id: round.dispute_id,
    });
}

public fun round_dispute_id<Collateral>(r: &SDVMVoteRound<Collateral>): ID { r.dispute_id }
public fun round_number<Collateral>(r: &SDVMVoteRound<Collateral>): u8 { r.round_number }
public fun round_phase<Collateral>(r: &SDVMVoteRound<Collateral>): u8 { r.phase }
public fun round_commit_deadline_ms<Collateral>(r: &SDVMVoteRound<Collateral>): u64 { r.commit_deadline_ms }
public fun round_reveal_deadline_ms<Collateral>(r: &SDVMVoteRound<Collateral>): u64 { r.reveal_deadline_ms }
public fun round_total_staked_snapshot<Collateral>(r: &SDVMVoteRound<Collateral>): u64 { r.total_staked_snapshot }
public fun round_total_committed_weight<Collateral>(r: &SDVMVoteRound<Collateral>): u64 { r.total_committed_weight }
public fun round_total_revealed_weight<Collateral>(r: &SDVMVoteRound<Collateral>): u64 { r.total_revealed_weight }
public fun round_expedited<Collateral>(r: &SDVMVoteRound<Collateral>): bool { r.expedited }
public fun round_outcome_count<Collateral>(r: &SDVMVoteRound<Collateral>): u16 { r.outcome_count }
public fun round_reveal_count<Collateral>(r: &SDVMVoteRound<Collateral>): u64 { vector::length(&r.reveals) }
public fun round_is_settled<Collateral>(r: &SDVMVoteRound<Collateral>): bool { r.phase == pm_rules::vote_phase_settled() }
public fun round_admin_resolved_outcome<Collateral>(r: &SDVMVoteRound<Collateral>): Option<u16> { r.admin_resolved_outcome }

public fun commit_record_voter<Collateral>(c: &SDVMCommitRecord<Collateral>): address { c.voter }
public fun commit_record_stake_weight<Collateral>(c: &SDVMCommitRecord<Collateral>): u64 { c.stake_weight }

public fun create_governance_tracker<Collateral>(
    clock: &Clock,
    ctx: &mut TxContext,
): SDVMGovernanceTracker<Collateral> {
    SDVMGovernanceTracker<Collateral> {
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

public fun create_and_share_governance_tracker<Collateral>(
    clock: &Clock,
    ctx: &mut TxContext,
) {
    transfer::share_object(create_governance_tracker<Collateral>(clock, ctx));
}

public fun increment_admin_resolve<Collateral>(tracker: &mut SDVMGovernanceTracker<Collateral>, clock: &Clock) {
    tracker.admin_resolve_count = tracker.admin_resolve_count + 1;
    tracker.last_updated_ms = sui::clock::timestamp_ms(clock);
}

public fun increment_admin_slash_override<Collateral>(tracker: &mut SDVMGovernanceTracker<Collateral>, clock: &Clock) {
    tracker.admin_slash_override_count = tracker.admin_slash_override_count + 1;
    tracker.last_updated_ms = sui::clock::timestamp_ms(clock);
}

public fun increment_admin_quorum_override<Collateral>(tracker: &mut SDVMGovernanceTracker<Collateral>, clock: &Clock) {
    tracker.admin_quorum_override_count = tracker.admin_quorum_override_count + 1;
    tracker.last_updated_ms = sui::clock::timestamp_ms(clock);
}

public fun increment_admin_pause_staking<Collateral>(tracker: &mut SDVMGovernanceTracker<Collateral>, clock: &Clock) {
    tracker.admin_pause_staking_count = tracker.admin_pause_staking_count + 1;
    tracker.last_updated_ms = sui::clock::timestamp_ms(clock);
}

public fun increment_admin_phase_advance<Collateral>(tracker: &mut SDVMGovernanceTracker<Collateral>, clock: &Clock) {
    tracker.admin_phase_advance_count = tracker.admin_phase_advance_count + 1;
    tracker.last_updated_ms = sui::clock::timestamp_ms(clock);
}

public fun increment_disputes_resolved<Collateral>(tracker: &mut SDVMGovernanceTracker<Collateral>, clock: &Clock) {
    tracker.total_disputes_resolved = tracker.total_disputes_resolved + 1;
    tracker.last_updated_ms = sui::clock::timestamp_ms(clock);
}

public fun increment_disputes_rolled<Collateral>(tracker: &mut SDVMGovernanceTracker<Collateral>, clock: &Clock) {
    tracker.total_disputes_rolled = tracker.total_disputes_rolled + 1;
    tracker.last_updated_ms = sui::clock::timestamp_ms(clock);
}

public fun read_admin_resolve_count<Collateral>(tracker: &SDVMGovernanceTracker<Collateral>): u64 { tracker.admin_resolve_count }
public fun read_admin_slash_override_count<Collateral>(tracker: &SDVMGovernanceTracker<Collateral>): u64 { tracker.admin_slash_override_count }
public fun read_admin_quorum_override_count<Collateral>(tracker: &SDVMGovernanceTracker<Collateral>): u64 { tracker.admin_quorum_override_count }
public fun read_admin_pause_staking_count<Collateral>(tracker: &SDVMGovernanceTracker<Collateral>): u64 { tracker.admin_pause_staking_count }
public fun read_admin_phase_advance_count<Collateral>(tracker: &SDVMGovernanceTracker<Collateral>): u64 { tracker.admin_phase_advance_count }
public fun read_total_disputes_resolved<Collateral>(tracker: &SDVMGovernanceTracker<Collateral>): u64 { tracker.total_disputes_resolved }
public fun read_total_disputes_rolled<Collateral>(tracker: &SDVMGovernanceTracker<Collateral>): u64 { tracker.total_disputes_rolled }
public fun read_last_updated_ms<Collateral>(tracker: &SDVMGovernanceTracker<Collateral>): u64 { tracker.last_updated_ms }
