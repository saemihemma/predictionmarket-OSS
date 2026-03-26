/// PMDeploy - one-shot bootstrap helpers for a collateral family.
/// This keeps future collateral swaps operational: publish (if needed), bootstrap, regenerate manifest.
module prediction_market::pm_deploy;

use std::string;
use sui::{clock::Clock, event};
use prediction_market::{
    pm_admin,
    pm_dispute,
    pm_faucet,
    pm_policy,
    pm_registry,
    pm_resolution,
    pm_rules,
    pm_sdvm,
    pm_staking,
    pm_treasury,
};

public struct ProtocolFamilyBootstrappedEvent<phantom Collateral> has copy, drop {
    admin: address,
}

fun share_default_policies<Collateral>(
    admin: &pm_registry::PMAdminCap<Collateral>,
    max_outcomes: u16,
    dispute_window_deterministic_ms: u64,
    dispute_window_declared_ms: u64,
    dispute_window_creator_ms: u64,
    escalation_timeout_ms: u64,
    ctx: &mut TxContext,
) {
    pm_policy::create_and_share_resolver_policy(
        admin,
        dispute_window_deterministic_ms,
        dispute_window_declared_ms,
        dispute_window_creator_ms,
        escalation_timeout_ms,
        ctx,
    );

    pm_policy::create_and_share_market_type_policy(
        admin,
        string::utf8(b"Canonical Binary"),
        pm_rules::trust_tier_canonical(),
        pm_rules::market_type_binary(),
        pm_rules::resolution_class_deterministic(),
        2,
        2,
        pm_rules::source_class_onchain_state(),
        pm_rules::evidence_format_tx_hash(),
        ctx,
    );
    pm_policy::create_and_share_market_type_policy(
        admin,
        string::utf8(b"Canonical Categorical"),
        pm_rules::trust_tier_canonical(),
        pm_rules::market_type_categorical(),
        pm_rules::resolution_class_deterministic(),
        0,
        max_outcomes,
        pm_rules::source_class_onchain_state(),
        pm_rules::evidence_format_tx_hash(),
        ctx,
    );

    pm_policy::create_and_share_market_type_policy(
        admin,
        string::utf8(b"Sourced Binary"),
        pm_rules::trust_tier_source_bound(),
        pm_rules::market_type_binary(),
        pm_rules::resolution_class_declared_source(),
        2,
        2,
        pm_rules::source_class_official_api(),
        pm_rules::evidence_format_api_hash(),
        ctx,
    );
    pm_policy::create_and_share_market_type_policy(
        admin,
        string::utf8(b"Sourced Categorical"),
        pm_rules::trust_tier_source_bound(),
        pm_rules::market_type_categorical(),
        pm_rules::resolution_class_declared_source(),
        0,
        max_outcomes,
        pm_rules::source_class_official_api(),
        pm_rules::evidence_format_api_hash(),
        ctx,
    );

    pm_policy::create_and_share_market_type_policy(
        admin,
        string::utf8(b"Community Binary"),
        pm_rules::trust_tier_creator_resolved(),
        pm_rules::market_type_binary(),
        pm_rules::resolution_class_creator_proposed(),
        2,
        2,
        pm_rules::source_class_public_doc(),
        pm_rules::evidence_format_screenshot_hash(),
        ctx,
    );
    pm_policy::create_and_share_market_type_policy(
        admin,
        string::utf8(b"Community Categorical"),
        pm_rules::trust_tier_creator_resolved(),
        pm_rules::market_type_categorical(),
        pm_rules::resolution_class_creator_proposed(),
        0,
        max_outcomes,
        pm_rules::source_class_public_doc(),
        pm_rules::evidence_format_screenshot_hash(),
        ctx,
    );

    pm_policy::create_and_share_market_type_policy(
        admin,
        string::utf8(b"Experimental Binary"),
        pm_rules::trust_tier_experimental(),
        pm_rules::market_type_binary(),
        pm_rules::resolution_class_creator_proposed(),
        2,
        2,
        pm_rules::source_class_public_doc(),
        pm_rules::evidence_format_screenshot_hash(),
        ctx,
    );
    pm_policy::create_and_share_market_type_policy(
        admin,
        string::utf8(b"Experimental Categorical"),
        pm_rules::trust_tier_experimental(),
        pm_rules::market_type_categorical(),
        pm_rules::resolution_class_creator_proposed(),
        0,
        max_outcomes,
        pm_rules::source_class_public_doc(),
        pm_rules::evidence_format_screenshot_hash(),
        ctx,
    );
}

/// Bootstrap the full shared-object family for a collateral type.
/// Defaults to single-operator testnet governance (sender owns all caps and acts as resolver/emergency member).
/// Testnet bootstrap intentionally returns admin and safety caps to the deployer.
#[allow(lint(self_transfer))]
public fun bootstrap_default_family<Collateral>(
    trading_fee_bps: u64,
    settlement_fee_bps: u64,
    creation_bond_canonical: u64,
    creation_bond_source_bound: u64,
    creation_bond_creator_resolved: u64,
    creation_bond_experimental: u64,
    dispute_bond_amount: u64,
    dispute_window_deterministic_ms: u64,
    dispute_window_declared_ms: u64,
    dispute_window_creator_ms: u64,
    min_market_duration_ms: u64,
    max_market_duration_ms: u64,
    max_outcomes: u16,
    creator_priority_window_ms: u64,
    liquidity_param: u64,
    escalation_timeout_ms: u64,
    emergency_review_window_ms: u64,
    faucet_starter_amount: u64,
    faucet_daily_amount: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let admin = pm_registry::bootstrap_registry<Collateral>(
        trading_fee_bps,
        settlement_fee_bps,
        creation_bond_canonical,
        creation_bond_source_bound,
        creation_bond_creator_resolved,
        creation_bond_experimental,
        dispute_bond_amount,
        dispute_window_deterministic_ms,
        dispute_window_declared_ms,
        dispute_window_creator_ms,
        min_market_duration_ms,
        max_market_duration_ms,
        max_outcomes,
        creator_priority_window_ms,
        liquidity_param,
        ctx,
    );

    pm_treasury::create_and_share_treasury<Collateral>(ctx);
    pm_faucet::create_and_share_faucet<Collateral>(&admin, faucet_starter_amount, faucet_daily_amount, ctx);
    pm_dispute::create_and_share_default_resolver_set<Collateral>(&admin, ctx);
    share_default_policies<Collateral>(
        &admin,
        max_outcomes,
        dispute_window_deterministic_ms,
        dispute_window_declared_ms,
        dispute_window_creator_ms,
        escalation_timeout_ms,
        ctx,
    );

    let emergency_cap = pm_admin::create_and_share_default_emergency_infra<Collateral>(
        &admin,
        emergency_review_window_ms,
        ctx,
    );
    let sdvm_admin_cap = pm_staking::bootstrap_staking<Collateral>(ctx);
    pm_sdvm::create_and_share_governance_tracker<Collateral>(clock, ctx);
    let verifier_cap = pm_resolution::create_verifier_cap<Collateral>(&admin, ctx);

    let sender = tx_context::sender(ctx);
    transfer::public_transfer(admin, sender);
    transfer::public_transfer(emergency_cap, sender);
    transfer::public_transfer(sdvm_admin_cap, sender);
    transfer::public_transfer(verifier_cap, sender);

    event::emit(ProtocolFamilyBootstrappedEvent<Collateral> { admin: sender });
}
