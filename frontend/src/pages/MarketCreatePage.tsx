import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import TerminalScreen from "../components/terminal/TerminalScreen";
import TerminalPanel from "../components/terminal/TerminalPanel";
import PageHeader from "../components/ui/PageHeader";
import Footer from "../components/ui/Footer";
import {
  CreatorInfluenceLevel,
  MarketType,
  ResolutionClass,
  SourceFallback,
  TrustTier,
} from "../lib/market-types";
import { buildCreateMarketTransaction } from "../lib/market-transactions";
import { fetchCollateralCoins, formatCollateralAmount, parseCollateralInput } from "../lib/collateral";
import { COLLATERAL_SYMBOL } from "../lib/market-constants";
import { getMarketTypePolicyId, hasLiveProtocolDeployment } from "../lib/protocol-config";
import {
  getCreationBondMinRawFromConfig,
  getDisputeBondAmountRawFromConfig,
} from "../lib/protocol-runtime";
import {
  fetchMarketTypePolicy,
  getPolicyEvidenceFormatLabel,
  getPolicySourceTypeLabel,
} from "../lib/protocol-policy";
import { useProtocolRuntimeConfig } from "../hooks/useProtocolRuntimeConfig";
import { useSponsoredTransaction } from "../hooks/useSponsoredTransaction";
import TitleStep from "./create/TitleStep";
import DescriptionStep from "./create/DescriptionStep";
import OutcomesStep from "./create/OutcomesStep";
import DatesStep from "./create/DatesStep";
import ResolutionStep from "./create/ResolutionStep";
import BondStep from "./create/BondStep";
import ReviewStep from "./create/ReviewStep";
import ProgressIndicator from "./create/ProgressIndicator";
import MarketPreview from "./create/MarketPreview";

type WizardStep = "title" | "description" | "outcomes" | "dates" | "resolution" | "bond" | "review";
type PublicProfile = "sourceBackedCommunity" | "openCommunity";

const STEPS: WizardStep[] = ["title", "description", "outcomes", "dates", "resolution", "bond", "review"];

const STEP_LABELS: Record<WizardStep, string> = {
  title: "MARKET TITLE",
  description: "DESCRIPTION",
  outcomes: "OUTCOMES",
  dates: "TIMELINE",
  resolution: "COMMUNITY SETTLEMENT",
  bond: "BOND AMOUNT",
  review: "REVIEW & SUBMIT",
};

interface FormData {
  title: string;
  description: string;
  marketType: MarketType;
  trustTier: PublicProfile;
  outcomes: string[];
  closeDate: string;
  resolutionSourceType: string;
  resolutionSourceUri: string;
  resolutionRules: string;
  creatorControls: boolean;
  creationBond: string;
  resolutionBond: string;
}

function rawToInputString(amount: bigint): string {
  return formatCollateralAmount(amount, { minimumFractionDigits: 0 });
}

function mapTrustTier(profile: PublicProfile): TrustTier {
  return profile === "sourceBackedCommunity" ? TrustTier.CREATOR_RESOLVED : TrustTier.EXPERIMENTAL;
}

