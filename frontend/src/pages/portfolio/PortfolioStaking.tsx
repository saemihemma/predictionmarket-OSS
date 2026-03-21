import { useState } from "react";
import { cn } from "../../lib/utils";
import { formatValue } from "../../lib/formatting";
import CountdownTimer from "../../components/ui/CountdownTimer";

const COOLDOWN_MS = 48 * 60 * 60 * 1000;

const MOCK_STAKE = {
  stakedAmount: 50000n,
  cumulativeRewards: 2450n,
  cumulativeSlash: 120n,
  unstakeInitiatedAtMs: null as number | null,
  pendingPreUnstakeDisputes: 0,
};

type Phase = "idle" | "confirming" | "processing" | "done";

export default function PortfolioStaking() {
  const [phase, setPhase] = useState<Phase>("idle");
  const stake = MOCK_STAKE;

  const netStake = stake.stakedAmount - stake.cumulativeSlash + stake.cumulativeRewards;
  const cooldownDeadlineMs = stake.unstakeInitiatedAtMs
    ? stake.unstakeInitiatedAtMs + COOLDOWN_MS
    : null;
  const cooldownElapsed = cooldownDeadlineMs ? Date.now() >= cooldownDeadlineMs : false;
  const isBlocked = stake.pendingPreUnstakeDisputes > 0;
  const canComplete = stake.unstakeInitiatedAtMs !== null && cooldownElapsed && !isBlocked;
  const isUp = netStake > stake.stakedAmount;

  const handleUnstake = () => {
    setPhase("processing");
    setTimeout(() => {
      MOCK_STAKE.unstakeInitiatedAtMs = Date.now();
      setPhase("idle");
    }, 1500);
  };

  const handleComplete = () => {
    setPhase("processing");
    setTimeout(() => {
      MOCK_STAKE.unstakeInitiatedAtMs = null;
      setPhase("done");
    }, 1500);
  };

  return (
    <div className="bg-bg-panel border border-border-panel p-4 font-mono max-w-[800px] mx-auto">
      <h3 className="text-lg font-bold text-mint mb-3 tracking-wide">STAKING</h3>
      <p className="text-sm text-text-muted mb-6 leading-relaxed">
        Stake SUFFER to vote on disputed markets. Rewards earned from correct votes. Slashed for incorrect or unrevealed votes.
      </p>

      {/* Stats — linear: staked → slashed → rewards → net */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div>
          <div className="text-xs text-text-dim mb-1 tracking-wide">STAKED</div>
          <div className="text-lg font-bold text-mint">{formatValue(stake.stakedAmount)}</div>
        </div>
        <div>
          <div className="text-xs text-text-dim mb-1 tracking-wide">SLASHED</div>
          <div className="text-lg font-bold text-orange">-{formatValue(stake.cumulativeSlash)}</div>
        </div>
        <div>
          <div className="text-xs text-text-dim mb-1 tracking-wide">REWARDS</div>
          <div className="text-lg font-bold text-mint">+{formatValue(stake.cumulativeRewards)}</div>
        </div>
        <div>
          <div className="text-xs text-text-dim mb-1 tracking-wide">NET</div>
          <div className={cn("text-lg font-bold", isUp ? "text-mint" : "text-orange")}>
            {formatValue(netStake)}
          </div>
          <div className="text-xs text-text-dim mt-1">Distributed on settlement</div>
        </div>
      </div>

      {/* Dispute blocker */}
      {isBlocked && (
        <div className="text-xs text-orange bg-[rgba(221,122,31,0.08)] border border-orange-dim px-3 py-2 mb-6">
          {stake.pendingPreUnstakeDisputes} dispute{stake.pendingPreUnstakeDisputes > 1 ? "s" : ""} pending. Unstake blocked until settled.
        </div>
      )}

      {/* Cooldown countdown */}
      {stake.unstakeInitiatedAtMs !== null && !cooldownElapsed && cooldownDeadlineMs && (
        <div className="text-sm text-tribe-b bg-[rgba(77,184,212,0.08)] border border-tribe-b-dim px-3 py-2 mb-6 flex justify-between items-center">
          <span>Unstake cooldown</span>
          <CountdownTimer targetMs={cooldownDeadlineMs} />
        </div>
      )}

      {/* Success */}
      {phase === "done" && (
        <div className="text-sm text-mint bg-[rgba(202,245,222,0.08)] border border-mint px-3 py-2 mb-6 shadow-[0_0_8px_rgba(202,245,222,0.15)]">
          ✓ {formatValue(netStake)} SFR returned to wallet
        </div>
      )}

      {/* Confirmation */}
      {phase === "confirming" && (
        <div className="border border-orange bg-[rgba(221,122,31,0.06)] p-4 mb-6">
          <div className="text-sm text-text mb-3">
            Starting 48h unstake cooldown. You will receive ~{formatValue(netStake)} SFR after cooldown. You can still vote on new disputes. Cannot be cancelled.
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setPhase("idle")}
              className="flex-1 py-2 font-mono text-xs font-semibold tracking-wide text-center border border-border-panel text-text-muted cursor-pointer transition-all duration-200 hover:border-mint-dim"
            >
              CANCEL
            </button>
            <button
              onClick={handleUnstake}
              className="flex-1 py-2 font-mono text-xs font-semibold tracking-wide text-center border border-orange text-orange cursor-pointer transition-all duration-200 hover:shadow-[0_0_12px_rgba(221,122,31,0.2)]"
            >
              CONFIRM UNSTAKE
            </button>
          </div>
        </div>
      )}

      {/* Action button */}
      {phase !== "confirming" && phase !== "done" && (
        <button
          onClick={() => {
            if (canComplete) handleComplete();
            else if (stake.unstakeInitiatedAtMs === null && !isBlocked) setPhase("confirming");
          }}
          disabled={phase === "processing" || isBlocked || (stake.unstakeInitiatedAtMs !== null && !canComplete)}
          className={cn(
            "w-full py-3 font-mono text-sm font-semibold tracking-wide text-center transition-all duration-300",
            phase === "processing" && "bg-bg-panel border border-mint text-mint claim-glow-pulse cursor-wait",
            phase !== "processing" && canComplete && "bg-[rgba(202,245,222,0.06)] border border-mint-dim text-mint cursor-pointer hover:border-mint hover:shadow-[0_0_12px_rgba(202,245,222,0.15)]",
            phase !== "processing" && !canComplete && stake.unstakeInitiatedAtMs !== null && !isBlocked && "bg-bg-panel border border-tribe-b-dim text-tribe-b-dim cursor-not-allowed",
            phase !== "processing" && stake.unstakeInitiatedAtMs === null && !isBlocked && "bg-[rgba(202,245,222,0.06)] border border-border-panel text-mint cursor-pointer hover:border-mint-dim hover:shadow-[0_0_10px_rgba(202,245,222,0.12)]",
            isBlocked && "bg-bg-panel border border-orange-dim text-orange-dim cursor-not-allowed",
          )}
        >
          {phase === "processing"
            ? "PROCESSING"
            : canComplete
              ? `WITHDRAW ${formatValue(netStake)} SFR`
              : stake.unstakeInitiatedAtMs !== null
                ? "COOLDOWN IN PROGRESS"
                : isBlocked
                  ? "BLOCKED BY DISPUTES"
                  : "UNSTAKE"
          }
        </button>
      )}
    </div>
  );
}
