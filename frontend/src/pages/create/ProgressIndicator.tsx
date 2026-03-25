type WizardStep =
  | "title"
  | "description"
  | "outcomes"
  | "dates"
  | "resolution"
  | "bond"
  | "review"
  | "success";

const STEPS: WizardStep[] = ["title", "description", "outcomes", "dates", "resolution", "bond", "review", "success"];

interface ProgressIndicatorProps {
  currentStep: WizardStep;
}

export default function ProgressIndicator({ currentStep }: ProgressIndicatorProps) {
  const currentStepIndex = STEPS.indexOf(currentStep);

  return (
    <div className="border-b border-border-panel">
      <div className="page-shell mobile-scroll-row py-3">
        <div className="flex min-w-max items-center gap-3 text-[0.75rem] tracking-[0.06em] text-text-dim">
          {STEPS.map((stepName, index) => (
            <div key={stepName} className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div
                  className={`flex h-8 w-8 items-center justify-center border font-semibold ${
                    stepName === currentStep ? "border-mint text-mint" : "border-border-panel text-text-dim"
                  }`}
                >
                  {index + 1}
                </div>
                <span className="hidden text-[0.6rem] tracking-[0.12em] text-text-dim md:block">
                  {stepName.toUpperCase()}
                </span>
              </div>

              {index < STEPS.length - 1 && (
                <div
                  className={`h-px w-10 ${
                    stepName === currentStep || index < currentStepIndex ? "bg-mint" : "bg-border-panel"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
