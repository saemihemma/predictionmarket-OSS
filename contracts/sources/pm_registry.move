/// PMRegistry — global prediction market registry, config, and admin capability.
module prediction_market::pm_registry;

use sui::event;

// ── Errors ──
#[error(code = 0)]
const ERegistryPaused: vector<u8> = b"Registry is paused";
#[error(code = 1)]
const EFeeBpsTooHigh: vector<u8> = b"Fee BPS must be less than 10000 (100%)";
#[error(code = 2)]
const EDisputeBondTooLow: vector<u8> = b"Dispute bond amount must be greater than zero";

// ── Events (must be defined in emitting module per Sui Move rules) ──

public struct RegistryCreatedEvent has copy, drop {
    registry_id: ID,
}

public struct RegistryPausedEvent has copy, drop {
    registry_id: ID,
}

public struct RegistryResumedEvent has copy, drop {
    registry_id: ID,
}

public struct ConfigUpdatedEvent has copy, drop {
    config_id: ID,
    version: u64,
}

/// Global singleton: tracks total markets created, pause state, config/treasury references.
public struct PMRegistry has key {
    id: UID,
    total_markets_created: u64,
    paused: bool,
    config_id: ID,
}

/// Versioned protocol configuration. Shared object referenced by registry.
public struct PMConfig has key {
    id: UID,
    version: u64,
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
    liquidity_param: u64,
}

/// Admin capability — owned by deployer.
/// Cannot invoke emergency actions (those require PMEmergencyCap).
public struct PMAdminCap has key, store {
    id: UID,
}

// ── Creation ──

public fun create_registry(
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
    liquidity_param: u64,
    ctx: &mut TxContext,
): (PMRegistry, PMConfig, PMAdminCap) {
    assert!(trading_fee_bps < 10000, EFeeBpsTooHigh);
    assert!(settlement_fee_bps < 10000, EFeeBpsTooHigh);
    assert!(dispute_bond_amount > 0, EDisputeBondTooLow);

    let config = PMConfig {
        id: object::new(ctx),
        version: 1,
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
        liquidity_param,
    };

    let config_id = object::id(&config);

    let registry = PMRegistry {
        id: object::new(ctx),
        total_markets_created: 0,
        paused: false,
        config_id,
    };

    let admin_cap = PMAdminCap {
        id: object::new(ctx),
    };

    event::emit(RegistryCreatedEvent { registry_id: object::id(&registry) });
    event::emit(ConfigUpdatedEvent { config_id, version: 1 });

    (registry, config, admin_cap)
}

/// Convenience: create registry + config + admin cap, share the first two,
/// transfer admin cap to sender. Callable from a PTB.
#[allow(lint(self_transfer))]
public fun create_and_share_registry(
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
    liquidity_param: u64,
    ctx: &mut TxContext,
) {
    let (registry, config, admin_cap) = create_registry(
        trading_fee_bps, settlement_fee_bps,
        creation_bond_canonical, creation_bond_source_bound,
        creation_bond_creator_resolved, creation_bond_experimental,
        dispute_bond_amount,
        dispute_window_deterministic_ms, dispute_window_declared_ms,
        dispute_window_creator_ms,
        min_market_duration_ms, max_market_duration_ms,
        max_outcomes, liquidity_param, ctx,
    );
    transfer::share_object(registry);
    transfer::share_object(config);
    transfer::transfer(admin_cap, tx_context::sender(ctx));
}

// ── Admin operations ──

public fun pause_registry(registry: &mut PMRegistry, _admin: &PMAdminCap) {
    registry.paused = true;
    event::emit(RegistryPausedEvent { registry_id: object::id(registry) });
}

public fun resume_registry(registry: &mut PMRegistry, _admin: &PMAdminCap) {
    registry.paused = false;
    event::emit(RegistryResumedEvent { registry_id: object::id(registry) });
}

public fun update_config(
    config: &mut PMConfig,
    _admin: &PMAdminCap,
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
    liquidity_param: u64,
) {
    assert!(trading_fee_bps < 10000, EFeeBpsTooHigh);
    assert!(settlement_fee_bps < 10000, EFeeBpsTooHigh);
    assert!(dispute_bond_amount > 0, EDisputeBondTooLow);

    config.version = config.version + 1;
    config.trading_fee_bps = trading_fee_bps;
    config.settlement_fee_bps = settlement_fee_bps;
    config.creation_bond_canonical = creation_bond_canonical;
    config.creation_bond_source_bound = creation_bond_source_bound;
    config.creation_bond_creator_resolved = creation_bond_creator_resolved;
    config.creation_bond_experimental = creation_bond_experimental;
    config.dispute_bond_amount = dispute_bond_amount;
    config.dispute_window_deterministic_ms = dispute_window_deterministic_ms;
    config.dispute_window_declared_ms = dispute_window_declared_ms;
    config.dispute_window_creator_ms = dispute_window_creator_ms;
    config.min_market_duration_ms = min_market_duration_ms;
    config.max_market_duration_ms = max_market_duration_ms;
    config.max_outcomes = max_outcomes;
    config.liquidity_param = liquidity_param;

    event::emit(ConfigUpdatedEvent { config_id: object::id(config), version: config.version });
}

public(package) fun increment_market_count(registry: &mut PMRegistry): u64 {
    registry.total_markets_created = registry.total_markets_created + 1;
    registry.total_markets_created
}

// ── Read accessors ──

public fun is_paused(registry: &PMRegistry): bool { registry.paused }
public fun total_markets(registry: &PMRegistry): u64 { registry.total_markets_created }
public fun config_id(registry: &PMRegistry): ID { registry.config_id }

public fun config_version(config: &PMConfig): u64 { config.version }
public fun trading_fee_bps(config: &PMConfig): u64 { config.trading_fee_bps }
public fun settlement_fee_bps(config: &PMConfig): u64 { config.settlement_fee_bps }
public fun dispute_bond_amount(config: &PMConfig): u64 { config.dispute_bond_amount }
public fun max_outcomes(config: &PMConfig): u16 { config.max_outcomes }
public fun liquidity_param(config: &PMConfig): u64 { config.liquidity_param }

public fun creation_bond_for_tier(config: &PMConfig, trust_tier: u8): u64 {
    if (trust_tier == 0) { config.creation_bond_canonical }
    else if (trust_tier == 1) { config.creation_bond_source_bound }
    else if (trust_tier == 2) { config.creation_bond_creator_resolved }
    else { config.creation_bond_experimental }
}

public fun dispute_window_for_class(config: &PMConfig, resolution_class: u8): u64 {
    if (resolution_class == 0) { config.dispute_window_deterministic_ms }
    else if (resolution_class == 1) { config.dispute_window_declared_ms }
    else { config.dispute_window_creator_ms }
}

public fun min_market_duration_ms(config: &PMConfig): u64 { config.min_market_duration_ms }
public fun max_market_duration_ms(config: &PMConfig): u64 { config.max_market_duration_ms }

// ── Assertions ──

public fun assert_not_paused(registry: &PMRegistry) {
    assert!(!registry.paused, ERegistryPaused);
}
