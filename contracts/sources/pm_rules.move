/// Constants, enums, and validation helpers for the prediction market system.
#[allow(unused_const)]
module prediction_market::pm_rules;

// ── Market types ──
const MARKET_TYPE_BINARY: u8 = 0;
const MARKET_TYPE_CATEGORICAL: u8 = 1;
const MARKET_TYPE_BUCKETED_SCALAR: u8 = 2;

// ── Trust tiers ──
const TRUST_TIER_CANONICAL: u8 = 0;
const TRUST_TIER_SOURCE_BOUND: u8 = 1;
const TRUST_TIER_CREATOR_RESOLVED: u8 = 2;
const TRUST_TIER_EXPERIMENTAL: u8 = 3;

// ── Resolution classes ──
const RESOLUTION_CLASS_DETERMINISTIC: u8 = 0;
const RESOLUTION_CLASS_DECLARED_SOURCE: u8 = 1;
const RESOLUTION_CLASS_CREATOR_PROPOSED: u8 = 2;
const RESOLUTION_CLASS_GAME_EVENT: u8 = 3;

// ── Market lifecycle states ──
const STATE_OPEN: u8 = 0;
const STATE_CLOSED: u8 = 1;
const STATE_RESOLUTION_PENDING: u8 = 2;
const STATE_DISPUTED: u8 = 3;
const STATE_RESOLVED: u8 = 4;
const STATE_INVALID: u8 = 5;

// ── Trade directions ──
const DIRECTION_BUY: u8 = 0;
const DIRECTION_SELL: u8 = 1;

// ── Creator influence levels ──
const CREATOR_INFLUENCE_NONE: u8 = 0;
const CREATOR_INFLUENCE_INDIRECT: u8 = 1;
const CREATOR_INFLUENCE_DIRECT: u8 = 2;

// ── Source classes ──
const SOURCE_CLASS_OFFICIAL_WEBSITE: u8 = 0;
const SOURCE_CLASS_OFFICIAL_API: u8 = 1;
const SOURCE_CLASS_OFFICIAL_DISCORD: u8 = 2;
const SOURCE_CLASS_PUBLIC_ACCOUNT: u8 = 3;
const SOURCE_CLASS_PUBLIC_DOCUMENT_URL: u8 = 4;
const SOURCE_CLASS_ONCHAIN_STATE: u8 = 5;
const SOURCE_CLASS_VERIFIER_OUTPUT: u8 = 6;
const SOURCE_CLASS_WORLD_API: u8 = 7;

// ── Evidence formats ──
const EVIDENCE_FORMAT_SCREENSHOT_HASH: u8 = 0;
const EVIDENCE_FORMAT_API_RESPONSE_HASH: u8 = 1;
const EVIDENCE_FORMAT_TX_HASH: u8 = 2;
const EVIDENCE_FORMAT_VERIFIER_SNAPSHOT_HASH: u8 = 3;

// ── Source unavailability fallback ──
const FALLBACK_INVALID: u8 = 0;
const FALLBACK_CREATOR_PROPOSES: u8 = 1;

// ── Fee types (for events) ──
const FEE_TYPE_TRADING: u8 = 0;
const FEE_TYPE_SETTLEMENT: u8 = 1;
const FEE_TYPE_BOND_FORFEITURE: u8 = 2;

// ── Dispute states ──
const DISPUTE_STATE_OPEN: u8 = 0;
const DISPUTE_STATE_UPHELD: u8 = 1;
const DISPUTE_STATE_REJECTED: u8 = 2;
const DISPUTE_STATE_TIMEOUT_INVALID: u8 = 3;

// ── Invalidation reasons ──
const INVALID_REASON_ADMIN_PRE_TRADE: u8 = 0;
const INVALID_REASON_DEADLINE_EXPIRED: u8 = 1;
const INVALID_REASON_DISPUTE_VERDICT: u8 = 2;
const INVALID_REASON_SOURCE_UNAVAILABLE: u8 = 3;
const INVALID_REASON_EMERGENCY: u8 = 4;
const INVALID_REASON_DISPUTE_TIMEOUT: u8 = 5;
const INVALID_REASON_DRAW: u8 = 6;

