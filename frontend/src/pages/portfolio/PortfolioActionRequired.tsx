import CountdownTimer from "../../components/ui/CountdownTimer";

interface PortfolioActionRequiredProps {
  market: any;
  proposalOutcome: Record<string, number>;
  setProposalOutcome: (v: Record<string, number>) => void;
  proposalEvidence: Record<string, string>;
  setProposalEvidence: (v: Record<string, string>) => void;
  proposalNote: Record<string, string>;
  setProposalNote: (v: Record<string, string>) => void;
  proposalState: Record<string, boolean>;
  setProposalState: (v: Record<string, boolean>) => void;
}

export default function PortfolioActionRequired({
  market,
  proposalOutcome,
  setProposalOutcome,
  proposalEvidence,
  setProposalEvidence,
  proposalNote,
  setProposalNote,
  proposalState,
  setProposalState,
}: PortfolioActionRequiredProps) {
  if (!market) return null;

  return (
    <div className="bg-bg-panel border-2 border-orange-dim rounded-sm p-6 mb-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-[1.1rem] font-bold text-orange tracking-[0.1em] flex items-center gap-2 m-0">
          ⚠ ACTION REQUIRED
        </h3>
        <div className="text-sm font-semibold text-orange tracking-[0.06em]">
          PROPOSE WITHIN: <CountdownTimer targetMs={market.resolveDeadlineMs} />
        </div>
      </div>

      <div className="p-4 bg-[rgba(221,122,31,0.08)] border border-orange-dim mb-4">
        <div className="text-base font-semibold text-text mb-2">
          {market.title}
        </div>
        <div className="text-[0.95rem] text-text-muted mb-4">
          Market closed 2 hours ago. Propose the outcome before the deadline.
        </div>

        <div className="flex flex-col gap-[0.8rem]">
          {/* Outcome selector */}
          <div>
            <label className="text-[0.95rem] font-medium text-mint block mb-2">
              OUTCOME
            </label>
            <select
              value={proposalOutcome[market.id] ?? 0}
              onChange={(e) => setProposalOutcome({ ...proposalOutcome, [market.id]: Number(e.target.value) })}
              className="w-full px-4 py-3 text-base bg-bg-terminal text-text border border-border-panel outline-none font-mono"
            >
              {market.outcomeLabels.map((label: string, i: number) => (
                <option key={i} value={i}>{label}</option>
              ))}
            </select>
          </div>

          {/* Evidence URL */}
          <div>
            <label className="text-[0.95rem] font-medium text-mint block mb-2">
              EVIDENCE (optional)
            </label>
            <input
              type="url"
              value={proposalEvidence[market.id] ?? ""}
              onChange={(e) => setProposalEvidence({ ...proposalEvidence, [market.id]: e.target.value })}
              placeholder="https://binance.com/eth-price..."
              className="w-full px-4 py-3 text-base bg-bg-terminal text-text border border-border-panel outline-none font-mono"
            />
            <div className="text-sm text-text-dim mt-1">
              Link to supporting evidence (e.g., exchange API, chart)
            </div>
          </div>

          {/* Note field */}
          <div>
            <label className="text-[0.95rem] font-medium text-mint block mb-2">
              NOTE (optional)
            </label>
            <textarea
              value={proposalNote[market.id] ?? ""}
              onChange={(e) => setProposalNote({ ...proposalNote, [market.id]: e.target.value })}
              placeholder="Brief explanation for your proposal..."
              className="w-full px-4 py-3 text-base bg-bg-terminal text-text border border-border-panel outline-none font-mono min-h-[80px] resize-vertical"
            />
            <div className="text-sm text-text-dim mt-1">
              Explain your outcome choice (e.g., "ETH reached $3,142 on March 15 per Binance daily close")
            </div>
          </div>

          {/* Propose button */}
          <button
            onClick={() => {
              setProposalState({ ...proposalState, [market.id]: true });
              // Show success state
              setTimeout(() => {
                alert("Proposal submitted! Market now in RESOLUTION_PENDING state.");
              }, 100);
            }}
            className="px-4 py-3 font-mono text-sm font-semibold tracking-[0.08em] bg-[rgba(202,245,222,0.12)] text-mint border border-mint-dim cursor-pointer transition-all duration-200 hover:shadow-[0_0_12px_rgba(202,245,222,0.15)]"
          >
            PROPOSE OUTCOME
          </button>

          {/* Deadline warning */}
          <div className="px-4 py-3 bg-[rgba(221,122,31,0.08)] border border-orange-dim text-sm text-orange leading-relaxed">
            If not proposed within deadline, market becomes INVALID and your 500 SFR creation bond is forfeited.
          </div>
        </div>
      </div>
    </div>
  );
}
