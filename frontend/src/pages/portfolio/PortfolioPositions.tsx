import { Link } from "react-router-dom";
import { cn } from "../../lib/utils";
import { formatValue, formatPnL } from "../../lib/formatting";
import ClaimButton from "../../components/ui/ClaimButton";

interface Position {
  marketId: string;
  marketTitle: string;
  outcome: string;
  shares: bigint;
  value: bigint;
  pnl: bigint;
  state: "open" | "resolved" | "claimable";
}

interface PortfolioPositionsProps {
  positions: Position[];
  openPositions: Position[];
  claimablePositions: Position[];
  lostPositions: Position[];
  positionFilter: string;
  setPositionFilter: (f: string) => void;
  claimedPositions: Set<string>;
  claimClaiming: Record<string, boolean>;
  claimSuccess: Record<string, boolean>;
  onClaim: (marketId: string) => void;
}

export default function PortfolioPositions({
  positions,
  openPositions,
  claimablePositions,
  lostPositions,
  positionFilter,
  setPositionFilter,
  claimedPositions,
  claimClaiming,
  claimSuccess,
  onClaim,
}: PortfolioPositionsProps) {
  const getFilteredPositions = () => {
    if (positionFilter === "all") return positions;
    if (positionFilter === "open") return openPositions;
    if (positionFilter === "claimable") return claimablePositions;
    if (positionFilter === "lost") return lostPositions;
    return positions;
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Position Filters */}
      <div className="flex gap-2 mb-4 pb-3 border-b border-border-panel">
        {(["all", "open", "claimable", "lost"] as const).map((filter) => (
          <button
            key={filter}
            onClick={() => setPositionFilter(filter)}
            className={cn(
              "px-4 py-2 font-mono text-sm font-semibold tracking-[0.08em] border-b-2 cursor-pointer transition-all duration-200 capitalize",
              positionFilter === filter
                ? "bg-[rgba(202,245,222,0.12)] text-mint border-mint"
                : "bg-transparent text-text-muted border-transparent"
            )}
          >
            {filter === "all" ? "ALL" : filter === "open" ? "OPEN" : filter === "claimable" ? "CLAIMABLE" : "LOST"}
          </button>
        ))}
      </div>

      {getFilteredPositions().length === 0 && (
        <div className="px-8 py-8 text-center text-text-muted text-[0.95rem]">
          No {positionFilter === "all" ? "positions" : positionFilter} found.
        </div>
      )}

      {claimablePositions.length > 0 && (positionFilter === "all" || positionFilter === "claimable") && (
        <div className="bg-bg-panel border border-border-panel p-4 mb-6">
          <h3 className="text-[1.1rem] font-bold text-mint mb-4 tracking-[0.1em]">CLAIMABLE WINNINGS ({claimablePositions.length})</h3>
          <div className="flex flex-col gap-[0.8rem]">
            {claimablePositions.map((pos) => (
              <div
                key={pos.marketId}
                className="px-4 py-3 border border-border-panel grid grid-cols-[1fr_120px_120px_100px] gap-4 items-center transition-all duration-200 bg-[rgba(202,245,222,0.05)] hover:border-mint-dim hover:shadow-[0_0_12px_rgba(202,245,222,0.08)]"
              >
                <Link
                  to={`/markets/${pos.marketId}`}
                  className="no-underline cursor-pointer"
                >
                  <div>
                    <div className="text-[0.95rem] text-text font-semibold">
                      {pos.marketTitle}
                    </div>
                    <div className="text-sm text-text-dim mt-1">
                      Outcome: {pos.outcome}
                    </div>
                  </div>
                </Link>
                <div className="text-right">
                  <div className="text-sm text-text-dim mb-1">SHARES</div>
                  <div className="text-[0.95rem] text-text">
                    {Number(pos.shares).toLocaleString()}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-text-dim mb-1">VALUE</div>
                  <div className="text-[0.95rem] text-mint">
                    {formatValue(pos.value)}
                  </div>
                </div>
                <ClaimButton
                  marketId={pos.marketId}
                  value={pos.value}
                  isClaimed={claimedPositions.has(pos.marketId)}
                  isClaiming={claimClaiming[pos.marketId] ?? false}
                  onClaim={onClaim}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {openPositions.length > 0 && (positionFilter === "all" || positionFilter === "open") && (
        <div className="bg-bg-panel border border-border-panel p-4">
          <h3 className="text-[1.1rem] font-bold text-mint mb-4 tracking-[0.1em]">OPEN POSITIONS ({openPositions.length})</h3>
          <div className="flex flex-col gap-[0.8rem]">
            {openPositions.map((pos) => (
              <Link
                key={pos.marketId}
                to={`/markets/${pos.marketId}`}
                className="no-underline"
              >
                <div className="px-4 py-3 border border-border-panel grid grid-cols-[1fr_120px_120px_100px] gap-4 items-center cursor-pointer transition-all duration-200 hover:border-mint-dim hover:shadow-[0_0_12px_rgba(202,245,222,0.08)]">
                  <div>
                    <div className="text-[0.95rem] text-text font-semibold">
                      {pos.marketTitle}
                    </div>
                    <div className="text-sm text-text-dim mt-1">
                      Outcome: {pos.outcome}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-text-dim mb-1">SHARES</div>
                    <div className="text-[0.95rem] text-text">
                      {Number(pos.shares).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-text-dim mb-1">VALUE</div>
                    <div className="text-[0.95rem] text-mint">
                      {formatValue(pos.value)}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-text-dim mb-1">P&L</div>
                    <div className={cn("text-[0.95rem] font-semibold", Number(pos.pnl) >= 0 ? "text-mint" : "text-orange")}>
                      {formatPnL(pos.pnl)}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
