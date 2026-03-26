import { useId } from "react";
import { COLLATERAL_SYMBOL } from "../../lib/market-constants";

interface BondStepProps {
  trustTier: "sourceBackedCommunity" | "openCommunity";
  creationBond: string;
  minimumCreationBond: string;
  resolutionBond: string;
  onCreationBondChange: (value: string) => void;
}

export default function BondStep({
  trustTier,
  creationBond,
  minimumCreationBond,
  resolutionBond,
  onCreationBondChange,
}: BondStepProps) {
  const creationBondId = useId();

  return (
    <>
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <label htmlFor={creationBondId} className="mb-2 block text-sm font-medium text-mint">
            Creation Bond ({COLLATERAL_SYMBOL})
          </label>
          <input
            id={creationBondId}
            type="text"
            inputMode="decimal"
            value={creationBond}
            onChange={(event) => onCreationBondChange(event.target.value)}
            placeholder={minimumCreationBond}
            className="touch-target min-h-11 w-full border border-border-panel bg-bg-terminal px-4 py-3 text-base text-text outline-none"
          />
          <div className="mt-1 text-xs text-text-muted">
            MIN: {minimumCreationBond} {COLLATERAL_SYMBOL} (
            {trustTier === "sourceBackedCommunity" ? "SOURCE-BACKED COMMUNITY" : "OPEN COMMUNITY"} profile)
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-mint">Dispute Bond ({COLLATERAL_SYMBOL})</label>
          <div className="flex min-h-11 w-full items-center border border-border-panel bg-bg-terminal px-4 py-3 font-mono text-base text-text opacity-60">
            {resolutionBond} (read-only)
          </div>
          <div className="mt-1 text-xs text-text-muted">Live protocol config</div>
        </div>
      </div>

      <div className="border border-border-panel bg-[rgba(202,245,222,0.04)] p-4 text-sm leading-relaxed text-text-muted">
        <div className="mb-2 font-semibold text-mint">CREATION BOND</div>
        <div className="mb-4">
          This stays with the market and is at risk if the market is disputed and settled against the creator path.
        </div>
        <div className="mb-2 font-semibold text-mint">DISPUTE BOND</div>
        <div>
          Challengers post the protocol dispute bond to escalate a bad proposal into the dispute and SDVM process.
        </div>
      </div>
    </>
  );
}
