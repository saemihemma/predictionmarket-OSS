/// PMDispute — dispute filing, resolver voting, escalation, timeout→invalid.
/// Any address can file a dispute by posting a bond.
/// Global resolver set votes; quorum finalizes; timeout → INVALID.
module prediction_market::pm_dispute;

use sui::{balance::{Self, Balance}, coin::{Self, Coin}, clock::Clock, event, object::ID};
use prediction_market::{
    suffer::SUFFER,
    pm_rules,
    pm_market::{Self, PMMarket},
    pm_registry::{Self, PMConfig, PMAdminCap},
    pm_treasury::PMTreasury,
    pm_sdvm::{Self, SDVMVoteRound},
    pm_staking::SufferStakePool,
};

// ── Errors ──
#[error(code = 200)]
const EMarketNotResolutionPending: vector<u8> = b"Market must be in RESOLUTION_PENDING state to file dispute";
#[error(code = 201)]
const EInsufficientDisputeBond: vector<u8> = b"Insufficient dispute bond";
#[error(code = 202)]
const EDisputeNotOpen: vector<u8> = b"Dispute is not open for voting";
#[error(code = 203)]
const ENotResolver: vector<u8> = b"Sender is not in the resolver set";
#[error(code = 204)]
const EAlreadyVoted: vector<u8> = b"Resolver has already voted";
#[error(code = 205)]
const EInvalidOutcome: vector<u8> = b"Invalid outcome for dispute vote";
#[error(code = 206)]
const EDisputeTimeoutNotReached: vector<u8> = b"Escalation timeout has not been reached";
#[error(code = 207)]
const EMarketNotDisputed: vector<u8> = b"Market is not in DISPUTED state";
#[error(code = 208)]
const EEmergencyPaused: vector<u8> = b"Market is emergency paused";
#[error(code = 209)]
const EInvalidQuorum: vector<u8> = b"Quorum must be greater than zero";
#[error(code = 210)]
const ESameOutcomeDispute: vector<u8> = b"Cannot dispute with the same outcome as the current resolution";
#[error(code = 211)]
const EDisputeMarketMismatch: vector<u8> = b"Dispute does not belong to this market";
#[error(code = 212)]
const EResolversBelowQuorum: vector<u8> = b"Cannot remove resolver: would drop below quorum";
#[error(code = 213)]
const EResolverSetMismatch: vector<u8> = b"Resolver set does not match dispute's bound resolver set";
#[error(code = 214)]
const EQuorumExceedsResolverCount: vector<u8> = b"Quorum cannot exceed resolver count";
#[error(code = 215)]
const EMarketNotInvalid: vector<u8> = b"Market is not in INVALID state";
#[error(code = 216)]
const EInvalidResolverAddress: vector<u8> = b"Resolver address cannot be zero";
#[error(code = 217)]
const EDuplicateResolver: vector<u8> = b"Duplicate resolver address";

// ── Events ──

public struct DisputeFiledEvent has copy, drop {
    market_id: ID,
    dispute_id: ID,
    disputer: address,
    proposed_outcome: u16,
    bond_amount: u64,
}

public struct DisputeVoteEvent has copy, drop {
    dispute_id: ID,
    voter: address,
    voted_outcome: u16,
}

public struct DisputeResolvedEvent has copy, drop {
    dispute_id: ID,
    market_id: ID,
    upheld: bool,
    final_outcome: u16,
}

public struct DisputeTimeoutEvent has copy, drop {
    dispute_id: ID,
    market_id: ID,
}

// ── Resolver set ──

/// Global appointed resolver set (v1: single global set).
public struct PMResolverSet has key {
    id: UID,
    resolvers: vector<address>,
    quorum: u64,
}

/// Create the global resolver set.
public fun create_resolver_set(
    _admin: &PMAdminCap,
    resolvers: vector<address>,
    quorum: u64,
    ctx: &mut TxContext,
): PMResolverSet {
    assert!(quorum > 0, EInvalidQuorum);
    assert!(quorum <= vector::length(&resolvers), EQuorumExceedsResolverCount);

    // RT-007: Validate resolver addresses are non-zero and unique
    let len = vector::length(&resolvers);
    let mut i = 0;
    while (i < len) {
        assert!(*vector::borrow(&resolvers, i) != @0x0, EInvalidResolverAddress);
        let mut j = i + 1;
        while (j < len) {
            assert!(*vector::borrow(&resolvers, i) != *vector::borrow(&resolvers, j), EDuplicateResolver);
            j = j + 1;
        };
        i = i + 1;
    };

    PMResolverSet {
        id: object::new(ctx),
        resolvers,
        quorum,
    }
}

