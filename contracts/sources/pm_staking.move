/// PMStaking — collateral-family staking pool for SDVM voters.
module prediction_market::pm_staking;

use sui::{
    balance::{Self, Balance},
    clock::Clock,
    coin::{Self, Coin},
    event,
};

#[error(code = 0)]
const EInsufficientStake: vector<u8> = b"Insufficient stake";
#[error(code = 1)]
const ECooldownNotElapsed: vector<u8> = b"Cooldown not elapsed";
#[error(code = 2)]
const EAlreadyUnstaking: vector<u8> = b"Already unstaking";
#[error(code = 3)]
const ENotUnstaking: vector<u8> = b"Unstake not initiated";
#[error(code = 4)]
const EStakingPaused: vector<u8> = b"Staking paused";
#[error(code = 5)]
const EPendingDisputes: vector<u8> = b"Pending disputes block unstake";
#[error(code = 6)]
const EZeroStake: vector<u8> = b"Stake amount must be greater than zero";
#[error(code = 7)]
const EZeroReward: vector<u8> = b"Reward amount must be greater than zero";
#[error(code = 8)]
const EInvalidSlashAmount: vector<u8> = b"Invalid slash amount";
#[error(code = 9)]
const EDisputeNotSettled: vector<u8> = b"Dispute round not settled";
#[error(code = 10)]
const EDisputeNotFound: vector<u8> = b"Dispute round not found";
#[error(code = 11)]
const ESlashExceedsRemaining: vector<u8> = b"Slash exceeds remaining stake";

const DEFAULT_COOLDOWN_MS: u64 = 48 * 60 * 60 * 1000;
const EMERGENCY_UNSTAKE_PENALTY_BPS: u64 = 500;
const BASIS_POINTS: u64 = 10_000;

public struct StakeEvent<phantom Collateral> has copy, drop {
    staker: address,
    stake_position_id: ID,
    amount: u64,
    timestamp_ms: u64,
}

public struct UnstakeInitiatedEvent<phantom Collateral> has copy, drop {
    staker: address,
    stake_position_id: ID,
    amount: u64,
    cooldown_deadline_ms: u64,
}

public struct UnstakeCompletedEvent<phantom Collateral> has copy, drop {
    staker: address,
    stake_position_id: ID,
    amount: u64,
}

public struct EmergencyUnstakeEvent<phantom Collateral> has copy, drop {
    staker: address,
    stake_position_id: ID,
    original_amount: u64,
    penalty_amount: u64,
    returned_amount: u64,
}

public struct SlashEvent<phantom Collateral> has copy, drop {
    staker: address,
    stake_position_id: ID,
    slash_amount: u64,
    reason: vector<u8>,
}

public struct RewardEvent<phantom Collateral> has copy, drop {
    staker: address,
    stake_position_id: ID,
    reward_amount: u64,
}

public struct StakingPausedEvent<phantom Collateral> has copy, drop {
    timestamp_ms: u64,
}

public struct StakingResumedEvent<phantom Collateral> has copy, drop {
    timestamp_ms: u64,
}

public struct AdminForceClearDisputesEvent<phantom Collateral> has copy, drop {
    staker: address,
    stake_position_id: ID,
    cleared_count: u64,
}

public struct PMStakePool<phantom Collateral> has key {
    id: UID,
    total_staked: u64,
    staked_balance: Balance<Collateral>,
    pending_slash: Balance<Collateral>,
    cooldown_ms: u64,
    is_paused: bool,
}

public struct PMStakePosition<phantom Collateral> has key, store {
    id: UID,
    owner: address,
    staked_amount: u64,
    stake_epoch_ms: u64,
    cumulative_slash: u64,
    cumulative_rewards: u64,
    unstake_initiated_at_ms: Option<u64>,
    pending_dispute_ids_pre_unstake: vector<ID>,
    pending_dispute_ids_post_unstake: vector<ID>,
}

public struct SDVMAdminCap<phantom Collateral> has key, store {
    id: UID,
}

public fun create_and_share_pool<Collateral>(ctx: &mut TxContext) {
    let pool = PMStakePool<Collateral> {
        id: object::new(ctx),
        total_staked: 0,
        staked_balance: balance::zero<Collateral>(),
        pending_slash: balance::zero<Collateral>(),
        cooldown_ms: DEFAULT_COOLDOWN_MS,
        is_paused: false,
    };
    transfer::share_object(pool);
}

public fun create_admin_cap<Collateral>(ctx: &mut TxContext): SDVMAdminCap<Collateral> {
    SDVMAdminCap<Collateral> { id: object::new(ctx) }
}

