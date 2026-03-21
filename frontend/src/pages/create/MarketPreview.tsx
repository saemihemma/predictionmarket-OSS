import TerminalPanel from "../../components/terminal/TerminalPanel";

interface MarketPreviewProps {
  title: string;
  description: string;
  closeDate: string;
  trustTier: "verified" | "sourced" | "community" | "experimental";
  outcomes: string[];
  resolutionSourceType: string;
  creationBond: string;
}

export default function MarketPreview({
  title,
  description,
  closeDate,
  trustTier,
  outcomes,
  resolutionSourceType,
  creationBond,
}: MarketPreviewProps) {
  const validOutcomes = outcomes.filter((o) => o);

  return (
    <div className="market-create-preview">
      <TerminalPanel title="PREVIEW">
        <div className="terminal-panel border-border-panel p-6 flex flex-col gap-5">
          {/* Title */}
          <div className="text-lg font-semibold text-mint leading-[1.4] min-h-[2.8rem]">
            {title || "Market Title"}
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-1.5 text-xs text-text-muted">
            <div>VOL • 0 SUFFER</div>
            <div>
              CLOSES •{" "}
              {closeDate ? new Date(closeDate).toLocaleDateString() : "Soon"}
            </div>
          </div>

          {/* Badges */}
          <div className="flex gap-2 text-[0.75rem] flex-wrap">
            <span className="text-mint border border-mint px-2 py-1">
              {trustTier.toUpperCase()}
            </span>
            <span className="text-mint border border-mint px-2 py-1">
              OPEN
            </span>
            {resolutionSourceType && (
              <span className="text-tribe-b border border-tribe-b px-2 py-1">
                {resolutionSourceType.toUpperCase()}
              </span>
            )}
          </div>

          {/* Description */}
          {description && (
            <div className="text-sm text-text-muted leading-[1.4] max-h-16 overflow-hidden">
              {description.substring(0, 150)}
              {description.length > 150 ? "..." : ""}
            </div>
          )}

          {/* Outcomes */}
          {validOutcomes.length > 0 && (
            <div className="flex flex-col gap-1">
              {validOutcomes.map((outcome, i) => {
                const totalOutcomes = validOutcomes.length;
                const prob = 100 / totalOutcomes;
                // Color progression for outcomes
                const colors = [
                  "var(--mint)",
                  "var(--tribe-b)",
                  "var(--orange)",
                  "var(--yellow)",
                  "var(--text-muted)",
                ];
                const barColor = colors[i] || colors[4];
                return (
                  <div key={i}>
                    <div className="flex justify-between text-xs mb-1">
                      <span>{outcome}</span>
                      <span>{prob.toFixed(0)}%</span>
                    </div>
                    <div className="h-3 bg-bg-terminal border border-border-grid relative overflow-hidden">
                      <div
                        style={{
                          width: `${prob}%`,
                          height: "100%",
                          background: `linear-gradient(90deg, ${barColor} 0%, ${barColor} 100%)`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Bond Info */}
          {creationBond && (
            <div className="text-sm text-text-dim border-t border-border-grid pt-1.5">
              <div>Bond: {creationBond} SFR</div>
            </div>
          )}
        </div>
      </TerminalPanel>
    </div>
  );
}
