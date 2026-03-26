import { useId } from "react";
import { MarketType } from "../../lib/market-types";

interface OutcomesStepProps {
  marketType: MarketType;
  outcomes: string[];
  onMarketTypeChange: (type: MarketType, outcomes: string[]) => void;
  onOutcomesChange: (outcomes: string[]) => void;
}

export default function OutcomesStep({
  marketType,
  outcomes,
  onMarketTypeChange,
  onOutcomesChange,
}: OutcomesStepProps) {
  const marketTypeId = useId();
  const outcomesLabelId = useId();

  const handleMarketTypeChange = (newTypeValue: string) => {
    const newType = Number(newTypeValue) as MarketType;
    if (newType === MarketType.BINARY) {
      onMarketTypeChange(newType, ["YES", "NO"]);
    } else if (newType === MarketType.CATEGORICAL) {
      onMarketTypeChange(newType, ["", "", ""]);
    }
  };

  return (
    <>
      <div>
        <label htmlFor={marketTypeId} className="block text-sm font-medium text-mint mb-2">
          Market Type
        </label>
        <select
          id={marketTypeId}
          value={marketType}
          onChange={(e) => handleMarketTypeChange(e.target.value)}
          className="w-full p-4 text-base bg-bg-terminal text-text border border-border-panel outline-none"
        >
          <option value="0">Yes / No - Simple two-outcome market</option>
          <option value="1">Multiple Choice - 3-8 custom outcomes</option>
        </select>
        <div className="mt-2 text-xs text-text-muted leading-relaxed">
          Public beta creation supports binary and categorical markets only.
        </div>
      </div>

      <div>
        <div id={outcomesLabelId} className="block text-sm font-medium text-mint mb-2">
          Outcomes
        </div>

        {/* Binary market */}
        {marketType === MarketType.BINARY && (
          <div className="flex flex-col gap-1.5 mt-2">
            {outcomes.map((outcome, i) => (
              <input
                key={i}
                aria-labelledby={outcomesLabelId}
                aria-label={`Outcome ${i + 1}`}
                type="text"
                value={outcome}
                onChange={(e) => {
                  const newOutcomes = [...outcomes];
                  newOutcomes[i] = e.target.value;
                  onOutcomesChange(newOutcomes);
                }}
                placeholder={outcome === "YES" ? "YES" : "NO"}
                className="p-4 text-base bg-bg-terminal text-text border border-border-panel outline-none"
              />
            ))}
          </div>
        )}

        {/* Categorical market */}
        {marketType === MarketType.CATEGORICAL && (
          <div>
            <div className="flex flex-col gap-1.5 mt-2">
              {outcomes.map((outcome, i) => (
                <input
                  key={i}
                  aria-labelledby={outcomesLabelId}
                  aria-label={`Outcome ${i + 1}`}
                  type="text"
                  value={outcome}
                  onChange={(e) => {
                    const newOutcomes = [...outcomes];
                    newOutcomes[i] = e.target.value;
                    onOutcomesChange(newOutcomes);
                  }}
                  placeholder={`Outcome ${i + 1} (e.g., "Faction Alpha")`}
                  className="p-4 text-base bg-bg-terminal text-text border border-border-panel outline-none"
                />
              ))}
            </div>
            {outcomes.length < 8 && (
              <button
                type="button"
                onClick={() => {
                  const newOutcomes = [...outcomes, ""];
                  onOutcomesChange(newOutcomes);
                }}
                className="mt-2 p-2 font-mono text-xs bg-[rgba(202,245,222,0.08)] text-mint border border-mint-dim cursor-pointer"
              >
                + ADD OUTCOME
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
