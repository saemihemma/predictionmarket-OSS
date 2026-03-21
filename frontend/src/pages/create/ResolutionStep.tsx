interface ResolutionStepProps {
  trustTier: "verified" | "sourced" | "community" | "experimental";
  resolutionSourceType: string;
  resolutionSourceUri: string;
  resolutionRules: string;
  creatorControls: boolean;
  onTrustTierChange: (
    tier: "verified" | "sourced" | "community" | "experimental"
  ) => void;
  onSourceTypeChange: (value: string) => void;
  onSourceUriChange: (value: string) => void;
  onRulesChange: (value: string) => void;
  onCreatorControlsChange: (value: boolean) => void;
}

export default function ResolutionStep({
  trustTier,
  resolutionSourceType,
  resolutionSourceUri,
  resolutionRules,
  creatorControls,
  onTrustTierChange,
  onSourceTypeChange,
  onSourceUriChange,
  onRulesChange,
  onCreatorControlsChange,
}: ResolutionStepProps) {
  const handleTrustTierChange = (newTier: string) => {
    const tier = newTier as "verified" | "sourced" | "community" | "experimental";
    const BOND_TIERS: Record<string, { creation: number; dispute: number }> = {
      verified: { creation: 250, dispute: 2500 },
      sourced: { creation: 500, dispute: 5000 },
      community: { creation: 1000, dispute: 7500 },
      experimental: { creation: 2000, dispute: 10000 },
    };

    // Auto-select source type based on trust tier
    let sourceType = "Official API";
    if (tier === "verified") sourceType = "On-Chain State";
    if (tier === "sourced") sourceType = "Official API";
    if (tier === "community" || tier === "experimental")
      sourceType = "Manual Verifier";

    onTrustTierChange(tier);
    if (sourceType !== resolutionSourceType) {
      onSourceTypeChange(sourceType);
    }
  };

  return (
    <>
      <div>
        <label className="block text-sm font-medium text-mint mb-2">
          Trust Tier
        </label>
        <select
          value={trustTier}
          onChange={(e) => handleTrustTierChange(e.target.value)}
          className="w-full p-4 text-base bg-bg-terminal text-text border border-border-panel outline-none"
        >
          <option value="verified">
            Verified — On-chain data resolves automatically (lowest bond)
          </option>
          <option value="sourced">
            Sourced — External data source with verifiable URL
          </option>
          <option value="community">
            Community — Creator proposes, community can dispute
          </option>
          <option value="experimental">
            Experimental — High risk, experimental resolution (highest bond)
          </option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-mint mb-2">
          Source Type
        </label>
        <select
          value={resolutionSourceType}
          onChange={(e) => onSourceTypeChange(e.target.value)}
          className="w-full p-4 text-base bg-bg-terminal text-text border border-border-panel outline-none"
        >
          <option value="Official API">Official API</option>
          <option value="Website">Website</option>
          <option value="On-Chain State">On-Chain State</option>
          <option value="Verified Snapshot">Verified Snapshot</option>
          <option value="Manual Verifier">Manual Verifier</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-mint mb-2">
          Primary Source URL
        </label>
        <input
          type="text"
          value={resolutionSourceUri}
          onChange={(e) => onSourceUriChange(e.target.value)}
          placeholder="https://api.example.com/events/..."
          className="w-full p-4 text-base bg-bg-terminal text-text border border-border-panel outline-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-mint mb-2">
          Resolution Rules
        </label>
        <textarea
          value={resolutionRules}
          onChange={(e) => onRulesChange(e.target.value)}
          placeholder={
            "Resolves YES if [condition]. Resolves NO if [condition]. Source: [URL]. Edge cases: [describe]."
          }
          rows={3}
          className="w-full p-3.5 text-sm bg-bg-terminal text-text border border-border-panel outline-none resize-none"
        />
        <div className="text-xs italic text-text-dim mt-1">
          {resolutionSourceType === "Official API" &&
            "e.g., Resolves on `winner` field from api.example.com/events/123"}
          {resolutionSourceType === "Website" &&
            "e.g., Result posted at example.com/events/123, 2+ sources if disputed"}
          {resolutionSourceType === "On-Chain State" &&
            "e.g., SnapshotRecord for system_id=456. Deterministic, no human judgment."}
          {(resolutionSourceType === "Verified Snapshot" ||
            resolutionSourceType === "Manual Verifier") &&
            "Provide clear, verifiable criteria."}
        </div>
      </div>

      <div>
        <label className="flex gap-2 items-start cursor-pointer text-sm font-medium text-mint">
          <input
            type="checkbox"
            checked={creatorControls}
            onChange={(e) => onCreatorControlsChange(e.target.checked)}
            className="mt-1 cursor-pointer"
          />
          <span>Creator controls or influences this source?</span>
        </label>
        <div className="text-xs text-text-muted mt-1 ml-6">
          Check if you have control over, manage, or influence the resolution
          source.
        </div>
      </div>
    </>
  );
}
