export default function MarketDetailProposal({
  market,
  proposedOutcome,
  setProposedOutcome,
  proposalEvidence,
  setProposalEvidence,
  proposalNote,
  setProposalNote,
  onSubmit,
  submitLabel,
  helperText,
  isSubmitting,
  error,
}: {
  market: any;
  proposedOutcome: number;
  setProposedOutcome: (n: number) => void;
  proposalEvidence: string;
  setProposalEvidence: (value: string) => void;
  proposalNote: string;
  setProposalNote: (value: string) => void;
  onSubmit: () => void | Promise<void>;
  submitLabel: string;
  helperText: string;
  isSubmitting: boolean;
  error: string | null;
}) {
  return (
    <div className="border-2 border-orange-dim bg-bg-panel p-4 sm:p-5">
      <h3 className="mb-3 text-[1.1rem] font-bold tracking-[0.1em] text-orange">PROPOSE OUTCOME</h3>

      <div className="flex flex-col gap-3">
        <div>
          <label className="mb-2 block text-[0.95rem] font-medium text-mint">OUTCOME</label>
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
          <label className="mb-2 block text-[0.95rem] font-medium text-mint">EVIDENCE (optional)</label>
          <input
            type="url"
            value={proposalEvidence}
            onChange={(event) => setProposalEvidence(event.target.value)}
            placeholder="https://example.com/evidence..."
            className="touch-target min-h-11 w-full border border-border-panel bg-bg-terminal px-3 py-2 font-mono text-base text-text outline-none"
          />
          <div className="mt-1 text-sm text-text-dim">{helperText}</div>
        </div>

        <div>
          <label className="mb-2 block text-[0.95rem] font-medium text-mint">NOTE (optional)</label>
          <textarea
            value={proposalNote}
            onChange={(event) => setProposalNote(event.target.value)}
            placeholder="Brief explanation for your proposal..."
            className="min-h-24 w-full resize-vertical border border-border-panel bg-bg-terminal px-3 py-2 font-mono text-base text-text outline-none"
          />
          <div className="mt-1 text-sm text-text-dim">Freeform context is hashed into the on-chain evidence payload.</div>
        </div>

        {error && <div className="border border-orange-dim bg-[rgba(221,122,31,0.08)] px-3 py-2 text-sm text-orange">{error}</div>}

        <button
          onClick={() => {
            void onSubmit();
          }}
          disabled={isSubmitting}
          className="touch-target min-h-11 border border-mint-dim bg-[rgba(202,245,222,0.12)] px-3 py-2 font-mono text-sm font-semibold tracking-[0.08em] text-mint transition-all duration-200 hover:shadow-[0_0_12px_rgba(202,245,222,0.15)] disabled:cursor-not-allowed disabled:border-border-panel disabled:bg-[rgba(0,0,0,0.3)] disabled:text-text-dim"
        >
          {isSubmitting ? "SUBMITTING" : submitLabel}
        </button>
      </div>
    </div>
  );
}
