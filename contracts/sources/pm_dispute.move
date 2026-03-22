/// PMDispute — collateral-family dispute filing, resolver voting, and SDVM escalation.
module prediction_market::pm_dispute;

use sui::{balance::{Self, Balance}, coin::{Self, Coin}, clock::Clock, event};
use prediction_market::{
    pm_rules,
    pm_market::{Self, PMMarket},
    pm_registry::{Self, PMConfig, PMAdminCap},
    pm_resolution,
    pm_treasury::PMTreasury,
    pm_sdvm::{Self, SDVMVoteRound},
    pm_staking::{Self, PMStakePool},
};

#[error(code = 0)]
const EMarketNotResolutionPending: vector<u8> = b"Market must be resolution pending";
#[error(code = 1)]
const EInsufficientDisputeBond: vector<u8> = b"Insufficient dispute bond";
#[error(code = 2)]
const EDisputeNotOpen: vector<u8> = b"Dispute is not open";
#[error(code = 3)]
const ENotResolver: vector<u8> = b"Sender is not in resolver set";
#[error(code = 4)]
const EAlreadyVoted: vector<u8> = b"Resolver already voted";
#[error(code = 5)]
const EInvalidOutcome: vector<u8> = b"Invalid dispute outcome";
#[error(code = 6)]
const EDisputeTimeoutNotReached: vector<u8> = b"Dispute timeout not reached";
#[error(code = 7)]
const EMarketNotDisputed: vector<u8> = b"Market must be disputed";
#[error(code = 8)]
const EResolverSetMismatch: vector<u8> = b"Resolver set mismatch";
#[error(code = 9)]
const EDisputeMarketMismatch: vector<u8> = b"Dispute market mismatch";
#[error(code = 10)]
const EInvalidQuorum: vector<u8> = b"Invalid resolver quorum";
#[error(code = 11)]
const ESameOutcomeDispute: vector<u8> = b"Dispute must propose a different outcome";

public struct DisputeFiledEvent<phantom Collateral> has copy, drop {
    market_id: ID,
    dispute_id: ID,
    disputer: address,
    proposed_outcome: u16,
    bond_amount: u64,
}

public struct DisputeVoteEvent<phantom Collateral> has copy, drop {
    dispute_id: ID,
    voter: address,
    voted_outcome: u16,
}

public struct DisputeResolvedEvent<phantom Collateral> has copy, drop {
    dispute_id: ID,
    market_id: ID,
    upheld: bool,
    final_outcome: u16,
}

public struct DisputeTimeoutEvent<phantom Collateral> has copy, drop {
    dispute_id: ID,
    market_id: ID,
}

public struct PMResolverSet<phantom Collateral> has key {
    id: UID,
    resolvers: vector<address>,
    quorum: u64,
}

public struct VoteRecord has store, copy, drop {
    voter: address,
    voted_outcome: u16,
}

public struct PMDispute<phantom Collateral> has key {
    id: UID,
    market_id: ID,
    resolver_set_id: ID,
    outcome_count: u16,
    disputer: address,
    proposed_outcome: u16,
    reason_hash: vector<u8>,
    bond: Balance<Collateral>,
    state: u8,
    votes: vector<VoteRecord>,
    escalation_deadline_ms: u64,
    quorum_at_filing: u64,
    resolvers_snapshot: vector<address>,
    sdvm_vote_round_id: Option<ID>,
}

public fun create_resolver_set<Collateral>(
    _admin: &PMAdminCap<Collateral>,
    resolvers: vector<address>,
    quorum: u64,
    ctx: &mut TxContext,
): PMResolverSet<Collateral> {
    assert!(quorum > 0 && quorum <= vector::length(&resolvers), EInvalidQuorum);
    PMResolverSet<Collateral> {
        id: object::new(ctx),
        resolvers,
        quorum,
    }
}

public fun create_and_share_resolver_set<Collateral>(
    admin: &PMAdminCap<Collateral>,
    resolvers: vector<address>,
    quorum: u64,
    ctx: &mut TxContext,
) {
    transfer::share_object(create_resolver_set(admin, resolvers, quorum, ctx));
}

/// Testnet/default bootstrap helper: the deployer becomes the sole resolver.
public fun create_and_share_default_resolver_set<Collateral>(
    admin: &PMAdminCap<Collateral>,
    ctx: &mut TxContext,
) {
    let sender = tx_context::sender(ctx);
    transfer::share_object(create_resolver_set(admin, vector[sender], 1, ctx));
}