/// Convenience: create and share resolver set in one call.
public fun create_and_share_resolver_set(
    admin: &PMAdminCap,
    resolvers: vector<address>,
    quorum: u64,
    ctx: &mut TxContext,
) {
    transfer::share_object(create_resolver_set(admin, resolvers, quorum, ctx));
}

/// Add a resolver to the set.
public fun add_resolver(
    set: &mut PMResolverSet,
    _admin: &PMAdminCap,
    resolver: address,
) {
    if (!vector::contains(&set.resolvers, &resolver)) {
        vector::push_back(&mut set.resolvers, resolver);
    };
}

/// Remove a resolver from the set.
public fun remove_resolver(
    set: &mut PMResolverSet,
    _admin: &PMAdminCap,
    resolver: address,
) {
    let (found, idx) = vector::index_of(&set.resolvers, &resolver);
    if (found) {
        vector::remove(&mut set.resolvers, idx);
        assert!(vector::length(&set.resolvers) >= set.quorum, EResolversBelowQuorum);
    };
}

/// Update quorum threshold. Must be > 0.
public fun update_quorum(
    set: &mut PMResolverSet,
    _admin: &PMAdminCap,
    new_quorum: u64,
) {
    assert!(new_quorum > 0, EInvalidQuorum);
    assert!(new_quorum <= vector::length(&set.resolvers), EQuorumExceedsResolverCount);
    set.quorum = new_quorum;
}

// ── Dispute object ──

/// A dispute filed against a pending resolution.
/// Phase 2: Includes optional SDVM vote round for decentralized dispute resolution.
public struct PMDispute has key {
    id: UID,
    market_id: ID,
    resolver_set_id: ID,
    outcome_count: u16,
    disputer: address,
    proposed_outcome: u16,
    reason_hash: vector<u8>,
    bond: Balance<SUFFER>,
    state: u8,
    votes: vector<VoteRecord>,
    escalation_deadline_ms: u64,
    quorum_at_filing: u64,
    resolvers_snapshot: vector<address>,
    /// Phase 2: SDVM vote round ID (for decentralized resolution path)
    sdvm_vote_round_id: Option<ID>,
}

public struct VoteRecord has store, copy, drop {
    voter: address,
    voted_outcome: u16,
}

// ── File dispute ──

/// File a dispute against a pending resolution. Requires bond.
#[allow(lint(self_transfer))]
public fun file_dispute(
    market: &mut PMMarket,
    config: &PMConfig,
    resolver_set: &PMResolverSet,
    proposed_outcome: u16,
    reason_hash: vector<u8>,
    mut bond_coin: Coin<SUFFER>,
    clock: &Clock,
    ctx: &mut TxContext,
): PMDispute {
    assert!(!pm_market::is_emergency_paused(market), EEmergencyPaused);
    assert!(pm_market::state(market) == pm_rules::state_resolution_pending(), EMarketNotResolutionPending);
    assert!((proposed_outcome as u64) < (pm_market::outcome_count(market) as u64), EInvalidOutcome);

    // Reject disputes proposing the same outcome as the current resolution
    let resolution = pm_market::resolution(market);
    let record = option::borrow(resolution);
    assert!(proposed_outcome != pm_market::resolution_outcome(record), ESameOutcomeDispute);

    let required_bond = pm_registry::dispute_bond_amount(config);
    assert!(coin::value(&bond_coin) >= required_bond, EInsufficientDisputeBond);

    // Take exact bond, return change
    let bond_payment = coin::split(&mut bond_coin, required_bond, ctx);
    if (coin::value(&bond_coin) > 0) {
        transfer::public_transfer(bond_coin, tx_context::sender(ctx));
    } else {
        coin::destroy_zero(bond_coin);
    };

    let current_time = sui::clock::timestamp_ms(clock);
    // Escalation timeout: use the market's dispute window
    let escalation_deadline = current_time + pm_market::dispute_window_ms(market);

    let market_id = pm_market::market_id(market);

    // Transition market to DISPUTED
    pm_market::transition_to_disputed(market);

    let dispute = PMDispute {
        id: object::new(ctx),
        market_id,
        resolver_set_id: object::id(resolver_set),
        outcome_count: pm_market::outcome_count(market),
        disputer: tx_context::sender(ctx),
        proposed_outcome,
        reason_hash,
        bond: coin::into_balance(bond_payment),
        state: pm_rules::dispute_state_open(),
        votes: vector::empty(),
        escalation_deadline_ms: escalation_deadline,
        quorum_at_filing: resolver_set.quorum,
        resolvers_snapshot: resolver_set.resolvers,
        sdvm_vote_round_id: option::none(),
    };

    event::emit(DisputeFiledEvent {
        market_id,
        dispute_id: object::id(&dispute),
        disputer: tx_context::sender(ctx),
        proposed_outcome,
        bond_amount: required_bond,
    });

    // SDVM Integration: SDVMVoteRound is created separately via create_sdvm_vote_round()
    // after file_dispute(). This two-step pattern allows the caller to control whether
    // SDVM escalation is enabled (expedited flag) and share the round object.

    dispute
}

