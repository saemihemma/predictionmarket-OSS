// Market state types
export type MarketState =
  | "OPEN"
  | "CLOSED"
  | "RESOLUTION_PENDING"
  | "DISPUTED"
  | "SDVM_COMMIT"
  | "SDVM_REVEAL"
  | "SDVM_TALLY"
  | "RESOLVED"
  | "INVALID";

export type MarketType = "CATEGORICAL" | "RANGE";
export type ProposerType = "CREATOR" | "COMMUNITY";
export type SDVMPhase = "COMMIT" | "REVEAL" | "TALLY";

// Outcome type
export interface Outcome {
  id: number;
  label: string;
  shortLabel?: string; // for RANGE markets, e.g., "[0-25)"
}

// Resolution data (proposal submitted)
export interface Resolution {
  proposedOutcomeId: number;
  proposer: string; // address
  proposerType: ProposerType;
  submittedAtMs: number;
  evidenceHash: string;
  note?: string;
  disputeWindowEndMs: number;
  creationBondAmount: number;
}

// Dispute data
export interface Dispute {
  disputer: string; // address
  proposedOutcomeId: number;
  reasonText: string;
  filedAtMs: number;
  bondAmount: number;
}

// SDVM data
export interface SDVMData {
  phase: SDVMPhase;
  phaseStartMs: number;
  phaseEndMs: number;
  commitDeadlineMs: number;
  revealDeadlineMs: number;
  talliedOutcome?: number;
  participantCount: number;
  totalStakeParticipating: number;
  userVote?: {
    outcome: number;
    isRevealed: boolean;
  };
}

// User's position in market
export interface UserPosition {
  shares: Record<number, number>; // outcome_id → share_count
  totalValue: number;
  pnl: number; // signed int
  unrealizedPnL: number;
  realizedPnL: number;
  hasWon: boolean;
  isClaimed: boolean;
}

// Creator stats
export interface CreatorStats {
  marketsCreated: number;
  marketsResolved: number;
  marketsAbandoned: number;
  resolutionRate: number; // 0.0-1.0
}

// Main market data interface
export interface MarketData {
  // Identity
  id: string;
  title: string;
  description: string;
  creatorAddress: string;
  marketType: MarketType;

  // Timing (in milliseconds, UTC)
  createdAtMs: number;
  closeTimeMs: number;
  disputeWindowMs: number;
  creatorPriorityWindowMs: number; // = 24h
  resolveDeadlineMs: number; // = 72h after close

  // State
  state: MarketState;

  // Outcomes
  outcomes: Outcome[];

  // Proposal (when in RESOLUTION_PENDING, DISPUTED, RESOLVED)
  resolution?: Resolution;

  // Dispute (when state = DISPUTED)
  dispute?: Dispute;

  // SDVM Phase (when in SDVM_*)
  sdvm?: SDVMData;

  // Financial
  trustTier: number; // 1-5
  creationBondAmount: number;

  // User's position (if user owns this market or has a position)
  userPosition?: UserPosition;

  // Volume & stats
  creatorStats?: CreatorStats;
}

// Portfolio position
export interface PortfolioPosition {
  marketId: string;
  marketTitle: string;
  outcome: Outcome;
  shares: number;
  pnl: number;
  status: "OPEN" | "CLAIMABLE" | "CLAIMED" | "LOST" | "REFUNDED";
  resolvedAtMs?: number;
  isCreatedByUser?: boolean;
  isDisputedByUser?: boolean;
  isSDVMVoteByUser?: boolean;
  claimAmount?: number;
}

// SDVM vote commitment/reveal
export interface VoteCommitment {
  marketId: string;
  salt: string; // hex-encoded random bytes
  phrase: string; // 24-word recovery phrase
  outcome: number;
  timestamp: number;
}
