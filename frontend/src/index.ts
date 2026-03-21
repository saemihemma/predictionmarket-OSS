/**
 * Main entry point exports for the frontend application.
 *
 * NOTE: Nothing inside this project imports from this barrel file.
 * It exists for potential external consumers. All internal imports
 * use direct paths (e.g., ../hooks/useMarketData).
 */

// Pages
export { default as MarketDetailPage } from "./pages/MarketDetailPage";
export { default as PortfolioPage } from "./pages/PortfolioPage";

// Shared UI Components
export { default as ConnectButton } from "./components/ui/ConnectButton";
export { default as CountdownTimer } from "./components/ui/CountdownTimer";
export { default as ClaimButton } from "./components/ui/ClaimButton";
export { default as Footer } from "./components/ui/Footer";

// Hooks
export {
  useMarketData,
  useAllMarkets,
  usePortfolio,
  useMarketStats,
} from "./hooks/useMarketData";

// Utilities
export { formatNumber, formatAddress } from "./lib/formatting";

// Types (canonical source: ./lib/market-types.ts)
export {
  MarketState,
  MarketType,
  TrustTier,
  ResolutionClass,
  CreatorInfluenceLevel,
} from "./lib/market-types";

export type {
  Market,
  Position,
  SourceDeclaration,
  CreatorInfluence,
  ResolutionRecord,
  ProposalData,
  DisputeData,
  SDVMData,
} from "./lib/market-types";
