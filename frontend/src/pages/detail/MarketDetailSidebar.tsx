/**
 * MarketDetailSidebar: Right column with trading, resolved, disputed, status, position, and activity
 */

import { Link } from "react-router-dom";
import { MarketState } from "../../lib/market-types";

export default function MarketDetailSidebar({
  market,
  probs,
  mainProb: _mainProb,
  selectedOutcome,
  setSelectedOutcome,
  tradeAmount,
  setTradeAmount,
  tradeType,
  setTradeType,
  account,
  voteExpanded,
}: {
  market: any;
  probs: number[];
  mainProb: number;
  selectedOutcome: number;
  setSelectedOutcome: (n: number) => void;
  tradeAmount: string;
  setTradeAmount: (s: string) => void;
  tradeType: "buy" | "sell";
  setTradeType: (t: "buy" | "sell") => void;
  account: string | null;
  voteExpanded: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      {/* When DISPUTED and not voting, show compact link to portfolio */}
      {market.state === MarketState.DISPUTED && market.sdvm && !voteExpanded ? (
        <div className="text-sm text-text-muted leading-relaxed">
          Stake SUFFER to vote on disputes →{" "}
          <Link to="/portfolio" className="text-mint underline cursor-pointer">
            Portfolio
          </Link>
        </div>
      ) : market.state === MarketState.RESOLVED && market.winningOutcome !== undefined ? (
        <div className="bg-bg-panel border border-mint-dim p-4">
          <h3 className="text-[1.1rem] font-bold text-mint mb-3 tracking-[0.1em]">MARKET RESOLVED</h3>

          <div className="flex flex-col gap-3 text-[0.95rem]">
            <div className="px-2 py-1.5 bg-[rgba(202,245,222,0.08)] border border-mint-dim text-mint">
              ✓ Final outcome: <span className="font-semibold">
                {market.outcomeLabels[market.winningOutcome]}
              </span>
            </div>

            {market.claimableAmount && Number(market.claimableAmount) > 0 && (
              <Link
                to="/portfolio?filter=claimable"
                className="block px-4 py-2 font-mono text-[0.85rem] font-semibold tracking-[0.08em] bg-[rgba(202,245,222,0.08)] text-mint border border-border-panel text-center no-underline transition-all duration-200 hover:border-mint-dim hover:shadow-[0_0_12px_rgba(202,245,222,0.15)]"
              >
                CLAIM {Number(market.claimableAmount).toLocaleString()} SFR → PORTFOLIO
              </Link>
            )}

            <div className="text-sm text-text-dim px-2 py-1.5 bg-[rgba(202,245,222,0.08)] border border-border-panel">
              Resolved via: {market.resolutionMethod || "SDVM Vote"}
            </div>
          </div>
        </div>
      ) : market.state === MarketState.OPEN ? (
        <div className="bg-bg-panel border border-border-panel p-4">
          <h3 className="text-[1.1rem] font-bold text-mint mb-4 tracking-[0.1em]">TRADING</h3>

          <div className="flex flex-col gap-3">
            {/* Trade type selector */}
            <div className="flex gap-2">
              {["buy", "sell"].map((type) => (
                <button
                  key={type}
                  onClick={() => setTradeType(type as "buy" | "sell")}
                  className="flex-1 px-2 py-1.5 font-mono text-sm font-semibold tracking-[0.08em] cursor-pointer transition-all duration-200"
                  style={{
                    background: tradeType === type ? "rgba(202, 245, 222, 0.12)" : "transparent",
                    color: tradeType === type ? "var(--mint)" : "var(--text-muted)",
                    borderColor: tradeType === type ? "var(--border-active)" : "var(--border-panel)",
                    borderWidth: "1px",
                  }}
                >
                  {type.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Outcome selector */}
            <div>
              <label className="text-[0.95rem] font-medium text-mint block mb-2">OUTCOME</label>
              <select
                value={selectedOutcome}
                onChange={(e) => setSelectedOutcome(Number(e.target.value))}
                className="w-full px-3 py-2 text-base bg-bg-terminal text-text border border-border-panel outline-none"
              >
                {market.outcomeLabels.map((label: string, i: number) => (
                  <option key={i} value={i}>
                    {label} ({(Number(probs[i]) / 100).toFixed(1)}%)
                  </option>
                ))}
              </select>
            </div>

            {/* Amount input */}
            <div>
              <label className="text-[0.95rem] font-medium text-mint block mb-2">AMOUNT (SFR)</label>
              <input
                type="number"
                value={tradeAmount}
                onChange={(e) => setTradeAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 text-base bg-bg-terminal text-text border border-border-panel outline-none"
              />
            </div>

            {/* Estimated cost/proceeds */}
            {tradeAmount && (
              <div className="px-3 py-2 bg-[rgba(77,184,212,0.08)] border border-tribe-b-dim text-[0.95rem] text-text">
                <div className="flex justify-between mb-1">
                  <span>Price Impact:</span>
                  <span>~{(Math.random() * 5).toFixed(2)}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Slippage:</span>
                  <span>~{(Math.random() * 2).toFixed(2)}%</span>
                </div>
              </div>
            )}

            {/* Execute button */}
            <button
              disabled={!account || !tradeAmount}
              className="px-3 py-2 font-mono text-sm font-semibold tracking-[0.08em] cursor-pointer transition-all duration-200"
              style={{
                background:
                  account && tradeAmount
                    ? tradeType === "buy"
                      ? "rgba(202, 245, 222, 0.12)"
                      : "rgba(77, 184, 212, 0.12)"
                    : "rgba(0, 0, 0, 0.3)",
                color:
                  account && tradeAmount
                    ? tradeType === "buy"
                      ? "var(--mint)"
                      : "var(--tribe-b)"
                    : "var(--text-dim)",
                borderColor:
                  account && tradeAmount
                    ? tradeType === "buy"
                      ? "var(--mint-dim)"
                      : "var(--tribe-b-dim)"
                    : "var(--border-panel)",
                borderWidth: "1px",
                cursor: account && tradeAmount ? "pointer" : "not-allowed",
              }}
            >
              {!account ? "CONNECT WALLET" : `${tradeType === "buy" ? "BUY" : "SELL"} ${market.outcomeLabels[selectedOutcome]}`}
            </button>

            {!account && (
              <div className="text-sm text-text-muted text-center">
                Connect wallet to trade
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-bg-panel border border-border-panel p-4">
          <h3 className="text-[1.1rem] font-bold text-mint mb-3 tracking-[0.1em]">STATUS</h3>
          <div className="text-[0.95rem] text-text-muted">
            {market.state === MarketState.CLOSED ? "Market has closed. Awaiting resolution." : "Market is not open for trading."}
          </div>
        </div>
      )}

      {/* Your Position */}
      <div className="bg-bg-panel border border-border-panel p-4">
        <h3 className="text-[1.1rem] font-bold text-mint mb-3 tracking-[0.1em]">YOUR POSITION</h3>
        <div className="text-[0.95rem] text-text-muted">
          No position
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-bg-panel border border-border-panel p-4">
        <h3 className="text-[1.1rem] font-bold text-mint mb-3 tracking-[0.1em]">RECENT ACTIVITY</h3>
        <div className="flex flex-col gap-2 text-sm text-text-dim">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex justify-between">
              <span>
                {i % 2 === 0 ? "BOUGHT" : "SOLD"} {Math.floor(Math.random() * 500) + 100} {market.outcomeLabels[0]}
              </span>
              <span>{Math.floor(Math.random() * 60) + 1}m ago</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