/// Deploy-time convenience wrapper for the staking subsystem.
/// Shares the stake pool and returns the SDVM admin cap to the caller.
public fun bootstrap_staking<Collateral>(ctx: &mut TxContext): SDVMAdminCap<Collateral> {
    create_and_share_pool<Collateral>(ctx);
    create_admin_cap<Collateral>(ctx)
}

public fun stake<Collateral>(
    pool: &mut PMStakePool<Collateral>,
    payment: Coin<Collateral>,
    clock: &Clock,
    ctx: &mut TxContext,
): PMStakePosition<Collateral> {
    assert!(!pool.is_paused, EStakingPaused);
    let amount = coin::value(&payment);
    assert!(amount > 0, EZeroStake);

    balance::join(&mut pool.staked_balance, coin::into_balance(payment));
    pool.total_staked = pool.total_staked + amount;

    let current_time = sui::clock::timestamp_ms(clock);
    let position = PMStakePosition<Collateral> {
        id: object::new(ctx),
        owner: tx_context::sender(ctx),
        staked_amount: amount,
        stake_epoch_ms: current_time,
        cumulative_slash: 0,
        cumulative_rewards: 0,
        unstake_initiated_at_ms: option::none(),
        pending_dispute_ids_pre_unstake: vector::empty(),
        pending_dispute_ids_post_unstake: vector::empty(),
    };

    event::emit(StakeEvent<Collateral> {
        staker: tx_context::sender(ctx),
        stake_position_id: object::id(&position),
        amount,
        timestamp_ms: current_time,
    });

    position
}

public fun initiate_unstake<Collateral>(
    position: &mut PMStakePosition<Collateral>,
    clock: &Clock,
    _ctx: &TxContext,
) {
    assert!(option::is_none(&position.unstake_initiated_at_ms), EAlreadyUnstaking);
    let current_time = sui::clock::timestamp_ms(clock);
    option::fill(&mut position.unstake_initiated_at_ms, current_time);

    event::emit(UnstakeInitiatedEvent<Collateral> {
        staker: position.owner,
        stake_position_id: object::id(position),
        amount: position.staked_amount,
        cooldown_deadline_ms: current_time + DEFAULT_COOLDOWN_MS,
    });
}

