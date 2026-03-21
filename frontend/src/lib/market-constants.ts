/**
 * Prediction market package IDs, object IDs, and type strings.
 * All values are sourced from environment variables with "0x0" defaults
 * for development before contracts are deployed.
 */

export const PM_PACKAGE_ID = import.meta.env.VITE_PM_PACKAGE_ID ?? "0x0";
export const PM_REGISTRY_ID = import.meta.env.VITE_PM_REGISTRY_ID ?? "0x0";
export const PM_CONFIG_ID = import.meta.env.VITE_PM_CONFIG_ID ?? "0x0";

// ── Policy object IDs ────────────────────────────────────────────────────

export const PM_MARKET_TYPE_POLICY_ID = import.meta.env.VITE_PM_MARKET_TYPE_POLICY_ID ?? "0x0";
export const PM_RESOLVER_POLICY_ID = import.meta.env.VITE_PM_RESOLVER_POLICY_ID ?? "0x0";

// ── Authority object IDs (Gate 2 / Gate 5) ──────────────────────────────

export const PM_TREASURY_ID = import.meta.env.VITE_PM_TREASURY_ID ?? "0x0";
export const PM_EMERGENCY_MULTISIG_ID = import.meta.env.VITE_PM_EMERGENCY_MULTISIG_ID ?? "0x0";
export const PM_RESOLVER_SET_ID = import.meta.env.VITE_PM_RESOLVER_SET_ID ?? "0x0";

// ── Manifest / version (Gate 5) ─────────────────────────────────────────

export const PM_MANIFEST_VERSION = "v3";
export const PM_MANIFEST_HASH = import.meta.env.VITE_PM_MANIFEST_HASH ?? "0x0000…0000";
export const PM_BENCHMARK_URL = import.meta.env.VITE_PM_BENCHMARK_URL ?? "";

// ── Struct type strings (for getOwnedObjects / queryEvents filters) ─────

export const SUFFER_COIN_TYPE = `${PM_PACKAGE_ID}::suffer::SUFFER`;
export const PMKT_COIN_TYPE = `${PM_PACKAGE_ID}::pm_token::PMKT`;
export const PM_MARKET_TYPE = `${PM_PACKAGE_ID}::pm_market::PMMarket`;
export const PM_POSITION_TYPE = `${PM_PACKAGE_ID}::pm_position::PMPosition`;

// ── Event type strings (for queryEvents) ────────────────────────────────

export const EVENT_MARKET_CREATED = `${PM_PACKAGE_ID}::pm_events::MarketCreatedEvent`;
export const EVENT_MARKET_FROZEN = `${PM_PACKAGE_ID}::pm_events::MarketFrozenEvent`;
export const EVENT_TRADE_EXECUTED = `${PM_PACKAGE_ID}::pm_events::TradeExecutedEvent`;
export const EVENT_MARKET_CLOSED = `${PM_PACKAGE_ID}::pm_events::MarketClosedEvent`;
export const EVENT_RESOLUTION_PROPOSED = `${PM_PACKAGE_ID}::pm_events::ResolutionProposedEvent`;
export const EVENT_DISPUTE_FILED = `${PM_PACKAGE_ID}::pm_events::DisputeFiledEvent`;
export const EVENT_DISPUTE_RESOLVED = `${PM_PACKAGE_ID}::pm_events::DisputeResolvedEvent`;
export const EVENT_MARKET_RESOLVED = `${PM_PACKAGE_ID}::pm_events::MarketResolvedEvent`;
export const EVENT_MARKET_INVALIDATED = `${PM_PACKAGE_ID}::pm_events::MarketInvalidatedEvent`;
export const EVENT_CLAIM_EXECUTED = `${PM_PACKAGE_ID}::pm_events::ClaimExecutedEvent`;
export const EVENT_INVALID_REFUND = `${PM_PACKAGE_ID}::pm_events::InvalidRefundExecutedEvent`;
export const EVENT_EMERGENCY_PAUSE = `${PM_PACKAGE_ID}::pm_events::EmergencyPauseEvent`;
export const EVENT_EMERGENCY_INVALIDATION = `${PM_PACKAGE_ID}::pm_events::EmergencyInvalidationEvent`;
export const EVENT_FEES_SWEPT = `${PM_PACKAGE_ID}::pm_events::FeesSweptEvent`;
