interface BondStepProps {
  trustTier: "verified" | "sourced" | "community" | "experimental";
  creationBond: string;
  resolutionBond: string;
  onCreationBondChange: (value: string) => void;
}

export default function BondStep({
  trustTier,
  creationBond,
  resolutionBond,
  onCreationBondChange,
}: BondStepProps) {
  const BOND_TIERS: Record<string, { creation: number; dispute: number }> = {
    verified: { creation: 250, dispute: 2500 },
    sourced: { creation: 500, dispute: 5000 },
    community: { creation: 1000, dispute: 7500 },
    experimental: { creation: 2000, dispute: 10000 },
  };

  const tierBonds = BOND_TIERS[trustTier] || BOND_TIERS.sourced;

  return (
    <>
      <div className="grid grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-mint mb-2">
            Creation Bond (SFR)
          </label>
          <input
            type="number"
            value={creationBond}
            onChange={(e) => {
              const val = Number(e.target.value);
              if (val >= tierBonds.creation) {
                onCreationBondChange(e.target.value);
              }
            }}
            className="w-full p-4 text-base bg-bg-terminal text-text border border-border-panel outline-none"
          />
          <div className="text-xs text-text-muted mt-1">
            MIN: {tierBonds.creation} SFR ({trustTier.toUpperCase()} tier)
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-mint mb-2">
            Dispute Bond (SFR)
          </label>
          <div className="w-full p-4 font-mono text-base bg-bg-terminal text-text border border-border-panel opacity-60">
            {tierBonds.dispute} (read-only)
          </div>
          <div className="text-xs text-text-muted mt-1">
            Set by protocol
          </div>
        </div>
      </div>

      <div className="p-4 bg-[rgba(202,245,222,0.04)] border border-border-panel rounded-sm text-sm text-text-muted leading-relaxed">
        <div className="font-semibold text-mint mb-2">CREATION BOND</div>
        <div className="mb-4">
          Your stake. Forfeit if disputed and dispute upheld (75% to disputer,
          25% to treasury). Returned on normal resolution.
        </div>
        <div className="font-semibold text-mint mb-2">DISPUTE BOND</div>
        <div>
          What challengers must post. Not set by you — determined by trust tier.
        </div>
      </div>
    </>
  );
}
