import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { cn } from "../lib/utils";
import TerminalScreen from "../components/terminal/TerminalScreen";
import { MarketState, ResolutionClass } from "../lib/market-types";
import { useAllMarkets, usePortfolio } from "../hooks/useMarketData";
import {
  buildClaimTransaction,
  buildInvalidRefundTransaction,
  buildProposeResolutionTransaction,
} from "../lib/market-transactions";
import { hashUtf8ToBytes32 } from "../lib/crypto";
import Footer from "../components/ui/Footer";
import PageHeader from "../components/ui/PageHeader";
import PortfolioSummary from "./portfolio/PortfolioSummary";
import PortfolioActionRequired from "./portfolio/PortfolioActionRequired";
import PortfolioPositions from "./portfolio/PortfolioPositions";
import PortfolioStaking from "./portfolio/PortfolioStaking";
import PortfolioHistory from "./portfolio/PortfolioHistory";
import { useSponsoredTransaction } from "../hooks/useSponsoredTransaction";

type PositionFilter = "all" | "open" | "claimable" | "lost";

export default function PortfolioPage() {
  const [searchParams] = useSearchParams();
  const initialFilter = (searchParams.get("filter") as PositionFilter) || "all";
  const account = useCurrentAccount();
  const { executeSponsoredTx } = useSponsoredTransaction();

  const { positions, refetch: refetchPortfolio } = usePortfolio(account?.address);
  const { markets: allMarkets, refetch: refetchMarkets } = useAllMarkets();

  const [activeTab, setActiveTab] = useState<"positions" | "staking" | "history">("positions");
  const [positionFilter, setPositionFilter] = useState<PositionFilter>(initialFilter);
  const [proposalOutcome, setProposalOutcome] = useState<{ [marketId: string]: number }>({});
  const [proposalEvidence, setProposalEvidence] = useState<{ [marketId: string]: string }>({});
  const [proposalNote, setProposalNote] = useState<{ [marketId: string]: string }>({});
  const [proposalSubmitting, setProposalSubmitting] = useState<Record<string, boolean>>({});
  const [proposalErrors, setProposalErrors] = useState<Record<string, string | null>>({});
  const [claimedPositions, setClaimedPositions] = useState<Set<string>>(new Set());
  const [claimClaiming, setClaimClaiming] = useState<Record<string, boolean>>({});
  const [claimErrors, setClaimErrors] = useState<Record<string, string | null>>({});

  const totalValue = positions.reduce((sum, position) => sum + position.value, 0n);
  const openPositions = positions.filter((position) => position.state === "open");
  const claimablePositions = positions.filter((position) => position.state === "claimable");
  const lostPositions = positions.filter((position) => position.state === "resolved" && position.pnl < 0n);

  const settledWon = positions.filter((position) => position.pnl > 0n && position.state !== "open").length;
  const settledLost = positions.filter((position) => position.pnl < 0n && position.state !== "open").length;
  const activeCount = openPositions.length;

  const marketNeedingProposal = allMarkets.find(
    (market) =>
      market.creator === account?.address &&
      market.state === MarketState.CLOSED &&
      !market.resolution &&
      market.resolutionClass === ResolutionClass.CREATOR_PROPOSED,
  );

  const getErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message.trim()) {
      return error.message;
    }
    if (typeof error === "string" && error.trim()) {
      return error;
    }
    return fallback;
  };

  const handleClaim = async (positionId: string) => {
    const position = positions.find((entry) => entry.positionId === positionId);
    if (!position || !position.claimAction) {
      return;
    }

    setClaimErrors((current) => ({ ...current, [positionId]: null }));
    setClaimClaiming((current) => ({ ...current, [positionId]: true }));

    try {
      const tx =
        position.claimAction === "refund_invalid"
          ? buildInvalidRefundTransaction({
              marketId: position.marketId,
              positionId: position.positionId,
            })
          : buildClaimTransaction({
              marketId: position.marketId,
              positionId: position.positionId,
            });

      await executeSponsoredTx(tx);
      setClaimedPositions((current) => new Set([...current, positionId]));
      setClaimErrors((current) => ({ ...current, [positionId]: null }));
      await Promise.all([refetchPortfolio(), refetchMarkets()]);
    } catch (error) {
      const message = getErrorMessage(error, "Claim or refund failed. Please try again.");
      setClaimErrors((current) => ({ ...current, [positionId]: message }));
    } finally {
      setClaimClaiming((current) => ({ ...current, [positionId]: false }));
    }
  };

  const handleProposalSubmit = async (marketId: string) => {
    const market = allMarkets.find((entry) => entry.id === marketId);
    if (!market) {
      setProposalErrors((current) => ({ ...current, [marketId]: "Market not found." }));
      return;
    }

    setProposalSubmitting((current) => ({ ...current, [marketId]: true }));
    setProposalErrors((current) => ({ ...current, [marketId]: null }));

    try {
      const evidenceHash = await hashUtf8ToBytes32(
        JSON.stringify({
          marketId,
          outcome: proposalOutcome[marketId] ?? 0,
          evidenceUrl: proposalEvidence[marketId] ?? "",
          note: proposalNote[marketId] ?? "",
        }),
      );

      const tx = buildProposeResolutionTransaction({
        marketId,
        outcome: proposalOutcome[marketId] ?? 0,
        evidenceHash,
      });

      await executeSponsoredTx(tx);
      setProposalEvidence((current) => ({ ...current, [marketId]: "" }));
      setProposalNote((current) => ({ ...current, [marketId]: "" }));
      await Promise.all([refetchMarkets(), refetchPortfolio()]);
    } catch (error) {
      setProposalErrors((current) => ({
        ...current,
        [marketId]: error instanceof Error ? error.message : "Proposal failed.",
      }));
    } finally {
      setProposalSubmitting((current) => ({ ...current, [marketId]: false }));
    }
  };

  return (
    <TerminalScreen>
      <div className="min-h-screen flex flex-col overflow-x-hidden">
        <PageHeader subtitle="PORTFOLIO" showBack />

        <PortfolioSummary
          totalValue={totalValue}
          settledWon={settledWon}
          settledLost={settledLost}
          activeCount={activeCount}
          claimableCount={claimablePositions.length}
        />

        <div className="border-b border-border-panel">
          <div className="page-shell mobile-scroll-row py-1">
            <div className="flex min-w-max gap-2">
              {(["positions", "staking", "history"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "touch-target inline-flex min-h-11 items-center justify-center border-b-2 px-4 py-3 font-mono text-sm font-semibold tracking-[0.08em] transition-all duration-200",
                    activeTab === tab
                      ? "border-mint bg-[rgba(202,245,222,0.12)] text-mint"
                      : "border-transparent bg-transparent text-text-muted",
                  )}
                >
                  {tab === "positions" ? "POSITIONS" : tab === "staking" ? "DISPUTE VOTING" : "HISTORY"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="page-shell page-section flex-1">
          {activeTab === "positions" && (
            <div className="flex flex-col gap-4">
              {marketNeedingProposal && (
                <PortfolioActionRequired
                  market={marketNeedingProposal}
                  proposalOutcome={proposalOutcome}
                  setProposalOutcome={setProposalOutcome}
                  proposalEvidence={proposalEvidence}
                  setProposalEvidence={setProposalEvidence}
                  proposalNote={proposalNote}
                  setProposalNote={setProposalNote}
                  proposalSubmitting={proposalSubmitting}
                  proposalErrors={proposalErrors}
                  onSubmit={handleProposalSubmit}
                />
              )}
              <PortfolioPositions
                positions={positions}
                openPositions={openPositions}
                claimablePositions={claimablePositions}
                lostPositions={lostPositions}
                positionFilter={positionFilter}
                setPositionFilter={setPositionFilter}
                claimedPositions={claimedPositions}
                claimClaiming={claimClaiming}
                claimErrors={claimErrors}
                onClaim={handleClaim}
              />
            </div>
          )}

          {activeTab === "staking" && <PortfolioStaking />}
          {activeTab === "history" && <PortfolioHistory />}
        </div>

        <Footer />
      </div>
    </TerminalScreen>
  );
}
