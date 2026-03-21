import { MarketType, MARKET_TYPE_LABELS } from "../../lib/market-types";
import TerminalNumberInput from "../../components/ui/TerminalNumberInput";

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
  const handleMarketTypeChange = (newTypeValue: string) => {
    const newType = Number(newTypeValue) as MarketType;
    let newOutcomes: string[] = [];
    if (newType === MarketType.BINARY) {
      newOutcomes = ["YES", "NO"];
    } else if (newType === MarketType.CATEGORICAL) {
      newOutcomes = ["", "", ""];
    } else if (newType === 2) {
      // BUCKETED_SCALAR
      newOutcomes = [];
    }
    onMarketTypeChange(newType, newOutcomes);
  };

  return (
    <>
      <div>
        <label className="block text-sm font-medium text-mint mb-2">
          Market Type
        </label>
        <select
          value={marketType}
          onChange={(e) => handleMarketTypeChange(e.target.value)}
          className="w-full p-4 text-base bg-bg-terminal text-text border border-border-panel outline-none"
        >
          <option value="0">Yes / No — Simple two-outcome market</option>
          <option value="1">Multiple Choice — 3-8 custom outcomes</option>
          <option value="2">Range Market — Bet on a numeric range</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-mint mb-2">
          Outcomes
        </label>

        {/* Binary market */}
        {marketType === MarketType.BINARY && (
          <div className="flex flex-col gap-1.5 mt-2">
            {outcomes.map((outcome, i) => (
              <input
                key={i}
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

        {/* Bucketed Scalar market */}
        {marketType === 2 && (
          <div className="flex flex-col gap-3.5 mt-2">
            <div className="p-4 bg-[rgba(202,245,222,0.04)] border border-border-panel text-sm text-text-muted leading-relaxed">
              <div className="mb-3.5">
                Define a numeric range. The range will be split into equal
                buckets. Traders bet on which bucket the actual value falls in.
              </div>
              <div className="text-[0.85rem] italic">
                Example: Min: 0, Max: 100, Buckets: 4 → [0-25), [25-50),
                [50-75), [75-100]
              </div>
            </div>
            <TerminalNumberInput
              value=""
              onChange={() => {}}
              label="Min Value"
              placeholder="0"
              min={0}
            />
            <TerminalNumberInput
              value=""
              onChange={() => {}}
              label="Max Value"
              placeholder="100"
              min={0}
            />
            <TerminalNumberInput
              value=""
              onChange={() => {}}
              label="Number of Buckets"
              placeholder="4"
              min={2}
              max={20}
            />
          </div>
        )}
      </div>
    </>
  );
}
