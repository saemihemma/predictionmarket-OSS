import { Market, MarketState, TrustTier, MarketType, ResolutionClass, CreatorInfluenceLevel, SourceClass, EvidenceFormat, SourceFallback, ProposalData, DisputeData, SDVMData } from "../market-types";

const now = Date.now();

/**
 * Extended market interface with mock resolution/dispute/SDVM data
 */
interface MockMarketExtended extends Market {
  claimableAmount?: bigint;
  winningOutcome?: number;
  resolutionMethod?: string;
}

const MOCK_CREATOR_ADDRESS = "0xce7c1a2b3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f2";

const createMockMarket = (
  id: string,
  number: number,
  title: string,
  description: string,
  daysOld: number,
  daysUntilClose: number,
  outcomeQuantities: [bigint, bigint],
  trustTier: TrustTier,
  influenceLevel: CreatorInfluenceLevel = CreatorInfluenceLevel.NONE,
  marketState?: MarketState,
  proposal?: ProposalData,
  dispute?: DisputeData,
  sdvm?: SDVMData,
  claimableAmount?: bigint,
  winningOutcome?: number,
  resolutionMethod?: string,
): MockMarketExtended => {
  let state = marketState;
  if (state === undefined) {
    state = daysUntilClose > 0 ? (daysUntilClose < 2 ? MarketState.CLOSED : MarketState.OPEN) : MarketState.RESOLVED;
  }

  return {
    id,
    marketNumber: number,
    creator: MOCK_CREATOR_ADDRESS,
    title,
    description,
    resolutionText: `Resolution based on official source: ${Math.random() > 0.5 ? "Binance API" : "Yahoo Finance"}`,
    marketType: MarketType.BINARY,
    resolutionClass: ResolutionClass.DECLARED_SOURCE,
    trustTier,
    outcomeCount: 2,
    outcomeLabels: ["YES", "NO"],
    sourceDeclaration: {
      sourceClass: SourceClass.OFFICIAL_API,
      sourceUri: "https://api.example.com",
      sourceDescription: "Official data source",
      evidenceFormat: EvidenceFormat.API_RESPONSE_HASH,
      sourceArchived: false,
      creatorControlsSource: false,
      verifierSubmissionRequired: false,
      fallbackOnSourceUnavailable: SourceFallback.INVALID,
    },
    creatorInfluence: {
      influenceLevel,
      isSourceController: influenceLevel !== CreatorInfluenceLevel.NONE,
      disclosureText: influenceLevel !== CreatorInfluenceLevel.NONE ? "Creator has influence" : "",
    },
    closeTimeMs: now + daysUntilClose * 24 * 60 * 60 * 1000,
    resolveDeadlineMs: now + (daysUntilClose + 7) * 24 * 60 * 60 * 1000,
    disputeWindowMs: 24 * 60 * 60 * 1000,
    creatorPriorityWindowMs: 24 * 60 * 60 * 1000,
    state,
    frozen: false,
    createdAtMs: now - daysOld * 24 * 60 * 60 * 1000,
    outcomeQuantities,
    totalCollateral: outcomeQuantities[0] + outcomeQuantities[1],
    accruedFees: (outcomeQuantities[0] + outcomeQuantities[1]) / 100n,
    marketTypePolicyId: "0x1",
    resolverPolicyId: "0x2",
    configVersion: 1,
    resolution: null,
    totalCostBasisSum: outcomeQuantities[0] + outcomeQuantities[1],
    invalidationSnapshotCollateral: null,
    emergencyPaused: false,
    proposal,
    dispute,
    sdvm,
    claimableAmount,
    winningOutcome,
    resolutionMethod,
  };
};

