/**
 * MarketDetailPending: RESOLUTION_PENDING state
 * Shows proposed outcome + dispute window, plus dispute expansion form
 */

import CountdownTimer from "../../components/ui/CountdownTimer";

export default function MarketDetailPending({
  market,
  disputeExpanded,
  setDisputeExpanded,
  proposedOutcome,
  setProposedOutcome,
  disputeReason,
  setDisputeReason,
}: {
  market: any;
  disputeExpanded: boolean;
  setDisputeExpanded: (b: boolean) => void;
  proposedOutcome: number;
  setProposedOutcome: (n: number) => void;
  disputeReason: string;
  setDisputeReason: (s: string) => void;
}) {
  return (
    <>
      {/* Proposed outcome display */}
      <div className="p-4 bg-bg-panel border border-border-panel">
        <h3 className="text-[1.1rem] font-bold text-mint mb-3 tracking-[0.1em]">PROPOSED OUTCOME</h3>

        <div className="px-3 py-2 bg-[rgba(202,245,222,0.12)] border border-mint-dim mb-3">
          <div className="flex items-center gap-2 text-[0.95rem] font-semibold text-text mb-2">
            <span className="inline-block w-4 h-4 bg-mint rounded-sm" />
            {market.outcomeLabels[market.proposal.proposedOutcomeId]}
          </div>
          <div className="text-sm text-text-muted">
            Proposed by {market.proposal.proposerAddress.slice(0, 6)}...{market.proposal.proposerAddress.slice(-4)}
          </div>
        </div>

        {market.proposal.evidenceUrl && (
          <div className="mb-3 px-2 py-1.5 bg-[rgba(77,184,212,0.08)] border border-tribe-b-dim text-sm">
            Evidence:{" "}
            <a
              href={market.proposal.evidenceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-tribe-b underline cursor-pointer"
            >
              {market.proposal.evidenceUrl.split("/").pop() || "View evidence"}
            </a>
          </div>
        )}

        {market.proposal.note && (
          <div className="mb-3 px-3 py-2 bg-[rgba(202,245,222,0.08)] border border-mint-dim text-sm leading-relaxed">
            <div className="font-semibold mb-1 text-mint">NOTE:</div>
            <div className="text-text">{market.proposal.note}</div>
          </div>
        )}

        <div className="text-sm font-semibold text-text-muted mb-2 tracking-[0.06em]">DISPUTE WINDOW</div>

        <div className="flex justify-between items-center mb-2">
          <div className="flex-1 mr-4">
            <div className="h-1.5 bg-orange-dim border border-border-panel relative overflow-hidden">
              <div
                className="h-full bg-orange transition-all duration-1000 linear"
                style={{ width: "35%" }}
              />
            </div>
          </div>
          <div className="text-sm font-semibold text-orange tracking-[0.06em] min-w-[100px] text-right">
            <CountdownTimer targetMs={market.proposal.disputeWindowEndMs} />
          </div>
        </div>

        <button
          onClick={() => setDisputeExpanded(!disputeExpanded)}
          className="w-full px-3 py-2 font-mono text-sm font-semibold tracking-[0.08em] bg-[rgba(221,122,31,0.12)] text-orange border border-orange cursor-pointer transition-all duration-200 mt-3 hover:shadow-[0_0_12px_rgba(221,122,31,0.3)]"
        >
          {disputeExpanded ? "CANCEL" : "DISPUTE THIS OUTCOME"}
        </button>
      </div>

      {/* Dispute expansion form */}
      {disputeExpanded && (
        <div>
          <h3 className="text-[1.1rem] font-bold text-orange mb-3 tracking-[0.1em]">DISPUTE THIS RESOLUTION</h3>
          <div className="p-4 bg-bg-panel border border-orange-dim">
            <div className="flex flex-col gap-4">
              <div className="text-sm text-orange px-2 py-1.5 bg-[rgba(221,122,31,0.08)] border border-orange-dim">
                Filing a dispute costs 5,000 SFR and escalates to SDVM tokenholder vote.
              </div>

              <div>
                <label className="text-[0.95rem] font-medium text-mint block mb-2">Required Bond</label>
                <div className="px-3 py-2 text-base bg-bg-terminal border border-border-panel text-text">
                  5,000 SFR (read-only)
                </div>
              </div>

              <div>
                <label className="text-[0.95rem] font-medium text-mint block mb-2">Proposed Outcome</label>
                <select
                  value={proposedOutcome}
                  onChange={(e) => setProposedOutcome(Number(e.target.value))}
                  className="w-full px-3 py-2 text-base bg-bg-terminal text-text border border-border-panel outline-none font-mono"
                >
                  {market.outcomeLabels.map((label: string, i: number) => (
                    <option key={i} value={i}>{label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[0.95rem] font-medium text-mint block mb-2">Reason for Dispute</label>
                <textarea
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  placeholder="Explain why you believe the resolution was incorrect..."
                  className="w-full px-3 py-2 text-[0.95rem] bg-bg-terminal text-text border border-border-panel outline-none min-h-[100px] resize-vertical font-mono"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setDisputeExpanded(false)}
                  className="flex-1 px-3 py-2 font-mono text-sm font-semibold tracking-[0.08em] bg-[rgba(77,184,212,0.12)] text-tribe-b border border-tribe-b-dim cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  className="flex-1 px-3 py-2 font-mono text-sm font-semibold tracking-[0.08em] cursor-pointer transition-colors"
                  style={{
                    background: disputeReason ? "rgba(221, 122, 31, 0.12)" : "rgba(0, 0, 0, 0.3)",
                    color: disputeReason ? "var(--orange)" : "var(--text-dim)",
                    borderColor: disputeReason ? "var(--orange)" : "var(--border-panel)",
                    borderWidth: "1px",
                    cursor: disputeReason ? "pointer" : "not-allowed",
                  }}
                  disabled={!disputeReason}
                >
                  SUBMIT DISPUTE
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
