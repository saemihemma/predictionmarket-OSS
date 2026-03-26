#[test_only]
module prediction_market::sdvm_functional_tests;

use std::{bcs, hash, unit_test::destroy};
use sui::{
    clock::{Self as clock},
    test_scenario::{Self as ts},
};
use prediction_market::{
    pm_dispute,
    pm_market,
    pm_resolution,
    pm_rules,
    pm_sdvm,
    pm_staking::{Self, PMStakePool},
    pm_treasury,
    test_support::{Self as support, TEST_COLLATERAL},
};

fun commitment_hash(outcome: u16, salt: vector<u8>): vector<u8> {
    let mut preimage = bcs::to_bytes(&outcome);
    vector::append(&mut preimage, salt);
    hash::sha3_256(preimage)
}

#[test]
fun test_sdvm_round_settles_and_routes_rewards_in_generic_collateral() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    pm_staking::create_and_share_pool<TEST_COLLATERAL>(ctx);

    ts::next_tx(&mut scenario, @0x1);
    let mut stake_pool = ts::take_shared<PMStakePool<TEST_COLLATERAL>>(&scenario);
    let ctx = ts::ctx(&mut scenario);
    let mut test_clock = clock::create_for_testing(ctx);

    let (mut registry, config, admin) = support::create_core_bundle<TEST_COLLATERAL>(ctx);
    let (policy, resolver_policy) = support::create_creator_policy(&admin, ctx);
    let mut treasury = pm_treasury::create_treasury<TEST_COLLATERAL>(ctx);
    let resolver_set = pm_dispute::create_resolver_set(&admin, vector[@0x2], 1, ctx);
    let staking_admin = pm_staking::create_admin_cap<TEST_COLLATERAL>(ctx);
    let mut market = support::create_binary_market(
        &mut registry,
        &config,
        &policy,
        &resolver_policy,
        support::mint_test_balance(support::default_creation_bond(), ctx),
        10_000,
        20_000,
        &test_clock,
        ctx,
    );

    clock::increment_for_testing(&mut test_clock, 11_000);
    pm_resolution::propose_resolution(
        &mut market,
        0,
        b"creator-outcome-zero",
        &test_clock,
        ctx,
    );

    let mut dispute = pm_dispute::file_dispute(
        &mut market,
        &config,
        &resolver_set,
        1,
        b"better-evidence",
        support::mint_test_coin(support::default_dispute_bond(), ctx),
        &test_clock,
        ctx,
    );

    let mut correct_position = pm_staking::stake(
        &mut stake_pool,
        support::mint_test_coin(100, ctx),
        &test_clock,
        ctx,
    );
    let mut reserve_position = pm_staking::stake(
        &mut stake_pool,
        support::mint_test_coin(40, ctx),
        &test_clock,
        ctx,
    );

    let mut round = pm_dispute::create_sdvm_vote_round(
        &mut dispute,
        &stake_pool,
        false,
        &test_clock,
        ctx,
    );

    let correct_salt = b"correct";
    let correct_commit = pm_sdvm::commit_vote(
        &mut round,
        &stake_pool,
        &mut correct_position,
        commitment_hash(1, correct_salt),
        &test_clock,
        ctx,
    );

    clock::increment_for_testing(&mut test_clock, 12 * 60 * 60 * 1000 + 1);
    pm_sdvm::advance_to_reveal_phase(&mut round, &test_clock);
    pm_sdvm::reveal_vote(
        &mut round,
        correct_commit,
        &correct_position,
        1,
        correct_salt,
        &test_clock,
        ctx,
    );

    clock::increment_for_testing(&mut test_clock, 12 * 60 * 60 * 1000 + 1);
    pm_sdvm::advance_to_tally_phase(&mut round, &test_clock);
    pm_sdvm::tally_votes(&mut round, &mut stake_pool, &test_clock, ctx);

    let settled_outcome = pm_sdvm::round_admin_resolved_outcome(&round);
    assert!(pm_sdvm::round_is_settled(&round), 0);
    assert!(option::is_some(&settled_outcome), 1);
    assert!(*option::borrow(&settled_outcome) == 1, 2);

    pm_staking::admin_slash_override(
        &staking_admin,
        &mut stake_pool,
        &mut reserve_position,
        4,
        b"seed-reward-pool",
    );
    pm_sdvm::claim_voter_reward(&mut round, &mut correct_position, &mut stake_pool, &test_clock, ctx);

    assert!(pm_staking::position_cumulative_rewards(&correct_position) == 4, 3);
    assert!(pm_staking::position_cumulative_slash(&reserve_position) == 4, 4);

    pm_dispute::resolve_from_sdvm(
        &mut dispute,
        &mut market,
        &mut treasury,
        &round,
        ctx,
    );

    assert!(pm_market::state(&market) == pm_rules::state_invalid(), 5);
    assert!(pm_treasury::balance(&treasury) >= support::default_creation_bond(), 6);

    ts::return_shared(stake_pool);
    destroy(round);
    destroy(reserve_position);
    destroy(correct_position);
    destroy(dispute);
    destroy(staking_admin);
    destroy(resolver_set);
    destroy(market);
    destroy(treasury);
    destroy(policy);
    destroy(resolver_policy);
    destroy(admin);
    destroy(config);
    destroy(registry);
    clock::destroy_for_testing(test_clock);
    ts::end(scenario);
}

