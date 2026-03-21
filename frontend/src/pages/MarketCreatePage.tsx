import { useState } from "react";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import TerminalScreen from "../components/terminal/TerminalScreen";
import TerminalPanel from "../components/terminal/TerminalPanel";
import PageHeader from "../components/ui/PageHeader";
import Footer from "../components/ui/Footer";
import { MarketType } from "../lib/market-types";
import { buildCreateMarketTransaction } from "../lib/market-transactions";
import TitleStep from "./create/TitleStep";
import DescriptionStep from "./create/DescriptionStep";
import OutcomesStep from "./create/OutcomesStep";
import DatesStep from "./create/DatesStep";
import ResolutionStep from "./create/ResolutionStep";
import BondStep from "./create/BondStep";
import ReviewStep from "./create/ReviewStep";
import ProgressIndicator from "./create/ProgressIndicator";
import MarketPreview from "./create/MarketPreview";

const styles = `
  @media (max-width: 768px) {
    .market-create-grid {
      grid-template-columns: 1fr !important;
    }
    .market-create-preview {
      order: 2;
    }
  }

  @media (max-width: 768px) {
    .bond-grid {
      grid-template-columns: 1fr !important;
    }
  }
`;

type WizardStep = "title" | "description" | "outcomes" | "dates" | "resolution" | "bond" | "review";

const STEPS: WizardStep[] = ["title", "description", "outcomes", "dates", "resolution", "bond", "review"];

const STEP_LABELS: Record<WizardStep, string> = {
  title: "MARKET TITLE",
  description: "DESCRIPTION",
  outcomes: "OUTCOMES",
  dates: "TIMELINE",
  resolution: "RESOLUTION & TRUST",
  bond: "BOND AMOUNT",
  review: "REVIEW & SUBMIT",
};

interface FormData {
  title: string;
  description: string;
  marketType: MarketType;
  trustTier: "verified" | "sourced" | "community" | "experimental";
  outcomes: string[];
  closeDate: string;
  resolutionSourceType: string;
  resolutionSourceUri: string;
  resolutionRules: string;
  creatorControls: boolean;
  creationBond: string;
  resolutionBond: string;
}