/// Convenience: file dispute and share it as a shared object in one call.
#[allow(lint(self_transfer))]
public fun file_and_share_dispute(
    market: &mut PMMarket,
    config: &PMConfig,
    resolver_set: &PMResolverSet,
    proposed_outcome: u16,
    reason_hash: vector<u8>,
    bond_coin: Coin<SUFFER>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let dispute = file_dispute(market, config, resolver_set, proposed_outcome, reason_hash, bond_coin, clock, ctx);
    transfer::share_object(dispute);
}

// ── SDVM Integration ──

/// Create and attach an SDVM vote round to this dispute.
/// Called after dispute is filed to enable decentralized resolution via SUFFER staker voting.
///
/// This creates a new SDVMVoteRound and stores its ID in the dispute for later resolution.
/// The round is NOT shared automatically — the caller must share it via transfer::share_object.
///
/// Returns the SDVMVoteRound which the caller should share.
public fun create_sdvm_vote_round(
    dispute: &mut PMDispute,
    stake_pool: &SufferStakePool,
    expedited: bool,
    clock: &Clock,
    ctx: &mut TxContext,
): SDVMVoteRound {
    assert!(option::is_none(&dispute.sdvm_vote_round_id), EDisputeNotOpen);

    let total_staked = pm_staking::pool_total_staked(stake_pool);
    let vote_round = pm_sdvm::create_vote_round(
        object::id(dispute),
        dispute.outcome_count,
        total_staked,
        expedited,
        clock,
        ctx,
    );

    // Store the round ID in dispute
    let round_id = object::id(&vote_round);
    option::fill(&mut dispute.sdvm_vote_round_id, round_id);

    vote_round
}

/// Convenience function: Create SDVM vote round and share it in one call.
/// This prevents the error where callers forget to call transfer::share_object(round).
/// (RT-INTEGRATION-001: SDVMVoteRound Sharing Responsibility Gap)
public fun create_and_share_sdvm_vote_round(
    dispute: &mut PMDispute,
    stake_pool: &SufferStakePool,
    expedited: bool,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let vote_round = create_sdvm_vote_round(dispute, stake_pool, expedited, clock, ctx);
    transfer::share_object(vote_round);
}

