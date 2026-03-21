/**
 * MarketDetailInfo: Description, Resolution Rules, and Market Details
 * Always visible on the left column
 */

import { formatNumber } from "../../lib/formatting";

export default function MarketDetailInfo({ market }: { market: any }) {
  return (
    <div className="flex flex-col gap-6">
      {/* Description Card */}
      <div className="p-6 bg-bg-panel border border-border-panel">
        <h3 className="text-[1.1rem] font-bold text-mint mb-3 tracking-[0.1em]">DESCRIPTION</h3>
        <p className="text-base text-text leading-relaxed m-0">
          {market.description}
        </p>
      </div>

      {/* Resolution Rules Card */}
      <div className="p-6 bg-bg-panel border border-border-panel">
        <h3 className="text-[1.1rem] font-bold text-mint mb-3 tracking-[0.1em]">RESOLUTION RULES</h3>
        <div className="text-[0.95rem] text-text-muted leading-relaxed">
          {market.resolutionText}
        </div>
      </div>

      {/* Market Details Card */}
      <div className="p-6 bg-bg-panel border border-border-panel">
        <h3 className="text-[1.1rem] font-bold text-mint mb-3 tracking-[0.1em]">MARKET DETAILS</h3>
        <div className="grid grid-cols-2 gap-4 text-[0.95rem]">
          <div className="px-3 py-2 bg-bg-terminal border border-border-panel">
            <div className="text-text-dim mb-1 text-sm font-medium">CREATED</div>
            <div className="text-text">
              {new Date(market.createdAtMs).toLocaleDateString()}
            </div>
          </div>
          <div className="px-3 py-2 bg-bg-terminal border border-border-panel">
            <div className="text-text-dim mb-1 text-sm font-medium">CLOSES</div>
            <div className="text-text">
              {new Date(market.closeTimeMs).toLocaleDateString()}
            </div>
          </div>
          <div className="px-3 py-2 bg-bg-terminal border border-border-panel">
            <div className="text-text-dim mb-1 text-sm font-medium">TOTAL VOLUME</div>
            <div className="text-text">
              {formatNumber(market.totalCollateral)} SUFFER
            </div>
          </div>
          <div className="px-3 py-2 bg-bg-terminal border border-border-panel">
            <div className="text-text-dim mb-1 text-sm font-medium">RESOLUTION SOURCE</div>
            <div className="text-text text-sm">
              {market.sourceDeclaration.sourceDescription}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
