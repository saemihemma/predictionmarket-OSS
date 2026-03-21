import { cn } from "../../lib/utils";
import { formatValue } from "../../lib/formatting";

interface PortfolioSummaryProps {
  totalValue: bigint;
  settledWon: number;
  settledLost: number;
  activeCount: number;
  claimableCount: number;
}

const CARD = "p-4 bg-bg-panel border border-border-panel flex flex-col gap-2 font-mono";
const LABEL = "text-xs font-semibold text-text-muted tracking-widest uppercase";
const VALUE = "text-xl font-bold text-mint tracking-wide";
const SUB = "text-xs text-text-dim tracking-wide";

export default function PortfolioSummary({
  totalValue,
  settledWon,
  settledLost,
  activeCount,
  claimableCount,
}: PortfolioSummaryProps) {
  return (
    <div className="border-b border-border-panel px-8 py-6 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-6">
      <div className={CARD}>
        <div className={LABEL}>PORTFOLIO VALUE</div>
        <div className={VALUE}>{formatValue(totalValue)}</div>
        <div className={SUB}>SUFFER tokens</div>
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

      <div className={cn(
        CARD,
        claimableCount > 0 && "border-mint shadow-[0_0_12px_rgba(202,245,222,0.2)]"
      )}>
        <div className={LABEL}>CLAIMABLE</div>
        <div className={cn(VALUE, claimableCount === 0 && "text-text-dim")}>
          {claimableCount} {claimableCount === 1 ? "POSITION" : "POSITIONS"}
        </div>
        <div className={SUB}>Ready to claim</div>
      </div>
    </div>
  );
}