/// Resolve a dispute using the settled SDVM vote round outcome.
///
/// Bond distribution per D2 (Design Decision 2):
/// - Dispute upheld (SDVM outcome == proposed_outcome):
///   * 75% of disputer's bond → original proposer
///   * 25% of disputer's bond → treasury
/// - Dispute rejected (SDVM outcome != proposed_outcome):
///   * 75% of original proposer's bond → disputer
///   * 25% of original proposer's bond → treasury
///
/// Note: Correct voters earn rewards from SDVM slash pool (separate from bonds).
/// Proposer can participate in SDVM voting and earning like any other staker.
///
/// Resolve dispute from settled SDVM vote round.
/// Bond distribution per D2 (confirmed):
/// - Upheld: disputer's bond returned in full; creation bond 75% to disputer, 25% to treasury
/// - Rejected: disputer's bond 75% to proposer (via market creator), 25% to treasury
pub fun resolve_from_sdvm(
    dispute: &mut PMDispute,
    market: &mut PMMarket,
    treasury: &mut PMTreasury,
    sdvm_round: &SDVMVoteRound,
    ctx: &mut TxContext,
) {
    assert!(dispute.state == pm_rules::dispute_state_open(), EDisputeNotOpen);
    assert!(pm_market::state(market) == pm_rules::state_disputed(), EMarketNotDisputed);
    assert!(dispute.market_id == pm_market::market_id(market), EDisputeMarketMismatch);

    // Verify this round belongs to this dispute
    assert!(
        option::is_some(&dispute.sdvm_vote_round_id) &&
        *option::borrow(&dispute.sdvm_vote_round_id) == object::id(sdvm_round),
        EDisputeMarketMismatch
    );

    // Round must be settled
    assert!(pm_sdvm::round_is_settled(sdvm_round), EDisputeNotOpen);

    let winning_outcome = *option::borrow(&pm_sdvm::round_admin_resolved_outcome(sdvm_round));
    let original_resolution = pm_market::resolution(market);
    let original_outcome = pm_market::resolution_outcome(option::borrow(original_resolution));

    let bond_amount = balance::value(&dispute.bond);

    if (winning_outcome == dispute.proposed_outcome) {
        // Dispute upheld: SDVM voters agreed with disputer
        dispute.state = pm_rules::dispute_state_upheld();

        // Return disputer's bond in full
        if (bond_amount > 0) {
            let disputer_coin = coin::from_balance(
                balance::split(&mut dispute.bond, bond_amount),
                ctx
            );
            transfer::public_transfer(disputer_coin, dispute.disputer);
        };

        // Forfeit creation bond: 75% to disputer, 25% to treasury (D2)
        let creator_bond = pm_market::take_creation_bond(market);
        let creator_bond_amount = balance::value(&creator_bond);
        if (creator_bond_amount > 0) {
            let disputer_share = (creator_bond_amount * 75) / 100;
            let mut creator_bond_mut = creator_bond;
            if (disputer_share > 0) {
                let disputer_reward = coin::from_balance(
                    balance::split(&mut creator_bond_mut, disputer_share),
                    ctx
                );
                transfer::public_transfer(disputer_reward, dispute.disputer);
            };
            // Remainder to treasury
            prediction_market::pm_treasury::deposit_forfeited_bond(treasury, creator_bond_mut);
        } else {
            balance::destroy_zero(creator_bond);
        };

        // Market → INVALID (dispute upheld means original resolution rejected)
        pm_market::transition_to_invalid(market, pm_rules::invalid_reason_dispute_verdict());

        event::emit(DisputeResolvedEvent {
            dispute_id: object::id(dispute),
            market_id: dispute.market_id,
            upheld: true,
            final_outcome: winning_outcome,
        });
    } else {
        // Dispute rejected: SDVM voters agreed with original resolution
        dispute.state = pm_rules::dispute_state_rejected();

        // Disputer's bond: 75% to proposer (market creator), 25% to treasury (D2)
        if (bond_amount > 0) {
            let proposer_share = (bond_amount * 75) / 100;
            let proposer = pm_market::creator(market);

            if (proposer_share > 0) {
                let proposer_coin = coin::from_balance(
                    balance::split(&mut dispute.bond, proposer_share),
                    ctx
                );
                transfer::public_transfer(proposer_coin, proposer);
            };

            // Remainder to treasury
            let remaining = balance::value(&dispute.bond);
            if (remaining > 0) {
                let treasury_balance = balance::split(&mut dispute.bond, remaining);
                prediction_market::pm_treasury::deposit_forfeited_bond(treasury, treasury_balance);
            };
        };

        // Market stays RESOLVED with original outcome
        pm_market::transition_to_resolved(market);

        event::emit(DisputeResolvedEvent {
            dispute_id: object::id(dispute),
            market_id: dispute.market_id,
            upheld: false,
            final_outcome: original_outcome,
        });
    };
}