#[test]
fun test_sdvm_round_rolls_and_allows_recommit_from_same_position() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    pm_staking::create_and_share_pool<TEST_COLLATERAL>(ctx);

    ts::next_tx(&mut scenario, @0x1);
    let mut stake_pool = ts::take_shared<PMStakePool<TEST_COLLATERAL>>(&scenario);
    let ctx = ts::ctx(&mut scenario);
    let mut test_clock = clock::create_for_testing(ctx);

    let mut position = pm_staking::stake(
        &mut stake_pool,
        support::mint_test_coin(100, ctx),
        &test_clock,
        ctx,
    );

    let mut round = pm_sdvm::create_vote_round<TEST_COLLATERAL>(
        object::id(&position),
        2,
        pm_staking::pool_total_staked(&stake_pool),
        false,
        &test_clock,
        ctx,
    );

    let first_commit = pm_sdvm::commit_vote(
        &mut round,
        &stake_pool,
        &mut position,
        commitment_hash(0, b"round-one"),
        &test_clock,
        ctx,
    );

    clock::increment_for_testing(&mut test_clock, 12 * 60 * 60 * 1000 + 1);
    pm_sdvm::advance_to_reveal_phase(&mut round, &test_clock);
    clock::increment_for_testing(&mut test_clock, 12 * 60 * 60 * 1000 + 1);
    pm_sdvm::advance_to_tally_phase(&mut round, &test_clock);
    pm_sdvm::tally_votes(&mut round, &mut stake_pool, &test_clock, ctx);

    assert!(pm_sdvm::round_phase(&round) == pm_rules::vote_phase_commit(), 0);
    assert!(pm_sdvm::round_number(&round) == 2, 1);

    let second_commit = pm_sdvm::commit_vote(
        &mut round,
        &stake_pool,
        &mut position,
        commitment_hash(1, b"round-two"),
        &test_clock,
        ctx,
    );

    destroy(second_commit);
    destroy(first_commit);
    ts::return_shared(stake_pool);
    destroy(round);
    destroy(position);
    clock::destroy_for_testing(test_clock);
    ts::end(scenario);
}

