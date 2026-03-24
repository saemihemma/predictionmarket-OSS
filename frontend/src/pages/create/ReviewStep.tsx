import { MarketType, MARKET_TYPE_LABELS } from "../../lib/market-types";

interface ReviewStepProps {
  title: string;
  description: string;
  marketType: MarketType;
  trustTier: "sourceBackedCommunity" | "openCommunity";
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
  const profileLabel =
    trustTier === "sourceBackedCommunity" ? "Source-Backed Community" : "Open Community";

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
        <div className="text-text-dim mb-1 text-xs font-medium">MARKET TYPE</div>
        <div className="text-base">{MARKET_TYPE_LABELS[marketType]}</div>
      </div>

      <div className="mb-6">
        <div className="text-text-dim mb-1 text-xs font-medium">PUBLIC PROFILE</div>
        <div className="text-base">{profileLabel}</div>
      </div>

      <div className="mb-6">
        <div className="text-text-dim mb-1 text-xs font-medium">OUTCOMES</div>
        <div className="text-base">{outcomes.filter((o) => o).join(", ") || "Not set"}</div>
      </div>

      <div className="mb-6">
        <div className="text-text-dim mb-1 text-xs font-medium">CLOSES</div>
        <div className="text-base">{closeDate || "Choose a close date and time"}</div>
      </div>

      <div className="mb-6">
        <div className="text-text-dim mb-1 text-xs font-medium">EVIDENCE INPUT</div>
        <div className="text-base">
          <div>Source type: {resolutionSourceType}</div>
          <div>Source link: {resolutionSourceUri || "Optional"}</div>
          <div>Creator influence disclosed: {creatorControls ? "Yes" : "No"}</div>
        </div>
      </div>

      <div className="mb-6">
        <div className="text-text-dim mb-1 text-xs font-medium">BONDS</div>
        <div className="text-base">
          Creation: {creationBond} | Dispute: {resolutionBond}
        </div>
      </div>
    </div>
  );
}
