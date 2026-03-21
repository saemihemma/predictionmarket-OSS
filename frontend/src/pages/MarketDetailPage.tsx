import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import TerminalScreen from "../components/terminal/TerminalScreen";
import { MarketState, TrustTier, CreatorInfluenceLevel } from "../lib/market-types";
import { outcomeProbabilityBps } from "../lib/amm";
import { useMarketData, useAllMarkets } from "../hooks/useMarketData";
import CountdownTimer from "../components/ui/CountdownTimer";
import PageHeader from "../components/ui/PageHeader";
import { formatAddress } from "../lib/formatting";
import Footer from "../components/ui/Footer";

// Sub-components
import MarketDetailProposal from "./detail/MarketDetailProposal";
import MarketDetailPending from "./detail/MarketDetailPending";
import MarketDetailSDVM from "./detail/MarketDetailSDVM";
import MarketDetailResolved from "./detail/MarketDetailResolved";
import MarketDetailInfo from "./detail/MarketDetailInfo";
import MarketDetailSidebar from "./detail/MarketDetailSidebar";

export default function MarketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { market: hookMarket } = useMarketData(id || "");
  const market = hookMarket as any;
  const { markets: allMarkets } = useAllMarkets();

  const [selectedOutcome, setSelectedOutcome] = useState(0);
  const [tradeAmount, setTradeAmount] = useState("");
  const [tradeType, setTradeType] = useState<"buy" | "sell">("buy");
  const [account] = useState<string | null>(null);
  const [disputeExpanded, setDisputeExpanded] = useState(false);
  const [proposedOutcome, setProposedOutcome] = useState(0);
  const [disputeReason, setDisputeReason] = useState("");
  const [voteExpanded, setVoteExpanded] = useState(false);
  const [voterChoice, setVoterChoice] = useState(0);
  const [recoveryPhraseSaved, setRecoveryPhraseSaved] = useState(false);
  const [phraseCopied, setPhraseCopied] = useState(false);
  const [mockRecoveryPhrase] = useState(() => {
    const words = ["abandon", "ability", "about", "above", "absent", "absolute", "absorb", "abstract", "absurd", "abuse", "access", "accident"];
    return words.join(" ");
  });

  if (!market) {
    return (
      <TerminalScreen>
        <div className="min-h-dvh flex flex-col">
          <PageHeader showBack />
          <main className="flex-1 p-8 flex flex-col items-center justify-center">
            <div className="text-sm text-orange mb-4">MARKET NOT FOUND</div>
            <Link
              to="/markets"
              className="text-xs text-mint-dim no-underline"
            >
              ← RETURN TO MARKET LIST
            </Link>
          </main>
        </div>
      </TerminalScreen>
    );
  }

  const probs = outcomeProbabilityBps(market.outcomeQuantities);
  const mainProb = Number(probs[0]) / 100;

  // Calculate creator markets count from all markets
  const creatorMarketsCount = allMarkets.filter((m: any) => m.creator === market.creator).length;
  const creatorAccuracy = creatorMarketsCount > 3 ? "80%" : "N/A";

  const getTrustTierColor = (tier: TrustTier): string => {
    switch (tier) {
      case TrustTier.CANONICAL:
        return "var(--mint)";
      case TrustTier.SOURCE_BOUND:
        return "var(--tribe-b)";
      case TrustTier.CREATOR_RESOLVED:
        return "var(--orange)";
      default:
        return "var(--text-dim)";
    }
  };

  const getTrustTierLabel = (tier: TrustTier): string => {
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
  };

  return (
    <TerminalScreen>
      <div className="min-h-dvh flex flex-col">
        <PageHeader showBack />

        {/* Title and Stats */}
        <div className="border-b border-border-panel px-8 py-6">
          <h2 className="text-[1.4rem] font-bold text-mint mb-2 leading-tight">
            {market.title}
          </h2>

          {/* Creator Section */}
          <div className="text-sm text-text-muted mb-4 pb-4 border-b border-border-panel">
            <span>CREATED BY {formatAddress(market.creator)}</span>
            <span className="mx-2">•</span>
            <span>{creatorMarketsCount} markets created • {creatorAccuracy} accuracy</span>
          </div>

          {/* Probability bar - large */}
          <div className="mb-4">
            <div className="flex justify-between text-[0.7rem] mb-2 tracking-[0.08em]">
              <span className="text-mint">YES {mainProb.toFixed(1)}%</span>
              <span className="text-orange">NO {(100 - mainProb).toFixed(1)}%</span>
            </div>
            <div className="h-2 bg-orange-dim relative overflow-hidden border border-border-panel">
              <div
                className="absolute left-0 top-0 bottom-0 bg-mint transition-all duration-300"
                style={{ width: `${mainProb}%` }}
              />
            </div>
          </div>

          {/* Row 1: Badges left, Timer right */}
          <div className="flex justify-between items-center mb-3">
            <div className="flex gap-2">
              <span
                className="text-[0.65rem] font-semibold tracking-[0.08em] border px-2 py-0.5"
                style={{ color: getTrustTierColor(market.trustTier), borderColor: getTrustTierColor(market.trustTier) }}
              >
                {getTrustTierLabel(market.trustTier)}
              </span>
              <span
                className="text-[0.65rem] font-semibold tracking-[0.08em] border px-2 py-0.5"
                style={{
                  color: market.state === MarketState.OPEN ? "var(--mint)" : market.state === MarketState.RESOLVED ? "var(--mint)" : "var(--orange)",
                  borderColor: market.state === MarketState.OPEN ? "var(--mint-dim)" : market.state === MarketState.RESOLVED ? "var(--mint-dim)" : "var(--orange-dim)"
                }}
              >
                {market.state === MarketState.OPEN ? "OPEN" : market.state === MarketState.RESOLVED ? "RESOLVED" : "CLOSED"}
              </span>
            </div>

            {/* Live Countdown Timer — UTC-based */}
            <CountdownTimer targetMs={market.closeTimeMs} />
          </div>

          {/* Creator Influence Disclosure — separate row, only if applies */}
          {market.creatorInfluence.influenceLevel !== CreatorInfluenceLevel.NONE && (
            <div
              className="text-xs text-orange bg-[rgba(221,122,31,0.08)] border border-orange-dim px-3 py-2 mb-2 tracking-[0.04em] cursor-help"
              title="When creating this market, the creator disclosed potential influence over its outcome. This is informational — factor it into your assessment."
            >
              ⚠ CREATOR HAS DECLARED INFLUENCE
            </div>
          )}
        </div>

        {/* Main content - 2 column grid */}
        <div className="flex-1 grid grid-cols-[3fr_2fr] gap-8 p-8 overflow-x-hidden max-w-[1400px] mx-auto w-full">
          {/* Left column (60%) */}
          <div className="flex flex-col gap-6 overflow-auto">
            {/* STATE 1.5: CLOSED (no proposal yet) - Show proposal form */}
            {market.state === MarketState.CLOSED && !market.proposal && (
              <MarketDetailProposal
                market={market}
                proposedOutcome={proposedOutcome}
                setProposedOutcome={setProposedOutcome}
              />
            )}

            {/* STATE 2: RESOLUTION_PENDING - Proposed outcome + dispute window */}
            {market.state === MarketState.RESOLUTION_PENDING && market.proposal && (
              <MarketDetailPending
                market={market}
                disputeExpanded={disputeExpanded}
                setDisputeExpanded={setDisputeExpanded}
                proposedOutcome={proposedOutcome}
                setProposedOutcome={setProposedOutcome}
                disputeReason={disputeReason}
                setDisputeReason={setDisputeReason}
              />
            )}

            {/* STATE 3: DISPUTED - SDVM Voting */}
            {market.state === MarketState.DISPUTED && market.dispute && market.sdvm && (
              <MarketDetailSDVM
                market={market}
                voteExpanded={voteExpanded}
                setVoteExpanded={setVoteExpanded}
                voterChoice={voterChoice}
                setVoterChoice={setVoterChoice}
                recoveryPhraseSaved={recoveryPhraseSaved}
                setRecoveryPhraseSaved={setRecoveryPhraseSaved}
                phraseCopied={phraseCopied}
                setPhraseCopied={setPhraseCopied}
                mockRecoveryPhrase={mockRecoveryPhrase}
              />
            )}

            {/* STATE 5: RESOLVED */}
            {market.state === MarketState.RESOLVED && market.winningOutcome !== undefined && (
              <MarketDetailResolved market={market} />
            )}

            {/* Description, Resolution Rules, Market Details — always visible */}
            <MarketDetailInfo market={market} />
          </div>

          {/* Right column (40%) */}
          <MarketDetailSidebar
            market={market}
            probs={probs}
            mainProb={mainProb}
            selectedOutcome={selectedOutcome}
            setSelectedOutcome={setSelectedOutcome}
            tradeAmount={tradeAmount}
            setTradeAmount={setTradeAmount}
            tradeType={tradeType}
            setTradeType={setTradeType}
            account={account}
            voteExpanded={voteExpanded}
          />
        </div>

        {/* Footer */}
        <Footer />
      </div>
    </TerminalScreen>
  );
}
