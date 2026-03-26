import { useId } from "react";

interface ResolutionStepProps {
  trustTier: "sourceBackedCommunity" | "openCommunity";
  resolutionSourceType: string;
  resolutionSourceUri: string;
  resolutionRules: string;
  creatorControls: boolean;
  allowedSourceTypes?: string[];
  requiredEvidenceLabel?: string | null;
  onTrustTierChange: (tier: "sourceBackedCommunity" | "openCommunity") => void;
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
  allowedSourceTypes,
  requiredEvidenceLabel,
  onTrustTierChange,
  onSourceTypeChange,
  onSourceUriChange,
  onRulesChange,
  onCreatorControlsChange,
}: ResolutionStepProps) {
  const trustTierId = useId();
  const sourceTypeId = useId();
  const sourceUriId = useId();
  const resolutionRulesId = useId();

  const sourceOptions = allowedSourceTypes ?? [];

  const handleTrustTierChange = (newTier: string) => {
    const tier = newTier as "sourceBackedCommunity" | "openCommunity";
    const sourceType = sourceOptions[0];

    onTrustTierChange(tier);
    if (sourceType && sourceType !== resolutionSourceType) {
      onSourceTypeChange(sourceType);
    }
  };

  const sourceIsExpected = trustTier === "sourceBackedCommunity";

  return (
    <>
      <div>
        <label htmlFor={trustTierId} className="block text-sm font-medium text-mint mb-2">
          SETTLEMENT PROFILE
        </label>
        <select
          id={trustTierId}
          value={trustTier}
          onChange={(e) => handleTrustTierChange(e.target.value)}
          className="w-full p-4 text-base bg-bg-terminal text-text border border-border-panel outline-none"
        >
          <option value="sourceBackedCommunity">
            Source-Backed Community — creator supplies sources, community settles
          </option>
          <option value="openCommunity">
            Open Community — creator sets rules, community settles openly
          </option>
        </select>
      </div>

      <div className="p-4 bg-[rgba(202,245,222,0.04)] border border-border-panel text-sm text-text-muted leading-relaxed">
        {sourceIsExpected
          ? "This market still resolves through creator proposal, dispute, and SDVM. The attached sources are evidence for the community, not an operator guarantee."
          : "This market is fully community-settled. Source links are optional evidence, not a managed verifier promise."}
      </div>

      <div>
        <label htmlFor={sourceTypeId} className="block text-sm font-medium text-mint mb-2">
          EVIDENCE SOURCE TYPE
        </label>
        <select
          id={sourceTypeId}
          value={sourceOptions.length > 0 ? resolutionSourceType : ""}
          onChange={(e) => onSourceTypeChange(e.target.value)}
          disabled={sourceOptions.length === 0}
          className="w-full p-4 text-base bg-bg-terminal text-text border border-border-panel outline-none"
        >
          {sourceOptions.length === 0 && (
            <option value="" disabled>
              LOADING LIVE POLICY...
            </option>
          )}
          {sourceOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {requiredEvidenceLabel && (
          <div className="mt-2 text-xs text-text-dim">
            Live policy requires <span className="text-mint">{requiredEvidenceLabel}</span> evidence for this profile.
          </div>
        )}
      </div>

      <div>
        <label htmlFor={sourceUriId} className="block text-sm font-medium text-mint mb-2">
          PRIMARY SOURCE URL {sourceIsExpected ? "(REQUIRED)" : "(OPTIONAL)"}
        </label>
        <input
          id={sourceUriId}
          type="text"
          value={resolutionSourceUri}
          onChange={(e) => onSourceUriChange(e.target.value)}
          placeholder="example.com/source"
          className="w-full p-4 text-base bg-bg-terminal text-text border border-border-panel outline-none"
        />
        <div className="mt-2 text-xs text-text-dim">
          Enter a public source domain or link. `http://`, `https://`, and `www.` are optional.
        </div>
      </div>

      <div>
        <label htmlFor={resolutionRulesId} className="block text-sm font-medium text-mint mb-2">
          RESOLUTION RULES
        </label>
        <textarea
          id={resolutionRulesId}
          value={resolutionRules}
          onChange={(e) => onRulesChange(e.target.value)}
          placeholder="State exactly what resolves each outcome, which evidence wins if sources conflict, and how edge cases are handled."
          rows={4}
          className="w-full p-3.5 text-sm bg-bg-terminal text-text border border-border-panel outline-none resize-none"
        />
        <div className="text-xs italic text-text-dim mt-1">
          Use explicit outcome criteria. This is what the creator/community/dispute flow will point back to later.
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
          <span>Creator controls or materially influences the referenced source</span>
        </label>
        <div className="text-xs text-text-muted mt-1 ml-6">
          Required if you control the source, can change it, or have privileged access that could affect the outcome.
        </div>
      </div>
    </>
  );
}
