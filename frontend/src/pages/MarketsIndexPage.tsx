import { useState } from "react";
import { Link } from "react-router-dom";
import { outcomeProbabilityBps } from "../lib/amm";
import { MarketState } from "../lib/market-types";
import { useAllMarkets, useMarketStats } from "../hooks/useMarketData";
import Footer from "../components/ui/Footer";
import PageHeader from "../components/ui/PageHeader";
import TerminalScreen from "../components/terminal/TerminalScreen";

export default function MarketsIndexPage() {

  // F7: Use hooks instead of direct mock imports
  const { markets: mockMarkets } = useAllMarkets();
  const { totalMarkets, totalVolume, activeTraders } = useMarketStats();

  // Derive display data from shared markets
  const MOCK_MARKETS = mockMarkets.map(m => {
  const probs = outcomeProbabilityBps(m.outcomeQuantities);
  const yes = Math.round(Number(probs[0]) / 100);
  const timeLeft = m.closeTimeMs - Date.now();
  const days = Math.max(0, Math.ceil(timeLeft / (24 * 60 * 60 * 1000)));
  const hours = Math.max(0, Math.ceil((timeLeft % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000)));
  return {
    id: m.id,
    title: m.title,
    yes,
    volume: `${Number(m.totalCollateral).toLocaleString()} SFR`,
    closes: days > 0 ? `${days}d ${hours}h` : timeLeft > 0 ? `${hours}h` : "Closed",
    state: m.state,
    closeTimeMs: m.closeTimeMs,
    proposal: m.proposal,
  };
});

/* ── Hover rule: each element brightens in its OWN accent color ──
   - Mint elements (cards, CREATE MARKET, CONNECT WALLET) → brighter mint glow
   - Orange elements ($SUFFER AIRDROP) → brighter orange glow
   No mixing. Consistent. */

const CARD_HEIGHT = 200; // Fixed height — room for title + badge tag + probability + footer

type FilterTab = "all" | "open" | "closing" | "needs-proposal" | "proposal-pending" | "disputed" | "resolved";

  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");

  const filtered = MOCK_MARKETS.filter(m => {
    // Search filter
    if (!m.title.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }

    // Tab filter
    if (filterTab === "all") {
      return true;
    } else if (filterTab === "open") {
      return m.state === MarketState.OPEN;
    } else if (filterTab === "closing") {
      return m.state === MarketState.OPEN && (m.closeTimeMs - Date.now()) < 12 * 60 * 60 * 1000;
    } else if (filterTab === "needs-proposal") {
      return m.state === MarketState.CLOSED && !m.proposal;
    } else if (filterTab === "proposal-pending") {
      return m.state === MarketState.RESOLUTION_PENDING;
    } else if (filterTab === "resolved") {
      return m.state === MarketState.RESOLVED || m.state === MarketState.INVALID;
    } else if (filterTab === "disputed") {
      return m.state === MarketState.DISPUTED;
    }
    return true;
  });

  return (
    <TerminalScreen>
      <div className="min-h-screen flex flex-col">

      <PageHeader actions={<>
        <Link
          to="/markets/create"
          className="no-underline text-mint text-xs font-semibold tracking-[0.12em] border border-border-panel px-4 py-2 transition-all duration-200 hover:border-mint hover:shadow-[0_0_12px_rgba(202,245,222,0.15)]"
        >
          + CREATE MARKET
        </Link>
        <button className="bg-transparent border-2 border-orange text-orange text-xs font-semibold tracking-[0.1em] px-4 py-2 cursor-pointer shadow-[0_0_8px_rgba(221,122,31,0.3)] transition-all duration-200 hover:shadow-[0_0_16px_rgba(221,122,31,0.5)]">
          $SUFFER AIRDROP
        </button>
      </>} />

      {/* Stats Bar */}
      <div className="flex gap-8 px-8 py-3 border-b border-border-grid text-xs text-text tracking-[0.08em] overflow-x-hidden">
        <span>MARKETS: <span className="text-mint font-semibold">{totalMarkets}</span></span>
        <span className="border-l border-border-panel pl-8">24H VOLUME: <span className="text-mint font-semibold">{totalVolume} SFR</span></span>
        <span className="border-l border-border-panel pl-8">ACTIVE TRADERS: <span className="text-mint font-semibold">{activeTraders}</span></span>
        <span className="border-l border-border-panel pl-8">NETWORK: <span className="text-tribe-b font-semibold">TESTNET</span></span>
      </div>

      {/* Main Content */}
      <main className="px-8 py-6 max-w-[1400px] mx-auto overflow-x-hidden">
        {/* Filter Tabs */}
        <div className="flex gap-2 mb-4 border-b border-border-panel pb-3 overflow-x-auto">
          {(["all", "open", "closing", "proposal-pending", "needs-proposal", "disputed", "resolved"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilterTab(tab)}
              className={`px-4 py-2 text-xs font-semibold tracking-[0.1em] transition-all duration-200 ease-in-out uppercase whitespace-nowrap cursor-pointer ${
                filterTab === tab
                  ? "bg-[rgba(202,245,222,0.12)] text-mint border border-mint-dim"
                  : "bg-transparent text-text-muted border border-border-panel"
              }`}
            >
              {tab === "needs-proposal" ? "NEEDS PROPOSAL" : tab === "proposal-pending" ? "DISPUTE WINDOW" : tab.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="SEARCH MARKETS..."
          className="w-full bg-bg-panel border border-border-panel text-mint px-3 py-2 text-xs tracking-[0.08em] mb-6 outline-none transition-all duration-200 ease-in-out"
        />

        {/* Market Grid — all cards same height */}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(380px,1fr))] gap-4">
          {filtered.map(market => (
            <Link
              key={market.id}
              to={`/markets/${market.id}`}
              className="no-underline text-inherit"
            >
              <div className="bg-bg-panel border border-border-panel p-6 cursor-pointer transition-all duration-200 ease-in-out h-[200px] flex flex-col justify-between relative hover:border-mint-dim hover:shadow-[0_0_12px_rgba(202,245,222,0.08)]">
                {/* Status Badge — top right corner tag */}
                {market.state === MarketState.OPEN && (market.closeTimeMs - Date.now()) < 12 * 60 * 60 * 1000 && (
                  <div className="absolute top-3 right-3 text-[0.5rem] font-bold tracking-[0.1em] text-orange bg-[rgba(221,122,31,0.1)] border border-orange-dim px-2 py-1 max-w-[4.5rem]">
                    CLOSING
                  </div>
                )}
                {market.state === MarketState.CLOSED && !market.proposal && (
                  <div className="absolute top-3 right-3 text-[0.5rem] font-bold tracking-[0.1em] text-orange bg-[rgba(221,122,31,0.1)] border border-orange-dim px-2 py-1 max-w-[4.5rem]">
                    NEEDS PROPOSAL
                  </div>
                )}
                {market.state === MarketState.RESOLUTION_PENDING && (
                  <div className="absolute top-3 right-3 text-[0.5rem] font-bold tracking-[0.1em] text-mint bg-[rgba(202,245,222,0.1)] border border-mint-dim px-2 py-1 max-w-[4.5rem]">
                    DISPUTE WINDOW
                  </div>
                )}
                {market.state === MarketState.DISPUTED && (
                  <div className="absolute top-3 right-3 text-[0.5rem] font-bold tracking-[0.1em] text-yellow bg-[rgba(242,201,76,0.1)] border border-yellow-dim px-2 py-1 max-w-[4.5rem]">
                    DISPUTED
                  </div>
                )}
                {(market.state === MarketState.RESOLVED || market.state === MarketState.INVALID) && (
                  <div className="absolute top-3 right-3 text-[0.5rem] font-bold tracking-[0.1em] text-mint bg-[rgba(202,245,222,0.1)] border border-mint-dim px-2 py-1 max-w-[4.5rem]">
                    RESOLVED
                  </div>
                )}

                {/* Title — clamped to 2 lines */}
                <div
                  className="text-sm font-semibold tracking-[0.04em] leading-6 text-mint overflow-hidden line-clamp-2"
                  style={{
                    paddingRight: (market.state !== MarketState.OPEN || market.state === MarketState.CLOSED) ? "5rem" : 0,
                  }}
                >
                  {market.title}
                </div>

                {/* Bottom section — probability + footer */}
                <div>
                  {/* Probability Bar */}
                  <div className="mb-3">
                    <div className="flex justify-between text-[0.7rem] mb-2">
                      <span className="text-mint">YES {market.yes}%</span>
                      <span className="text-orange">NO {100 - market.yes}%</span>
                    </div>
                    <div className="h-1 bg-orange-dim relative overflow-hidden">
                      <div
                        className="absolute left-0 top-0 bottom-0 bg-mint transition-all duration-300 ease-in-out"
                        style={{
                          width: `${market.yes}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex justify-between text-[0.65rem] text-text-dim tracking-[0.06em]">
                    <span>VOL {market.volume}</span>
                    <span>CLOSES {market.closes}</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>

      <Footer />
      </div>
    </TerminalScreen>
  );
}
