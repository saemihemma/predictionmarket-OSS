import CountdownTimer from "../../components/ui/CountdownTimer";
import { COLLATERAL_SYMBOL } from "../../lib/market-constants";

interface PortfolioActionRequiredProps {
  market: any;
  proposalOutcome: Record<string, number>;
  setProposalOutcome: (v: Record<string, number>) => void;
  proposalEvidence: Record<string, string>;
  setProposalEvidence: (v: Record<string, string>) => void;
  proposalNote: Record<string, string>;
  setProposalNote: (v: Record<string, string>) => void;
  proposalSubmitting: Record<string, boolean>;
  proposalErrors: Record<string, string | null>;
  onSubmit: (marketId: string) => void | Promise<void>;
}

export default function PortfolioActionRequired({
  market,
  proposalOutcome,
  setProposalOutcome,
  proposalEvidence,
  setProposalEvidence,
  proposalNote,
  setProposalNote,
  proposalSubmitting,
  proposalErrors,
  onSubmit,
}: PortfolioActionRequiredProps) {
  if (!market) return null;

  return (
    <div className="mb-4 border-2 border-orange-dim bg-bg-panel p-4 sm:p-6">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="m-0 flex items-center gap-2 text-[1.1rem] font-bold tracking-[0.1em] text-orange">
          ACTION REQUIRED
        </h3>
        <div className="text-sm font-semibold tracking-[0.06em] text-orange">
          PROPOSE WITHIN: <CountdownTimer targetMs={market.resolveDeadlineMs} />
        </div>
      </div>

      <div className="border border-orange-dim bg-[rgba(221,122,31,0.08)] p-4">
        <div className="mb-2 text-base font-semibold text-text">{market.title}</div>
        <div className="mb-4 text-[0.95rem] text-text-muted">
          Market closed. Submit the creator resolution before the deadline or the creation bond can be forfeited.
        </div>

        <div className="flex flex-col gap-[0.8rem]">
          <div>
            <label className="mb-2 block text-[0.95rem] font-medium text-mint">OUTCOME</label>
            <select
              value={proposalOutcome[market.id] ?? 0}
              onChange={(event) => setProposalOutcome({ ...proposalOutcome, [market.id]: Number(event.target.value) })}
              className="touch-target min-h-11 w-full border border-border-panel bg-bg-terminal px-4 py-3 font-mono text-base text-text outline-none"
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
              value={proposalEvidence[market.id] ?? ""}
              onChange={(event) => setProposalEvidence({ ...proposalEvidence, [market.id]: event.target.value })}
              placeholder="https://source.example/evidence"
              className="touch-target min-h-11 w-full border border-border-panel bg-bg-terminal px-4 py-3 font-mono text-base text-text outline-none"
            />
            <div className="mt-1 text-sm text-text-dim">This URL is hashed into the proposal payload for auditability.</div>
          </div>

          <div>
            <label className="mb-2 block text-[0.95rem] font-medium text-mint">NOTE (optional)</label>
            <textarea
              value={proposalNote[market.id] ?? ""}
              onChange={(event) => setProposalNote({ ...proposalNote, [market.id]: event.target.value })}
              placeholder="Brief explanation for your proposal..."
              className="min-h-[80px] w-full resize-vertical border border-border-panel bg-bg-terminal px-4 py-3 font-mono text-base text-text outline-none"
            />
            <div className="mt-1 text-sm text-text-dim">Freeform context is included in the hashed evidence payload.</div>
          </div>

          {proposalErrors[market.id] && (
            <div className="border border-orange-dim bg-[rgba(221,122,31,0.08)] px-4 py-3 text-sm leading-relaxed text-orange">
              {proposalErrors[market.id]}
            </div>
          )}

          <button
            onClick={() => {
              void onSubmit(market.id);
            }}
            disabled={proposalSubmitting[market.id] ?? false}
            className="touch-target min-h-11 border border-mint-dim bg-[rgba(202,245,222,0.12)] px-4 py-3 font-mono text-sm font-semibold tracking-[0.08em] text-mint transition-all duration-200 hover:shadow-[0_0_12px_rgba(202,245,222,0.15)] disabled:cursor-not-allowed disabled:border-border-panel disabled:bg-[rgba(0,0,0,0.3)] disabled:text-text-dim"
          >
            {proposalSubmitting[market.id] ? "SUBMITTING" : "PROPOSE OUTCOME"}
          </button>

          <div className="border border-orange-dim bg-[rgba(221,122,31,0.08)] px-4 py-3 text-sm leading-relaxed text-orange">
            If not proposed within deadline, market becomes INVALID and your creation bond is at risk. Bond amounts are
            denominated in {COLLATERAL_SYMBOL}.
          </div>
        </div>
      </div>
    </div>
  );
}