public fun add_resolver<Collateral>(
    set: &mut PMResolverSet<Collateral>,
    _admin: &PMAdminCap<Collateral>,
    resolver: address,
) {
    if (!vector::contains(&set.resolvers, &resolver)) {
        vector::push_back(&mut set.resolvers, resolver);
    };
}

public fun remove_resolver<Collateral>(
    set: &mut PMResolverSet<Collateral>,
    _admin: &PMAdminCap<Collateral>,
    resolver: address,
) {
    let (found, idx) = vector::index_of(&set.resolvers, &resolver);
    if (found) {
        vector::remove(&mut set.resolvers, idx);
        assert!(vector::length(&set.resolvers) >= set.quorum, EInvalidQuorum);
    };
}

public fun update_quorum<Collateral>(
    set: &mut PMResolverSet<Collateral>,
    _admin: &PMAdminCap<Collateral>,
    new_quorum: u64,
) {
    assert!(new_quorum > 0 && new_quorum <= vector::length(&set.resolvers), EInvalidQuorum);
    set.quorum = new_quorum;
}

public fun file_dispute<Collateral>(
    market: &mut PMMarket<Collateral>,
    config: &PMConfig<Collateral>,
    resolver_set: &PMResolverSet<Collateral>,
    proposed_outcome: u16,
    reason_hash: vector<u8>,
    mut bond_coin: Coin<Collateral>,
    clock: &Clock,
    ctx: &mut TxContext,
): PMDispute<Collateral> {
    assert!(pm_market::state(market) == pm_rules::state_resolution_pending(), EMarketNotResolutionPending);
    assert!((proposed_outcome as u64) < (pm_market::outcome_count(market) as u64), EInvalidOutcome);

    let resolution = pm_market::resolution(market);
    let current_record = option::borrow(resolution);
    assert!(proposed_outcome != pm_market::resolution_outcome(current_record), ESameOutcomeDispute);

    let required_bond = pm_registry::dispute_bond_amount(config);
    assert!(coin::value(&bond_coin) >= required_bond, EInsufficientDisputeBond);

    let bond_payment = coin::split(&mut bond_coin, required_bond, ctx);
    if (coin::value(&bond_coin) > 0) {
        transfer::public_transfer(bond_coin, tx_context::sender(ctx));
    } else {
        coin::destroy_zero(bond_coin);
    };

    pm_market::transition_to_disputed(market);
    let current_time = sui::clock::timestamp_ms(clock);
    let dispute = PMDispute<Collateral> {
        id: object::new(ctx),
        market_id: pm_market::market_id(market),
        resolver_set_id: object::id(resolver_set),
        outcome_count: pm_market::outcome_count(market),
        disputer: tx_context::sender(ctx),
        proposed_outcome,
        reason_hash,
        bond: coin::into_balance(bond_payment),
        state: pm_rules::dispute_state_open(),
        votes: vector::empty(),
        escalation_deadline_ms: current_time + pm_market::dispute_window_ms(market),
        quorum_at_filing: resolver_set.quorum,
        resolvers_snapshot: resolver_set.resolvers,
        sdvm_vote_round_id: option::none(),
    };

    event::emit(DisputeFiledEvent<Collateral> {
        market_id: pm_market::market_id(market),
        dispute_id: object::id(&dispute),
        disputer: tx_context::sender(ctx),
        proposed_outcome,
        bond_amount: required_bond,
    });

    dispute
}

public fun file_and_share_dispute<Collateral>(
    market: &mut PMMarket<Collateral>,
    config: &PMConfig<Collateral>,
    resolver_set: &PMResolverSet<Collateral>,
    proposed_outcome: u16,
    reason_hash: vector<u8>,
    bond_coin: Coin<Collateral>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let dispute = file_dispute(market, config, resolver_set, proposed_outcome, reason_hash, bond_coin, clock, ctx);
    transfer::share_object(dispute);
}

public fun create_sdvm_vote_round<Collateral>(
    dispute: &mut PMDispute<Collateral>,
    stake_pool: &PMStakePool<Collateral>,
    expedited: bool,
    clock: &Clock,
    ctx: &mut TxContext,
): SDVMVoteRound<Collateral> {
    assert!(option::is_none(&dispute.sdvm_vote_round_id), EDisputeNotOpen);
    let vote_round = pm_sdvm::create_vote_round(
        object::id(dispute),
        dispute.outcome_count,
        pm_staking::pool_total_staked(stake_pool),
        expedited,
        clock,
        ctx,
    );
    option::fill(&mut dispute.sdvm_vote_round_id, object::id(&vote_round));
    vote_round
}

