type WizardStep = "title" | "description" | "outcomes" | "dates" | "resolution" | "bond" | "review";

const STEPS: WizardStep[] = ["title", "description", "outcomes", "dates", "resolution", "bond", "review"];

interface ProgressIndicatorProps {
  currentStep: WizardStep;
}

export default function ProgressIndicator({ currentStep }: ProgressIndicatorProps) {
  const currentStepIndex = STEPS.indexOf(currentStep);

  return (
    <div className="border-b border-border-panel px-6 py-1.5 flex gap-2 items-center text-[0.75rem] text-text-dim tracking-[0.06em] overflow-auto">
      {STEPS.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <div
            className={`w-7 h-7 flex items-center justify-center font-semibold ${
              s === currentStep
                ? "border border-mint text-mint"
                : "border border-border-panel text-text-dim"
            }`}
          >
            {i + 1}
          </div>
          {i < STEPS.length - 1 && (
            <div
              className={`w-10 h-px ${
                s === currentStep || STEPS.indexOf(s) < currentStepIndex
                  ? "bg-mint"
                  : "bg-border-panel"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}
