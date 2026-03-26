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
  [TrustTier.CANONICAL]: "CANONICAL",
  [TrustTier.SOURCE_BOUND]: "SOURCE-BOUND",
  [TrustTier.CREATOR_RESOLVED]: "SOURCE-BACKED COMMUNITY",
  [TrustTier.EXPERIMENTAL]: "OPEN COMMUNITY",
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
  evidenceHash: string;
  note?: string;
  disputeWindowEndMs: number;
  creationBondAmount?: number;
}

/** Dispute filed against a proposal */
export interface DisputeData {
  id: string;
  disputer: string;
  proposedOutcomeId: number;
  reasonHash: string;
  filedAtMs: number;
  bondAmount: number;
  state: number;
  escalationDeadlineMs: number;
  sdvmVoteRoundId?: string | null;
}

/** SDVM voting phase data */
export interface SDVMData {
  roundId: string;
  disputeId: string;
  roundNumber: number;
  phase: "COMMIT" | "REVEAL" | "TALLY" | "SETTLED";
  commitDeadlineMs: number;
  revealDeadlineMs: number;
  hardDeadlineMs: number;
  talliedOutcome?: number | null;
  participantCount: number;
  totalStakeParticipating: number;
  totalStakeSnapshot: number;
  expedited: boolean;
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

