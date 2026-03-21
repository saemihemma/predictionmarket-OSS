import { MarketType, MARKET_TYPE_LABELS } from "../../lib/market-types";

interface ReviewStepProps {
  title: string;
  description: string;
  marketType: MarketType;
  trustTier: "verified" | "sourced" | "community" | "experimental";
  outcomes: string[];
  closeDate: string;
  resolutionSourceType: string;
  resolutionSourceUri: string;
  creatorControls: boolean;
  creationBond: string;
  resolutionBond: string;
}

export default function ReviewStep({
  title,
  description,
  marketType,
  trustTier,
  outcomes,
  closeDate,
  resolutionSourceType,
  resolutionSourceUri,
  creatorControls,
  creationBond,
  resolutionBond,
}: ReviewStepProps) {
  return (
    <div className="text-base text-text leading-[1.7]">
      <div className="mb-6">
        <div className="text-text-dim mb-1 text-xs font-medium">TITLE</div>
        <div className="text-lg font-semibold">{title || "Not set"}</div>
      </div>

      <div className="mb-6">
        <div className="text-text-dim mb-1 text-xs font-medium">DESCRIPTION</div>
        <div className="text-base">{description || "Not set"}</div>
      </div>

      <div className="mb-6">
        <div className="text-text-dim mb-1 text-xs font-medium">
          MARKET TYPE
        </div>
        <div className="text-base">{MARKET_TYPE_LABELS[marketType]}</div>
      </div>

      <div className="mb-6">
        <div className="text-text-dim mb-1 text-xs font-medium">TRUST TIER</div>
        <div className="text-base">
          {trustTier.charAt(0).toUpperCase() + trustTier.slice(1)}
        </div>
      </div>

      <div className="mb-6">
        <div className="text-text-dim mb-1 text-xs font-medium">OUTCOMES</div>
        <div className="text-base">
          {outcomes.filter((o) => o).join(", ") || "Not set"}
        </div>
      </div>

      <div className="mb-6">
        <div className="text-text-dim mb-1 text-xs font-medium">CLOSES</div>
        <div className="text-base">{closeDate || "Not set"}</div>
      </div>

      <div className="mb-6">
        <div className="text-text-dim mb-1 text-xs font-medium">
          RESOLUTION SOURCE
        </div>
        <div className="text-base">
          <div>Type: {resolutionSourceType}</div>
          <div>URI: {resolutionSourceUri || "Not set"}</div>
          <div>Creator controls: {creatorControls ? "Yes" : "No"}</div>
        </div>
      </div>

      <div className="mb-6">
        <div className="text-text-dim mb-1 text-xs font-medium">BONDS</div>
        <div className="text-base">
          Creation: {creationBond} SFR | Dispute: {resolutionBond} SFR
        </div>
      </div>
    </div>
  );
}
