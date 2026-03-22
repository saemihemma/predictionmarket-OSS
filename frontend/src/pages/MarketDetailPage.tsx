import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import TerminalScreen from "../components/terminal/TerminalScreen";
import { MarketState, TrustTier, CreatorInfluenceLevel, ResolutionClass } from "../lib/market-types";
import { outcomeProbabilityBps } from "../lib/amm";
import { useMarketData, useAllMarkets } from "../hooks/useMarketData";
import { useMarketPositions } from "../hooks/useMarketPositions";
import CountdownTimer from "../components/ui/CountdownTimer";
import PageHeader from "../components/ui/PageHeader";
import { formatAddress } from "../lib/formatting";
import Footer from "../components/ui/Footer";
import { hashUtf8ToBytes32 } from "../lib/crypto";
import { fetchCollateralCoins } from "../lib/collateral";
import {
  buildCommunityProposeResolutionTransaction,
  buildDisputeTransaction,
  buildProposeResolutionTransaction,
} from "../lib/market-transactions";
import {
  getCreationBondMinRawFromConfig,
  getDisputeBondAmountRawFromConfig,
} from "../lib/protocol-runtime";
import { useProtocolRuntimeConfig } from "../hooks/useProtocolRuntimeConfig";
import { useSponsoredTransaction } from "../hooks/useSponsoredTransaction";
import MarketDetailProposal from "./detail/MarketDetailProposal";
import MarketDetailPending from "./detail/MarketDetailPending";
import MarketDetailResolved from "./detail/MarketDetailResolved";
import MarketDetailInfo from "./detail/MarketDetailInfo";
import MarketDetailSidebar from "./detail/MarketDetailSidebar";

function getTrustTierLabel(tier: TrustTier): string {
  switch (tier) {
    case TrustTier.CANONICAL:
      return "VERIFIED";
    case TrustTier.SOURCE_BOUND:
      return "SOURCED";
    case TrustTier.CREATOR_RESOLVED:
      return "COMMUNITY";
    default:
      return "EXPERIMENTAL";
  }
}

function getTrustTierBadgeClasses(tier: TrustTier): string {
  switch (tier) {
    case TrustTier.CANONICAL:
      return "border-mint text-mint";
    case TrustTier.SOURCE_BOUND:
      return "border-tribe-b text-tribe-b";
    case TrustTier.CREATOR_RESOLVED:
      return "border-orange text-orange";
    default:
      return "border-border-panel text-text-dim";
  }
}

function getMarketStateLabel(state: MarketState): string {
  switch (state) {
    case MarketState.OPEN:
      return "OPEN";
    case MarketState.RESOLVED:
      return "RESOLVED";
    case MarketState.RESOLUTION_PENDING:
      return "PENDING";
    case MarketState.DISPUTED:
      return "DISPUTED";
    default:
      return "CLOSED";
  }
}

function getMarketStateBadgeClasses(state: MarketState): string {
  return state === MarketState.OPEN || state === MarketState.RESOLVED
    ? "border-mint-dim text-mint"
    : "border-orange-dim text-orange";
}

