/// SDVM Staking Pool — manages staker deposits, cooldown, emergency unstake, and admin controls.
/// Implements D1 (opt-in slash), D6 (48h cooldown, dispute-aware, emergency with 5% penalty).
///
/// Objects:
/// - SufferStakePool (shared): global pool state
/// - SufferStakePosition (owned): per-staker stake record, slashable
/// - SDVMAdminCap: capability for god lever operations
module prediction_market::pm_staking;

use sui::{
    balance::{Self, Balance},
    clock::Clock,
    coin::{Self, Coin},
    event,
    object::{Self, UID, ID},
    transfer,
    tx_context::{Self, TxContext},
};
use prediction_market::suffer::SUFFER;

// ═══════════════════════════════════════════════════════════════
// Error Codes (range 300-320 per spec)
// ═══════════════════════════════════════════════════════════════

#[error(code = 300)]
const EInsufficientStake: vector<u8> = b"Insufficient stake to withdraw";

#[error(code = 301)]
const ECooldownNotElapsed: vector<u8> = b"Cooldown period not elapsed";

#[error(code = 302)]
const EAlreadyUnstaking: vector<u8> = b"Already initiated unstake";

#[error(code = 303)]
const ENotUnstaking: vector<u8> = b"Unstake not initiated";

#[error(code = 304)]
const EStakingPaused: vector<u8> = b"Staking is paused";

#[error(code = 305)]
const EPendingDisputes: vector<u8> = b"Cannot complete unstake: pending pre-filed disputes block completion";

#[error(code = 306)]
const EZeroStake: vector<u8> = b"Stake amount must be greater than zero";

#[error(code = 307)]
const EZeroReward: vector<u8> = b"Cannot claim zero rewards";

#[error(code = 308)]
const EInvalidSlashAmount: vector<u8> = b"Invalid slash amount";

#[error(code = 309)]
const EEmergencyUnstakeNotAllowed: vector<u8> = b"Emergency unstake not allowed";

#[error(code = 310)]
const EDisputeNotSettled: vector<u8> = b"Dispute round is not settled — cannot clear";

#[error(code = 311)]
const EDisputeNotFound: vector<u8> = b"Dispute round ID not found in pending list";

#[error(code = 312)]
const ESlashExceedsRemaining: vector<u8> = b"Slash amount exceeds remaining stake";

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const DEFAULT_COOLDOWN_MS: u64 = 48 * 60 * 60 * 1000; // 48 hours in milliseconds
const EMERGENCY_UNSTAKE_PENALTY_BPS: u64 = 500; // 5% penalty = 500 basis points
const BASIS_POINTS: u64 = 10000;
const MIN_STAKE: u64 = 1; // Minimum stake amount (in SUFFER base units)

// ═══════════════════════════════════════════════════════════════
// Events
// ═══════════════════════════════════════════════════════════════

public struct StakeEvent has copy, drop {
    staker: address,
    stake_position_id: ID,
    amount: u64,
    timestamp_ms: u64,
}

public struct UnstakeInitiatedEvent has copy, drop {
    staker: address,
    stake_position_id: ID,
    amount: u64,
    cooldown_deadline_ms: u64,
}

public struct UnstakeCompletedEvent has copy, drop {
    staker: address,
    stake_position_id: ID,
    amount: u64,
}

public struct EmergencyUnstakeEvent has copy, drop {
    staker: address,
    stake_position_id: ID,
    original_amount: u64,
    penalty_amount: u64,
    returned_amount: u64,
}

public struct SlashEvent has copy, drop {
    staker: address,
    stake_position_id: ID,
    slash_amount: u64,
    reason: vector<u8>,
}

public struct RewardEvent has copy, drop {
    staker: address,
    stake_position_id: ID,
    reward_amount: u64,
}

public struct StakingPausedEvent has copy, drop {
    timestamp_ms: u64,
}

public struct StakingResumedEvent has copy, drop {
    timestamp_ms: u64,
}

public struct AdminForceClearDisputesEvent has copy, drop {
    staker: address,
    stake_position_id: ID,
    cleared_count: u64,
}

