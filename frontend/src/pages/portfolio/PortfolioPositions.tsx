import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "../../lib/utils";
import { formatValue, formatPnL } from "../../lib/formatting";
import { formatShareAmount } from "../../lib/shares";
import ClaimButton from "../../components/ui/ClaimButton";

interface Position {
  positionId: string;
  marketId: string;
  marketTitle: string;
  outcome: string;
  shares: bigint;
  value: bigint;
  pnl: bigint;
  claimAction: "claim" | "refund_invalid" | null;
  state: "open" | "resolved" | "claimable";
}

type PositionFilter = "all" | "open" | "claimable" | "lost";

interface PortfolioPositionsProps {
  positions: Position[];
  openPositions: Position[];
  claimablePositions: Position[];
  lostPositions: Position[];
  positionFilter: PositionFilter;
  setPositionFilter: (f: PositionFilter) => void;
  claimedPositions: Set<string>;
  claimClaiming: Record<string, boolean>;
  claimErrors: Record<string, string | null>;
  onClaim: (positionId: string) => void;
}

function MetricCell({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 md:block md:text-right">
      <div className="text-sm text-text-dim md:mb-1">{label}</div>
      <div className={cn("text-[0.95rem] text-text", valueClassName)}>{value}</div>
    </div>
  );
}

function PositionShell({
  children,
  tone = "mint",
}: {
  children: ReactNode;
  tone?: "mint" | "orange";
}) {
  return (
    <div
      className={cn(
        "grid gap-3 border border-border-panel px-4 py-3 transition-all duration-200 md:grid-cols-[minmax(0,1fr)_120px_120px_100px] md:items-center",
        tone === "mint"
          ? "hover:border-mint-dim hover:shadow-[0_0_12px_rgba(202,245,222,0.08)]"
          : "hover:border-orange-dim",
      )}
    >
      {children}
    </div>
  );
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
  claimErrors,
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
      <div className="mobile-scroll-row mb-4 border-b border-border-panel">
        <div className="flex min-w-max gap-2 pb-3">
          {(["all", "open", "claimable", "lost"] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setPositionFilter(filter)}
              className={cn(
                "touch-target inline-flex min-h-11 items-center justify-center border-b-2 px-4 py-2 font-mono text-sm font-semibold capitalize tracking-[0.08em] transition-all duration-200",
                positionFilter === filter
                  ? "border-mint bg-[rgba(202,245,222,0.12)] text-mint"
                  : "border-transparent bg-transparent text-text-muted",
              )}
            >
              {filter === "claimable" ? "CLAIMABLE" : filter.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {getFilteredPositions().length === 0 && (
        <div className="px-4 py-8 text-center text-[0.95rem] text-text-muted sm:px-6">
          No {positionFilter === "all" ? "positions" : positionFilter} found.
        </div>
      )}

      {claimablePositions.length > 0 && (positionFilter === "all" || positionFilter === "claimable") && (
        <div className="border border-border-panel bg-bg-panel p-4">
          <h3 className="mb-4 text-[1.1rem] font-bold tracking-[0.1em] text-mint">
            CLAIMABLE POSITIONS ({claimablePositions.length})
          </h3>
          <div className="flex flex-col gap-[0.8rem]">
            {claimablePositions.map((position) => (
              <PositionShell key={position.positionId}>
                <Link to={`/markets/${position.marketId}`} className="text-inherit no-underline">
                  <div>
                    <div className="text-[0.95rem] font-semibold text-text">{position.marketTitle}</div>
                    <div className="mt-1 text-sm text-text-dim">Outcome: {position.outcome}</div>
                  </div>
                </Link>
                <MetricCell label="SHARES" value={formatShareAmount(position.shares)} />
                <MetricCell label="VALUE" value={formatValue(position.value)} valueClassName="text-mint" />
                <ClaimButton
                  positionId={position.positionId}
                  claimAction={position.claimAction ?? "claim"}
                  value={position.value}
                  isClaimed={claimedPositions.has(position.positionId)}
                  isClaiming={claimClaiming[position.positionId] ?? false}
                  claimError={claimErrors[position.positionId] ?? null}
                  onClaim={onClaim}
                />
              </PositionShell>
            ))}
          </div>
        </div>
      )}

      {openPositions.length > 0 && (positionFilter === "all" || positionFilter === "open") && (
        <div className="border border-border-panel bg-bg-panel p-4">
          <h3 className="mb-4 text-[1.1rem] font-bold tracking-[0.1em] text-mint">OPEN POSITIONS ({openPositions.length})</h3>
          <div className="flex flex-col gap-[0.8rem]">
            {openPositions.map((position) => (
              <Link key={position.positionId} to={`/markets/${position.marketId}`} className="text-inherit no-underline">
                <PositionShell>
                  <div>
                    <div className="text-[0.95rem] font-semibold text-text">{position.marketTitle}</div>
                    <div className="mt-1 text-sm text-text-dim">Outcome: {position.outcome}</div>
                  </div>
                  <MetricCell label="SHARES" value={formatShareAmount(position.shares)} />
                  <MetricCell label="VALUE" value={formatValue(position.value)} valueClassName="text-mint" />
                  <MetricCell
                    label="P&L"
                    value={formatPnL(position.pnl)}
                    valueClassName={position.pnl >= 0n ? "font-semibold text-mint" : "font-semibold text-orange"}
                  />
                </PositionShell>
              </Link>
            ))}
          </div>
        </div>
      )}

      {lostPositions.length > 0 && positionFilter === "lost" && (
        <div className="border border-border-panel bg-bg-panel p-4">
          <h3 className="mb-4 text-[1.1rem] font-bold tracking-[0.1em] text-orange">SETTLED LOSSES ({lostPositions.length})</h3>
          <div className="flex flex-col gap-[0.8rem]">
            {lostPositions.map((position) => (
              <Link key={position.positionId} to={`/markets/${position.marketId}`} className="text-inherit no-underline">
                <PositionShell tone="orange">
                  <div>
                    <div className="text-[0.95rem] font-semibold text-text">{position.marketTitle}</div>
                    <div className="mt-1 text-sm text-text-dim">Outcome: {position.outcome}</div>
                  </div>
                  <MetricCell label="SHARES" value={formatShareAmount(position.shares)} />
                  <MetricCell label="VALUE" value={formatValue(position.value)} valueClassName="text-text-dim" />
                  <MetricCell label="P&L" value={formatPnL(position.pnl)} valueClassName="font-semibold text-orange" />
                </PositionShell>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