public fun create_and_share_sdvm_vote_round<Collateral>(
    dispute: &mut PMDispute<Collateral>,
    stake_pool: &PMStakePool<Collateral>,
    expedited: bool,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let vote_round = create_sdvm_vote_round(dispute, stake_pool, expedited, clock, ctx);
    pm_sdvm::share_vote_round(vote_round);
}

fun refund_dispute_bond<Collateral>(
    dispute: &mut PMDispute<Collateral>,
    recipient: address,
    ctx: &mut TxContext,
) {
    let bond_amount = balance::value(&dispute.bond);
    if (bond_amount > 0) {
        let refund_coin = coin::from_balance(balance::split(&mut dispute.bond, bond_amount), ctx);
        transfer::public_transfer(refund_coin, recipient);
    };
}

fun forfeit_dispute_bond_to_treasury<Collateral>(
    dispute: &mut PMDispute<Collateral>,
    treasury: &mut PMTreasury<Collateral>,
) {
    let bond_amount = balance::value(&dispute.bond);
    if (bond_amount > 0) {
        let treasury_balance = balance::split(&mut dispute.bond, bond_amount);
        prediction_market::pm_treasury::deposit_forfeited_bond(treasury, treasury_balance);
    };
}

fun forfeit_creator_bond_to_treasury<Collateral>(
    market: &mut PMMarket<Collateral>,
    treasury: &mut PMTreasury<Collateral>,
) {
    let creator_bond = pm_market::take_creation_bond(market);
    prediction_market::pm_treasury::deposit_forfeited_bond(treasury, creator_bond);
}

fun invalidate_as_draw<Collateral>(
    dispute: &mut PMDispute<Collateral>,
    market: &mut PMMarket<Collateral>,
    treasury: &mut PMTreasury<Collateral>,
    ctx: &mut TxContext,
) {
    let disputer = dispute.disputer;
    dispute.state = pm_rules::dispute_state_timeout_invalid();
    refund_dispute_bond(dispute, disputer, ctx);
    pm_resolution::refund_community_resolution_bond(market, ctx);
    forfeit_creator_bond_to_treasury(market, treasury);
    pm_market::transition_to_invalid(market, pm_rules::invalid_reason_draw());

    event::emit(DisputeResolvedEvent<Collateral> {
        dispute_id: object::id(dispute),
        market_id: dispute.market_id,
        upheld: false,
        final_outcome: pm_rules::sdvm_outcome_abstain(),
    });
}

public fun resolve_from_sdvm<Collateral>(
    dispute: &mut PMDispute<Collateral>,
    market: &mut PMMarket<Collateral>,
    treasury: &mut PMTreasury<Collateral>,
    sdvm_round: &SDVMVoteRound<Collateral>,
    ctx: &mut TxContext,
) {
    assert!(dispute.state == pm_rules::dispute_state_open(), EDisputeNotOpen);
    assert!(pm_market::state(market) == pm_rules::state_disputed(), EMarketNotDisputed);
    assert!(dispute.market_id == pm_market::market_id(market), EDisputeMarketMismatch);
    assert!(option::is_some(&dispute.sdvm_vote_round_id), EDisputeNotOpen);
    assert!(*option::borrow(&dispute.sdvm_vote_round_id) == object::id(sdvm_round), EDisputeMarketMismatch);
    assert!(pm_sdvm::round_is_settled(sdvm_round), EDisputeNotOpen);

    let settled_outcome = pm_sdvm::round_admin_resolved_outcome(sdvm_round);
    if (option::is_none(&settled_outcome)) {
        invalidate_as_draw(dispute, market, treasury, ctx);
        return
    };
    let winning_outcome = *option::borrow(&settled_outcome);

    if (winning_outcome == dispute.proposed_outcome) {
        let disputer = dispute.disputer;
        dispute.state = pm_rules::dispute_state_upheld();
        refund_dispute_bond(dispute, disputer, ctx);
        pm_resolution::forfeit_community_resolution_bond(market, treasury, disputer, ctx);
        forfeit_creator_bond_to_treasury(market, treasury);
        pm_market::transition_to_invalid(market, pm_rules::invalid_reason_dispute_verdict());

        event::emit(DisputeResolvedEvent<Collateral> {
            dispute_id: object::id(dispute),
            market_id: dispute.market_id,
            upheld: true,
            final_outcome: winning_outcome,
        });
    } else {
        dispute.state = pm_rules::dispute_state_rejected();
        forfeit_dispute_bond_to_treasury(dispute, treasury);
        pm_resolution::settle_community_resolution_success(market, ctx);
        pm_market::transition_to_resolved(market);

        event::emit(DisputeResolvedEvent<Collateral> {
            dispute_id: object::id(dispute),
            market_id: dispute.market_id,
            upheld: false,
            final_outcome: winning_outcome,
        });
    };
}

