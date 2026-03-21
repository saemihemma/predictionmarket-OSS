/// Event type definitions for documentation and frontend reference.
/// In Sui Move, events must be emitted from the module where the struct is defined.
/// Therefore, each module (pm_registry, pm_market, pm_treasury, etc.) defines and emits
/// its own event structs. This module is kept as a documentation reference only.
///
/// Canonical event contract:
/// - MarketCreatedEvent (pm_market)
/// - MarketFrozenEvent (pm_market)
/// - MarketClosedEvent (pm_market)
/// - MarketResolvedEvent (pm_market)
/// - MarketInvalidatedEvent (pm_market)
/// - TradeExecutedEvent (pm_trading)
/// - ClaimExecutedEvent (pm_trading)
/// - InvalidRefundExecutedEvent (pm_trading)
/// - ResolutionProposedEvent (pm_resolution)
/// - DisputeFiledEvent (pm_dispute)
/// - DisputeVoteEvent (pm_dispute)
/// - DisputeResolvedEvent (pm_dispute)
/// - FeesSweptEvent (pm_treasury)
/// - TreasuryWithdrawalEvent (pm_treasury)
/// - EmergencyPauseEvent (pm_market)
/// - EmergencyInvalidationEvent (pm_market)
/// - EmergencyAuthorityRotatedEvent (pm_emergency)
/// - RegistryCreatedEvent (pm_registry)
/// - RegistryPausedEvent (pm_registry)
/// - RegistryResumedEvent (pm_registry)
/// - ConfigUpdatedEvent (pm_registry)
/// - MarketTypePolicyCreatedEvent (pm_policy)
/// - ResolverPolicyCreatedEvent (pm_policy)
module prediction_market::pm_events;

// This module intentionally has no code.
// Events are defined in their respective modules per Sui Move requirements.
