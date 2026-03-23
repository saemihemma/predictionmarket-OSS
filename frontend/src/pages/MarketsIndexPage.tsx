import { useState } from "react";
import { Link } from "react-router-dom";
import { outcomeProbabilityBps } from "../lib/amm";
import { MarketState } from "../lib/market-types";
import { useAllMarkets } from "../hooks/useMarketData";
import { formatCollateralAmount } from "../lib/collateral";
import { COLLATERAL_SYMBOL } from "../lib/market-constants";
import Footer from "../components/ui/Footer";
import PageHeader from "../components/ui/PageHeader";
import TerminalScreen from "../components/terminal/TerminalScreen";

type FilterTab =
  | "all"
  | "open"
  | "closing"
  | "needs-proposal"
  | "proposal-pending"
  | "disputed"
  | "resolved";

const FILTER_TABS: FilterTab[] = [
  "all",
  "open",
  "closing",
  "proposal-pending",
  "needs-proposal",
  "disputed",
  "resolved",
];

function getFilterLabel(tab: FilterTab) {
  if (tab === "needs-proposal") return "NEEDS PROPOSAL";
  if (tab === "proposal-pending") return "DISPUTE WINDOW";
  return tab.toUpperCase();
}

export default function MarketsIndexPage() {
  const { markets, isLoading, error } = useAllMarkets();
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const totalMarkets = markets.length;
  const totalVolume = formatCollateralAmount(markets.reduce((sum, market) => sum + market.totalCollateral, 0n));
  const activeTraders = new Set(markets.map((market) => market.creator).filter(Boolean)).size;

  const displayMarkets = markets.map((market) => {
    const probabilities = outcomeProbabilityBps(market.outcomeQuantities);
    const yes = Math.round(Number(probabilities[0]) / 100);
    const timeLeft = market.closeTimeMs - Date.now();
    const days = Math.max(0, Math.ceil(timeLeft / (24 * 60 * 60 * 1000)));
    const hours = Math.max(0, Math.ceil((timeLeft % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000)));

    return {
      id: market.id,
      title: market.title,
      yes,
      volume: formatCollateralAmount(market.totalCollateral, { withSymbol: true }),
      closes: days > 0 ? `${days}d ${hours}h` : timeLeft > 0 ? `${hours}h` : "Closed",
      state: market.state,
      closeTimeMs: market.closeTimeMs,
      proposal: market.proposal,
    };
  });

  const filteredMarkets = displayMarkets.filter((market) => {
    if (!market.title.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }

    if (filterTab === "all") return true;
    if (filterTab === "open") return market.state === MarketState.OPEN;
    if (filterTab === "closing") {
      return market.state === MarketState.OPEN && market.closeTimeMs - Date.now() < 12 * 60 * 60 * 1000;
    }
    if (filterTab === "needs-proposal") {
      return market.state === MarketState.CLOSED && !market.proposal;
    }
    if (filterTab === "proposal-pending") {
      return market.state === MarketState.RESOLUTION_PENDING;
    }
    if (filterTab === "resolved") {
      return market.state === MarketState.RESOLVED || market.state === MarketState.INVALID;
    }
    if (filterTab === "disputed") {
      return market.state === MarketState.DISPUTED;
    }

    return true;
  });

  const hasActiveFilters = filterTab !== "all" || search.trim().length > 0;

  return (
    <TerminalScreen>
      <div className="min-h-screen flex flex-col">
        <PageHeader
          actions={
            <>
              <Link
                to="/markets/create"
                className="touch-target inline-flex min-h-11 items-center justify-center border border-border-panel px-4 py-2 text-xs font-semibold tracking-[0.12em] text-mint no-underline transition-all duration-200 hover:border-mint hover:shadow-[0_0_12px_rgba(202,245,222,0.15)]"
              >
                + CREATE MARKET
              </Link>
              <Link
                to="/airdrop"
                className="touch-target inline-flex min-h-11 items-center justify-center border-2 border-orange px-4 py-2 text-xs font-semibold tracking-[0.1em] text-orange no-underline shadow-[0_0_8px_rgba(221,122,31,0.3)] transition-all duration-200 hover:shadow-[0_0_16px_rgba(221,122,31,0.5)]"
              >
                $SUFFER AIRDROP
              </Link>
            </>
          }
        />

        <div className="border-b border-border-grid">
          <div className="page-shell grid gap-3 py-3 text-xs tracking-[0.08em] text-text sm:grid-cols-2 xl:grid-cols-4">
            <span>MARKETS: <span className="font-semibold text-mint">{totalMarkets}</span></span>
            <span>TOTAL COLLATERAL: <span className="font-semibold text-mint">{totalVolume} {COLLATERAL_SYMBOL}</span></span>
            <span>UNIQUE CREATORS: <span className="font-semibold text-mint">{activeTraders}</span></span>
            <span>NETWORK: <span className="font-semibold text-tribe-b">TESTNET</span></span>
          </div>
        </div>

        <main className="page-shell page-section flex-1">
          <div className="mobile-scroll-row mb-4 border-b border-border-panel">
            <div className="flex min-w-max gap-2 pb-3">
              {FILTER_TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setFilterTab(tab)}
                  className={`touch-target inline-flex min-h-11 items-center justify-center whitespace-nowrap border px-4 py-2 text-xs font-semibold tracking-[0.1em] uppercase transition-all duration-200 ease-in-out ${
                    filterTab === tab
                      ? "border-mint-dim bg-[rgba(202,245,222,0.12)] text-mint"
                      : "border-border-panel bg-transparent text-text-muted"
                  }`}
                >
                  {getFilterLabel(tab)}
                </button>
              ))}
            </div>
          </div>

          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="SEARCH MARKETS..."
            className="touch-target mb-6 min-h-11 w-full border border-border-panel bg-bg-panel px-3 py-2 text-xs tracking-[0.08em] text-mint outline-none"
          />

          {isLoading ? (
            <div className="border border-border-panel bg-bg-panel px-4 py-8 text-center text-sm tracking-[0.08em] text-text-muted">
              LOADING LIVE MARKETS...
            </div>
          ) : error && markets.length === 0 ? (
            <div className="border border-orange-dim bg-[rgba(221,122,31,0.08)] px-4 py-6 text-sm leading-relaxed text-orange">
              LIVE MARKET FEED UNAVAILABLE.
              <div className="mt-2 text-text-muted">{error.message}</div>
            </div>
          ) : filteredMarkets.length === 0 ? (
            <div className="border border-border-panel bg-bg-panel px-4 py-8 text-center text-sm leading-relaxed text-text-muted">
              {hasActiveFilters
                ? "No markets match the current search or filter selection."
                : "No live markets are available yet. Create the first market to seed the board."}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredMarkets.map((market) => {
                const isClosingSoon =
                  market.state === MarketState.OPEN && market.closeTimeMs - Date.now() < 12 * 60 * 60 * 1000;
                const needsProposal = market.state === MarketState.CLOSED && !market.proposal;
                const inDisputeWindow = market.state === MarketState.RESOLUTION_PENDING;
                const isDisputed = market.state === MarketState.DISPUTED;
                const isResolved = market.state === MarketState.RESOLVED || market.state === MarketState.INVALID;
                const hasStatusBadge = isClosingSoon || needsProposal || inDisputeWindow || isDisputed || isResolved;

                return (
                  <Link key={market.id} to={`/markets/${market.id}`} className="text-inherit no-underline">
                    <div className="relative flex h-full flex-col justify-between border border-border-panel bg-bg-panel p-5 transition-all duration-200 ease-in-out hover:border-mint-dim hover:shadow-[0_0_12px_rgba(202,245,222,0.08)] md:min-h-[200px]">
                      {isClosingSoon && (
                        <div className="absolute right-3 top-3 max-w-[5.5rem] border border-orange-dim bg-[rgba(221,122,31,0.1)] px-2 py-1 text-[0.5rem] font-bold tracking-[0.1em] text-orange">
                          CLOSING
                        </div>
                      )}
                      {needsProposal && (
                        <div className="absolute right-3 top-3 max-w-[5.5rem] border border-orange-dim bg-[rgba(221,122,31,0.1)] px-2 py-1 text-[0.5rem] font-bold tracking-[0.1em] text-orange">
                          NEEDS PROPOSAL
                        </div>
                      )}
                      {inDisputeWindow && (
                        <div className="absolute right-3 top-3 max-w-[5.5rem] border border-mint-dim bg-[rgba(202,245,222,0.1)] px-2 py-1 text-[0.5rem] font-bold tracking-[0.1em] text-mint">
                          DISPUTE WINDOW
                        </div>
                      )}
                      {isDisputed && (
                        <div className="absolute right-3 top-3 max-w-[5.5rem] border border-yellow-dim bg-[rgba(242,201,76,0.1)] px-2 py-1 text-[0.5rem] font-bold tracking-[0.1em] text-yellow">
                          DISPUTED
                        </div>
                      )}
                      {isResolved && (
                        <div className="absolute right-3 top-3 max-w-[5.5rem] border border-mint-dim bg-[rgba(202,245,222,0.1)] px-2 py-1 text-[0.5rem] font-bold tracking-[0.1em] text-mint">
                          RESOLVED
                        </div>
                      )}

                      <div className={`line-clamp-2 text-sm font-semibold leading-6 tracking-[0.04em] text-mint ${hasStatusBadge ? "pr-24" : ""}`}>
                        {market.title}
                      </div>

                      <div className="mt-4">
                        <div className="mb-3">
                          <div className="mb-2 flex justify-between text-[0.7rem]">
                            <span className="text-mint">YES {market.yes}%</span>
                            <span className="text-orange">NO {100 - market.yes}%</span>
                          </div>
                          <div className="relative h-1 overflow-hidden bg-orange-dim">
                            <div
                              className="absolute bottom-0 left-0 top-0 bg-mint transition-all duration-300 ease-in-out"
                              style={{ width: `${market.yes}%` }}
                            />
                          </div>
                        </div>

                        <div className="flex flex-col gap-1 text-[0.65rem] tracking-[0.06em] text-text-dim sm:flex-row sm:justify-between">
                          <span>VOL {market.volume}</span>
                          <span>CLOSES {market.closes}</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </main>

        <Footer />
      </div>
    </TerminalScreen>
  );
}