export const mockMarkets: Market[] = [
  // ─── 3 OPEN markets (regular trading) ────
  createMockMarket(
    "market-001",
    1,
    "ETH/USD price above $3000 by EOY 2025",
    "Will Ethereum trade above $3000 USD at any point before December 31, 2025?",
    15,
    30,
    [2500n, 1800n],
    TrustTier.CANONICAL,
  ),
  createMockMarket(
    "market-002",
    2,
    "Bitcoin reaches $100k in 2025",
    "Will Bitcoin's price reach $100,000 USD at any point during 2025?",
    10,
    30,
    [3200n, 1200n],
    TrustTier.CANONICAL,
  ),
  createMockMarket(
    "market-003",
    3,
    "Fed drops rates below 3% in Q1 2025",
    "Will the federal funds rate be below 3.0% by the end of Q1 2025?",
    5,
    20,
    [1500n, 2800n],
    TrustTier.SOURCE_BOUND,
    CreatorInfluenceLevel.INDIRECT,
  ),

  // ─── 1 CLOSING market (< 12h) ───
  createMockMarket(
    "market-closing-soon",
    99,
    "Gold prices rise above $2,100/oz this week",
    "Will gold prices exceed $2,100 per troy ounce at any point before end of week?",
    2,
    0.5,
    [2100n, 1900n],
    TrustTier.SOURCE_BOUND,
  ),

  // ─── 1 CLOSED market (needs proposal, within creator priority) ───
  createMockMarket(
    "market-closed-creator-priority",
    100,
    "Apple stock outperforms S&P 500 in Q1",
    "Will AAPL stock have higher returns than the S&P 500 in Q1 2025?",
    3,
    -0.083,
    [1900n, 2100n],
    TrustTier.CREATOR_RESOLVED,
    CreatorInfluenceLevel.DIRECT,
    MarketState.CLOSED,
  ),

  // ─── 1 CLOSED market (needs proposal, creator priority expired — community can propose) ───
  createMockMarket(
    "market-closed-community-can-propose",
    101,
    "AI chip shortage resolves by June 2025",
    "Will AI chip availability return to normal levels by June 30, 2025?",
    8,
    -1.5,
    [2300n, 1700n],
    TrustTier.CANONICAL,
    CreatorInfluenceLevel.NONE,
    MarketState.CLOSED,
  ),

  // ─── 1 RESOLUTION_PENDING market (proposal submitted, dispute window open) ───
  createMockMarket(
    "market-resolution-pending",
    102,
    "Oil price below $70/barrel end of Q1",
    "Will crude oil prices fall below $70 per barrel by March 31, 2025?",
    20,
    -2.2,
    [1200n, 2800n],
    TrustTier.SOURCE_BOUND,
    CreatorInfluenceLevel.NONE,
    MarketState.RESOLUTION_PENDING,
    {
      proposedOutcomeId: 1,
      proposerAddress: MOCK_CREATOR_ADDRESS,
      proposerType: "CREATOR",
      submittedAtMs: now - 4 * 60 * 60 * 1000,
      evidenceUrl: "https://www.brent-oil-prices.com/historical-2025",
      note: "Oil prices stayed above $75/barrel throughout Q1 2025. Final close: $78.50.",
      disputeWindowEndMs: now + 20 * 60 * 60 * 1000,
      creationBondAmount: 500,
    },
  ),

  // ─── 1 DISPUTED market (SDVM COMMIT phase) ───
  createMockMarket(
    "market-disputed-sdvm-commit",
    103,
    "Euro/USD above 1.15 in March",
    "Will EUR/USD exchange rate exceed 1.15 at any point in March 2025?",
    1,
    -2,
    [1650n, 2350n],
    TrustTier.CANONICAL,
    CreatorInfluenceLevel.NONE,
    MarketState.DISPUTED,
    {
      proposedOutcomeId: 0,
      proposerAddress: "0xabc123def456789abcdef123def456789abcdef1",
      proposerType: "COMMUNITY",
      submittedAtMs: now - 6 * 60 * 60 * 1000,
      evidenceUrl: "https://tradingview.com/symbols/EURUSD/",
      disputeWindowEndMs: now - 1 * 60 * 60 * 1000,
      creationBondAmount: 500,
    },
    {
      disputer: "0x9876543210fedcba9876543210fedcba98765432",
      proposedOutcomeId: 1,
      reasonText: "The proposal is incorrect. EUR/USD did reach 1.15 on March 15, 2025.",
      filedAtMs: now - 2 * 60 * 60 * 1000,
      bondAmount: 500,
    },
    {
      phase: "COMMIT",
      phaseStartMs: now - 2 * 60 * 60 * 1000,
      phaseEndMs: now + 10 * 60 * 60 * 1000,
      commitDeadlineMs: now + 10 * 60 * 60 * 1000,
      participantCount: 15,
      totalStakeParticipating: 7500,
    },
  ),

  // ─── 2 RESOLVED markets (1 won, 1 lost for mock user) ───
  createMockMarket(
    "market-resolved-won",
    104,
    "S&P 500 new all-time high before April",
    "Will the S&P 500 index reach a new all-time high before April 1, 2025?",
    6,
    -14,
    [2600n, 1400n],
    TrustTier.SOURCE_BOUND,
    CreatorInfluenceLevel.NONE,
    MarketState.RESOLVED,
    {
      proposedOutcomeId: 0,
      proposerAddress: MOCK_CREATOR_ADDRESS,
      proposerType: "CREATOR",
      submittedAtMs: now - 15 * 24 * 60 * 60 * 1000,
      evidenceUrl: "https://www.cnbc.com/data/markets/sp500",
      disputeWindowEndMs: now - 14 * 24 * 60 * 60 * 1000,
      creationBondAmount: 500,
    },
    undefined,
    undefined,
    750n,
    0,
  ),
  createMockMarket(
    "market-resolved-lost",
    105,
    "Doge coin breaks $1 by Q2 2024",
    "Did Dogecoin's price reach $1.00 USD at any point during Q2 2024?",
    120,
    -60,
    [4200n, 2800n],
    TrustTier.CANONICAL,
    CreatorInfluenceLevel.NONE,
    MarketState.RESOLVED,
    {
      proposedOutcomeId: 1,
      proposerAddress: MOCK_CREATOR_ADDRESS,
      proposerType: "CREATOR",
      submittedAtMs: now - 90 * 24 * 60 * 60 * 1000,
      evidenceUrl: "https://coinmarketcap.com/currencies/dogecoin/",
      disputeWindowEndMs: now - 89 * 24 * 60 * 60 * 1000,
      creationBondAmount: 500,
    },
  ),

  // ─── 1 INVALID market (refund available) ───
  createMockMarket(
    "market-invalid",
    106,
    "US unemployment below 4% in 2024",
    "Did US unemployment rate fall below 4.0% at any point during 2024?",
    110,
    -50,
    [3900n, 3100n],
    TrustTier.SOURCE_BOUND,
    CreatorInfluenceLevel.NONE,
    MarketState.INVALID,
  ),
];

export function getMockMarket(id: string): Market | undefined {
  return mockMarkets.find((m) => m.id === id);
}

export function getMockMarketById(id: string): Market | undefined {
  return mockMarkets.find((m) => m.id === id);
}
