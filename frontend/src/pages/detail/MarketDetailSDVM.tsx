/**
 * MarketDetailSDVM: DISPUTED state SDVM voting
 * Shows dispute details and COMMIT/REVEAL phases with voting functionality
 */

import CountdownTimer from "../../components/ui/CountdownTimer";

export default function MarketDetailSDVM({
  market,
  voteExpanded,
  setVoteExpanded,
  voterChoice,
  setVoterChoice,
  recoveryPhraseSaved,
  setRecoveryPhraseSaved,
  phraseCopied,
  setPhraseCopied,
  mockRecoveryPhrase,
}: {
  market: any;
  voteExpanded: boolean;
  setVoteExpanded: (b: boolean) => void;
  voterChoice: number;
  setVoterChoice: (n: number) => void;
  recoveryPhraseSaved: boolean;
  setRecoveryPhraseSaved: (b: boolean) => void;
  phraseCopied: boolean;
  setPhraseCopied: (b: boolean) => void;
  mockRecoveryPhrase: string;
}) {
  return (
    <div className="p-4 bg-bg-panel border border-orange-dim">
      <h3 className="text-[1.1rem] font-bold text-orange mb-3 tracking-[0.1em]">THIS MARKET IS DISPUTED</h3>

      <div className="px-3 py-2 bg-[rgba(221,122,31,0.08)] border border-orange-dim mb-3 text-sm">
        <div className="mb-2">
          <span className="text-text-dim">Original:</span>{" "}
          <span className="text-mint font-semibold">YES</span>{" "}
          <span className="text-text-muted text-xs">
            (by {market.creator?.slice(0, 6)}...{market.creator?.slice(-4)})
          </span>
        </div>
        <div className="mb-2">
          <span className="text-text-dim">Dispute:</span>{" "}
          <span className="text-orange font-semibold">{market.outcomeLabels[market.dispute.proposedOutcomeId]}</span>{" "}
          <span className="text-text-muted text-xs">
            (by {market.dispute.disputer.slice(0, 6)}...{market.dispute.disputer.slice(-4)})
          </span>
        </div>
        <div className="text-xs text-text-muted italic">
          "{market.dispute.reasonText}"
        </div>
      </div>

      <div className="mb-3">
        <h4 className="text-sm font-semibold text-text-muted mb-2 tracking-[0.06em]">SDVM VOTE</h4>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="px-2 py-1.5 bg-[rgba(77,184,212,0.08)] border border-tribe-b-dim text-sm">
            <div className="text-text-dim mb-1">Phase</div>
            <div className="text-tribe-b font-semibold">
              {market.sdvm.phase}
            </div>
          </div>
          <div className="px-2 py-1.5 bg-[rgba(77,184,212,0.08)] border border-tribe-b-dim text-sm">
            <div className="text-text-dim mb-1">Time remaining</div>
            <CountdownTimer targetMs={market.sdvm.phaseEndMs} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="px-2 py-1.5 bg-[rgba(202,245,222,0.08)] border border-mint-dim text-sm">
            <div className="text-text-dim mb-1">Participation</div>
            <div className="text-mint font-semibold">
              {market.sdvm.participantCount} voters
            </div>
          </div>
          <div className="px-2 py-1.5 bg-[rgba(202,245,222,0.08)] border border-mint-dim text-sm">
            <div className="text-text-dim mb-1">SDVM Phases</div>
            <div className="text-xs text-text-muted">
              {["COMMIT", "REVEAL", "TALLY", "SETTLED"].map((phase, i) => (
                <span key={phase} style={{
                  color: market.sdvm.phase === phase ? "var(--mint)" : "var(--text-dim)",
                  fontWeight: market.sdvm.phase === phase ? 600 : 400,
                }}>
                  {phase}
                  {i < 3 && <span className="text-border-panel mx-1">→</span>}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {market.sdvm.phase === "COMMIT" && (
        <>
          <button
            onClick={() => setVoteExpanded(!voteExpanded)}
            className="w-full px-3 py-2 font-mono text-sm font-semibold tracking-[0.08em] bg-[rgba(202,245,222,0.12)] text-mint border border-mint-dim cursor-pointer transition-all duration-200 hover:shadow-[0_0_12px_rgba(202,245,222,0.15)]"
          >
            {voteExpanded ? "CANCEL" : "VOTE ON THIS DISPUTE"}
          </button>

          {/* Vote expansion for DISPUTED state */}
          {voteExpanded && market.sdvm && (
            <div className="p-4 bg-bg-panel border border-mint-dim mt-3">
              <h3 className="text-[1.1rem] font-bold text-mint mb-3 tracking-[0.1em]">COMMIT YOUR VOTE</h3>

              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-[0.95rem] font-medium text-mint block mb-2">
                    I believe the correct outcome is:
                  </label>
                  <select
                    value={voterChoice}
                    onChange={(e) => setVoterChoice(Number(e.target.value))}
                    className="w-full px-3 py-2 text-base bg-bg-terminal text-text border border-border-panel outline-none font-mono"
                  >
                    {market.outcomeLabels.map((label: string, i: number) => (
                      <option key={i} value={i}>{label}</option>
                    ))}
                    <option value={-1}>ABSTAIN</option>
                  </select>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-[0.95rem] font-medium text-mint">
                      RECOVERY PHRASE (save this safely)
                    </label>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(mockRecoveryPhrase);
                        setPhraseCopied(true);
                        setTimeout(() => setPhraseCopied(false), 2000);
                      }}
                      className="px-2 py-0.5 text-xs font-semibold text-mint bg-transparent border border-mint-dim cursor-pointer transition-all duration-200 font-mono tracking-[0.06em] hover:shadow-[0_0_8px_rgba(202,245,222,0.2)]"
                    >
                      {phraseCopied ? "COPIED ✓" : "COPY"}
                    </button>
                  </div>
                  <div className="px-3 py-2 bg-bg-terminal border border-border-panel text-mint-dim text-sm break-words leading-relaxed font-mono">
                    {mockRecoveryPhrase}
                  </div>
                  <div className="text-sm text-text-dim mt-1">
                    You need this to reveal your vote in 12 hours. Never share it.
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer text-[0.95rem] text-text">
                  <input
                    type="checkbox"
                    checked={recoveryPhraseSaved}
                    onChange={(e) => setRecoveryPhraseSaved(e.target.checked)}
                    className="cursor-pointer w-4 h-4"
                  />
                  I have saved my recovery phrase
                </label>

                <div className="flex gap-2">
                  <button
                    onClick={() => setVoteExpanded(false)}
                    className="flex-1 px-3 py-2 font-mono text-sm font-semibold tracking-[0.08em] bg-[rgba(77,184,212,0.12)] text-tribe-b border border-tribe-b-dim cursor-pointer"
                  >
                    CANCEL
                  </button>
                  <button
                    className="flex-1 px-3 py-2 font-mono text-sm font-semibold tracking-[0.08em] cursor-pointer transition-colors"
                    style={{
                      background: recoveryPhraseSaved ? "rgba(202, 245, 222, 0.12)" : "rgba(0, 0, 0, 0.3)",
                      color: recoveryPhraseSaved ? "var(--mint)" : "var(--text-dim)",
                      borderColor: recoveryPhraseSaved ? "var(--mint-dim)" : "var(--border-panel)",
                      borderWidth: "1px",
                      cursor: recoveryPhraseSaved ? "pointer" : "not-allowed",
                    }}
                    disabled={!recoveryPhraseSaved}
                  >
                    COMMIT VOTE
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {market.sdvm.phase === "REVEAL" && (
        <div className="px-3 py-2 bg-[rgba(202,245,220,0.08)] border border-mint-dim mb-3">
          <div className="text-sm text-text mb-3">
            You committed. Now reveal your vote.
          </div>
          <div className="px-2 py-1.5 bg-bg-terminal border border-border-panel mb-3 text-sm text-mint">
            Your vote: YES
          </div>
          <button className="w-full px-3 py-2 font-mono text-sm font-semibold tracking-[0.08em] bg-[rgba(202,245,222,0.12)] text-mint border border-mint-dim cursor-pointer">
            REVEAL VOTE
          </button>
          <div className="text-xs text-text-dim mt-2">
            If you don't reveal, you'll be slashed 1% of stake.
          </div>
        </div>
      )}
    </div>
  );
}
