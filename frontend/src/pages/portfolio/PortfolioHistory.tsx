/**
 * Transaction history tab.
 * Mock history was removed so the portfolio no longer implies fake activity.
 */

export default function PortfolioHistory() {
  return (
    <div className="bg-bg-panel border border-border-panel p-4 font-mono">
      <h3 className="text-lg font-bold text-mint mb-4 tracking-wide">TRANSACTION HISTORY</h3>
      <div className="px-3 py-6 border border-border-panel text-sm text-text-muted leading-relaxed">
        Live history is not mocked anymore. Claim, trade, and resolution actions now hit the live generic-collateral protocol,
        and this tab is reserved for a direct on-chain event feed in the next pass.
      </div>
    </div>
  );
}