// ── Limits ──
const MAX_OUTCOMES_CATEGORICAL: u16 = 16;
const MAX_OUTCOMES_SCALAR_BUCKETS: u16 = 32;
const MAX_TITLE_LENGTH: u64 = 120;
const MAX_DESCRIPTION_LENGTH: u64 = 2000;

// ── Community Resolution ──
const CREATOR_PRIORITY_WINDOW_MS: u64 = 24 * 60 * 60 * 1000; // 24 hours

// ── SDVM Vote Phases (D5) ──
const VOTE_PHASE_COMMIT: u8 = 0;
const VOTE_PHASE_REVEAL: u8 = 1;
const VOTE_PHASE_TALLY: u8 = 2;
const VOTE_PHASE_SETTLED: u8 = 3;

// ── SDVM Vote Outcomes ──
const SDVM_OUTCOME_ABSTAIN: u16 = 0xFFFF; // 65535: special abstain outcome

// ═══════════════════════════════════════════════════════════════
// Accessors (public, so other modules can reference constants)
// ═══════════════════════════════════════════════════════════════

// Market types
public fun market_type_binary(): u8 { MARKET_TYPE_BINARY }
public fun market_type_categorical(): u8 { MARKET_TYPE_CATEGORICAL }
public fun market_type_bucketed_scalar(): u8 { MARKET_TYPE_BUCKETED_SCALAR }

// Trust tiers
public fun trust_tier_canonical(): u8 { TRUST_TIER_CANONICAL }
public fun trust_tier_source_bound(): u8 { TRUST_TIER_SOURCE_BOUND }
public fun trust_tier_creator_resolved(): u8 { TRUST_TIER_CREATOR_RESOLVED }
public fun trust_tier_experimental(): u8 { TRUST_TIER_EXPERIMENTAL }

// Resolution classes
public fun resolution_class_deterministic(): u8 { RESOLUTION_CLASS_DETERMINISTIC }
public fun resolution_class_declared_source(): u8 { RESOLUTION_CLASS_DECLARED_SOURCE }
public fun resolution_class_creator_proposed(): u8 { RESOLUTION_CLASS_CREATOR_PROPOSED }
public fun resolution_class_game_event(): u8 { RESOLUTION_CLASS_GAME_EVENT }

// Lifecycle states
public fun state_open(): u8 { STATE_OPEN }
public fun state_closed(): u8 { STATE_CLOSED }
public fun state_resolution_pending(): u8 { STATE_RESOLUTION_PENDING }
public fun state_disputed(): u8 { STATE_DISPUTED }
public fun state_resolved(): u8 { STATE_RESOLVED }
public fun state_invalid(): u8 { STATE_INVALID }

// Trade directions
public fun direction_buy(): u8 { DIRECTION_BUY }
public fun direction_sell(): u8 { DIRECTION_SELL }

// Creator influence
public fun creator_influence_none(): u8 { CREATOR_INFLUENCE_NONE }
public fun creator_influence_indirect(): u8 { CREATOR_INFLUENCE_INDIRECT }
public fun creator_influence_direct(): u8 { CREATOR_INFLUENCE_DIRECT }

// Source classes
public fun source_class_onchain_state(): u8 { SOURCE_CLASS_ONCHAIN_STATE }
public fun source_class_verifier_output(): u8 { SOURCE_CLASS_VERIFIER_OUTPUT }
public fun source_class_world_api(): u8 { SOURCE_CLASS_WORLD_API }

// Evidence formats
public fun evidence_format_verifier_snapshot_hash(): u8 { EVIDENCE_FORMAT_VERIFIER_SNAPSHOT_HASH }
public fun evidence_format_tx_hash(): u8 { EVIDENCE_FORMAT_TX_HASH }

// Fallbacks
public fun fallback_invalid(): u8 { FALLBACK_INVALID }
public fun fallback_creator_proposes(): u8 { FALLBACK_CREATOR_PROPOSES }

// Fee types
public fun fee_type_trading(): u8 { FEE_TYPE_TRADING }
public fun fee_type_settlement(): u8 { FEE_TYPE_SETTLEMENT }
public fun fee_type_bond_forfeiture(): u8 { FEE_TYPE_BOND_FORFEITURE }

