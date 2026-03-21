/**
 * MarketDetailResolved: RESOLVED state summary
 * Shows the winning outcome and resolution method
 */

export default function MarketDetailResolved({ market }: { market: any }) {
  return (
    <div className="p-4 bg-bg-panel border border-mint-dim">
      <h3 className="text-[1.1rem] font-bold text-mint mb-3 tracking-[0.1em]">RESOLVED ✓</h3>

      <div className="px-3 py-2 bg-[rgba(202,245,222,0.08)] border border-mint-dim mb-3">
        <div className="text-sm mb-2">
          <span className="text-text-dim">Winning outcome:</span>{" "}
          <span className="text-mint font-semibold">
            {market.outcomeLabels[market.winningOutcome]}
          </span>
        </div>
        <div className="text-xs text-text-muted">
          Resolved via: {market.resolutionMethod || "SDVM Vote"}
        </div>
      </div>
    </div>
  );
}