export default function MarketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const account = useCurrentAccount();
  const { executeSponsoredTx } = useSponsoredTransaction();
  const {
    market: hookMarket,
    isLoading: isMarketLoading,
    error: marketError,
    refetch: refetchMarket,
  } = useMarketData(id || "");
  const market = hookMarket as any;
  const { markets: allMarkets } = useAllMarkets();
  const { data: positions = [], refetch: refetchPositions } = useMarketPositions(id);
  const { data: protocolConfig } = useProtocolRuntimeConfig();

  const [selectedOutcome, setSelectedOutcome] = useState(0);
  const [tradeAmount, setTradeAmount] = useState("");
  const [tradeType, setTradeType] = useState<"buy" | "sell">("buy");
  const [disputeExpanded, setDisputeExpanded] = useState(false);
  const [proposedOutcome, setProposedOutcome] = useState(0);
  const [proposalEvidence, setProposalEvidence] = useState("");
  const [proposalNote, setProposalNote] = useState("");
  const [proposalPending, setProposalPending] = useState(false);
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputePending, setDisputePending] = useState(false);
  const [disputeError, setDisputeError] = useState<string | null>(null);

  if (isMarketLoading) {
    return (
      <TerminalScreen>
        <div className="min-h-screen flex flex-col">
          <PageHeader showBack />
          <main className="page-shell page-section flex flex-1 flex-col items-center justify-center text-center">
            <div className="mb-4 text-sm text-mint">LOADING MARKET</div>
            <div className="text-xs tracking-[0.08em] text-text-muted">FETCHING CHAIN DATA</div>
          </main>
        </div>
      </TerminalScreen>
    );
  }

  if (marketError && !market) {
    return (
      <TerminalScreen>
        <div className="min-h-screen flex flex-col">
          <PageHeader showBack />
          <main className="page-shell page-section flex flex-1 flex-col items-center justify-center text-center">
            <div className="mb-4 text-sm text-orange">ERROR LOADING MARKET</div>
            <div className="mb-6 max-w-[32rem] text-xs leading-relaxed text-text-muted sm:text-sm">
              {marketError.message}
            </div>
            <Link to="/markets" className="text-xs text-mint-dim no-underline">
              &larr; RETURN TO MARKET LIST
            </Link>
          </main>
        </div>
      </TerminalScreen>
    );
  }

  if (!market) {
    return (
      <TerminalScreen>
        <div className="min-h-screen flex flex-col">
          <PageHeader showBack />
          <main className="page-shell page-section flex flex-1 flex-col items-center justify-center text-center">
            <div className="mb-4 text-sm text-orange">MARKET NOT FOUND</div>
            <Link to="/markets" className="text-xs text-mint-dim no-underline">
              &larr; RETURN TO MARKET LIST
            </Link>
          </main>
        </div>
      </TerminalScreen>
    );
  }

  const probabilities = outcomeProbabilityBps(market.outcomeQuantities);
  const mainProb = Number(probabilities[0]) / 100;
  const disputeBondAmountRaw = protocolConfig
    ? getDisputeBondAmountRawFromConfig(protocolConfig)
    : 0n;
  const creatorMarketsCount = allMarkets.filter((entry: any) => entry.creator === market.creator).length;
  const isCreator = account?.address === market.creator;
  const supportsCommunityProposal = market.resolutionClass === ResolutionClass.CREATOR_PROPOSED;
  const creatorPriorityExpired = market.creatorPriorityDeadlineMs <= Date.now();
  const canCommunityPropose =
    market.state === MarketState.CLOSED && supportsCommunityProposal && !isCreator && creatorPriorityExpired;
  const marketStateLabel = getMarketStateLabel(market.state);

  const handleSubmitProposal = async () => {
    if (!account?.address) {
      setProposalError("Connect wallet to propose a resolution.");
      return;
    }

    setProposalPending(true);
    setProposalError(null);

    try {
      const evidencePayload = JSON.stringify({
        marketId: market.id,
        outcome: proposedOutcome,
        evidenceUrl: proposalEvidence,
        note: proposalNote,
      });
      const evidenceHash = await hashUtf8ToBytes32(evidencePayload);

      if (isCreator) {
        const tx = buildProposeResolutionTransaction({
          marketId: market.id,
          outcome: proposedOutcome,
          evidenceHash,
        });
        await executeSponsoredTx(tx);
      } else if (canCommunityPropose) {
        if (!protocolConfig) {
          throw new Error("Live protocol config is still syncing.");
        }
        const inventory = await fetchCollateralCoins(account.address);
        const bondAmount = getCreationBondMinRawFromConfig(protocolConfig, market.trustTier);
        if (inventory.totalBalance < bondAmount) {
          throw new Error("Not enough collateral for the required community proposal bond.");
        }

        const tx = buildCommunityProposeResolutionTransaction({
          marketId: market.id,
          outcome: proposedOutcome,
          evidenceHash,
          bondCoinIds: inventory.coinObjectIds,
          bondAmount,
        });
        await executeSponsoredTx(tx);
      } else {
        throw new Error("Proposal is locked to the creator until the priority window expires.");
      }

      setProposalEvidence("");
      setProposalNote("");
      await refetchMarket();
    } catch (error) {
      setProposalError(error instanceof Error ? error.message : "Failed to submit proposal.");
    } finally {
      setProposalPending(false);
    }
  };

  const handleSubmitDispute = async () => {
    if (!account?.address) {
      setDisputeError("Connect wallet to file a dispute.");
      return;
    }

    setDisputePending(true);
    setDisputeError(null);

    try {
      const inventory = await fetchCollateralCoins(account.address);
      const reasonHash = await hashUtf8ToBytes32(
        JSON.stringify({
          marketId: market.id,
          proposedOutcome,
          disputeReason,
        }),
      );

      const tx = buildDisputeTransaction({
        marketId: market.id,
        proposedOutcome,
        reasonHash,
        bondCoinIds: inventory.coinObjectIds,
      });

      await executeSponsoredTx(tx);
      setDisputeExpanded(false);
      setDisputeReason("");
      await refetchMarket();
    } catch (error) {
      setDisputeError(error instanceof Error ? error.message : "Failed to file dispute.");
    } finally {
      setDisputePending(false);
    }
  };

  return (
    <TerminalScreen>
      <div className="min-h-screen flex flex-col">
        <PageHeader showBack />

        <div className="border-b border-border-panel">
          <div className="page-shell py-5 md:py-6">
            <h2 className="mb-2 text-[1.2rem] font-bold leading-tight text-mint sm:text-[1.4rem]">{market.title}</h2>

            <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border-panel pb-4 text-sm text-text-muted">
              <span>CREATED BY {formatAddress(market.creator)}</span>
              <span className="hidden text-text-dim sm:inline">|</span>
              <span>{creatorMarketsCount} markets created</span>
            </div>

            <div className="mb-4">
              <div className="mb-2 flex justify-between text-[0.7rem] tracking-[0.08em]">
                <span className="text-mint">YES {mainProb.toFixed(1)}%</span>
                <span className="text-orange">NO {(100 - mainProb).toFixed(1)}%</span>
              </div>
              <div className="relative h-2 overflow-hidden border border-border-panel bg-orange-dim">
                <div
                  className="absolute bottom-0 left-0 top-0 bg-mint transition-all duration-300"
                  style={{ width: `${mainProb}%` }}
                />
              </div>
            </div>

            <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap gap-2">
                <span
                  className={`border px-2 py-0.5 text-[0.65rem] font-semibold tracking-[0.08em] ${getTrustTierBadgeClasses(market.trustTier)}`}
                >
                  {getTrustTierLabel(market.trustTier)}
                </span>
                <span
                  className={`border px-2 py-0.5 text-[0.65rem] font-semibold tracking-[0.08em] ${getMarketStateBadgeClasses(market.state)}`}
                >
                  {marketStateLabel}
                </span>
              </div>
              <div className="text-sm text-text">
                <CountdownTimer targetMs={market.closeTimeMs} />
              </div>
            </div>

            {market.creatorInfluence.influenceLevel !== CreatorInfluenceLevel.NONE && (
              <div
                className="cursor-help border border-orange-dim bg-[rgba(221,122,31,0.08)] px-3 py-2 text-xs tracking-[0.04em] text-orange"
                title="When creating this market, the creator disclosed potential influence over its outcome. This is informational; factor it into your assessment."
              >
                WARNING: CREATOR HAS DECLARED INFLUENCE
              </div>
            )}
          </div>
        </div>

        <div className="page-shell page-section panel-stack panel-stack--detail flex-1">
          <div className="order-2 flex flex-col gap-6 lg:order-1">
            {market.state === MarketState.CLOSED && !market.resolution && supportsCommunityProposal && (
              <MarketDetailProposal
                market={market}
                proposedOutcome={proposedOutcome}
                setProposedOutcome={setProposedOutcome}
                proposalEvidence={proposalEvidence}
                setProposalEvidence={setProposalEvidence}
                proposalNote={proposalNote}
                setProposalNote={setProposalNote}
                onSubmit={handleSubmitProposal}
                submitLabel={
                  isCreator
                    ? "PROPOSE AS CREATOR"
                    : canCommunityPropose
                      ? "PROPOSE WITH COMMUNITY BOND"
                      : "PROPOSAL LOCKED"
                }
                helperText={
                  isCreator
                    ? "Link supporting evidence if you want a clearer audit trail for the proposal hash."
                    : "If the creator window has expired, this proposal posts the community bond from your wallet."
                }
                isSubmitting={proposalPending}
                error={proposalError}
              />
            )}

            {market.state === MarketState.CLOSED && !market.resolution && !supportsCommunityProposal && (
              <div className="border border-border-panel bg-bg-panel p-4">
                <h3 className="mb-3 text-[1.1rem] font-bold tracking-[0.1em] text-orange">AWAITING VERIFIER RESOLUTION</h3>
                <div className="text-sm leading-relaxed text-text">
                  This market resolves through the configured verifier path, so creator or community proposal controls are not
                  exposed here.
                </div>
              </div>
            )}

            {market.state === MarketState.RESOLUTION_PENDING && market.resolution && (
              <MarketDetailPending
                market={market}
                disputeBondAmountRaw={disputeBondAmountRaw}
                disputeExpanded={disputeExpanded}
                setDisputeExpanded={setDisputeExpanded}
                proposedOutcome={proposedOutcome}
                setProposedOutcome={setProposedOutcome}
                disputeReason={disputeReason}
                setDisputeReason={setDisputeReason}
                onSubmitDispute={handleSubmitDispute}
                isSubmitting={disputePending}
                error={disputeError}
              />
            )}

            {market.state === MarketState.DISPUTED && (
              <div className="border border-orange-dim bg-bg-panel p-4">
                <h3 className="mb-3 text-[1.1rem] font-bold tracking-[0.1em] text-orange">DISPUTE LIVE</h3>
                <div className="text-sm leading-relaxed text-text">
                  This market is already disputed on-chain for the active{" "}
                  {market.trustTier === TrustTier.CREATOR_RESOLVED ? "community" : "resolver"} flow. The generic collateral
                  family is live; the dedicated SDVM voting panel is the remaining UI pass.
                </div>
              </div>
            )}

            {market.state === MarketState.RESOLVED && market.resolution && <MarketDetailResolved market={market} />}

            <MarketDetailInfo market={market} />
          </div>

          <div className="order-1 lg:order-2">
            <MarketDetailSidebar
              market={market}
              probs={probabilities}
              selectedOutcome={selectedOutcome}
              setSelectedOutcome={setSelectedOutcome}
              tradeAmount={tradeAmount}
              setTradeAmount={setTradeAmount}
              tradeType={tradeType}
              setTradeType={setTradeType}
              account={account?.address ?? null}
              voteExpanded={false}
              positions={positions}
              onTradeSuccess={async () => {
                await Promise.all([refetchMarket(), refetchPositions()]);
              }}
            />
          </div>
        </div>

        <Footer />
      </div>
    </TerminalScreen>
  );
}