// Dispute states
public fun dispute_state_open(): u8 { DISPUTE_STATE_OPEN }
public fun dispute_state_upheld(): u8 { DISPUTE_STATE_UPHELD }
public fun dispute_state_rejected(): u8 { DISPUTE_STATE_REJECTED }
public fun dispute_state_timeout_invalid(): u8 { DISPUTE_STATE_TIMEOUT_INVALID }

// Invalidation reasons
public fun invalid_reason_admin_pre_trade(): u8 { INVALID_REASON_ADMIN_PRE_TRADE }
public fun invalid_reason_deadline_expired(): u8 { INVALID_REASON_DEADLINE_EXPIRED }
public fun invalid_reason_dispute_verdict(): u8 { INVALID_REASON_DISPUTE_VERDICT }
public fun invalid_reason_source_unavailable(): u8 { INVALID_REASON_SOURCE_UNAVAILABLE }
public fun invalid_reason_emergency(): u8 { INVALID_REASON_EMERGENCY }
public fun invalid_reason_dispute_timeout(): u8 { INVALID_REASON_DISPUTE_TIMEOUT }
public fun invalid_reason_draw(): u8 { INVALID_REASON_DRAW }

// Limits
public fun max_outcomes_categorical(): u16 { MAX_OUTCOMES_CATEGORICAL }
public fun max_outcomes_scalar_buckets(): u16 { MAX_OUTCOMES_SCALAR_BUCKETS }
public fun max_title_length(): u64 { MAX_TITLE_LENGTH }
public fun max_description_length(): u64 { MAX_DESCRIPTION_LENGTH }

// Community resolution
public fun creator_priority_window_ms(): u64 { CREATOR_PRIORITY_WINDOW_MS }

// SDVM Vote Phases
public fun vote_phase_commit(): u8 { VOTE_PHASE_COMMIT }
public fun vote_phase_reveal(): u8 { VOTE_PHASE_REVEAL }
public fun vote_phase_tally(): u8 { VOTE_PHASE_TALLY }
public fun vote_phase_settled(): u8 { VOTE_PHASE_SETTLED }

// SDVM Vote Outcomes
public fun sdvm_outcome_abstain(): u16 { SDVM_OUTCOME_ABSTAIN }

// ═══════════════════════════════════════════════════════════════
// Validators
// ═══════════════════════════════════════════════════════════════

public fun is_valid_market_type(t: u8): bool {
    t <= MARKET_TYPE_BUCKETED_SCALAR
}

public fun is_valid_trust_tier(t: u8): bool {
    t <= TRUST_TIER_EXPERIMENTAL
}

public fun is_valid_resolution_class(c: u8): bool {
    c <= RESOLUTION_CLASS_GAME_EVENT
}

public fun is_valid_state(s: u8): bool {
    s <= STATE_INVALID
}

public fun is_valid_creator_influence(i: u8): bool {
    i <= CREATOR_INFLUENCE_DIRECT
}

public fun is_valid_source_class(c: u8): bool {
    c <= SOURCE_CLASS_WORLD_API
}

public fun is_valid_evidence_format(f: u8): bool {
    f <= EVIDENCE_FORMAT_VERIFIER_SNAPSHOT_HASH
}

public fun is_valid_fallback(f: u8): bool {
    f <= FALLBACK_CREATOR_PROPOSES
}

public fun is_valid_invalidation_reason(r: u8): bool {
    r <= INVALID_REASON_DRAW
}

public fun is_valid_vote_phase(p: u8): bool {
    p <= VOTE_PHASE_SETTLED
}

/// Returns the maximum number of outcomes for a given market type.
public fun max_outcomes_for_type(market_type: u8): u16 {
    if (market_type == MARKET_TYPE_BINARY) { 2 }
    else if (market_type == MARKET_TYPE_CATEGORICAL) { MAX_OUTCOMES_CATEGORICAL }
    else if (market_type == MARKET_TYPE_BUCKETED_SCALAR) { MAX_OUTCOMES_SCALAR_BUCKETS }
    else { 0 }
}

/// Returns true if the given state is a terminal state (no further transitions).
public fun is_terminal_state(s: u8): bool {
    s == STATE_RESOLVED || s == STATE_INVALID
}
