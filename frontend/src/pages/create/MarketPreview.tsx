import TerminalPanel from "../../components/terminal/TerminalPanel";
import { COLLATERAL_SYMBOL } from "../../lib/market-constants";
import { MarketType, MARKET_TYPE_LABELS } from "../../lib/market-types";

interface MarketPreviewProps {
  title: string;
  description: string;
  marketType: MarketType;
  closeDate: string;
  trustTier: "sourceBackedCommunity" | "openCommunity";
  outcomes: string[];
  resolutionSourceType: string;
  creationBond: string;
}

const TRUST_TIER_COPY = {
  sourceBackedCommunity: {
    label: "SOURCE-BACKED COMMUNITY",
    tone: "text-mint",
    border: "border-mint-dim",
    background: "bg-[rgba(202,245,222,0.08)]",
  },
  openCommunity: {
    label: "OPEN COMMUNITY",
    tone: "text-orange",
    border: "border-orange-dim",
    background: "bg-[rgba(221,122,31,0.08)]",
  },
} as const;

export default function MarketPreview({
  title,
  description,
  marketType,
  closeDate,
  trustTier,
  outcomes,
  resolutionSourceType,
  creationBond,
}: MarketPreviewProps) {
  const tier = TRUST_TIER_COPY[trustTier];
  const previewTitle = title.trim() || "Untitled community market";
  const previewDescription =
    description.trim() ||
    "This preview mirrors the live shell so spacing, wrapping, and copy stay honest while you create the market.";
  const previewOutcomes = outcomes.filter((value) => value.trim().length > 0);

  return (
    <div className="lg:sticky lg:top-6">
      <TerminalPanel title="LIVE PREVIEW" className="h-full">
        <div className="flex flex-col gap-5">
          <div className={`border ${tier.border} ${tier.background} px-3 py-2 text-[0.65rem] tracking-[0.16em] ${tier.tone}`}>
            {tier.label}
          </div>

          <div>
            <div className="mb-2 text-[1rem] font-semibold leading-relaxed text-mint sm:text-[1.1rem]">{previewTitle}</div>
            <p className="m-0 text-sm leading-7 text-text-muted">{previewDescription}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="border border-border-panel bg-bg-terminal px-3 py-3">
              <div className="mb-1 text-[0.58rem] tracking-[0.16em] text-text-dim">MARKET TYPE</div>
              <div className="text-sm text-text">{MARKET_TYPE_LABELS[marketType]}</div>
            </div>
            <div className="border border-border-panel bg-bg-terminal px-3 py-3">
              <div className="mb-1 text-[0.58rem] tracking-[0.16em] text-text-dim">CLOSES</div>
              <div className="text-sm text-text">{closeDate || "Not scheduled yet"}</div>
            </div>
            <div className="border border-border-panel bg-bg-terminal px-3 py-3">
              <div className="mb-1 text-[0.58rem] tracking-[0.16em] text-text-dim">RESOLUTION INPUT</div>
              <div className="text-sm text-text">{resolutionSourceType}</div>
            </div>
            <div className="border border-border-panel bg-bg-terminal px-3 py-3">
              <div className="mb-1 text-[0.58rem] tracking-[0.16em] text-text-dim">CREATION BOND</div>
              <div className="text-sm text-text">
                {creationBond || "0"} {COLLATERAL_SYMBOL}
              </div>
            </div>
          </div>

          <div>
            <div className="mb-3 text-[0.62rem] tracking-[0.16em] text-text-dim">OUTCOME RAIL</div>
            <div className="flex flex-col gap-2">
              {previewOutcomes.length > 0 ? (
                previewOutcomes.map((outcome, index) => (
                  <div
                    key={`${outcome}-${index}`}
                    className="flex items-center justify-between gap-3 border border-border-panel bg-bg-terminal px-3 py-3 text-sm text-text"
                  >
                    <span className="truncate">{outcome}</span>
                    <span className="shrink-0 text-text-dim">{index === 0 ? "PRIMARY" : `OUTCOME ${index + 1}`}</span>
                  </div>
                ))
              ) : (
                <div className="border border-border-panel bg-bg-terminal px-3 py-3 text-sm text-text-muted">
                  Add outcomes to populate the trading preview.
                </div>
              )}
            </div>
          </div>

          <div className="border border-border-panel bg-[rgba(202,245,222,0.04)] px-3 py-3 text-sm leading-7 text-text-muted">
            Mobile-safe preview uses the same shell sizing as the live market cards and detail panels, so copy and spacing stay
            honest while you build the market.
          </div>
        </div>
      </TerminalPanel>
    </div>
  );
}