export default function MarketCreatePage() {
  const account = useCurrentAccount();
  const { executeSponsoredTx } = useSponsoredTransaction();
  const { data: protocolConfig, isLoading: configLoading } = useProtocolRuntimeConfig();

  const [step, setStep] = useState<WizardStep>("title");
  const [formData, setFormData] = useState<FormData>({
    title: "",
    description: "",
    marketType: MarketType.BINARY,
    trustTier: "sourceBackedCommunity",
    outcomes: ["YES", "NO"],
    closeDate: "",
    resolutionSourceType: "Public Document",
    resolutionSourceUri: "",
    resolutionRules: "",
    creatorControls: false,
    creationBond: "0",
    resolutionBond: "0",
  });

  useEffect(() => {
    if (!protocolConfig) {
      return;
    }

    const trustTier = mapTrustTier(formData.trustTier);
    const minCreationBond = rawToInputString(getCreationBondMinRawFromConfig(protocolConfig, trustTier));
    const disputeBond = rawToInputString(getDisputeBondAmountRawFromConfig(protocolConfig));

    setFormData((current) => ({
      ...current,
      creationBond: current.creationBond === "0" ? minCreationBond : current.creationBond,
      resolutionBond: disputeBond,
    }));
  }, [protocolConfig, formData.trustTier]);

  const selectedTrustTier = mapTrustTier(formData.trustTier);
  const selectedResolutionClass = ResolutionClass.CREATOR_PROPOSED;
  const selectedPolicyId = useMemo(
    () =>
      getMarketTypePolicyId({
        trustTier: selectedTrustTier,
        marketType: formData.marketType,
        resolutionClass: selectedResolutionClass,
      }),
    [selectedTrustTier, formData.marketType],
  );
  const { data: selectedPolicy, isLoading: policyLoading } = useQuery({
    queryKey: ["market-type-policy", selectedPolicyId],
    queryFn: () => fetchMarketTypePolicy(selectedPolicyId),
    staleTime: 60_000,
  });

  const policySourceType = selectedPolicy ? getPolicySourceTypeLabel(selectedPolicy) : null;
  const policyEvidenceLabel = selectedPolicy ? getPolicyEvidenceFormatLabel(selectedPolicy) : null;

  useEffect(() => {
    if (!policySourceType) {
      return;
    }

    setFormData((current) =>
      current.resolutionSourceType === policySourceType
        ? current
        : {
            ...current,
            resolutionSourceType: policySourceType,
          },
    );
  }, [policySourceType]);

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

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!account) {
      setSubmitError("Connect wallet first.");
      return;
    }
    if (!protocolConfig) {
      setSubmitError("Live protocol config is still syncing.");
      return;
    }
    if (!hasLiveProtocolDeployment()) {
      setSubmitError("Protocol manifest is not bootstrapped yet.");
      return;
    }
    if (!selectedPolicy || !selectedPolicy.active) {
      setSubmitError("Selected market policy is not live yet.");
      return;
    }
    if (!formData.title.trim() || !formData.description.trim()) {
      setSubmitError("Title and description are required.");
      return;
    }
    if (!formData.resolutionRules.trim()) {
      setSubmitError("Resolution rules are required for public beta markets.");
      return;
    }
    if (formData.trustTier === "sourceBackedCommunity" && !formData.resolutionSourceUri.trim()) {
      setSubmitError("Source-backed community markets require a source URL.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const closeMs = formData.closeDate
        ? BigInt(new Date(formData.closeDate).getTime())
        : BigInt(Date.now() + 7 * 86400000);
      const bondAmount = parseCollateralInput(formData.creationBond);
      const inventory = await fetchCollateralCoins(account.address);

      if (inventory.totalBalance < bondAmount) {
        setSubmitError(`Not enough ${COLLATERAL_SYMBOL} for the creation bond.`);
        return;
      }

      const trustTier = mapTrustTier(formData.trustTier);
      const tx = buildCreateMarketTransaction({
        title: formData.title,
        description: formData.description,
        resolutionText: formData.resolutionRules,
        marketType: formData.marketType,
        trustTier,
        resolutionClass: selectedResolutionClass,
        outcomeCount: formData.outcomes.length,
        outcomeLabels: formData.outcomes,
        closeTimeMs: closeMs,
        resolveDeadlineMs: closeMs + BigInt(72 * 60 * 60 * 1000),
        sourceClass: selectedPolicy.requiredSourceClass,
        sourceUri: formData.resolutionSourceUri,
        sourceDescription:
          formData.trustTier === "sourceBackedCommunity"
            ? `${formData.resolutionSourceType} / source-backed community`
            : `${formData.resolutionSourceType} / open community`,
        evidenceFormat: selectedPolicy.requiredEvidenceFormat,
        sourceArchived: false,
        creatorControlsSource: formData.creatorControls,
        verifierSubmissionRequired: false,
        fallbackOnSourceUnavailable: SourceFallback.CREATOR_PROPOSES,
        influenceLevel: formData.creatorControls
          ? CreatorInfluenceLevel.DIRECT
          : CreatorInfluenceLevel.NONE,
        creatorIsSourceController: formData.creatorControls,
        disclosureText: formData.creatorControls ? "Creator disclosed source influence." : "",
        bondCoinIds: inventory.coinObjectIds,
        bondAmount,
      });

      await executeSponsoredTx(tx);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Transaction failed";
      setSubmitError(message);
      console.error("Market creation failed:", error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <TerminalScreen>
      <div className="min-h-screen flex flex-col overflow-x-hidden">
        <PageHeader subtitle="CREATE COMMUNITY MARKET" showBack />

        <ProgressIndicator currentStep={step} />

        <main className="page-shell page-section panel-stack panel-stack--create flex-1 items-start">
          <div className="min-w-0">
            <TerminalPanel title={STEP_LABELS[step]}>
              <div className="flex flex-col gap-4">
                {configLoading && (
                  <div className="border border-border-panel bg-[rgba(202,245,222,0.05)] px-4 py-3 text-[0.72rem] tracking-[0.08em] text-text-dim">
                    SYNCING LIVE PROTOCOL ECONOMICS...
                  </div>
                )}

                {policyLoading && (
                  <div className="border border-border-panel bg-[rgba(202,245,222,0.05)] px-4 py-3 text-[0.72rem] tracking-[0.08em] text-text-dim">
                    LOADING LIVE MARKET POLICY...
                  </div>
                )}

                {step === "title" && (
                  <TitleStep title={formData.title} onChange={(value) => setFormData({ ...formData, title: value })} />
                )}

                {step === "description" && (
                  <DescriptionStep
                    description={formData.description}
                    onChange={(value) => setFormData({ ...formData, description: value })}
                  />
                )}

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
                    onOutcomesChange={(outcomes) => setFormData({ ...formData, outcomes })}
                  />
                )}

                {step === "dates" && (
                  <DatesStep closeDate={formData.closeDate} onChange={(value) => setFormData({ ...formData, closeDate: value })} />
                )}

                {step === "resolution" && (
                  <ResolutionStep
                    trustTier={formData.trustTier}
                    resolutionSourceType={formData.resolutionSourceType}
                    resolutionSourceUri={formData.resolutionSourceUri}
                    resolutionRules={formData.resolutionRules}
                    creatorControls={formData.creatorControls}
                    allowedSourceTypes={policySourceType ? [policySourceType] : undefined}
                    requiredEvidenceLabel={policyEvidenceLabel}
                    onTrustTierChange={(tier) => {
                      if (!protocolConfig) {
                        setFormData({
                          ...formData,
                          trustTier: tier,
                        });
                        return;
                      }

                      const mappedTier = mapTrustTier(tier);
                      setFormData({
                        ...formData,
                        trustTier: tier,
                        creationBond: rawToInputString(getCreationBondMinRawFromConfig(protocolConfig, mappedTier)),
                        resolutionBond: rawToInputString(getDisputeBondAmountRawFromConfig(protocolConfig)),
                      });
                    }}
                    onSourceTypeChange={(value) => setFormData({ ...formData, resolutionSourceType: value })}
                    onSourceUriChange={(value) => setFormData({ ...formData, resolutionSourceUri: value })}
                    onRulesChange={(value) => setFormData({ ...formData, resolutionRules: value })}
                    onCreatorControlsChange={(value) => setFormData({ ...formData, creatorControls: value })}
                  />
                )}

                {step === "bond" && (
                  <BondStep
                    trustTier={formData.trustTier}
                    creationBond={formData.creationBond}
                    resolutionBond={formData.resolutionBond}
                    runtimeConfig={protocolConfig ?? null}
                    onCreationBondChange={(value) => setFormData({ ...formData, creationBond: value })}
                  />
                )}

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

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                onClick={handlePrev}
                disabled={isFirstStep}
                className={`touch-target flex-1 border px-4 py-3 font-mono text-xs font-semibold tracking-[0.08em] transition-all duration-200 ${
                  !isFirstStep
                    ? "cursor-pointer border-tribe-b-dim bg-[rgba(77,184,212,0.12)] text-tribe-b"
                    : "cursor-not-allowed border-border-inactive bg-[rgba(0,0,0,0.3)] text-text-dim"
                }`}
              >
                &lt; PREV
              </button>

              {isLastStep ? (
                <button
                  onClick={handleSubmit}
                  disabled={!formData.title || submitting || configLoading}
                  className={`touch-target flex-1 border px-4 py-3 font-mono text-xs font-semibold tracking-[0.08em] transition-all duration-200 ${
                    formData.title && !submitting && !configLoading
                      ? "cursor-pointer border-mint-dim bg-[rgba(202,245,222,0.15)] text-mint"
                      : "cursor-not-allowed border-border-inactive bg-[rgba(0,0,0,0.3)] text-text-dim"
                  }`}
                >
                  {submitting ? "SUBMITTING..." : "SUBMIT MARKET"}
                </button>
              ) : (
                <button
                  onClick={handleNext}
                  className="touch-target flex-1 border border-mint-dim bg-[rgba(202,245,222,0.12)] px-4 py-3 font-mono text-xs font-semibold tracking-[0.08em] text-mint transition-all duration-200 hover:bg-[rgba(202,245,222,0.2)]"
                >
                  NEXT &gt;
                </button>
              )}
            </div>

            {submitError && (
              <div className="mt-3 border border-orange-dim bg-[rgba(221,122,31,0.08)] px-4 py-3 text-[0.7rem] tracking-[0.08em] text-orange">
                {submitError}
              </div>
            )}
          </div>

          <div className="min-w-0">
            <MarketPreview
              title={formData.title}
              description={formData.description}
              marketType={formData.marketType}
              closeDate={formData.closeDate}
              trustTier={formData.trustTier}
              outcomes={formData.outcomes}
              resolutionSourceType={formData.resolutionSourceType}
              creationBond={formData.creationBond}
            />
          </div>
        </main>

        <Footer />
      </div>
    </TerminalScreen>
  );
}
