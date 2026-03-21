/**
 * TypeScript interfaces and enums mirroring the prediction market Move contracts.
 * Sources: pm_rules.move, pm_source.move, pm_market.move, pm_position.move
 */

// ── Enum types (mirroring pm_rules.move constants) ──────────────────────

export const MarketType = {
  BINARY: 0,
  CATEGORICAL: 1,
  BUCKETED_SCALAR: 2,
} as const;
export type MarketType = (typeof MarketType)[keyof typeof MarketType];

export const MARKET_TYPE_LABELS: Record<MarketType, string> = {
  [MarketType.BINARY]: "Yes / No",
  [MarketType.CATEGORICAL]: "Multiple Choice",
  [MarketType.BUCKETED_SCALAR]: "Range Market",
};

export const TrustTier = {
  CANONICAL: 0,
  SOURCE_BOUND: 1,
  CREATOR_RESOLVED: 2,
  EXPERIMENTAL: 3,
} as const;
export type TrustTier = (typeof TrustTier)[keyof typeof TrustTier];

export const TRUST_TIER_LABELS: Record<TrustTier, string> = {
  [TrustTier.CANONICAL]: "VERIFIED",
  [TrustTier.SOURCE_BOUND]: "SOURCED",
  [TrustTier.CREATOR_RESOLVED]: "COMMUNITY",
  [TrustTier.EXPERIMENTAL]: "EXPERIMENTAL",
};

export const MarketState = {
  OPEN: 0,
  CLOSED: 1,
  RESOLUTION_PENDING: 2,
  DISPUTED: 3,
  RESOLVED: 4,
  INVALID: 5,
} as const;
export type MarketState = (typeof MarketState)[keyof typeof MarketState];

export const MARKET_STATE_LABELS: Record<MarketState, string> = {
  [MarketState.OPEN]: "OPEN",
  [MarketState.CLOSED]: "CLOSED",
  [MarketState.RESOLUTION_PENDING]: "RESOLUTION PENDING",
  [MarketState.DISPUTED]: "DISPUTED",
  [MarketState.RESOLVED]: "RESOLVED",
  [MarketState.INVALID]: "INVALID",
};

export const ResolutionClass = {
  DETERMINISTIC: 0,
  DECLARED_SOURCE: 1,
  CREATOR_PROPOSED: 2,
  GAME_EVENT: 3,
} as const;
export type ResolutionClass = (typeof ResolutionClass)[keyof typeof ResolutionClass];

export const RESOLUTION_CLASS_LABELS: Record<ResolutionClass, string> = {
  [ResolutionClass.DETERMINISTIC]: "Deterministic",
  [ResolutionClass.DECLARED_SOURCE]: "Declared Source",
  [ResolutionClass.CREATOR_PROPOSED]: "Creator Proposed",
  [ResolutionClass.GAME_EVENT]: "Game Event",
};

export const CreatorInfluenceLevel = {
  NONE: 0,
  INDIRECT: 1,
  DIRECT: 2,
} as const;
export type CreatorInfluenceLevel = (typeof CreatorInfluenceLevel)[keyof typeof CreatorInfluenceLevel];

export const CREATOR_INFLUENCE_LABELS: Record<CreatorInfluenceLevel, string> = {
  [CreatorInfluenceLevel.NONE]: "None",
  [CreatorInfluenceLevel.INDIRECT]: "Indirect",
  [CreatorInfluenceLevel.DIRECT]: "Direct",
};

export const SourceClass = {
  OFFICIAL_WEBSITE: 0,
  OFFICIAL_API: 1,
  OFFICIAL_DISCORD: 2,
  PUBLIC_ACCOUNT: 3,
  PUBLIC_DOCUMENT_URL: 4,
  ONCHAIN_STATE: 5,
  VERIFIER_OUTPUT: 6,
  WORLD_API: 7,
} as const;
export type SourceClass = (typeof SourceClass)[keyof typeof SourceClass];