// ── Voting ──

/// A resolver casts a vote on a dispute.
public fun cast_vote(
    dispute: &mut PMDispute,
    resolver_set: &PMResolverSet,
    voted_outcome: u16,
    ctx: &TxContext,
) {
    assert!(dispute.state == pm_rules::dispute_state_open(), EDisputeNotOpen);
    assert!(object::id(resolver_set) == dispute.resolver_set_id, EResolverSetMismatch);
    assert!((voted_outcome as u64) < (dispute.outcome_count as u64), EInvalidOutcome);

    let voter = tx_context::sender(ctx);
    assert!(vector::contains(&dispute.resolvers_snapshot, &voter), ENotResolver);

    // Check not already voted
    let mut i = 0u64;
    let len = vector::length(&dispute.votes);
    while (i < len) {
        let vote = vector::borrow(&dispute.votes, i);
        assert!(vote.voter != voter, EAlreadyVoted);
        i = i + 1;
    };

    vector::push_back(&mut dispute.votes, VoteRecord { voter, voted_outcome });

    event::emit(DisputeVoteEvent {
        dispute_id: object::id(dispute),
        voter,
        voted_outcome,
    });
}

/// Tally votes and resolve the dispute if quorum is reached.
public fun try_resolve_dispute(
    dispute: &mut PMDispute,
    market: &mut PMMarket,
    treasury: &mut PMTreasury,
    resolver_set: &PMResolverSet,
    ctx: &mut TxContext,
) {
    assert!(dispute.state == pm_rules::dispute_state_open(), EDisputeNotOpen);
    assert!(pm_market::state(market) == pm_rules::state_disputed(), EMarketNotDisputed);
    assert!(dispute.market_id == pm_market::market_id(market), EDisputeMarketMismatch);
    assert!(object::id(resolver_set) == dispute.resolver_set_id, EResolverSetMismatch);

    let total_votes = vector::length(&dispute.votes);
    if ((total_votes as u64) < dispute.quorum_at_filing) {
        return // Not enough votes yet
    };

    // Count votes per outcome
    let outcome_count = pm_market::outcome_count(market);
    let mut vote_counts = vector::empty<u64>();
    let mut i: u16 = 0;
    while (i < outcome_count) {
        vector::push_back(&mut vote_counts, 0);
        i = i + 1;
    };
    // Also count "invalid" votes (outcome = outcome_count used as sentinel)
    let mut invalid_votes = 0u64;

    let mut j = 0u64;
    while (j < total_votes) {
        let vote = vector::borrow(&dispute.votes, j);
        if ((vote.voted_outcome as u64) < (outcome_count as u64)) {
            let count = vector::borrow_mut(&mut vote_counts, vote.voted_outcome as u64);
            *count = *count + 1;
        } else {
            invalid_votes = invalid_votes + 1;
        };
        j = j + 1;
    };

    // Find majority outcome
    let mut max_votes = 0u64;
    let mut max_outcome: u16 = 0;
    let mut k: u16 = 0;
    let mut tie = false;
    while (k < outcome_count) {
        let count = *vector::borrow(&vote_counts, k as u64);
        if (count > max_votes) {
            max_votes = count;
            max_outcome = k;
            tie = false;
        } else if (count == max_votes && count > 0) {
            tie = true;
        };
        k = k + 1;
    };

    // Get original resolution outcome for tie-break logic
    let resolution = pm_market::resolution(market);
    let record = option::borrow(resolution);
    let original_outcome = pm_market::resolution_outcome(record);

    // Handle tie-break rule: on tie, if proposed_outcome has more votes than original, uphold
    // If exact tie including original, keep original (defender wins ties)
    if (tie) {
        // On a tie: check if proposed_outcome beats original
        let proposed_votes = if ((dispute.proposed_outcome as u64) < (outcome_count as u64)) {
            *vector::borrow(&vote_counts, dispute.proposed_outcome as u64)
        } else {
            0
        };
        let original_votes = if ((original_outcome as u64) < (outcome_count as u64)) {
            *vector::borrow(&vote_counts, original_outcome as u64)
        } else {
            0
        };

        if (proposed_votes > original_votes) {
            // Proposed outcome wins tie-break against original — dispute upheld
            dispute.state = pm_rules::dispute_state_upheld();

            // Return disputer bond
            let bond_amount = balance::value(&dispute.bond);
            let bond_return = balance::split(&mut dispute.bond, bond_amount);
            let bond_coin = coin::from_balance(bond_return, ctx);
            transfer::public_transfer(bond_coin, dispute.disputer);

            // Forfeit creator bond to treasury
            let creator_bond = pm_market::take_creation_bond(market);
            prediction_market::pm_treasury::deposit_forfeited_bond(treasury, creator_bond);

            // Market → INVALID (v1: no re-resolution, dispute winner invalidates)
            pm_market::transition_to_invalid(market, pm_rules::invalid_reason_dispute_verdict());

            event::emit(DisputeResolvedEvent {
                dispute_id: object::id(dispute),
                market_id: dispute.market_id,
                upheld: true,
                final_outcome: dispute.proposed_outcome,
            });
        } else {
            // Original outcome wins tie-break (or exact tie) — dispute rejected, original stands
            dispute.state = pm_rules::dispute_state_rejected();

            // Disputer bond → treasury
            let bond_amount = balance::value(&dispute.bond);
            let bond_to_treasury = balance::split(&mut dispute.bond, bond_amount);
            prediction_market::pm_treasury::deposit_forfeited_bond(treasury, bond_to_treasury);

            // Finalize original resolution
            pm_market::transition_to_resolved(market);

            event::emit(DisputeResolvedEvent {
                dispute_id: object::id(dispute),
                market_id: dispute.market_id,
                upheld: false,
                final_outcome: original_outcome,
            });
        };
        return
    };

    // Invalid majority check: if invalid votes > max outcome votes, market goes INVALID
    if (invalid_votes > max_votes) {
        dispute.state = pm_rules::dispute_state_upheld();
        pm_market::transition_to_invalid(market, pm_rules::invalid_reason_dispute_verdict());

        // Return disputer bond to disputer
        let bond_amount = balance::value(&dispute.bond);
        let bond_return = balance::split(&mut dispute.bond, bond_amount);
        let bond_coin = coin::from_balance(bond_return, ctx);
        transfer::public_transfer(bond_coin, dispute.disputer);

        // Forfeit creator bond to treasury
        let creator_bond = pm_market::take_creation_bond(market);
        prediction_market::pm_treasury::deposit_forfeited_bond(treasury, creator_bond);

        event::emit(DisputeResolvedEvent {
            dispute_id: object::id(dispute),
            market_id: dispute.market_id,
            upheld: true,
            final_outcome: 0,
        });
        return
    };

    // No tie, no invalid majority: check if max_outcome differs from original
    if (max_outcome != original_outcome) {
        // Dispute upheld — different outcome wins
        dispute.state = pm_rules::dispute_state_upheld();

        // Return disputer bond
        let bond_amount = balance::value(&dispute.bond);
        let bond_return = balance::split(&mut dispute.bond, bond_amount);
        let bond_coin = coin::from_balance(bond_return, ctx);
        transfer::public_transfer(bond_coin, dispute.disputer);

        // Forfeit creator bond to treasury
        let creator_bond = pm_market::take_creation_bond(market);
        prediction_market::pm_treasury::deposit_forfeited_bond(treasury, creator_bond);

        // Market → INVALID (v1: no re-resolution, dispute winner invalidates)
        pm_market::transition_to_invalid(market, pm_rules::invalid_reason_dispute_verdict());

        event::emit(DisputeResolvedEvent {
            dispute_id: object::id(dispute),
            market_id: dispute.market_id,
            upheld: true,
            final_outcome: max_outcome,
        });
    } else {
        // Dispute rejected — original resolution stands
        dispute.state = pm_rules::dispute_state_rejected();

        // Disputer bond → treasury
        let bond_amount = balance::value(&dispute.bond);
        let bond_to_treasury = balance::split(&mut dispute.bond, bond_amount);
        prediction_market::pm_treasury::deposit_forfeited_bond(treasury, bond_to_treasury);

        // Finalize original resolution
        pm_market::transition_to_resolved(market);

        event::emit(DisputeResolvedEvent {
            dispute_id: object::id(dispute),
            market_id: dispute.market_id,
            upheld: false,
            final_outcome: original_outcome,
        });
    };
}

