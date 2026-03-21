/**
 * MarketDetailProposal: CLOSED state proposal form
 * Allows users to propose an outcome with optional evidence and notes
 */

export default function MarketDetailProposal({
  market,
  proposedOutcome,
  setProposedOutcome,
}: {
  market: any;
  proposedOutcome: number;
  setProposedOutcome: (n: number) => void;
}) {
  return (
    <div className="p-4 bg-bg-panel border-2 border-orange-dim">
      <h3 className="text-[1.1rem] font-bold text-orange mb-3 tracking-[0.1em]">PROPOSE OUTCOME</h3>

      <div className="flex flex-col gap-3">
        {/* Outcome selector */}
        <div>
          <label className="text-[0.95rem] font-medium text-mint block mb-2">
            OUTCOME
          </label>
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

        {/* Evidence URL */}
        <div>
          <label className="text-[0.95rem] font-medium text-mint block mb-2">
            EVIDENCE (optional)
          </label>
          <input
            type="url"
            placeholder="https://example.com/evidence..."
            className="w-full px-3 py-2 text-base bg-bg-terminal text-text border border-border-panel outline-none font-mono"
          />
          <div className="text-sm text-text-dim mt-1">
            Link to supporting evidence
          </div>
        </div>

        {/* Note field */}
        <div>
          <label className="text-[0.95rem] font-medium text-mint block mb-2">
            NOTE (optional)
          </label>
          <textarea
            placeholder="Brief explanation for your proposal..."
            className="w-full px-3 py-2 text-base bg-bg-terminal text-text border border-border-panel outline-none font-mono min-h-20 resize-vertical"
          />
          <div className="text-sm text-text-dim mt-1">
            Explain your outcome choice
          </div>
        </div>

        {/* Submit button */}
        <button
          className="px-3 py-2 font-mono text-sm font-semibold tracking-[0.08em] bg-[rgba(202,245,222,0.12)] text-mint border border-mint-dim cursor-pointer transition-all duration-200 hover:shadow-[0_0_12px_rgba(202,245,222,0.15)]"
        >
          PROPOSE OUTCOME
        </button>
      </div>
    </div>
  );
}
