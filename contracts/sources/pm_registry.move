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
#[error(code = 3)]
const EInvalidCreatorPriorityWindow: vector<u8> = b"Creator priority window must be greater than zero";
#[error(code = 4)]
const EInvalidLiquidityParam: vector<u8> = b"Liquidity param must be between 1 and 10000";

// ── Events (must be defined in emitting module per Sui Move rules) ──

public struct RegistryCreatedEvent<phantom Collateral> has copy, drop {
    registry_id: ID,
}

public struct RegistryPausedEvent<phantom Collateral> has copy, drop {
    registry_id: ID,
}

public struct RegistryResumedEvent<phantom Collateral> has copy, drop {
    registry_id: ID,
}

public struct ConfigUpdatedEvent<phantom Collateral> has copy, drop {
    config_id: ID,
    version: u64,
}

/// Global singleton: tracks total markets created, pause state, config/treasury references.
public struct PMRegistry<phantom Collateral> has key {
    id: UID,
    total_markets_created: u64,
    paused: bool,
    config_id: ID,
}

/// Versioned protocol configuration. Shared object referenced by registry.
public struct PMConfig<phantom Collateral> has key {
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
    creator_priority_window_ms: u64,
    liquidity_param: u64,
}

/// Admin capability — owned by deployer.
/// Cannot invoke emergency actions (those require PMEmergencyCap).
public struct PMAdminCap<phantom Collateral> has key, store {
    id: UID,
}

// ── Creation ──

public fun create_registry<Collateral>(
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
    ctx: &mut TxContext,
): (PMRegistry<Collateral>, PMConfig<Collateral>, PMAdminCap<Collateral>) {
    assert!(trading_fee_bps < 10000, EFeeBpsTooHigh);
    assert!(settlement_fee_bps < 10000, EFeeBpsTooHigh);
    assert!(dispute_bond_amount > 0, EDisputeBondTooLow);
    assert!(creator_priority_window_ms > 0, EInvalidCreatorPriorityWindow);
    assert!(liquidity_param > 0 && liquidity_param <= 10_000, EInvalidLiquidityParam);

    let config = PMConfig<Collateral> {
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
        creator_priority_window_ms,
        liquidity_param,
    };

    let config_id = object::id(&config);

    let registry = PMRegistry<Collateral> {
        id: object::new(ctx),
        total_markets_created: 0,
        paused: false,
        config_id,
    };

    let admin_cap = PMAdminCap<Collateral> {
        id: object::new(ctx),
    };

    event::emit(RegistryCreatedEvent<Collateral> { registry_id: object::id(&registry) });
    event::emit(ConfigUpdatedEvent<Collateral> { config_id, version: 1 });

    (registry, config, admin_cap)
}

/// Convenience: create registry + config + admin cap, share the first two,
/// transfer admin cap to sender. Callable from a PTB.
/// Testnet bootstrap intentionally shares registry state and hands the admin cap to the deployer.
#[allow(lint(self_transfer))]
public fun create_and_share_registry<Collateral>(
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
    ctx: &mut TxContext,
) {
    let (registry, config, admin_cap) = create_registry<Collateral>(
        trading_fee_bps, settlement_fee_bps,
        creation_bond_canonical, creation_bond_source_bound,
        creation_bond_creator_resolved, creation_bond_experimental,
        dispute_bond_amount,
        dispute_window_deterministic_ms, dispute_window_declared_ms,
        dispute_window_creator_ms,
        min_market_duration_ms, max_market_duration_ms,
        max_outcomes, creator_priority_window_ms, liquidity_param, ctx,
    );
    transfer::share_object(registry);
    transfer::share_object(config);
    transfer::transfer(admin_cap, tx_context::sender(ctx));
}