// ═══════════════════════════════════════════════════════════════
// Objects
// ═══════════════════════════════════════════════════════════════

/// Global staking pool (shared object).
/// Tracks total staked amount, pending reward/slash balances, and configuration.
public struct SufferStakePool has key {
    id: UID,
    total_staked: u64,
    pending_rewards: Balance<SUFFER>,
    pending_slash: Balance<SUFFER>,
    cooldown_ms: u64,
    is_paused: bool,
}

/// Per-staker stake position (owned object).
/// Tracks a single staker's stake, cumulative slash/rewards, and unstake initiation.
/// Can be slashed by SDVM (via SDVMAdminCap) or consumed by unstake operations.
///
/// RT2-CRITICAL-003: Split pending disputes into two lists to distinguish between
/// disputes filed BEFORE unstake initiation (which block unstake completion)
/// vs disputes filed AFTER unstake initiation (which don't block).
public struct SufferStakePosition has key, store {
    id: UID,
    owner: address,
    staked_amount: u64,
    stake_epoch_ms: u64,
    cumulative_slash: u64,
    cumulative_rewards: u64,
    unstake_initiated_at_ms: Option<u64>,
    // Disputes filed before unstake initiated (block completion)
    pending_dispute_ids_pre_unstake: vector<ID>,
    // Disputes filed after unstake initiated (do not block completion)
    pending_dispute_ids_post_unstake: vector<ID>,
}

/// Admin capability for god lever operations.
public struct SDVMAdminCap has key, store {
    id: UID,
}

// ═══════════════════════════════════════════════════════════════
// Pool Initialization
// ═══════════════════════════════════════════════════════════════

/// Create and share the global staking pool.
public fun create_and_share_pool(ctx: &mut TxContext) {
    let pool = SufferStakePool {
        id: object::new(ctx),
        total_staked: 0,
        pending_rewards: balance::zero<SUFFER>(),
        pending_slash: balance::zero<SUFFER>(),
        cooldown_ms: DEFAULT_COOLDOWN_MS,
        is_paused: false,
    };
    transfer::share_object(pool);
}

/// Create the SDVMAdminCap (one-time in module init).
public fun create_admin_cap(ctx: &mut TxContext): SDVMAdminCap {
    SDVMAdminCap {
        id: object::new(ctx),
    }
}

// ═══════════════════════════════════════════════════════════════
// Staking Operations
// ═══════════════════════════════════════════════════════════════