    const read = (snake: string, camel?: string) => fields[snake] ?? (camel ? fields[camel] : undefined);
    const asBigIntInput = (value: unknown): string | number | bigint => {
      if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") {
        return value;
      }
      if (value && typeof value === "object" && "value" in (value as Record<string, unknown>)) {
        return asBigIntInput((value as { value?: unknown }).value ?? 0);
      }
      return 0;
    };
    const unwrapOption = (value: unknown) => {
      if (
        value &&
        typeof value === "object" &&
        "vec" in (value as Record<string, unknown>) &&
        Array.isArray((value as { vec?: unknown[] }).vec)
      ) {
        const vec = (value as { vec: unknown[] }).vec;
        return vec.length > 0 ? vec[0] : null;
      }
      return value ?? null;
    };

    const readScalar = (snake: string, camel?: string) => read(snake, camel);
    const sourceDeclaration = read("source_declaration", "sourceDeclaration");
    const creatorInfluence = read("creator_influence", "creatorInfluence");
    const sd = sourceDeclaration?.fields ?? sourceDeclaration ?? {};
    const ci = creatorInfluence?.fields ?? creatorInfluence ?? {};
    const totalCollateral = read("total_collateral", "totalCollateral");
    const accruedFees = read("accrued_fees", "accruedFees");
    const resolution = unwrapOption(read("resolution"));
    const invalidationSnapshotCollateral = unwrapOption(
      read("invalidation_snapshot_collateral", "invalidationSnapshotCollateral"),
    );

    return {
      id: obj.data.objectId ?? fields.id?.id ?? "",
      marketNumber: Number(readScalar("market_number", "marketNumber") ?? 0),
      creator: String(readScalar("creator") ?? ""),
      title: String(readScalar("title") ?? ""),
      description: String(readScalar("description") ?? ""),
      resolutionText: String(readScalar("resolution_text", "resolutionText") ?? ""),
      marketType: Number(readScalar("market_type", "marketType") ?? 0) as MarketType,
      resolutionClass: Number(readScalar("resolution_class", "resolutionClass") ?? 0) as ResolutionClass,
      trustTier: Number(readScalar("trust_tier", "trustTier") ?? 0) as TrustTier,
      outcomeCount: Number(readScalar("outcome_count", "outcomeCount") ?? 2),
      outcomeLabels: Array.isArray(readScalar("outcome_labels", "outcomeLabels"))
        ? (readScalar("outcome_labels", "outcomeLabels") as unknown[]).map(String)
        : [],
      sourceDeclaration: {
        sourceClass: Number(sd.source_class ?? sd.sourceClass ?? 0) as SourceClass,
        sourceUri: String(sd.source_uri ?? sd.sourceUri ?? ""),
        sourceDescription: String(sd.source_description ?? sd.sourceDescription ?? ""),
        evidenceFormat: Number(sd.evidence_format ?? sd.evidenceFormat ?? 0) as EvidenceFormat,
        sourceArchived: Boolean(sd.source_archived ?? sd.sourceArchived),
        creatorControlsSource: Boolean(sd.creator_controls_source ?? sd.creatorControlsSource),
        verifierSubmissionRequired: Boolean(
          sd.verifier_submission_required ?? sd.verifierSubmissionRequired,
        ),
        fallbackOnSourceUnavailable: Number(
          sd.fallback_on_source_unavailable ?? sd.fallbackOnSourceUnavailable ?? 0,
        ) as SourceFallback,
      },
      creatorInfluence: {
        influenceLevel: Number(ci.influence_level ?? ci.influenceLevel ?? 0) as CreatorInfluenceLevel,
        isSourceController: Boolean(ci.creator_is_source_controller ?? ci.creatorIsSourceController),
        disclosureText: String(ci.disclosure_text ?? ci.disclosureText ?? ""),
      },
      closeTimeMs: Number(readScalar("close_time_ms", "closeTimeMs") ?? 0),
      resolveDeadlineMs: Number(readScalar("resolve_deadline_ms", "resolveDeadlineMs") ?? 0),
      disputeWindowMs: Number(readScalar("dispute_window_ms", "disputeWindowMs") ?? 0),
      state: Number(readScalar("state") ?? 0) as MarketState,
      frozen: Boolean(readScalar("frozen")),
      createdAtMs: Number(readScalar("created_at_ms", "createdAtMs") ?? 0),
      outcomeQuantities: Array.isArray(readScalar("outcome_quantities", "outcomeQuantities"))
        ? (readScalar("outcome_quantities", "outcomeQuantities") as Array<string | number>).map((v) =>
            BigInt(v),
          )
        : [],
      totalCollateral: BigInt(asBigIntInput(totalCollateral?.fields?.value ?? totalCollateral ?? 0)),
      accruedFees: BigInt(asBigIntInput(accruedFees?.fields?.value ?? accruedFees ?? 0)),
      totalCostBasisSum: BigInt(readScalar("total_cost_basis_sum", "totalCostBasisSum") ?? 0),
      invalidationSnapshotCollateral: invalidationSnapshotCollateral != null
        ? BigInt(
            asBigIntInput(
              (invalidationSnapshotCollateral as { fields?: { value?: unknown } })?.fields?.value ??
                invalidationSnapshotCollateral,
            ),
          )
        : null,
      marketTypePolicyId: String(readScalar("market_type_policy_id", "marketTypePolicyId") ?? ""),
      resolverPolicyId: String(readScalar("resolver_policy_id", "resolverPolicyId") ?? ""),
      configVersion: Number(readScalar("config_version", "configVersion") ?? 0),
      resolution: resolution
        ? {
            resolvedOutcome: Number(
              (resolution as { fields?: Record<string, unknown> })?.fields?.resolved_outcome ??
                (resolution as Record<string, unknown>).resolved_outcome ??
                0,
            ),
            resolutionClass: Number(
              (resolution as { fields?: Record<string, unknown> })?.fields?.resolution_class ??
                (resolution as Record<string, unknown>).resolution_class ??
                0,
            ) as ResolutionClass,
            resolverAddress: String(
              (resolution as { fields?: Record<string, unknown> })?.fields?.resolver_address ??
                (resolution as Record<string, unknown>).resolver_address ??
                "",
            ),
            evidenceHash: String(
              (resolution as { fields?: Record<string, unknown> })?.fields?.evidence_hash ??
                (resolution as Record<string, unknown>).evidence_hash ??
                "",
            ),
            resolvedAtMs: Number(
              (resolution as { fields?: Record<string, unknown> })?.fields?.resolved_at_ms ??
                (resolution as Record<string, unknown>).resolved_at_ms ??
                0,
            ),
            disputeWindowEndMs: Number(
              (resolution as { fields?: Record<string, unknown> })?.fields?.dispute_window_end_ms ??
                (resolution as Record<string, unknown>).dispute_window_end_ms ??
                0,
            ),
            finalized: Boolean(
              (resolution as { fields?: Record<string, unknown> })?.fields?.finalized ??
                (resolution as Record<string, unknown>).finalized,
            ),
          }
        : null,
      emergencyPaused: Boolean(readScalar("emergency_paused", "emergencyPaused")),
    };
  } catch {
    return null;
  }
}