// ── Timeout ──

/// If escalation timeout passes without quorum, market → INVALID.
public fun timeout_dispute(
    dispute: &mut PMDispute,
    market: &mut PMMarket,
    treasury: &mut PMTreasury,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(dispute.state == pm_rules::dispute_state_open(), EDisputeNotOpen);
    assert!(pm_market::state(market) == pm_rules::state_disputed(), EMarketNotDisputed);
    assert!(dispute.market_id == pm_market::market_id(market), EDisputeMarketMismatch);

    let current_time = sui::clock::timestamp_ms(clock);
    assert!(current_time >= dispute.escalation_deadline_ms, EDisputeTimeoutNotReached);

    dispute.state = pm_rules::dispute_state_timeout_invalid();

    // Market → INVALID
    pm_market::transition_to_invalid(market, pm_rules::invalid_reason_dispute_timeout());

    // Return disputer bond — timeout is resolver failure, not disputer's fault
    let bond_amount = balance::value(&dispute.bond);
    let bond_return = balance::split(&mut dispute.bond, bond_amount);
    let bond_coin = coin::from_balance(bond_return, ctx);
    transfer::public_transfer(bond_coin, dispute.disputer);

    // Creator bond → treasury
    let creator_bond = pm_market::take_creation_bond(market);
    prediction_market::pm_treasury::deposit_forfeited_bond(treasury, creator_bond);

    event::emit(DisputeTimeoutEvent {
        dispute_id: object::id(dispute),
        market_id: dispute.market_id,
    });
}