public fun cast_vote<Collateral>(
    dispute: &mut PMDispute<Collateral>,
    resolver_set: &PMResolverSet<Collateral>,
    voted_outcome: u16,
    ctx: &TxContext,
) {
    assert!(dispute.state == pm_rules::dispute_state_open(), EDisputeNotOpen);
    assert!(object::id(resolver_set) == dispute.resolver_set_id, EResolverSetMismatch);
    assert!((voted_outcome as u64) < (dispute.outcome_count as u64), EInvalidOutcome);

    let voter = tx_context::sender(ctx);
    assert!(vector::contains(&dispute.resolvers_snapshot, &voter), ENotResolver);

    let votes_len = vector::length(&dispute.votes);
    let mut i = 0u64;
    while (i < votes_len) {
        let vote = vector::borrow(&dispute.votes, i);
        assert!(vote.voter != voter, EAlreadyVoted);
        i = i + 1;
    };

    vector::push_back(&mut dispute.votes, VoteRecord { voter, voted_outcome });
    event::emit(DisputeVoteEvent<Collateral> {
        dispute_id: object::id(dispute),
        voter,
        voted_outcome,
    });
}

public fun try_resolve_dispute<Collateral>(
    dispute: &mut PMDispute<Collateral>,
    market: &mut PMMarket<Collateral>,
    treasury: &mut PMTreasury<Collateral>,
    resolver_set: &PMResolverSet<Collateral>,
    ctx: &mut TxContext,
) {
    assert!(dispute.state == pm_rules::dispute_state_open(), EDisputeNotOpen);
    assert!(pm_market::state(market) == pm_rules::state_disputed(), EMarketNotDisputed);
    assert!(dispute.market_id == pm_market::market_id(market), EDisputeMarketMismatch);
    assert!(object::id(resolver_set) == dispute.resolver_set_id, EResolverSetMismatch);
    if ((vector::length(&dispute.votes) as u64) < dispute.quorum_at_filing) {
        return
    };

    let mut counts = vector::empty<u64>();
    let mut i = 0u16;
    while (i < dispute.outcome_count) {
        vector::push_back(&mut counts, 0);
        i = i + 1;
    };

    let votes_len = vector::length(&dispute.votes);
    let mut j = 0u64;
    while (j < votes_len) {
        let vote = vector::borrow(&dispute.votes, j);
        let bucket = vector::borrow_mut(&mut counts, vote.voted_outcome as u64);
        *bucket = *bucket + 1;
        j = j + 1;
    };

    let mut winning_outcome = 0u16;
    let mut max_votes = 0u64;
    let mut has_unique_winner = false;
    let mut k = 0u16;
    while (k < dispute.outcome_count) {
        let weight = *vector::borrow(&counts, k as u64);
        if (weight > max_votes) {
            max_votes = weight;
            winning_outcome = k;
            has_unique_winner = true;
        } else if (weight == max_votes && weight > 0) {
            has_unique_winner = false;
        };
        k = k + 1;
    };

    if (max_votes == 0) {
        return
    };

    if (!has_unique_winner) {
        if ((vector::length(&dispute.votes) as u64) < vector::length(&dispute.resolvers_snapshot)) {
            return
        };
        invalidate_as_draw(dispute, market, treasury, ctx);
        return
    };

    let resolution = pm_market::resolution(market);
    let original_outcome = pm_market::resolution_outcome(option::borrow(resolution));
    if (winning_outcome == original_outcome) {
        dispute.state = pm_rules::dispute_state_rejected();
        forfeit_dispute_bond_to_treasury(dispute, treasury);
        pm_resolution::settle_community_resolution_success(market, ctx);
        pm_market::transition_to_resolved(market);

        event::emit(DisputeResolvedEvent<Collateral> {
            dispute_id: object::id(dispute),
            market_id: dispute.market_id,
            upheld: false,
            final_outcome: original_outcome,
        });
    } else {
        let disputer = dispute.disputer;
        dispute.state = pm_rules::dispute_state_upheld();
        refund_dispute_bond(dispute, disputer, ctx);
        pm_resolution::forfeit_community_resolution_bond(market, treasury, disputer, ctx);
        forfeit_creator_bond_to_treasury(market, treasury);
        pm_market::transition_to_invalid(market, pm_rules::invalid_reason_dispute_verdict());

        event::emit(DisputeResolvedEvent<Collateral> {
            dispute_id: object::id(dispute),
            market_id: dispute.market_id,
            upheld: true,
            final_outcome: winning_outcome,
        });
    };
}

