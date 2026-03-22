#[test_only]
module prediction_market::sdvm_test_vectors;

use sui::{clock::{Self as clock}, test_scenario::{Self as ts}};
use prediction_market::{pm_sdvm, test_support::TEST_COLLATERAL};

#[test]
fun test_governance_tracker_counters_are_manifest_friendly() {
    let mut scenario = ts::begin(@0x1);
    let ctx = ts::ctx(&mut scenario);
    let test_clock = clock::create_for_testing(ctx);
    let mut tracker = pm_sdvm::create_governance_tracker<TEST_COLLATERAL>(&test_clock, ctx);

    pm_sdvm::increment_admin_resolve(&mut tracker, &test_clock);
    pm_sdvm::increment_admin_quorum_override(&mut tracker, &test_clock);
    pm_sdvm::increment_admin_phase_advance(&mut tracker, &test_clock);
    pm_sdvm::increment_disputes_resolved(&mut tracker, &test_clock);

    assert!(pm_sdvm::read_admin_resolve_count(&tracker) == 1, 0);
    assert!(pm_sdvm::read_admin_quorum_override_count(&tracker) == 1, 1);
    assert!(pm_sdvm::read_admin_phase_advance_count(&tracker) == 1, 2);
    assert!(pm_sdvm::read_total_disputes_resolved(&tracker) == 1, 3);

    clock::destroy_for_testing(test_clock);
    std::unit_test::destroy(tracker);
    ts::end(scenario);
}
