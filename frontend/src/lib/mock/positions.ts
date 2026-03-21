/**
 * Mock portfolio positions for demo/development.
 * See lib/mock/config.ts to enable/disable.
 */
import type { Position } from "../../hooks/useMarketData";

export const mockPositions: Position[] = [
  {
    marketId: "market-001",
    marketTitle: "ETH/USD price above $3000 by EOY 2025",
    outcome: "YES",
    shares: 500n,
    value: 2450n,
    pnl: 450n,
    state: "open",
  },
  {
    marketId: "market-002",
    marketTitle: "Bitcoin reaches $100k in 2025",
    outcome: "YES",
    shares: 1200n,
    value: 8400n,
    pnl: 1200n,
    state: "open",
  },
  {
    marketId: "market-003",
    marketTitle: "Fed drops rates below 3% in Q1 2025",
    outcome: "NO",
    shares: 750n,
    value: 950n,
    pnl: -250n,
    state: "open",
  },
  {
    marketId: "market-006",
    marketTitle: "Oil price below $70/barrel end of Q1",
    outcome: "YES",
    shares: 300n,
    value: 0n,
    pnl: -300n,
    state: "claimable",
  },
  {
    marketId: "market-loss",
    marketTitle: "Ethereum will reach $5000 by June 2025",
    outcome: "NO",
    shares: 400n,
    value: 120n,
    pnl: -400n,
    state: "open",
  },
];
