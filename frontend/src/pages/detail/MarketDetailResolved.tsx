/**
 * MarketDetailResolved: RESOLVED state summary
 * Shows the winning outcome from the on-chain resolution record.
 */

export default function MarketDetailResolved({
  market,
  isCreator,
  onReturnCreatorBond,
  creatorBondPending,
  creatorBondError,
}: {
  market: any;
  isCreator: boolean;
  onReturnCreatorBond: () => void | Promise<void>;
  creatorBondPending: boolean;
  creatorBondError: string | null;
}) {
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

      {resolution.finalized && (
        <div className="border border-border-panel bg-[rgba(202,245,222,0.04)] px-3 py-3 text-sm text-text">
          <div className="mb-1 font-semibold text-mint">SETTLEMENT STATUS</div>
          <div>This resolution is finalized on-chain. Claims and creator bond return can now proceed.</div>
        </div>
      )}

      {isCreator && resolution.finalized && (
        <div className="mt-3">
          {creatorBondError && (
            <div className="mb-3 border border-orange-dim bg-[rgba(221,122,31,0.08)] px-3 py-2 text-sm text-orange">
              {creatorBondError}
            </div>
          )}
          <button
            onClick={() => {
              void onReturnCreatorBond();
            }}
            disabled={creatorBondPending}
            className={`touch-target min-h-11 w-full border px-3 py-2 font-mono text-sm font-semibold tracking-[0.08em] ${
              creatorBondPending
                ? "cursor-not-allowed border-border-panel bg-[rgba(0,0,0,0.3)] text-text-dim"
                : "border-mint-dim bg-[rgba(202,245,222,0.12)] text-mint"
            }`}
          >
            {creatorBondPending ? "RETURNING CREATOR BOND" : "RETURN CREATOR BOND"}
          </button>
        </div>
      )}
    </div>
  );
}
