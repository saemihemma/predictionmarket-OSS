import CountdownTimer from "../../components/ui/CountdownTimer";
import { formatCollateralAmount } from "../../lib/collateral";

export default function MarketDetailPending({
  market,
  disputeBondAmountRaw,
  disputeExpanded,
  setDisputeExpanded,
  proposedOutcome,
  setProposedOutcome,
  disputeReason,
  setDisputeReason,
  onSubmitDispute,
  isSubmitting,
  error,
}: {
  market: any;
  disputeBondAmountRaw: bigint;
  disputeExpanded: boolean;
  setDisputeExpanded: (b: boolean) => void;
  proposedOutcome: number;
  setProposedOutcome: (n: number) => void;
  disputeReason: string;
  setDisputeReason: (s: string) => void;
  onSubmitDispute: () => void | Promise<void>;
  isSubmitting: boolean;
  error: string | null;
}) {
  const resolution = market.resolution;

  if (!resolution) {
    return null;
  }

  const disputeWindowDuration = Math.max(1, resolution.disputeWindowEndMs - resolution.resolvedAtMs);
  const disputeProgress = Math.min(
    100,
    Math.max(0, ((Date.now() - resolution.resolvedAtMs) / disputeWindowDuration) * 100),
  );
  const canSubmitDispute = Boolean(disputeReason) && !isSubmitting;

  return (
    <>
      <div className="border border-border-panel bg-bg-panel p-4 sm:p-5">
        <h3 className="mb-3 text-[1.1rem] font-bold tracking-[0.1em] text-mint">PROPOSED OUTCOME</h3>

        <div className="mb-3 border border-mint-dim bg-[rgba(202,245,222,0.12)] px-3 py-2">
          <div className="mb-2 flex items-center gap-2 text-[0.95rem] font-semibold text-text">
            <span className="inline-block h-4 w-4 bg-mint" />
            {market.outcomeLabels[resolution.resolvedOutcome]}
          </div>
          <div className="text-sm text-text-muted">
            Proposed by {resolution.resolverAddress.slice(0, 6)}...{resolution.resolverAddress.slice(-4)}
          </div>
        </div>

        {resolution.evidenceHash && (
          <div className="mb-3 break-all border border-tribe-b-dim bg-[rgba(77,184,212,0.08)] px-3 py-2 text-sm text-tribe-b">
            Evidence hash: {String(resolution.evidenceHash).slice(0, 18)}...
          </div>
        )}

        <div className="mb-3 border border-mint-dim bg-[rgba(202,245,222,0.08)] px-3 py-2 text-sm leading-relaxed">
          <div className="mb-1 font-semibold text-mint">RESOLUTION TRACK</div>
          <div className="text-text">Finalization stays locked until the dispute window ends or a dispute escalates this market.</div>
        </div>

        <div className="mb-2 text-sm font-semibold tracking-[0.06em] text-text-muted">DISPUTE WINDOW</div>

        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <div className="relative h-1.5 overflow-hidden border border-border-panel bg-orange-dim">
              <div className="h-full bg-orange transition-all duration-1000 linear" style={{ width: `${disputeProgress}%` }} />
            </div>
          </div>
          <div className="text-sm font-semibold tracking-[0.06em] text-orange sm:text-right">
            <CountdownTimer targetMs={resolution.disputeWindowEndMs} />
          </div>
        </div>

        <button
          onClick={() => setDisputeExpanded(!disputeExpanded)}
          className="touch-target min-h-11 w-full border border-orange bg-[rgba(221,122,31,0.12)] px-3 py-2 font-mono text-sm font-semibold tracking-[0.08em] text-orange transition-all duration-200 hover:shadow-[0_0_12px_rgba(221,122,31,0.3)]"
        >
          {disputeExpanded ? "CANCEL" : "DISPUTE THIS OUTCOME"}
        </button>
      </div>

      {disputeExpanded && (
        <div className="border border-orange-dim bg-bg-panel p-4 sm:p-5">
          <h3 className="mb-3 text-[1.1rem] font-bold tracking-[0.1em] text-orange">DISPUTE THIS RESOLUTION</h3>
          <div className="flex flex-col gap-4">
            <div className="border border-orange-dim bg-[rgba(221,122,31,0.08)] px-2 py-1.5 text-sm text-orange">
              Filing a dispute costs{" "}
              {formatCollateralAmount(disputeBondAmountRaw, { withSymbol: true })} and
              escalates to SDVM tokenholder vote.
            </div>

            <div>
              <label className="mb-2 block text-[0.95rem] font-medium text-mint">Required Bond</label>
              <div className="border border-border-panel bg-bg-terminal px-3 py-2 text-base text-text">
                {formatCollateralAmount(disputeBondAmountRaw, { withSymbol: true })} (read-only)
              </div>
            </div>

            <div>
              <label className="mb-2 block text-[0.95rem] font-medium text-mint">Proposed Outcome</label>
              <select
                value={proposedOutcome}
                onChange={(event) => setProposedOutcome(Number(event.target.value))}
                className="touch-target min-h-11 w-full border border-border-panel bg-bg-terminal px-3 py-2 font-mono text-base text-text outline-none"
              >
                {market.outcomeLabels.map((label: string, index: number) => (
                  <option key={index} value={index}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-[0.95rem] font-medium text-mint">Reason for Dispute</label>
              <textarea
                value={disputeReason}
                onChange={(event) => setDisputeReason(event.target.value)}
                placeholder="Explain why you believe the resolution was incorrect..."
                className="min-h-[100px] w-full resize-vertical border border-border-panel bg-bg-terminal px-3 py-2 font-mono text-[0.95rem] text-text outline-none"
              />
            </div>

            {error && <div className="border border-orange-dim bg-[rgba(221,122,31,0.08)] px-3 py-2 text-sm text-orange">{error}</div>}

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                onClick={() => setDisputeExpanded(false)}
                className="touch-target min-h-11 flex-1 border border-tribe-b-dim bg-[rgba(77,184,212,0.12)] px-3 py-2 font-mono text-sm font-semibold tracking-[0.08em] text-tribe-b"
              >
                CANCEL
              </button>
              <button
                onClick={() => {
                  void onSubmitDispute();
                }}
                className={`touch-target min-h-11 flex-1 border px-3 py-2 font-mono text-sm font-semibold tracking-[0.08em] transition-colors ${
                  canSubmitDispute
                    ? "cursor-pointer border-orange bg-[rgba(221,122,31,0.12)] text-orange"
                    : "cursor-not-allowed border-border-panel bg-[rgba(0,0,0,0.3)] text-text-dim"
                }`}
                disabled={!canSubmitDispute}
              >
                {isSubmitting ? "SUBMITTING" : "SUBMIT DISPUTE"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