public fun complete_unstake<Collateral>(
    pool: &mut PMStakePool<Collateral>,
    position: PMStakePosition<Collateral>,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<Collateral> {
    let position_id = object::id(&position);
    let PMStakePosition {
        id,
        owner,
        staked_amount,
        stake_epoch_ms: _,
        cumulative_slash,
        cumulative_rewards: _,
        unstake_initiated_at_ms,
        pending_dispute_ids_pre_unstake,
        pending_dispute_ids_post_unstake,
    } = position;

    assert!(vector::is_empty(&pending_dispute_ids_pre_unstake), EPendingDisputes);
    assert!(vector::is_empty(&pending_dispute_ids_post_unstake), EPendingDisputes);
    assert!(option::is_some(&unstake_initiated_at_ms), ENotUnstaking);

    let initiated_at = *option::borrow(&unstake_initiated_at_ms);
    let current_time = sui::clock::timestamp_ms(clock);
    assert!(current_time >= initiated_at + DEFAULT_COOLDOWN_MS, ECooldownNotElapsed);

    let net_amount = if (cumulative_slash >= staked_amount) {
        0
    } else {
        staked_amount - cumulative_slash
    };
    assert!(net_amount > 0, EInsufficientStake);

    pool.total_staked = pool.total_staked - staked_amount;
    let coin_out = coin::take(&mut pool.staked_balance, net_amount, ctx);

    event::emit(UnstakeCompletedEvent<Collateral> {
        staker: owner,
        stake_position_id: position_id,
        amount: net_amount,
    });

    object::delete(id);
    coin_out
}

public fun emergency_unstake<Collateral>(
    pool: &mut PMStakePool<Collateral>,
    position: PMStakePosition<Collateral>,
    _clock: &Clock,
    ctx: &mut TxContext,
): Coin<Collateral> {
    let position_id = object::id(&position);
    let PMStakePosition {
        id,
        owner,
        staked_amount,
        stake_epoch_ms: _,
        cumulative_slash,
        cumulative_rewards: _,
        unstake_initiated_at_ms: _,
        pending_dispute_ids_pre_unstake,
        pending_dispute_ids_post_unstake,
    } = position;

    assert!(vector::is_empty(&pending_dispute_ids_pre_unstake), EPendingDisputes);
    assert!(vector::is_empty(&pending_dispute_ids_post_unstake), EPendingDisputes);

    let net_amount = if (cumulative_slash >= staked_amount) {
        0
    } else {
        staked_amount - cumulative_slash
    };
    assert!(net_amount > 0, EInsufficientStake);

    let penalty = (((net_amount as u128) * (EMERGENCY_UNSTAKE_PENALTY_BPS as u128)) / (BASIS_POINTS as u128)) as u64;
    assert!(penalty <= net_amount, EInvalidSlashAmount);
    let returned_amount = net_amount - penalty;

    pool.total_staked = pool.total_staked - staked_amount;
    if (penalty > 0) {
        let penalty_balance = balance::split(&mut pool.staked_balance, penalty);
        balance::join(&mut pool.pending_slash, penalty_balance);
    };
    let coin_out = coin::take(&mut pool.staked_balance, returned_amount, ctx);

    event::emit(EmergencyUnstakeEvent<Collateral> {
        staker: owner,
        stake_position_id: position_id,
        original_amount: staked_amount,
        penalty_amount: penalty,
        returned_amount,
    });

    object::delete(id);
    coin_out
}

public fun admin_pause_staking<Collateral>(
    _admin: &SDVMAdminCap<Collateral>,
    pool: &mut PMStakePool<Collateral>,
    clock: &Clock,
) {
    pool.is_paused = true;
    event::emit(StakingPausedEvent<Collateral> {
        timestamp_ms: sui::clock::timestamp_ms(clock),
    });
}

public fun admin_resume_staking<Collateral>(
    _admin: &SDVMAdminCap<Collateral>,
    pool: &mut PMStakePool<Collateral>,
    clock: &Clock,
) {
    pool.is_paused = false;
    event::emit(StakingResumedEvent<Collateral> {
        timestamp_ms: sui::clock::timestamp_ms(clock),
    });
}

public(package) fun apply_slash<Collateral>(
    pool: &mut PMStakePool<Collateral>,
    position: &mut PMStakePosition<Collateral>,
    slash_amount: u64,
    reason: vector<u8>,
) {
    let remaining = if (position.cumulative_slash >= position.staked_amount) {
        0
    } else {
        position.staked_amount - position.cumulative_slash
    };
    let capped = if (slash_amount > remaining) { remaining } else { slash_amount };
    if (capped == 0) {
        return
    };

    position.cumulative_slash = position.cumulative_slash + capped;
    let slashed_balance = balance::split(&mut pool.staked_balance, capped);
    balance::join(&mut pool.pending_slash, slashed_balance);

    event::emit(SlashEvent<Collateral> {
        staker: position.owner,
        stake_position_id: object::id(position),
        slash_amount: capped,
        reason,
    });
}

public(package) fun apply_reward<Collateral>(
    position: &mut PMStakePosition<Collateral>,
    reward_amount: u64,
) {
    assert!(reward_amount > 0, EZeroReward);
    position.cumulative_rewards = position.cumulative_rewards + reward_amount;

    event::emit(RewardEvent<Collateral> {
        staker: position.owner,
        stake_position_id: object::id(position),
        reward_amount,
    });
}

public fun admin_slash_override<Collateral>(
    _admin: &SDVMAdminCap<Collateral>,
    pool: &mut PMStakePool<Collateral>,
    position: &mut PMStakePosition<Collateral>,
    slash_amount: u64,
    reason: vector<u8>,
) {
    let remaining = if (position.cumulative_slash >= position.staked_amount) {
        0
    } else {
        position.staked_amount - position.cumulative_slash
    };
    assert!(slash_amount <= remaining, ESlashExceedsRemaining);
    apply_slash(pool, position, slash_amount, reason);
}

public fun admin_reward_override<Collateral>(
    _admin: &SDVMAdminCap<Collateral>,
    position: &mut PMStakePosition<Collateral>,
    reward_amount: u64,
) {
    apply_reward(position, reward_amount);
}

public(package) fun register_dispute<Collateral>(
    position: &mut PMStakePosition<Collateral>,
    dispute_round_id: ID,
) {
    if (option::is_none(&position.unstake_initiated_at_ms)) {
        if (!vector::contains(&position.pending_dispute_ids_pre_unstake, &dispute_round_id)) {
            vector::push_back(&mut position.pending_dispute_ids_pre_unstake, dispute_round_id);
        };
    } else {
        if (!vector::contains(&position.pending_dispute_ids_post_unstake, &dispute_round_id)) {
            vector::push_back(&mut position.pending_dispute_ids_post_unstake, dispute_round_id);
        };
    };
}

public(package) fun unregister_dispute<Collateral>(
    position: &mut PMStakePosition<Collateral>,
    dispute_round_id: ID,
) {
    let (found_pre, idx_pre) = vector::index_of(&position.pending_dispute_ids_pre_unstake, &dispute_round_id);
    if (found_pre) {
        vector::remove(&mut position.pending_dispute_ids_pre_unstake, idx_pre);
        return
    };

    let (found_post, idx_post) = vector::index_of(&position.pending_dispute_ids_post_unstake, &dispute_round_id);
    if (found_post) {
        vector::remove(&mut position.pending_dispute_ids_post_unstake, idx_post);
    };
}

public(package) fun has_registered_dispute<Collateral>(
    position: &PMStakePosition<Collateral>,
    dispute_round_id: ID,
): bool {
    vector::contains(&position.pending_dispute_ids_pre_unstake, &dispute_round_id) ||
    vector::contains(&position.pending_dispute_ids_post_unstake, &dispute_round_id)
}

public fun clear_settled_dispute<Collateral>(
    position: &mut PMStakePosition<Collateral>,
    dispute_round_id: ID,
    round_phase: u8,
    _ctx: &TxContext,
) {
    assert!(round_phase == 3, EDisputeNotSettled);
    let before = position_pending_disputes(position) + position_post_unstake_pending_disputes(position);
    unregister_dispute(position, dispute_round_id);
    let after = position_pending_disputes(position) + position_post_unstake_pending_disputes(position);
    assert!(before != after, EDisputeNotFound);
}

public fun admin_force_clear_disputes<Collateral>(
    _admin: &SDVMAdminCap<Collateral>,
    position: &mut PMStakePosition<Collateral>,
) {
    let cleared_count = position_pending_disputes(position) + position_post_unstake_pending_disputes(position);
    while (!vector::is_empty(&position.pending_dispute_ids_pre_unstake)) {
        vector::pop_back(&mut position.pending_dispute_ids_pre_unstake);
    };
    while (!vector::is_empty(&position.pending_dispute_ids_post_unstake)) {
        vector::pop_back(&mut position.pending_dispute_ids_post_unstake);
    };

    event::emit(AdminForceClearDisputesEvent<Collateral> {
        staker: position.owner,
        stake_position_id: object::id(position),
        cleared_count,
    });
}

public fun pool_total_staked<Collateral>(pool: &PMStakePool<Collateral>): u64 { pool.total_staked }
public fun pool_staked_balance<Collateral>(pool: &PMStakePool<Collateral>): u64 { balance::value(&pool.staked_balance) }
public fun pool_pending_slash<Collateral>(pool: &PMStakePool<Collateral>): u64 { balance::value(&pool.pending_slash) }
public fun pool_is_paused<Collateral>(pool: &PMStakePool<Collateral>): bool { pool.is_paused }
public fun pool_cooldown_ms<Collateral>(pool: &PMStakePool<Collateral>): u64 { pool.cooldown_ms }

public fun position_owner<Collateral>(p: &PMStakePosition<Collateral>): address { p.owner }
public fun position_staked_amount<Collateral>(p: &PMStakePosition<Collateral>): u64 { p.staked_amount }
public fun position_cumulative_slash<Collateral>(p: &PMStakePosition<Collateral>): u64 { p.cumulative_slash }
public fun position_cumulative_rewards<Collateral>(p: &PMStakePosition<Collateral>): u64 { p.cumulative_rewards }
public fun position_net_stake<Collateral>(p: &PMStakePosition<Collateral>): u64 {
    if (p.cumulative_slash >= p.staked_amount) { 0 } else { p.staked_amount - p.cumulative_slash }
}
public fun position_is_unstaking<Collateral>(p: &PMStakePosition<Collateral>): bool {
    option::is_some(&p.unstake_initiated_at_ms)
}
public fun position_unstake_deadline_ms<Collateral>(p: &PMStakePosition<Collateral>): Option<u64> {
    if (option::is_some(&p.unstake_initiated_at_ms)) {
        option::some(*option::borrow(&p.unstake_initiated_at_ms) + DEFAULT_COOLDOWN_MS)
    } else {
        option::none()
    }
}
public fun position_pending_disputes<Collateral>(p: &PMStakePosition<Collateral>): u64 {
    vector::length(&p.pending_dispute_ids_pre_unstake)
}
public fun position_post_unstake_pending_disputes<Collateral>(p: &PMStakePosition<Collateral>): u64 {
    vector::length(&p.pending_dispute_ids_post_unstake)
}
public fun position_all_pending_disputes<Collateral>(p: &PMStakePosition<Collateral>): u64 {
    vector::length(&p.pending_dispute_ids_pre_unstake) + vector::length(&p.pending_dispute_ids_post_unstake)
}

public(package) fun withdraw_pending_slash<Collateral>(
    pool: &mut PMStakePool<Collateral>,
    amount: u64,
    ctx: &mut TxContext,
): Coin<Collateral> {
    coin::take(&mut pool.pending_slash, amount, ctx)
}