export default function MarketCreatePage() {
  const [step, setStep] = useState<WizardStep>("title");
  const [formData, setFormData] = useState<FormData>({
    title: "",
    description: "",
    marketType: MarketType.BINARY,
    trustTier: "sourced",
    outcomes: ["YES", "NO"],
    closeDate: "",
    resolutionSourceType: "Official API",
    resolutionSourceUri: "",
    resolutionRules: "",
    creatorControls: false,
    creationBond: "500",
    resolutionBond: "5000",
  });

  const currentStepIndex = STEPS.indexOf(step);
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === STEPS.length - 1;

  const handleNext = () => {
    if (!isLastStep) {
      setStep(STEPS[currentStepIndex + 1]);
    }
  };

  const handlePrev = () => {
    if (!isFirstStep) {
      setStep(STEPS[currentStepIndex - 1]);
    }
  };

  const account = useCurrentAccount();
  const dAppKit = useDAppKit();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!account) {
      setSubmitError("Connect wallet first");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const closeMs = formData.closeDate ? BigInt(new Date(formData.closeDate).getTime()) : BigInt(Date.now() + 7 * 86400000);
      const tx = buildCreateMarketTransaction({
        title: formData.title,
        description: formData.description,
        resolutionText: formData.resolutionRules,
        outcomeCount: formData.outcomes.length,
        outcomeLabels: formData.outcomes,
        closeTimeMs: closeMs,
        resolveDeadlineMs: closeMs + BigInt(72 * 60 * 60 * 1000),
        sourceClass: 0,
        sourceUri: formData.resolutionSourceUri,
        sourceDescription: formData.resolutionSourceType,
        evidenceFormat: 0,
        sourceArchived: false,
        creatorControlsSource: formData.creatorControls,
        verifierSubmissionRequired: false,
        fallbackOnSourceUnavailable: 0,
        influenceLevel: 0,
        creatorIsSourceController: formData.creatorControls,
        disclosureText: "",
        bondCoinId: "", // user's SFR coin object ID — resolved at sign time
      });
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
    } catch (e: any) {
      setSubmitError(e.message || "Transaction failed");
      console.error("Market creation failed:", e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <TerminalScreen>
      <div className="min-h-screen flex flex-col overflow-hidden">
        <PageHeader subtitle="CREATE MARKET" showBack />

        {/* Progress Indicator */}
        <ProgressIndicator currentStep={step} />

        {/* Main content */}
        <style>{styles}</style>
        <div
          className="market-create-grid flex-1 p-8 grid gap-8"
          style={{ gridTemplateColumns: "1fr 1fr" }}
        >
          {/* Form */}
          <div>
            <TerminalPanel title={STEP_LABELS[step]}>
              <div className="flex flex-col gap-4">
                {/* Title Step */}
                {step === "title" && (
                  <TitleStep
                    title={formData.title}
                    onChange={(value) =>
                      setFormData({ ...formData, title: value })
                    }
                  />
                )}

                {/* Description Step */}
                {step === "description" && (
                  <DescriptionStep
                    description={formData.description}
                    onChange={(value) =>
                      setFormData({ ...formData, description: value })
                    }
                  />
                )}

                {/* Outcomes Step */}
                {step === "outcomes" && (
                  <OutcomesStep
                    marketType={formData.marketType}
                    outcomes={formData.outcomes}
                    onMarketTypeChange={(type, outcomes) =>
                      setFormData({
                        ...formData,
                        marketType: type,
                        outcomes,
                      })
                    }
                    onOutcomesChange={(outcomes) =>
                      setFormData({ ...formData, outcomes })
                    }
                  />
                )}

                {/* Dates Step */}
                {step === "dates" && (
                  <DatesStep
                    closeDate={formData.closeDate}
                    onChange={(value) =>
                      setFormData({ ...formData, closeDate: value })
                    }
                  />
                )}

                {/* Resolution Step */}
                {step === "resolution" && (
                  <ResolutionStep
                    trustTier={formData.trustTier}
                    resolutionSourceType={formData.resolutionSourceType}
                    resolutionSourceUri={formData.resolutionSourceUri}
                    resolutionRules={formData.resolutionRules}
                    creatorControls={formData.creatorControls}
                    onTrustTierChange={(tier) => {
                      const BOND_TIERS: Record<
                        string,
                        { creation: number; dispute: number }
                      > = {
                        verified: { creation: 250, dispute: 2500 },
                        sourced: { creation: 500, dispute: 5000 },
                        community: { creation: 1000, dispute: 7500 },
                        experimental: { creation: 2000, dispute: 10000 },
                      };
                      const bonds = BOND_TIERS[tier];
                      setFormData({
                        ...formData,
                        trustTier: tier,
                        creationBond: bonds.creation.toString(),
                        resolutionBond: bonds.dispute.toString(),
                      });
                    }}
                    onSourceTypeChange={(value) =>
                      setFormData({
                        ...formData,
                        resolutionSourceType: value,
                      })
                    }
                    onSourceUriChange={(value) =>
                      setFormData({
                        ...formData,
                        resolutionSourceUri: value,
                      })
                    }
                    onRulesChange={(value) =>
                      setFormData({
                        ...formData,
                        resolutionRules: value,
                      })
                    }
                    onCreatorControlsChange={(value) =>
                      setFormData({
                        ...formData,
                        creatorControls: value,
                      })
                    }
                  />
                )}

                {/* Bond Step */}
                {step === "bond" && (
                  <BondStep
                    trustTier={formData.trustTier}
                    creationBond={formData.creationBond}
                    resolutionBond={formData.resolutionBond}
                    onCreationBondChange={(value) =>
                      setFormData({ ...formData, creationBond: value })
                    }
                  />
                )}

                {/* Review Step */}
                {step === "review" && (
                  <ReviewStep
                    title={formData.title}
                    description={formData.description}
                    marketType={formData.marketType}
                    trustTier={formData.trustTier}
                    outcomes={formData.outcomes}
                    closeDate={formData.closeDate}
                    resolutionSourceType={formData.resolutionSourceType}
                    resolutionSourceUri={formData.resolutionSourceUri}
                    creatorControls={formData.creatorControls}
                    creationBond={formData.creationBond}
                    resolutionBond={formData.resolutionBond}
                  />
                )}
              </div>
            </TerminalPanel>

            {/* Navigation */}
            <div className="mt-4 flex gap-2">
              <button
                onClick={handlePrev}
                disabled={isFirstStep}
                className={`flex-1 p-3.5 font-mono text-xs font-semibold tracking-[0.08em] transition-all duration-200 ${
                  !isFirstStep
                    ? "bg-[rgba(77,184,212,0.12)] text-tribe-b border border-tribe-b-dim cursor-pointer"
                    : "bg-[rgba(0,0,0,0.3)] text-text-dim border border-border-inactive cursor-not-allowed"
                }`}
              >
                ← PREV
              </button>

              {isLastStep ? (
                <button
                  onClick={handleSubmit}
                  disabled={!formData.title}
                  className={`flex-1 p-3.5 font-mono text-xs font-semibold tracking-[0.08em] transition-all duration-200 ${
                    formData.title
                      ? "bg-[rgba(202,245,222,0.15)] text-mint border border-mint-dim cursor-pointer"
                      : "bg-[rgba(0,0,0,0.3)] text-text-dim border border-border-inactive cursor-not-allowed"
                  }`}
                >
                  SUBMIT MARKET
                </button>
              ) : (
                <button
                  onClick={handleNext}
                  className="flex-1 p-3.5 font-mono text-xs font-semibold tracking-[0.08em] bg-[rgba(202,245,222,0.12)] text-mint border border-mint-dim cursor-pointer transition-all duration-200 hover:bg-[rgba(202,245,222,0.2)]"
                >
                  NEXT →
                </button>
              )}
            </div>
          </div>

          {/* Preview */}
          <MarketPreview
            title={formData.title}
            description={formData.description}
            closeDate={formData.closeDate}
            trustTier={formData.trustTier}
            outcomes={formData.outcomes}
            resolutionSourceType={formData.resolutionSourceType}
            creationBond={formData.creationBond}
          />
        </div>

        <Footer />
      </div>
    </TerminalScreen>
  );
}