export const SOURCE_CLASS_LABELS: Record<SourceClass, string> = {
  [SourceClass.OFFICIAL_WEBSITE]: "Official Website",
  [SourceClass.OFFICIAL_API]: "Official API",
  [SourceClass.OFFICIAL_DISCORD]: "Official Discord",
  [SourceClass.PUBLIC_ACCOUNT]: "Public Account",
  [SourceClass.PUBLIC_DOCUMENT_URL]: "Public Document",
  [SourceClass.ONCHAIN_STATE]: "On-chain State",
  [SourceClass.VERIFIER_OUTPUT]: "Verifier Output",
  [SourceClass.WORLD_API]: "World API",
};

export const EvidenceFormat = {
  SCREENSHOT_HASH: 0,
  API_RESPONSE_HASH: 1,
  TX_HASH: 2,
  VERIFIER_SNAPSHOT_HASH: 3,
} as const;
export type EvidenceFormat = (typeof EvidenceFormat)[keyof typeof EvidenceFormat];

export const EVIDENCE_FORMAT_LABELS: Record<EvidenceFormat, string> = {
  [EvidenceFormat.SCREENSHOT_HASH]: "Screenshot Hash",
  [EvidenceFormat.API_RESPONSE_HASH]: "API Response Hash",
  [EvidenceFormat.TX_HASH]: "Transaction Hash",
  [EvidenceFormat.VERIFIER_SNAPSHOT_HASH]: "Verifier Snapshot Hash",
};

export const SourceFallback = {
  INVALID: 0,
  CREATOR_PROPOSES: 1,
} as const;
export type SourceFallback = (typeof SourceFallback)[keyof typeof SourceFallback];

export const TradeDirection = {
  BUY: 0,
  SELL: 1,
} as const;
export type TradeDirection = (typeof TradeDirection)[keyof typeof TradeDirection];

export const InvalidationReason = {
  ADMIN_PRE_TRADE: 0,
  DEADLINE_EXPIRED: 1,
  DISPUTE_VERDICT: 2,
  SOURCE_UNAVAILABLE: 3,
  EMERGENCY: 4,
  DISPUTE_TIMEOUT: 5,
  DRAW: 6,
} as const;
export type InvalidationReason = (typeof InvalidationReason)[keyof typeof InvalidationReason];

export const INVALIDATION_REASON_LABELS: Record<InvalidationReason, string> = {
  [InvalidationReason.ADMIN_PRE_TRADE]: "Admin invalidated (pre-trade)",
  [InvalidationReason.DEADLINE_EXPIRED]: "Resolution deadline expired",
  [InvalidationReason.DISPUTE_VERDICT]: "Dispute verdict: invalid",
  [InvalidationReason.SOURCE_UNAVAILABLE]: "Source permanently unavailable",
  [InvalidationReason.EMERGENCY]: "Emergency invalidation",
  [InvalidationReason.DISPUTE_TIMEOUT]: "Dispute timeout (no quorum)",
  [InvalidationReason.DRAW]: "Outcome ended in a draw",
};

// ── Struct interfaces ───────────────────────────────────────────────────

/** Mirrors pm_source::SourceDeclaration */
export interface SourceDeclaration {
  sourceClass: SourceClass;
  sourceUri: string;
  sourceDescription: string;
  evidenceFormat: EvidenceFormat;
  sourceArchived: boolean;
  creatorControlsSource: boolean;
  verifierSubmissionRequired: boolean;
  fallbackOnSourceUnavailable: SourceFallback;
}

/** Creator influence disclosure */
export interface CreatorInfluence {
  influenceLevel: CreatorInfluenceLevel;
  isSourceController: boolean;
  disclosureText: string;
}

