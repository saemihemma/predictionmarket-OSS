import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { cn } from "../lib/utils";
import TerminalScreen from "../components/terminal/TerminalScreen";
import { MarketState } from "../lib/market-types";
import { useMarketData, usePortfolio } from "../hooks/useMarketData";
import Footer from "../components/ui/Footer";
import PageHeader from "../components/ui/PageHeader";
import PortfolioSummary from "./portfolio/PortfolioSummary";
import PortfolioActionRequired from "./portfolio/PortfolioActionRequired";
import PortfolioPositions from "./portfolio/PortfolioPositions";
import PortfolioStaking from "./portfolio/PortfolioStaking";
import PortfolioHistory from "./portfolio/PortfolioHistory";

type PositionFilter = "all" | "open" | "claimable" | "lost";

export default function PortfolioPage() {
  const [searchParams] = useSearchParams();
  const initialFilter = (searchParams.get("filter") as PositionFilter) || "all";
  const account = useCurrentAccount();

  const { positions } = usePortfolio(account?.address);
  const { market: marketNeedingProposal } = useMarketData("market-012");

  const [activeTab, setActiveTab] = useState<"positions" | "staking" | "history">("positions");
  const [positionFilter, setPositionFilter] = useState<PositionFilter>(initialFilter);
  const [proposalState, setProposalState] = useState<{ [marketId: string]: boolean }>({});
  const [proposalOutcome, setProposalOutcome] = useState<{ [marketId: string]: number }>({});
  const [proposalEvidence, setProposalEvidence] = useState<{ [marketId: string]: string }>({});
  const [proposalNote, setProposalNote] = useState<{ [marketId: string]: string }>({});
  const [claimedPositions, setClaimedPositions] = useState<Set<string>>(new Set());
  const [claimSuccess, setClaimSuccess] = useState<{ [marketId: string]: boolean }>({});
  const [claimClaiming, setClaimClaiming] = useState<{ [marketId: string]: boolean }>({});

  const totalValue = positions.reduce((sum, p) => sum + p.value, 0n);
  const openPositions = positions.filter((p) => p.state === "open");
  const claimablePositions = positions.filter((p) => p.state === "claimable");
  const lostPositions = positions.filter((p) => Number(p.pnl) < 0);

  const settledWon = 3;
  const settledLost = 1;
  const activeCount = openPositions.length;

  const handleClaim = (marketId: string) => {
    if (!claimedPositions.has(marketId)) {
      setClaimClaiming({ ...claimClaiming, [marketId]: true });
      setTimeout(() => {
        setClaimClaiming({ ...claimClaiming, [marketId]: false });
        setClaimedPositions(new Set([...claimedPositions, marketId]));
        setClaimSuccess({ ...claimSuccess, [marketId]: true });
      }, 1500);
    }
  };

  return (
    <TerminalScreen>
      <div className="min-h-[100dvh] flex flex-col overflow-x-hidden">
        <PageHeader subtitle="PORTFOLIO" showBack />

        {/* Summary Cards */}
        <PortfolioSummary
          totalValue={totalValue}
          settledWon={settledWon}
          settledLost={settledLost}
          activeCount={activeCount}
          claimableCount={claimablePositions.length}
        />

        {/* Tab Navigation */}
        <div className="border-b border-border-panel px-8 flex gap-2">
          {(["positions", "staking", "history"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-6 py-3 font-mono text-sm font-semibold tracking-[0.08em] border-b-2 cursor-pointer transition-all duration-200",
                activeTab === tab
                  ? "bg-[rgba(202,245,222,0.12)] text-mint border-mint"
                  : "bg-transparent text-text-muted border-transparent"
              )}
            >
              {tab === "positions" ? "POSITIONS" : tab === "staking" ? "DISPUTE VOTING" : "HISTORY"}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 px-8 py-8 overflow-auto max-w-[1400px] mx-auto w-full">
          {activeTab === "positions" && (
            <div className="flex flex-col gap-4">
              {marketNeedingProposal && marketNeedingProposal.state === MarketState.CLOSED && (
                <PortfolioActionRequired
                  market={marketNeedingProposal}
                  proposalOutcome={proposalOutcome}
                  setProposalOutcome={setProposalOutcome}
                  proposalEvidence={proposalEvidence}
                  setProposalEvidence={setProposalEvidence}
                  proposalNote={proposalNote}
                  setProposalNote={setProposalNote}
                  proposalState={proposalState}
                  setProposalState={setProposalState}
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
                claimSuccess={claimSuccess}
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