// ── Close dispute on emergency invalidation ──

/// Close an active dispute when the market has been emergency-invalidated.
/// Returns the bond to the disputer since invalidation is not their fault.
public fun close_dispute_on_invalid(
    dispute: &mut PMDispute,
    market: &PMMarket,
    ctx: &mut TxContext,
) {
    assert!(dispute.state == pm_rules::dispute_state_open(), EDisputeNotOpen);
    assert!(pm_market::state(market) == pm_rules::state_invalid(), EMarketNotInvalid);
    assert!(dispute.market_id == pm_market::market_id(market), EDisputeMarketMismatch);

    dispute.state = pm_rules::dispute_state_timeout_invalid();

    // Return bond to disputer (emergency invalidation isn't their fault)
    let bond_amount = balance::value(&dispute.bond);
    if (bond_amount > 0) {
        let bond_return = balance::split(&mut dispute.bond, bond_amount);
        let bond_coin = coin::from_balance(bond_return, ctx);
        transfer::public_transfer(bond_coin, dispute.disputer);
    };
}

// ── Read accessors ──

public fun dispute_market_id(d: &PMDispute): ID { d.market_id }
public fun dispute_resolver_set_id(d: &PMDispute): ID { d.resolver_set_id }
public fun dispute_disputer(d: &PMDispute): address { d.disputer }
public fun dispute_proposed_outcome(d: &PMDispute): u16 { d.proposed_outcome }
public fun dispute_state(d: &PMDispute): u8 { d.state }
public fun dispute_bond_amount(d: &PMDispute): u64 { balance::value(&d.bond) }
public fun dispute_escalation_deadline(d: &PMDispute): u64 { d.escalation_deadline_ms }
public fun dispute_vote_count(d: &PMDispute): u64 { vector::length(&d.votes) }
public fun dispute_quorum_at_filing(d: &PMDispute): u64 { d.quorum_at_filing }
public fun dispute_sdvm_vote_round_id(d: &PMDispute): Option<ID> { d.sdvm_vote_round_id }

public fun resolver_set_quorum(s: &PMResolverSet): u64 { s.quorum }
public fun resolver_set_count(s: &PMResolverSet): u64 { vector::length(&s.resolvers) }
public fun resolver_set_contains(s: &PMResolverSet, addr: address): bool {
    vector::contains(&s.resolvers, &addr)
}
