import { formatNumber } from "../../lib/formatting";
import { COLLATERAL_SYMBOL } from "../../lib/market-constants";

export default function MarketDetailInfo({ market }: { market: any }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="border border-border-panel bg-bg-panel p-5 sm:p-6">
        <h3 className="mb-3 text-[1.1rem] font-bold tracking-[0.1em] text-mint">DESCRIPTION</h3>
        <p className="m-0 text-base leading-relaxed text-text">{market.description}</p>
      </div>

      <div className="border border-border-panel bg-bg-panel p-5 sm:p-6">
        <h3 className="mb-3 text-[1.1rem] font-bold tracking-[0.1em] text-mint">RESOLUTION RULES</h3>
        <div className="text-[0.95rem] leading-relaxed text-text-muted">{market.resolutionText}</div>
      </div>

      <div className="border border-border-panel bg-bg-panel p-5 sm:p-6">
        <h3 className="mb-3 text-[1.1rem] font-bold tracking-[0.1em] text-mint">MARKET DETAILS</h3>
        <div className="grid gap-4 sm:grid-cols-2 text-[0.95rem]">
          <div className="border border-border-panel bg-bg-terminal px-3 py-2">
            <div className="mb-1 text-sm font-medium text-text-dim">CREATED</div>
            <div className="text-text">{new Date(market.createdAtMs).toLocaleDateString()}</div>
          </div>
          <div className="border border-border-panel bg-bg-terminal px-3 py-2">
            <div className="mb-1 text-sm font-medium text-text-dim">CLOSES</div>
            <div className="text-text">{new Date(market.closeTimeMs).toLocaleDateString()}</div>
          </div>
          <div className="border border-border-panel bg-bg-terminal px-3 py-2">
            <div className="mb-1 text-sm font-medium text-text-dim">TOTAL VOLUME</div>
            <div className="text-text">
              {formatNumber(market.totalCollateral)} {COLLATERAL_SYMBOL}
            </div>
          </div>
          <div className="border border-border-panel bg-bg-terminal px-3 py-2">
            <div className="mb-1 text-sm font-medium text-text-dim">RESOLUTION SOURCE</div>
            <div className="break-words text-sm text-text">{market.sourceDeclaration.sourceDescription}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
