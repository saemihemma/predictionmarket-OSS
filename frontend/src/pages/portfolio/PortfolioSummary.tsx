import { cn } from "../../lib/utils";
import { formatValue } from "../../lib/formatting";
import { COLLATERAL_SYMBOL } from "../../lib/market-constants";

interface PortfolioSummaryProps {
  totalValue: bigint;
  settledWon: number;
  settledLost: number;
  activeCount: number;
  claimableCount: number;
}

const CARD = "flex flex-col gap-2 border border-border-panel bg-bg-panel p-4 font-mono";
const LABEL = "text-xs font-semibold uppercase tracking-widest text-text-muted";
const VALUE = "text-lg font-bold tracking-wide text-mint sm:text-xl";
const SUB = "text-xs tracking-wide text-text-dim";

export default function PortfolioSummary({
  totalValue,
  settledWon,
  settledLost,
  activeCount,
  claimableCount,
}: PortfolioSummaryProps) {
  return (
    <div className="border-b border-border-panel">
      <div className="page-shell grid gap-4 py-5 sm:grid-cols-2 xl:grid-cols-4">
        <div className={CARD}>
          <div className={LABEL}>PORTFOLIO VALUE</div>
          <div className={VALUE}>{formatValue(totalValue)}</div>
          <div className={SUB}>{COLLATERAL_SYMBOL} collateral</div>
        </div>

        <div className={CARD}>
          <div className={LABEL}>SETTLED</div>
          <div className={VALUE}>{settledWon} WON / {settledLost} LOST</div>
          <div className={SUB}>Resolved markets</div>
        </div>

        <div className={CARD}>
          <div className={LABEL}>ACTIVE</div>
          <div className={VALUE}>{activeCount} POSITION{activeCount !== 1 ? "S" : ""}</div>
          <div className={SUB}>Open positions</div>
        </div>

        <div className={cn(CARD, claimableCount > 0 && "border-mint shadow-[0_0_12px_rgba(202,245,222,0.2)]")}>
          <div className={LABEL}>CLAIMABLE</div>
          <div className={cn(VALUE, claimableCount === 0 && "text-text-dim")}>
            {claimableCount} {claimableCount === 1 ? "POSITION" : "POSITIONS"}
          </div>
          <div className={SUB}>Ready to claim</div>
        </div>
      </div>
    </div>
  );
}
