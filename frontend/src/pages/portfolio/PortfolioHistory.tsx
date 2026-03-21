/**
 * Transaction history — mock data.
 * When live, reads from on-chain events (TradeExecutedEvent, ClaimExecutedEvent, etc.)
 */

const MOCK_HISTORY = [
  { type: "CLAIM",   detail: "ETH/USD > $3000",    amount: 750,   positive: true,  txHash: "A3F2C1", daysAgo: 1  },
  { type: "BUY",     detail: "BTC reaches $100k",   amount: 2400,  positive: false, txHash: "B7E4D2", daysAgo: 2  },
  { type: "UNSTAKE", detail: "Withdrawal",           amount: 10000, positive: true,  txHash: "C1D8F3", daysAgo: 5  },
  { type: "SELL",    detail: "Fed drops rates < 3%", amount: 500,   positive: true,  txHash: "D4A9E6", daysAgo: 7  },
  { type: "STAKE",   detail: "Locked for voting",    amount: 50000, positive: false, txHash: "E2B3C7", daysAgo: 12 },
  { type: "CLAIM",   detail: "Oil < $70/barrel",     amount: 1200,  positive: true,  txHash: "F8D1A4", daysAgo: 15 },
  { type: "BUY",     detail: "AAPL vs S&P 500",     amount: 3100,  positive: false, txHash: "A6C2E8", daysAgo: 18 },
  { type: "SELL",    detail: "ETH/USD > $3000",      amount: 800,   positive: true,  txHash: "B3F7D5", daysAgo: 22 },
] as const;

export default function PortfolioHistory() {
  return (
    <div className="bg-bg-panel border border-border-panel p-4 font-mono">
      <h3 className="text-lg font-bold text-mint mb-4 tracking-wide">TRANSACTION HISTORY</h3>
      <div className="flex flex-col">
        {MOCK_HISTORY.map((tx, i) => (
          <div
            key={i}
            className="grid grid-cols-[1fr_100px_90px] gap-4 px-3 py-3 items-center border-b border-border-panel last:border-b-0"
          >
            <div>
              <div className="text-sm font-semibold text-text">
                {tx.type}
                <span className="text-text-dim font-normal ml-2">{tx.detail}</span>
              </div>
              <div className="text-xs text-text-dim mt-0.5">{tx.daysAgo}d ago</div>
            </div>
            <div className="text-right">
              <div className={`text-sm font-semibold ${tx.positive ? "text-mint" : "text-orange"}`}>
                {tx.positive ? "+" : "-"}{tx.amount.toLocaleString()} SFR
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-text-dim">0x{tx.txHash}…</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