/** Resolution record (dynamic field on PMMarket) */
export interface ResolutionRecord {
  resolvedOutcome: number;
  resolutionClass: ResolutionClass;
  resolverAddress: string;
  evidenceHash: string;
  resolvedAtMs: number;
  disputeWindowEndMs: number;
  finalized: boolean;
}

/** Proposal submitted to resolve the market */
export interface ProposalData {
  proposedOutcomeId: number;
  proposerAddress: string;
  proposerType: "CREATOR" | "COMMUNITY";
  submittedAtMs: number;
  evidenceUrl: string;
  note?: string;
  disputeWindowEndMs: number;
  creationBondAmount: number;
}

/** Dispute filed against a proposal */
export interface DisputeData {
  disputer: string;
  proposedOutcomeId: number;
  reasonText: string;
  filedAtMs: number;
  bondAmount: number;
}

/** SDVM voting phase data */
export interface SDVMData {
  phase: "COMMIT" | "REVEAL" | "TALLY";
  phaseStartMs: number;
  phaseEndMs: number;
  commitDeadlineMs?: number;
  revealDeadlineMs?: number;
  talliedOutcome?: number;
  participantCount: number;
  totalStakeParticipating: number;
  userVote?: {
    outcome: number;
    isRevealed: boolean;
  };
}

/** Core market object — mirrors PMMarket struct fields */
export interface Market {
  id: string;
  marketNumber: number;
  creator: string;
  title: string;
  description: string;
  resolutionText: string;
  marketType: MarketType;
  resolutionClass: ResolutionClass;
  trustTier: TrustTier;
  outcomeCount: number;
  outcomeLabels: string[];
  sourceDeclaration: SourceDeclaration;
  creatorInfluence: CreatorInfluence;
  closeTimeMs: number;
  resolveDeadlineMs: number;
  disputeWindowMs: number;
  state: MarketState;
  frozen: boolean;
  createdAtMs: number;
  outcomeQuantities: bigint[];
  totalCollateral: bigint;
  accruedFees: bigint;
  marketTypePolicyId: string;
  resolverPolicyId: string;
  configVersion: number;
  resolution: ResolutionRecord | null;
  /** Running sum of all position cost bases — for pro-rata invalidation refunds */
  totalCostBasisSum: bigint;
  /** Collateral snapshot taken at moment of invalidation (null if not invalidated) */
  invalidationSnapshotCollateral: bigint | null;
  /**
   * Emergency pause signal. The exact field name/shape on-chain is TBD —
   * do not hard-code until Move side confirms. This is a frontend-derived
   * overlay, not an onchain lifecycle state.
   */
  emergencyPaused: boolean;

  // ── Resolution Flow Data (populated when state progresses) ──
  proposal?: ProposalData;
  dispute?: DisputeData;
  sdvm?: SDVMData;

  // ── User Position Data (for portfolio) ──
  userPosition?: {
    shares: Record<number, bigint>;
    totalValue: bigint;
    pnl: bigint;
    unrealizedPnL: bigint;
    realizedPnL: bigint;
    hasWon: boolean;
    isClaimed: boolean;
  };

  // ── Creator Priority Window ──
  creatorPriorityWindowMs?: number; // 24h = 86400000ms
}

/** Position object — mirrors PMPosition struct (one per user/market/outcome) */
export interface Position {
  id: string;
  marketId: string;
  owner: string;
  outcomeIndex: number;
  quantity: bigint;
  netCostBasis: bigint;
  createdAtMs: number;
}

// ── Bond tiers (from pm_rules.move) ────────────────────────────────────────

// RT-039: Bond tier constants (matches pm_rules.move trust tiers)
export const BOND_TIERS = {
  CANONICAL: 0,
  SOURCE_BOUND: 1,
  CREATOR_RESOLVED: 2,
  EXPERIMENTAL: 3,
} as const;

// ── Limits (from pm_rules.move) ─────────────────────────────────────────