#[test]
fun test_sdvm_zero_participation_invalidates_market_instead_of_defaulting_to_outcome_zero() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    pm_staking::create_and_share_pool<TEST_COLLATERAL>(ctx);

    ts::next_tx(&mut scenario, @0x1);
    let mut stake_pool = ts::take_shared<PMStakePool<TEST_COLLATERAL>>(&scenario);
    let ctx = ts::ctx(&mut scenario);
    let mut test_clock = clock::create_for_testing(ctx);

    let (mut registry, config, admin) = support::create_core_bundle<TEST_COLLATERAL>(ctx);
    let (policy, resolver_policy) = support::create_creator_policy(&admin, ctx);
    let mut treasury = pm_treasury::create_treasury<TEST_COLLATERAL>(ctx);
    let resolver_set = pm_dispute::create_resolver_set(&admin, vector[@0x2], 1, ctx);
    let mut market = support::create_binary_market(
        &mut registry,
        &config,
        &policy,
        &resolver_policy,
        support::mint_test_balance(support::default_creation_bond(), ctx),
        10_000,
        20_000,
        &test_clock,
        ctx,
    );

    clock::increment_for_testing(&mut test_clock, 11_000);
    pm_resolution::propose_resolution(
        &mut market,
        0,
        b"creator-outcome-zero",
        &test_clock,
        ctx,
    );

    let mut dispute = pm_dispute::file_dispute(
        &mut market,
        &config,
        &resolver_set,
        1,
        b"draw-case",
        support::mint_test_coin(support::default_dispute_bond(), ctx),
        &test_clock,
        ctx,
    );

    let position_a = pm_staking::stake(
        &mut stake_pool,
        support::mint_test_coin(100, ctx),
        &test_clock,
        ctx,
    );
    let staking_admin = pm_staking::create_admin_cap<TEST_COLLATERAL>(ctx);

    let mut round = pm_dispute::create_sdvm_vote_round(
        &mut dispute,
        &stake_pool,
        false,
        &test_clock,
        ctx,
    );

    pm_sdvm::admin_quorum_override(&staking_admin, &mut round, 0, ctx);

    clock::increment_for_testing(&mut test_clock, 12 * 60 * 60 * 1000 + 1);
    pm_sdvm::advance_to_reveal_phase(&mut round, &test_clock);

    clock::increment_for_testing(&mut test_clock, 12 * 60 * 60 * 1000 + 1);
    pm_sdvm::advance_to_tally_phase(&mut round, &test_clock);
    pm_sdvm::tally_votes(&mut round, &mut stake_pool, &test_clock, ctx);

    assert!(pm_sdvm::round_is_settled(&round), 2);
    assert!(option::is_none(&pm_sdvm::round_admin_resolved_outcome(&round)), 3);

    pm_dispute::resolve_from_sdvm(
        &mut dispute,
        &mut market,
        &mut treasury,
        &round,
        ctx,
    );

    assert!(pm_market::state(&market) == pm_rules::state_invalid(), 4);
    assert!(pm_dispute::dispute_state(&dispute) == pm_rules::dispute_state_timeout_invalid(), 5);

    ts::return_shared(stake_pool);
    destroy(round);
    destroy(staking_admin);
    destroy(position_a);
    destroy(dispute);
    destroy(resolver_set);
    destroy(market);
    destroy(treasury);
    destroy(policy);
    destroy(resolver_policy);
    destroy(admin);
    destroy(config);
    destroy(registry);
    clock::destroy_for_testing(test_clock);
    ts::end(scenario);
}

#[test, expected_failure(abort_code = pm_staking::EPendingDisputes, location = prediction_market::pm_staking)]
fun test_post_unstake_dispute_blocks_complete_unstake() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    pm_staking::create_and_share_pool<TEST_COLLATERAL>(ctx);

    ts::next_tx(&mut scenario, @0x1);
    let mut stake_pool = ts::take_shared<PMStakePool<TEST_COLLATERAL>>(&scenario);
    let ctx = ts::ctx(&mut scenario);
    let mut test_clock = clock::create_for_testing(ctx);

    let mut position = pm_staking::stake(
        &mut stake_pool,
        support::mint_test_coin(100, ctx),
        &test_clock,
        ctx,
    );

    let position_id = object::id(&position);
    pm_staking::initiate_unstake(&mut position, &test_clock, ctx);
    pm_staking::register_dispute(&mut position, position_id);
    clock::increment_for_testing(&mut test_clock, 48 * 60 * 60 * 1000 + 1);

    destroy(pm_staking::complete_unstake(
        &mut stake_pool,
        position,
        &test_clock,
        ctx,
    ));

    ts::return_shared(stake_pool);
    clock::destroy_for_testing(test_clock);
    ts::end(scenario);
}

#[test, expected_failure(abort_code = pm_staking::EPendingDisputes, location = prediction_market::pm_staking)]
fun test_post_unstake_dispute_blocks_emergency_unstake() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    pm_staking::create_and_share_pool<TEST_COLLATERAL>(ctx);

    ts::next_tx(&mut scenario, @0x1);
    let mut stake_pool = ts::take_shared<PMStakePool<TEST_COLLATERAL>>(&scenario);
    let ctx = ts::ctx(&mut scenario);
    let test_clock = clock::create_for_testing(ctx);

    let mut position = pm_staking::stake(
        &mut stake_pool,
        support::mint_test_coin(100, ctx),
        &test_clock,
        ctx,
    );

    let position_id = object::id(&position);
    pm_staking::initiate_unstake(&mut position, &test_clock, ctx);
    pm_staking::register_dispute(&mut position, position_id);

    destroy(pm_staking::emergency_unstake(
        &mut stake_pool,
        position,
        &test_clock,
        ctx,
    ));

    ts::return_shared(stake_pool);
    clock::destroy_for_testing(test_clock);
    ts::end(scenario);
}
