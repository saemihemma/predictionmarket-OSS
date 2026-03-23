import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

const MarketsIndexPage = lazy(() => import("./pages/MarketsIndexPage"));
const MarketDetailPage = lazy(() => import("./pages/MarketDetailPage"));
const MarketCreatePage = lazy(() => import("./pages/MarketCreatePage"));
const PortfolioPage = lazy(() => import("./pages/PortfolioPage"));
const DisputeHelpPage = lazy(() => import("./pages/DisputeHelpPage"));
const MarketDiagnosticsPage = lazy(() => import("./pages/MarketDiagnosticsPage"));
const AirdropPage = lazy(() => import("./pages/AirdropPage"));

function LoadingFallback() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "var(--bg-terminal)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "IBM Plex Mono",
        fontSize: "0.7rem",
        color: "var(--text-dim)",
        animation: "pulse 1.5s ease-in-out infinite",
      }}
    >
      INITIALIZING TERMINAL...
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/" element={<Navigate to="/markets" replace />} />
          <Route path="/markets" element={<MarketsIndexPage />} />
          <Route path="/markets/create" element={<MarketCreatePage />} />
          <Route path="/markets/:id" element={<MarketDetailPage />} />
          <Route path="/portfolio" element={<PortfolioPage />} />
          <Route path="/airdrop" element={<AirdropPage />} />
          <Route path="/disputes/help" element={<DisputeHelpPage />} />
          <Route path="/markets/diagnostics" element={<MarketDiagnosticsPage />} />
          <Route path="*" element={<Navigate to="/markets" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
