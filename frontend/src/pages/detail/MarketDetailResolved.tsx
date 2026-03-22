/**
 * MarketDetailResolved: RESOLVED state summary
 * Shows the winning outcome from the on-chain resolution record.
 */

export default function MarketDetailResolved({ market }: { market: any }) {
  const resolution = market.resolution;

  if (!resolution) {
    return null;
  }

  return (
    <div className="p-4 bg-bg-panel border border-mint-dim">
      <h3 className="text-[1.1rem] font-bold text-mint mb-3 tracking-[0.1em]">RESOLVED</h3>

      <div className="px-3 py-2 bg-[rgba(202,245,222,0.08)] border border-mint-dim mb-3">
        <div className="text-sm mb-2">
          <span className="text-text-dim">Winning outcome:</span>{" "}
          <span className="text-mint font-semibold">
            {market.outcomeLabels[resolution.resolvedOutcome]}
          </span>
        </div>
        <div className="text-xs text-text-muted">
          Resolved by {resolution.resolverAddress.slice(0, 6)}...{resolution.resolverAddress.slice(-4)}
        </div>
      </div>
    </div>
  );
}