/// Deploy-time convenience wrapper.
/// Creates the registry/config pair, shares them, and returns the admin cap
/// to the caller so additional bootstrap actions can happen in the same PTB.
public fun bootstrap_registry<Collateral>(
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
    ctx: &mut TxContext,
): PMAdminCap<Collateral> {
    let (registry, config, admin_cap) = create_registry<Collateral>(
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

    transfer::share_object(registry);
    transfer::share_object(config);
    admin_cap
}

// ── Admin operations ──

public fun pause_registry<Collateral>(registry: &mut PMRegistry<Collateral>, _admin: &PMAdminCap<Collateral>) {
    registry.paused = true;
    event::emit(RegistryPausedEvent<Collateral> { registry_id: object::id(registry) });
}

public fun resume_registry<Collateral>(registry: &mut PMRegistry<Collateral>, _admin: &PMAdminCap<Collateral>) {
    registry.paused = false;
    event::emit(RegistryResumedEvent<Collateral> { registry_id: object::id(registry) });
}

public fun update_config<Collateral>(
    config: &mut PMConfig<Collateral>,
    _admin: &PMAdminCap<Collateral>,
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
) {
    assert!(trading_fee_bps < 10000, EFeeBpsTooHigh);
    assert!(settlement_fee_bps < 10000, EFeeBpsTooHigh);
    assert!(dispute_bond_amount > 0, EDisputeBondTooLow);
    assert!(creator_priority_window_ms > 0, EInvalidCreatorPriorityWindow);
    assert!(liquidity_param > 0 && liquidity_param <= 10_000, EInvalidLiquidityParam);

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
    config.creator_priority_window_ms = creator_priority_window_ms;
    config.liquidity_param = liquidity_param;

    event::emit(ConfigUpdatedEvent<Collateral> { config_id: object::id(config), version: config.version });
}

public(package) fun increment_market_count<Collateral>(registry: &mut PMRegistry<Collateral>): u64 {
    registry.total_markets_created = registry.total_markets_created + 1;
    registry.total_markets_created
}

// ── Read accessors ──

public fun is_paused<Collateral>(registry: &PMRegistry<Collateral>): bool { registry.paused }
public fun total_markets<Collateral>(registry: &PMRegistry<Collateral>): u64 { registry.total_markets_created }
public fun config_id<Collateral>(registry: &PMRegistry<Collateral>): ID { registry.config_id }

public fun config_version<Collateral>(config: &PMConfig<Collateral>): u64 { config.version }
public fun trading_fee_bps<Collateral>(config: &PMConfig<Collateral>): u64 { config.trading_fee_bps }
public fun settlement_fee_bps<Collateral>(config: &PMConfig<Collateral>): u64 { config.settlement_fee_bps }
public fun dispute_bond_amount<Collateral>(config: &PMConfig<Collateral>): u64 { config.dispute_bond_amount }
public fun max_outcomes<Collateral>(config: &PMConfig<Collateral>): u16 { config.max_outcomes }
public fun liquidity_param<Collateral>(config: &PMConfig<Collateral>): u64 { config.liquidity_param }

public fun creation_bond_for_tier<Collateral>(config: &PMConfig<Collateral>, trust_tier: u8): u64 {
    if (trust_tier == 0) { config.creation_bond_canonical }
    else if (trust_tier == 1) { config.creation_bond_source_bound }
    else if (trust_tier == 2) { config.creation_bond_creator_resolved }
    else { config.creation_bond_experimental }
}

public fun dispute_window_for_class<Collateral>(config: &PMConfig<Collateral>, resolution_class: u8): u64 {
    if (resolution_class == 0) { config.dispute_window_deterministic_ms }
    else if (resolution_class == 1) { config.dispute_window_declared_ms }
    else { config.dispute_window_creator_ms }
}

public fun min_market_duration_ms<Collateral>(config: &PMConfig<Collateral>): u64 { config.min_market_duration_ms }
public fun max_market_duration_ms<Collateral>(config: &PMConfig<Collateral>): u64 { config.max_market_duration_ms }
public fun creator_priority_window_ms<Collateral>(config: &PMConfig<Collateral>): u64 { config.creator_priority_window_ms }

// ── Assertions ──

public fun assert_not_paused<Collateral>(registry: &PMRegistry<Collateral>) {
    assert!(!registry.paused, ERegistryPaused);
}
