/**
 * Staking tab.
 * Replaces the old mock stake panel with an honest live-status placeholder.
 */

import { PM_STAKING_POOL_ID } from "../../lib/market-constants";

export default function PortfolioStaking() {
  return (
    <div className="bg-bg-panel border border-border-panel p-4 font-mono max-w-[800px] mx-auto">
      <h3 className="text-lg font-bold text-mint mb-3 tracking-wide">DISPUTE VOTING</h3>
      <p className="text-sm text-text-muted mb-4 leading-relaxed">
        The protocol dispute objects and staking pool are live on-chain, but the dedicated stake, vote, and reward UI is still
        being shipped. The old mock balances and cooldown timers have been removed.
      </p>
      <div className="px-3 py-4 border border-border-panel bg-[rgba(202,245,222,0.04)] text-sm text-text leading-relaxed">
        <div className="text-mint mb-2">ACTIVE STAKING POOL</div>
        <div className="break-all text-text-muted">{PM_STAKING_POOL_ID}</div>
      </div>
      <div className="mt-4 px-3 py-4 border border-orange-dim bg-[rgba(221,122,31,0.08)] text-sm text-orange leading-relaxed">
        Live stake, unstake, commit-reveal, and reward surfaces are the remaining dedicated SDVM UI pass. The protocol and
        manifest are already configured for the external SFR collateral family.
      </div>
    </div>
  );
}