export const LIMITS = {
  MAX_OUTCOMES_CATEGORICAL: 16,
  MAX_OUTCOMES_SCALAR_BUCKETS: 32,
  MAX_TITLE_LENGTH: 120,
  MAX_DESCRIPTION_LENGTH: 2000,
} as const;

// ── Parser ──────────────────────────────────────────────────────────────

/**
 * Parse a raw Sui object (from getObject with showContent: true) into a Market.
 *
 * NOTE: The field layout here is based on the current pm_market.move struct.
 * If the Move struct changes, this parser must be updated. Do not treat this
 * as frozen until confirmed with Move dev.
 */
export function parseMarketFromSuiObject(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  obj: any,
): Market | null {
  try {
    const fields = obj?.data?.content?.fields;
    if (!fields) return null;

    const sd = fields.source_declaration?.fields ?? {};
    const ci = fields.creator_influence?.fields ?? {};

    return {
      id: obj.data.objectId ?? fields.id?.id ?? "",
      marketNumber: Number(fields.market_number ?? 0),
      creator: String(fields.creator ?? ""),
      title: String(fields.title ?? ""),
      description: String(fields.description ?? ""),
      resolutionText: String(fields.resolution_text ?? ""),
      marketType: Number(fields.market_type ?? 0) as MarketType,
      resolutionClass: Number(fields.resolution_class ?? 0) as ResolutionClass,
      trustTier: Number(fields.trust_tier ?? 0) as TrustTier,
      outcomeCount: Number(fields.outcome_count ?? 2),
      outcomeLabels: Array.isArray(fields.outcome_labels) ? fields.outcome_labels.map(String) : [],
      sourceDeclaration: {
        sourceClass: Number(sd.source_class ?? 0) as SourceClass,
        sourceUri: String(sd.source_uri ?? ""),
        sourceDescription: String(sd.source_description ?? ""),
        evidenceFormat: Number(sd.evidence_format ?? 0) as EvidenceFormat,
        sourceArchived: Boolean(sd.source_archived),
        creatorControlsSource: Boolean(sd.creator_controls_source),
        verifierSubmissionRequired: Boolean(sd.verifier_submission_required),
        fallbackOnSourceUnavailable: Number(sd.fallback_on_source_unavailable ?? 0) as SourceFallback,
      },
      creatorInfluence: {
        influenceLevel: Number(ci.influence_level ?? 0) as CreatorInfluenceLevel,
        isSourceController: Boolean(ci.creator_is_source_controller),
        disclosureText: String(ci.disclosure_text ?? ""),
      },
      closeTimeMs: Number(fields.close_time_ms ?? 0),
      resolveDeadlineMs: Number(fields.resolve_deadline_ms ?? 0),
      disputeWindowMs: Number(fields.dispute_window_ms ?? 0),
      state: Number(fields.state ?? 0) as MarketState,
      frozen: Boolean(fields.frozen),
      createdAtMs: Number(fields.created_at_ms ?? 0),
      outcomeQuantities: Array.isArray(fields.outcome_quantities)
        ? fields.outcome_quantities.map((v: string | number) => BigInt(v))
        : [],
      totalCollateral: BigInt(fields.total_collateral?.fields?.value ?? fields.total_collateral ?? 0),
      accruedFees: BigInt(fields.accrued_fees?.fields?.value ?? fields.accrued_fees ?? 0),
      totalCostBasisSum: BigInt(fields.total_cost_basis_sum ?? 0),
      invalidationSnapshotCollateral: fields.invalidation_snapshot_collateral != null
        ? BigInt(fields.invalidation_snapshot_collateral)
        : null,
      marketTypePolicyId: String(fields.market_type_policy_id ?? ""),
      resolverPolicyId: String(fields.resolver_policy_id ?? ""),
      configVersion: Number(fields.config_version ?? 0),
      resolution: null, // Populated separately via dynamic field fetch
      emergencyPaused: Boolean(fields.emergency_paused),
    };
  } catch {
    return null;
  }
}