/// Stake SUFFER tokens. Creates a new SufferStakePosition (owned object).
/// Returns the stake position to be held by the staker.
public fun stake(
    pool: &mut SufferStakePool,
    payment: Coin<SUFFER>,
    clock: &Clock,
    ctx: &mut TxContext,
): SufferStakePosition {
    assert!(!pool.is_paused, EStakingPaused);

    let amount = coin::value(&payment);
    assert!(amount >= MIN_STAKE, EZeroStake);

    // Add to pool's balance
    let balance_to_add = coin::into_balance(payment);
    balance::join(&mut pool.pending_rewards, balance_to_add);
    pool.total_staked = pool.total_staked + amount;

    let current_time = sui::clock::timestamp_ms(clock);
    let position = SufferStakePosition {
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

    event::emit(StakeEvent {
        staker: tx_context::sender(ctx),
        stake_position_id: object::id(&position),
        amount,
        timestamp_ms: current_time,
    });

    position
}

/// Initiate unstaking (starts cooldown).
/// Position remains slashable during cooldown for disputes filed before unstake initiation.
public fun initiate_unstake(
    position: &mut SufferStakePosition,
    clock: &Clock,
    _ctx: &TxContext,
) {
    assert!(option::is_none(&position.unstake_initiated_at_ms), EAlreadyUnstaking);

    let current_time = sui::clock::timestamp_ms(clock);
    let cooldown_deadline = current_time + DEFAULT_COOLDOWN_MS;

    option::fill(&mut position.unstake_initiated_at_ms, current_time);

    event::emit(UnstakeInitiatedEvent {
        staker: position.owner,
        stake_position_id: object::id(position),
        amount: position.staked_amount,
        cooldown_deadline_ms: cooldown_deadline,
    });
}

/// Complete unstaking (after cooldown elapsed).
/// Requires no pending disputes filed before unstake_initiated.
/// Consumes the position and returns the stake (minus any slash).
public fun complete_unstake(
    pool: &mut SufferStakePool,
    position: SufferStakePosition,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<SUFFER> {
    // RT2-CRITICAL-001 FIX: Capture actual position ID before destructuring
    let position_id = object::id(&position);

    let SufferStakePosition {
        id,
        owner,
        staked_amount,
        stake_epoch_ms: _,
        cumulative_slash,
        cumulative_rewards: _,
        unstake_initiated_at_ms,
        pending_dispute_ids_pre_unstake,
        pending_dispute_ids_post_unstake: _,
    } = position;

    object::delete(id);

    // RT2-CRITICAL-003: Only check pre-unstake disputes
    assert!(vector::is_empty(&pending_dispute_ids_pre_unstake), EPendingDisputes);

    assert!(option::is_some(&unstake_initiated_at_ms), ENotUnstaking);
    let unstake_initiated = option::extract(&mut unstake_initiated_at_ms);

    let current_time = sui::clock::timestamp_ms(clock);
    let cooldown_deadline = unstake_initiated + DEFAULT_COOLDOWN_MS;
    assert!(current_time >= cooldown_deadline, ECooldownNotElapsed);

    // Net unstakeable amount (after slash)
    let net_amount = staked_amount - cumulative_slash;
    assert!(net_amount > 0, EInsufficientStake);

    // Remove from pool total
    pool.total_staked = pool.total_staked - staked_amount;

    // Take from pending_rewards and return to staker
    let coin_out = coin::take(&mut pool.pending_rewards, net_amount, ctx);

    event::emit(UnstakeCompletedEvent {
        staker: owner,
        stake_position_id: position_id,
        amount: net_amount,
    });

    coin_out
}

/// Emergency unstake: immediate withdrawal with 5% penalty.
/// Still slashable for pending disputes filed before emergency_unstake call.
/// Returns: (stake - penalty) to staker.
/// Penalty goes to pool's pending_slash balance.
pub fun emergency_unstake(
    pool: &mut SufferStakePool,
    position: SufferStakePosition,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<SUFFER> {
    // RT2-CRITICAL-001 FIX: Capture actual position ID before destructuring
    let position_id = object::id(&position);

    let SufferStakePosition {
        id,
        owner,
        staked_amount,
        stake_epoch_ms: _,
        cumulative_slash,
        cumulative_rewards: _,
        unstake_initiated_at_ms: _,
        pending_dispute_ids_pre_unstake,
        pending_dispute_ids_post_unstake: _,
    } = position;

    object::delete(id);

    // RT2-CRITICAL-003: Check pre-unstake disputes (post-unstake don't block emergency)
    assert!(vector::is_empty(&pending_dispute_ids_pre_unstake), EPendingDisputes);

    // Net amount after slash
    let net_amount = staked_amount - cumulative_slash;
    assert!(net_amount > 0, EInsufficientStake);

    // Apply 5% penalty using u128 to prevent overflow
    // RT2-CRITICAL-001: Use u128 intermediate for safe arithmetic
    let net_amount_u128 = (net_amount as u128);
    let penalty_u128 = (net_amount_u128 * (EMERGENCY_UNSTAKE_PENALTY_BPS as u128)) / (BASIS_POINTS as u128);
    let penalty = (penalty_u128 as u64);
    assert!(penalty <= net_amount, EInvalidSlashAmount);
    let return_amount = net_amount - penalty;

    // Remove from pool total
    pool.total_staked = pool.total_staked - staked_amount;

    // Move penalty to pending_slash
    let penalty_balance = balance::split(&mut pool.pending_rewards, penalty);
    balance::join(&mut pool.pending_slash, penalty_balance);

    // Return the rest to staker
    let coin_out = coin::take(&mut pool.pending_rewards, return_amount, ctx);

    let current_time = sui::clock::timestamp_ms(clock);
    event::emit(EmergencyUnstakeEvent {
        staker: owner,
        stake_position_id: position_id,
        original_amount: staked_amount,
        penalty_amount: penalty,
        returned_amount: return_amount,
    });

    coin_out
}

// ═══════════════════════════════════════════════════════════════
// Admin Operations (God Levers)
// ═══════════════════════════════════════════════════════════════

/// Admin: Pause staking (god lever).
public fun admin_pause_staking(
    _: &SDVMAdminCap,
    pool: &mut SufferStakePool,
    clock: &Clock,
) {
    pool.is_paused = true;

    event::emit(StakingPausedEvent {
        timestamp_ms: sui::clock::timestamp_ms(clock),
    });
}

/// Admin: Resume staking (god lever).
public fun admin_resume_staking(
    _: &SDVMAdminCap,
    pool: &mut SufferStakePool,
    clock: &Clock,
) {
    pool.is_paused = false;

    event::emit(StakingResumedEvent {
        timestamp_ms: sui::clock::timestamp_ms(clock),
    });
}

/// Apply slash to a position AND move slashed tokens from pending_rewards to pending_slash.
/// This is the critical step that funds the reward pool for correct voters.
/// Marked as `public(package)` so pm_sdvm can call without capability.
public(package) fun apply_slash(
    pool: &mut SufferStakePool,
    position: &mut SufferStakePosition,
    slash_amount: u64,
    reason: vector<u8>,
) {
    // Cap slash to remaining slashable amount
    let max_slashable = position.staked_amount - position.cumulative_slash;
    let capped_slash = if (slash_amount > max_slashable) { max_slashable } else { slash_amount };

    if (capped_slash == 0) { return };

    position.cumulative_slash = position.cumulative_slash + capped_slash;

    // CRITICAL: Move slashed tokens from pending_rewards → pending_slash.
    // This is what funds the reward pool that correct voters claim from.
    // Without this, pool.pending_slash stays empty and rewards are zero.
    let slashed_balance = balance::split(&mut pool.pending_rewards, capped_slash);
    balance::join(&mut pool.pending_slash, slashed_balance);

    event::emit(SlashEvent {
        staker: position.owner,
        stake_position_id: object::id(position),
        slash_amount: capped_slash,
        reason,
    });
}

/// Apply reward to a position (callable by SDVM post-tally for correct voters).
/// Increases cumulative_rewards. Rewards come from pending_rewards balance.
/// Marked as `public(package)` so pm_sdvm can call without capability.
public(package) fun apply_reward(
    position: &mut SufferStakePosition,
    reward_amount: u64,
) {
    assert!(reward_amount > 0, EZeroReward);

    // RT1-001 FIX: Track cumulative rewards for later withdrawal
    // Note: Actual reward token transfers happen via claim_voter_reward() in pm_sdvm
    // which extracts from pool.pending_slash after slashing is finalized
    position.cumulative_rewards = position.cumulative_rewards + reward_amount;

    event::emit(RewardEvent {
        staker: position.owner,
        stake_position_id: object::id(position),
        reward_amount,
    });
}

/// Admin: Slash a position by god lever (admin override).
/// Slashes up to the position's stake amount.
pub fun admin_slash_override(
    _: &SDVMAdminCap,
    pool: &mut SufferStakePool,
    position: &mut SufferStakePosition,
    slash_amount: u64,
    reason: vector<u8>,
) {
    // RT2-HIGH-008: Verify slash doesn't exceed remaining slashable amount
    let max_slashable = position.staked_amount - position.cumulative_slash;
    assert!(slash_amount <= max_slashable, ESlashExceedsRemaining);
    apply_slash(pool, position, slash_amount, reason);
}

/// Admin: Apply reward to a position (admin override).
public fun admin_reward_override(
    _: &SDVMAdminCap,
    position: &mut SufferStakePosition,
    reward_amount: u64,
) {
    apply_reward(position, reward_amount);
}

// ═══════════════════════════════════════════════════════════════
// Dispute Registration (Dispute-Aware Unstaking)
// ═══════════════════════════════════════════════════════════════

/// Register a dispute as pending on a stake position.
/// Called by pm_sdvm when a dispute is filed during the staker's active period.
/// RT2-CRITICAL-003: Register a dispute on a stake position.
/// If unstake_initiated_at_ms is None, add to pre_unstake list.
/// If unstake_initiated_at_ms is Some, add to post_unstake list.
public(package) fun register_dispute(position: &mut SufferStakePosition, dispute_round_id: ID) {
    if (option::is_none(&position.unstake_initiated_at_ms)) {
        // Only add if not already registered (prevents duplicates on round rolls)
        if (!vector::contains(&position.pending_dispute_ids_pre_unstake, &dispute_round_id)) {
            vector::push_back(&mut position.pending_dispute_ids_pre_unstake, dispute_round_id);
        };
    } else {
        if (!vector::contains(&position.pending_dispute_ids_post_unstake, &dispute_round_id)) {
            vector::push_back(&mut position.pending_dispute_ids_post_unstake, dispute_round_id);
        };
    }
}

/// Unregister a dispute from a stake position.
/// Called by pm_sdvm when a dispute is resolved.
/// RT2-CRITICAL-003: Check both pre and post unstake lists.
public(package) fun unregister_dispute(position: &mut SufferStakePosition, dispute_round_id: ID) {
    // Try to remove from pre_unstake list first
    let len_pre = vector::length(&position.pending_dispute_ids_pre_unstake);
    let mut i = 0;
    while (i < len_pre) {
        if (*vector::borrow(&position.pending_dispute_ids_pre_unstake, i) == dispute_round_id) {
            vector::remove(&mut position.pending_dispute_ids_pre_unstake, i);
            return
        };
        i = i + 1;
    };

    // If not found in pre, try post_unstake list
    let len_post = vector::length(&position.pending_dispute_ids_post_unstake);
    i = 0;
    while (i < len_post) {
        if (*vector::borrow(&position.pending_dispute_ids_post_unstake, i) == dispute_round_id) {
            vector::remove(&mut position.pending_dispute_ids_post_unstake, i);
            return
        };
        i = i + 1;
    };
}

/// Self-service dispute cleanup: staker proves the round is SETTLED and clears it.
/// Prevents permanent lock if pm_sdvm fails to call unregister_dispute().
/// Permissionless — staker calls this with a reference to the settled SDVMVoteRound.
/// The round must be in SETTLED phase (3) to prove the dispute is resolved.
///
/// NOTE: This takes a `round_phase: u8` parameter rather than an SDVMVoteRound reference
/// to avoid a circular dependency (pm_staking cannot import pm_sdvm). The caller must
/// read the round's phase off-chain and pass it. The `round_id` must match a pending entry.
/// For on-chain safety, use clear_settled_dispute_verified() in pm_sdvm instead, which
/// reads the round directly and calls unregister_dispute().
public fun clear_settled_dispute(
    position: &mut SufferStakePosition,
    dispute_round_id: ID,
    round_phase: u8,
    _ctx: &TxContext,
) {
    // Round must be in SETTLED phase (3)
    assert!(round_phase == 3, EDisputeNotSettled);

    // RT2-CRITICAL-003: Search both pre and post unstake lists
    // Find and remove the dispute ID
    let len_pre = vector::length(&position.pending_dispute_ids_pre_unstake);
    let mut i = 0;
    let mut found = false;
    while (i < len_pre) {
        if (*vector::borrow(&position.pending_dispute_ids_pre_unstake, i) == dispute_round_id) {
            vector::remove(&mut position.pending_dispute_ids_pre_unstake, i);
            found = true;
            break
        };
        i = i + 1;
    };

    if (!found) {
        let len_post = vector::length(&position.pending_dispute_ids_post_unstake);
        i = 0;
        while (i < len_post) {
            if (*vector::borrow(&position.pending_dispute_ids_post_unstake, i) == dispute_round_id) {
                vector::remove(&mut position.pending_dispute_ids_post_unstake, i);
                found = true;
                break
            };
            i = i + 1;
        };
    };
    assert!(found, EDisputeNotFound);
}

/// Admin: Force-clear all pending disputes from a position (god lever).
/// Use when: round objects are destroyed, pm_sdvm bug prevents unregister, or
/// staker is permanently locked and needs rescue. Emits event for audit trail.
public fun admin_force_clear_disputes(
    _: &SDVMAdminCap,
    position: &mut SufferStakePosition,
) {
    // RT2-CRITICAL-003: Clear both pre and post unstake disputes
    let count_pre = vector::length(&position.pending_dispute_ids_pre_unstake);
    let count_post = vector::length(&position.pending_dispute_ids_post_unstake);
    let total_count = count_pre + count_post;

    // Clear all pending disputes from both lists
    while (!vector::is_empty(&position.pending_dispute_ids_pre_unstake)) {
        vector::pop_back(&mut position.pending_dispute_ids_pre_unstake);
    };
    while (!vector::is_empty(&position.pending_dispute_ids_post_unstake)) {
        vector::pop_back(&mut position.pending_dispute_ids_post_unstake);
    };

    event::emit(AdminForceClearDisputesEvent {
        staker: position.owner,
        stake_position_id: object::id(position),
        cleared_count: total_count,
    });
}

// ═══════════════════════════════════════════════════════════════
// Read Accessors
// ═══════════════════════════════════════════════════════════════

public fun pool_total_staked(pool: &SufferStakePool): u64 { pool.total_staked }
public fun pool_pending_rewards(pool: &SufferStakePool): u64 { balance::value(&pool.pending_rewards) }
public fun pool_pending_slash(pool: &SufferStakePool): u64 { balance::value(&pool.pending_slash) }
public fun pool_is_paused(pool: &SufferStakePool): bool { pool.is_paused }
public fun pool_cooldown_ms(pool: &SufferStakePool): u64 { pool.cooldown_ms }

public fun position_owner(p: &SufferStakePosition): address { p.owner }
public fun position_staked_amount(p: &SufferStakePosition): u64 { p.staked_amount }
public fun position_cumulative_slash(p: &SufferStakePosition): u64 { p.cumulative_slash }
public fun position_cumulative_rewards(p: &SufferStakePosition): u64 { p.cumulative_rewards }
public fun position_net_stake(p: &SufferStakePosition): u64 {
    let gross = p.staked_amount;
    let slashed = p.cumulative_slash;
    if (slashed >= gross) { 0 } else { gross - slashed }
}
public fun position_is_unstaking(p: &SufferStakePosition): bool {
    option::is_some(&p.unstake_initiated_at_ms)
}
public fun position_unstake_deadline_ms(p: &SufferStakePosition): Option<u64> {
    if (option::is_some(&p.unstake_initiated_at_ms)) {
        let initiated = option::borrow(&p.unstake_initiated_at_ms);
        option::some(*initiated + DEFAULT_COOLDOWN_MS)
    } else {
        option::none()
    }
}

/// RT2-CRITICAL-003: Return count of pre-unstake disputes that actually block unstake
pub fun position_pending_disputes(p: &SufferStakePosition): u64 {
    vector::length(&p.pending_dispute_ids_pre_unstake)
}

/// Return count of all disputes (pre + post unstake) for monitoring
pub fun position_all_pending_disputes(p: &SufferStakePosition): u64 {
    let pre = vector::length(&p.pending_dispute_ids_pre_unstake);
    let post = vector::length(&p.pending_dispute_ids_post_unstake);
    pre + post
}

// ═══════════════════════════════════════════════════════════════
// Internal Utilities
// ═══════════════════════════════════════════════════════════════

/// Withdraw pending slash balance to an address (for treasury integration).
/// Called by pm_sdvm after tally to move slash to appropriate destinations.
public(package) fun withdraw_pending_slash(
    pool: &mut SufferStakePool,
    amount: u64,
    ctx: &mut TxContext,
): Coin<SUFFER> {
    coin::take(&mut pool.pending_slash, amount, ctx)
}

/// Withdraw pending rewards balance to an address.
public(package) fun withdraw_pending_rewards(
    pool: &mut SufferStakePool,
    amount: u64,
    ctx: &mut TxContext,
): Coin<SUFFER> {
    coin::take(&mut pool.pending_rewards, amount, ctx)
}