public fun timeout_dispute<Collateral>(
    dispute: &mut PMDispute<Collateral>,
    market: &mut PMMarket<Collateral>,
    treasury: &mut PMTreasury<Collateral>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(dispute.state == pm_rules::dispute_state_open(), EDisputeNotOpen);
    assert!(pm_market::state(market) == pm_rules::state_disputed(), EMarketNotDisputed);
    assert!(dispute.market_id == pm_market::market_id(market), EDisputeMarketMismatch);

    let current_time = sui::clock::timestamp_ms(clock);
    assert!(current_time >= dispute.escalation_deadline_ms, EDisputeTimeoutNotReached);
    let disputer = dispute.disputer;
    dispute.state = pm_rules::dispute_state_timeout_invalid();
    pm_market::transition_to_invalid(market, pm_rules::invalid_reason_dispute_timeout());

    refund_dispute_bond(dispute, disputer, ctx);
    pm_resolution::refund_community_resolution_bond(market, ctx);
    forfeit_creator_bond_to_treasury(market, treasury);

    event::emit(DisputeTimeoutEvent<Collateral> {
        dispute_id: object::id(dispute),
        market_id: dispute.market_id,
    });
}

public fun close_dispute_on_invalid<Collateral>(
    dispute: &mut PMDispute<Collateral>,
    market: &mut PMMarket<Collateral>,
    ctx: &mut TxContext,
) {
    assert!(dispute.state == pm_rules::dispute_state_open(), EDisputeNotOpen);
    assert!(pm_market::state(market) == pm_rules::state_invalid(), EMarketNotDisputed);
    assert!(dispute.market_id == pm_market::market_id(market), EDisputeMarketMismatch);

    let disputer = dispute.disputer;
    dispute.state = pm_rules::dispute_state_timeout_invalid();
    refund_dispute_bond(dispute, disputer, ctx);
    pm_resolution::refund_community_resolution_bond(market, ctx);
}

public fun dispute_market_id<Collateral>(d: &PMDispute<Collateral>): ID { d.market_id }
public fun dispute_resolver_set_id<Collateral>(d: &PMDispute<Collateral>): ID { d.resolver_set_id }
public fun dispute_disputer<Collateral>(d: &PMDispute<Collateral>): address { d.disputer }
public fun dispute_proposed_outcome<Collateral>(d: &PMDispute<Collateral>): u16 { d.proposed_outcome }
public fun dispute_state<Collateral>(d: &PMDispute<Collateral>): u8 { d.state }
public fun dispute_bond_amount<Collateral>(d: &PMDispute<Collateral>): u64 { balance::value(&d.bond) }
public fun dispute_escalation_deadline<Collateral>(d: &PMDispute<Collateral>): u64 { d.escalation_deadline_ms }
public fun dispute_vote_count<Collateral>(d: &PMDispute<Collateral>): u64 { vector::length(&d.votes) }
public fun dispute_quorum_at_filing<Collateral>(d: &PMDispute<Collateral>): u64 { d.quorum_at_filing }
public fun dispute_sdvm_vote_round_id<Collateral>(d: &PMDispute<Collateral>): Option<ID> { d.sdvm_vote_round_id }

public fun resolver_set_quorum<Collateral>(s: &PMResolverSet<Collateral>): u64 { s.quorum }
public fun resolver_set_count<Collateral>(s: &PMResolverSet<Collateral>): u64 { vector::length(&s.resolvers) }
public fun resolver_set_contains<Collateral>(s: &PMResolverSet<Collateral>, addr: address): bool {
    vector::contains(&s.resolvers, &addr)
}
