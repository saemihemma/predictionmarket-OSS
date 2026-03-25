import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { useNavigate } from "react-router-dom";
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
import {
  fetchCollateralCoins,
  formatCollateralAmount,
  formatCollateralInputAmount,
  normalizeCollateralInput,
  parseCollateralInput,
} from "../lib/collateral";
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
import { formatLocalDateTime, parseLocalDateTime } from "./create/DateTimePicker";

type FormStep = "title" | "description" | "outcomes" | "dates" | "resolution" | "bond" | "review";
type WizardStep = FormStep | "success";
type PublicProfile = "sourceBackedCommunity" | "openCommunity";
type StepValidationMap = Record<FormStep, string[]>;

const FORM_STEPS: FormStep[] = ["title", "description", "outcomes", "dates", "resolution", "bond", "review"];
const STEPS: WizardStep[] = [...FORM_STEPS, "success"];
const EXPLORER_BASE_URL = "https://testnet.suivision.xyz/txblock";

const STEP_LABELS: Record<WizardStep, string> = {
  title: "MARKET TITLE",
  description: "DESCRIPTION",
  outcomes: "OUTCOMES",
  dates: "TIMELINE",
  resolution: "COMMUNITY SETTLEMENT",
  bond: "BOND AMOUNT",
  review: "REVIEW & SUBMIT",
  success: "SUCCESS",
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
}

function createInitialFormData(): FormData {
  return {
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
    creationBond: "",
  };
}

function mapTrustTier(profile: PublicProfile): TrustTier {
  return profile === "sourceBackedCommunity" ? TrustTier.CREATOR_RESOLVED : TrustTier.EXPERIMENTAL;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function sanitizeWizardError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Transaction failed.";
  const lowerMessage = message.toLowerCase();

  if (
    lowerMessage.includes("bigint") ||
    lowerMessage.includes("invalid collateral input") ||
    lowerMessage.includes("cannot convert")
  ) {
    return "Enter the creation bond as a number, for example 1000 or 1000.00.";
  }

  return message;
}

function buildExplorerUrl(digest: string): string {
  return `${EXPLORER_BASE_URL}/${digest}`;
}

export default function MarketCreatePage() {
  const navigate = useNavigate();
  const account = useCurrentAccount();
  const { executeSponsoredTx } = useSponsoredTransaction();
  const { data: protocolConfig, isLoading: configLoading } = useProtocolRuntimeConfig();

  const [step, setStep] = useState<WizardStep>("title");
  const [formData, setFormData] = useState<FormData>(() => createInitialFormData());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successDigest, setSuccessDigest] = useState<string | null>(null);

  const patchFormData = (patch: Partial<FormData>) => {
    setSubmitError(null);
    setFormData((current) => ({
      ...current,
      ...patch,
    }));
  };

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

  const minimumCreationBondRaw = useMemo(
    () => (protocolConfig ? getCreationBondMinRawFromConfig(protocolConfig, selectedTrustTier) : null),
    [protocolConfig, selectedTrustTier],
  );
  const disputeBondRaw = useMemo(
    () => (protocolConfig ? getDisputeBondAmountRawFromConfig(protocolConfig) : null),
    [protocolConfig],
  );
  const minimumCreationBondInput = minimumCreationBondRaw ? formatCollateralInputAmount(minimumCreationBondRaw) : "";
  const minimumCreationBondDisplay = minimumCreationBondRaw
    ? formatCollateralAmount(minimumCreationBondRaw, { minimumFractionDigits: 0 })
    : "--";
  const resolutionBondDisplay = disputeBondRaw
    ? formatCollateralAmount(disputeBondRaw, { withSymbol: true, minimumFractionDigits: 0 })
    : `-- ${COLLATERAL_SYMBOL}`;

  useEffect(() => {
    if (!minimumCreationBondRaw) {
      return;
    }

    setFormData((current) => {
      const currentInput = current.creationBond.trim();
      if (!currentInput) {
        return {
          ...current,
          creationBond: formatCollateralInputAmount(minimumCreationBondRaw),
        };
      }

      try {
        const parsed = parseCollateralInput(currentInput);
        if (parsed < minimumCreationBondRaw) {
          return {
            ...current,
            creationBond: formatCollateralInputAmount(minimumCreationBondRaw),
          };
        }
      } catch {
        return current;
      }

      return current;
    });
  }, [minimumCreationBondRaw]);

  const currentStepIndex = STEPS.indexOf(step);
  const isFirstStep = currentStepIndex === 0;
  const isReviewStep = step === "review";
  const isSuccessStep = step === "success";
  const explorerUrl = successDigest ? buildExplorerUrl(successDigest) : null;

  const trimmedTitle = formData.title.trim();
  const trimmedDescription = formData.description.trim();
  const trimmedRules = formData.resolutionRules.trim();
  const trimmedSourceUri = formData.resolutionSourceUri.trim();
  const trimmedOutcomes = formData.outcomes.map((outcome) => outcome.trim());
  const filledOutcomes = trimmedOutcomes.filter((outcome) => outcome.length > 0);
  const closeDateValue = parseLocalDateTime(formData.closeDate);
  const closeDateDisplay = formData.closeDate ? formatLocalDateTime(formData.closeDate) : "";
  const normalizedCreationBondInput = normalizeCollateralInput(formData.creationBond);
  const creationBondHasInvalidStructure =
    normalizedCreationBondInput.length > 0 && !/^\d*(\.\d*)?$/.test(normalizedCreationBondInput);

  let parsedCreationBond: bigint | null = null;
  if (!creationBondHasInvalidStructure && normalizedCreationBondInput.length > 0) {
    try {
      parsedCreationBond = parseCollateralInput(normalizedCreationBondInput);
    } catch {
      parsedCreationBond = null;
    }
  }

  const creationBondDisplay =
    parsedCreationBond !== null
      ? formatCollateralAmount(parsedCreationBond, { withSymbol: true, minimumFractionDigits: 0 })
      : normalizedCreationBondInput.length > 0
        ? `Enter a valid bond amount in ${COLLATERAL_SYMBOL}`
        : `Set a bond amount in ${COLLATERAL_SYMBOL}`;

  const validationByStep = useMemo<StepValidationMap>(() => {
    const titleMessages: string[] = [];
    const descriptionMessages: string[] = [];
    const outcomesMessages: string[] = [];
    const datesMessages: string[] = [];
    const resolutionMessages: string[] = [];
    const bondMessages: string[] = [];

    if (!trimmedTitle) {
      titleMessages.push("Enter a market title.");
    }

    if (!trimmedDescription) {
      descriptionMessages.push("Add a description so traders know what the market is about.");
    }

    if (formData.marketType === MarketType.BINARY) {
      if (trimmedOutcomes.length !== 2 || trimmedOutcomes.some((outcome) => outcome.length === 0)) {
        outcomesMessages.push("Binary markets need two non-empty outcomes.");
      }
    } else if (formData.marketType === MarketType.CATEGORICAL) {
      if (filledOutcomes.length < 3) {
        outcomesMessages.push("Multiple choice markets need at least three outcomes.");
      }
      if (trimmedOutcomes.length > 8) {
        outcomesMessages.push("Multiple choice markets can have up to eight outcomes.");
      }
      if (trimmedOutcomes.some((outcome) => outcome.length === 0)) {
        outcomesMessages.push("Fill in each outcome or remove the empty ones before continuing.");
      }
    }

    if (!formData.closeDate) {
      datesMessages.push("Choose when trading should close.");
    } else if (!closeDateValue) {
      datesMessages.push("Pick a valid close date and time.");
    } else if (closeDateValue.getTime() <= Date.now()) {
      datesMessages.push("Choose a close date in the future.");
    }

    if (policyLoading) {
      resolutionMessages.push("Live market policy is still loading.");
    } else if (!selectedPolicy || !selectedPolicy.active) {
      resolutionMessages.push("The selected market policy is not live yet.");
    }
    if (!trimmedRules) {
      resolutionMessages.push("Add resolution rules so the community can settle the market.");
    }
    if (formData.trustTier === "sourceBackedCommunity" && !trimmedSourceUri) {
      resolutionMessages.push("Source-backed community markets require a primary source URL.");
    }
    if (trimmedSourceUri && !isValidHttpUrl(trimmedSourceUri)) {
      resolutionMessages.push("Enter a valid source URL starting with http:// or https://.");
    }

    if (configLoading || !minimumCreationBondRaw) {
      bondMessages.push("Live protocol economics are still syncing.");
    }
    if (!normalizedCreationBondInput) {
      bondMessages.push("Enter the creation bond as a number.");
    } else if (creationBondHasInvalidStructure || parsedCreationBond === null) {
      bondMessages.push("Enter the creation bond as a number, for example 1000 or 1000.00.");
    } else if (minimumCreationBondRaw && parsedCreationBond < minimumCreationBondRaw) {
      bondMessages.push(`Creation bond must be at least ${minimumCreationBondDisplay} ${COLLATERAL_SYMBOL}.`);
    }

    const reviewMessages = [
      ...titleMessages,
      ...descriptionMessages,
      ...outcomesMessages,
      ...datesMessages,
      ...resolutionMessages,
      ...bondMessages,
    ];

    if (!account) {
      reviewMessages.push("Connect your wallet to submit the market.");
    }
    if (!hasLiveProtocolDeployment()) {
      reviewMessages.push("Live protocol deployment details are not available yet.");
    }

    return {
      title: titleMessages,
      description: descriptionMessages,
      outcomes: outcomesMessages,
      dates: datesMessages,
      resolution: resolutionMessages,
      bond: bondMessages,
      review: reviewMessages,
    };
  }, [
    account,
    closeDateValue,
    configLoading,
    creationBondHasInvalidStructure,
    filledOutcomes.length,
    formData.closeDate,
    formData.marketType,
    formData.trustTier,
    hasLiveProtocolDeployment,
    minimumCreationBondDisplay,
    minimumCreationBondRaw,
    normalizedCreationBondInput,
    parsedCreationBond,
    policyLoading,
    selectedPolicy,
    trimmedDescription,
    trimmedOutcomes,
    trimmedRules,
    trimmedSourceUri,
    trimmedTitle,
  ]);

  const currentStepMessages = step === "success" ? [] : validationByStep[step];
  const firstInvalidStep =
    FORM_STEPS.find((candidate) => candidate !== "review" && validationByStep[candidate].length > 0) ?? null;
  const canAdvance = !isReviewStep && !isSuccessStep && currentStepMessages.length === 0 && !submitting;
  const canSubmit = validationByStep.review.length === 0 && !submitting;

  const handleNext = () => {
    if (!canAdvance) {
      return;
    }

    setStep(STEPS[currentStepIndex + 1]);
  };

  const handlePrev = () => {
    if (!isFirstStep) {
      setStep(STEPS[currentStepIndex - 1]);
    }
  };

  const handleCreateAnother = () => {
    setSuccessDigest(null);
    setSubmitError(null);
    setSubmitting(false);
    setFormData(createInitialFormData());
    setStep("title");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async () => {
    if (validationByStep.review.length > 0 || !parsedCreationBond || !closeDateValue) {
      setSubmitError("Finish the remaining required fields before submitting.");
      if (firstInvalidStep) {
        setStep(firstInvalidStep);
      }
      return;
    }
    if (!account) {
      setSubmitError("Connect your wallet to submit the market.");
      return;
    }
    if (!protocolConfig) {
      setSubmitError("Live protocol economics are still syncing.");
      return;
    }
    if (!hasLiveProtocolDeployment()) {
      setSubmitError("Live protocol deployment details are not available yet.");
      return;
    }
    if (!selectedPolicy || !selectedPolicy.active) {
      setSubmitError("The selected market policy is not live yet.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSuccessDigest(null);

    try {
      const closeMs = BigInt(closeDateValue.getTime());
      const inventory = await fetchCollateralCoins(account.address);

      if (inventory.totalBalance < parsedCreationBond) {
        setSubmitError(`Not enough ${COLLATERAL_SYMBOL} for the creation bond.`);
        return;
      }

      const tx = buildCreateMarketTransaction({
        title: trimmedTitle,
        description: trimmedDescription,
        resolutionText: trimmedRules,
        marketType: formData.marketType,
        trustTier: selectedTrustTier,
        resolutionClass: selectedResolutionClass,
        outcomeCount: filledOutcomes.length,
        outcomeLabels: filledOutcomes,
        closeTimeMs: closeMs,
        resolveDeadlineMs: closeMs + BigInt(72 * 60 * 60 * 1000),
        sourceClass: selectedPolicy.requiredSourceClass,
        sourceUri: trimmedSourceUri,
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
        bondAmount: parsedCreationBond,
      });

      const result = await executeSponsoredTx(tx);
      setSuccessDigest(result.digest);
      setStep("success");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error: unknown) {
      const message = sanitizeWizardError(error);
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

                {step === "title" && <TitleStep title={formData.title} onChange={(value) => patchFormData({ title: value })} />}

                {step === "description" && (
                  <DescriptionStep
                    description={formData.description}
                    onChange={(value) => patchFormData({ description: value })}
                  />
                )}

                {step === "outcomes" && (
                  <OutcomesStep
                    marketType={formData.marketType}
                    outcomes={formData.outcomes}
                    onMarketTypeChange={(type, outcomes) =>
                      patchFormData({
                        marketType: type,
                        outcomes,
                      })
                    }
                    onOutcomesChange={(outcomes) => patchFormData({ outcomes })}
                  />
                )}

                {step === "dates" && (
                  <DatesStep closeDate={formData.closeDate} onChange={(value) => patchFormData({ closeDate: value })} />
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
                    onTrustTierChange={(tier) => patchFormData({ trustTier: tier })}
                    onSourceTypeChange={(value) => patchFormData({ resolutionSourceType: value })}
                    onSourceUriChange={(value) => patchFormData({ resolutionSourceUri: value })}
                    onRulesChange={(value) => patchFormData({ resolutionRules: value })}
                    onCreatorControlsChange={(value) => patchFormData({ creatorControls: value })}
                  />
                )}

                {step === "bond" && (
                  <BondStep
                    trustTier={formData.trustTier}
                    creationBond={formData.creationBond}
                    minimumCreationBond={minimumCreationBondInput}
                    resolutionBond={resolutionBondDisplay}
                    onCreationBondChange={(value) => patchFormData({ creationBond: normalizeCollateralInput(value) })}
                  />
                )}

                {step === "review" && (
                  <ReviewStep
                    title={trimmedTitle}
                    description={trimmedDescription}
                    marketType={formData.marketType}
                    trustTier={formData.trustTier}
                    outcomes={filledOutcomes}
                    closeDate={closeDateDisplay}
                    resolutionSourceType={formData.resolutionSourceType}
                    resolutionSourceUri={trimmedSourceUri}
                    creatorControls={formData.creatorControls}
                    creationBond={creationBondDisplay}
                    resolutionBond={resolutionBondDisplay}
                  />
                )}

                {step === "success" && (
                  <div className="flex flex-col gap-5 text-base leading-[1.7] text-text">
                    <div className="space-y-2">
                      <div className="text-xl font-semibold tracking-[0.12em] text-mint md:text-2xl">
                        MARKET CREATED SUCCESSFULLY
                      </div>
                      <p className="max-w-2xl text-text-dim">
                        Your market is now live on testnet. You can head back to the market board or start a new one right away.
                      </p>
                    </div>

                    <div className="border border-border-panel bg-[rgba(202,245,222,0.05)] px-4 py-4">
                      <div className="mb-2 text-xs font-medium tracking-[0.12em] text-text-dim">
                        TRANSACTION ID
                      </div>
                      <div className="break-all font-mono text-[0.78rem] leading-[1.8] text-mint">
                        {successDigest ?? "Pending transaction digest"}
                      </div>
                    </div>

                    {explorerUrl && (
                      <a
                        href={explorerUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex w-fit border border-tribe-b-dim bg-[rgba(77,184,212,0.12)] px-4 py-3 font-mono text-xs font-semibold tracking-[0.08em] text-tribe-b transition-all duration-200 hover:bg-[rgba(77,184,212,0.2)]"
                      >
                        VIEW ON EXPLORER
                      </a>
                    )}
                  </div>
                )}

                {currentStepMessages.length > 0 && (
                  <div className="border border-orange-dim bg-[rgba(221,122,31,0.08)] px-4 py-3 text-[0.72rem] tracking-[0.08em] text-orange">
                    <div className="mb-2 font-semibold tracking-[0.12em] text-orange">BEFORE YOU CONTINUE</div>
                    <ul className="list-disc space-y-1 pl-4">
                      {currentStepMessages.map((message) => (
                        <li key={message}>{message}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </TerminalPanel>

            {isSuccessStep ? (
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                  onClick={() => navigate("/markets")}
                  className="touch-target flex-1 cursor-pointer border border-mint-dim bg-[rgba(202,245,222,0.15)] px-4 py-3 font-mono text-xs font-semibold tracking-[0.08em] text-mint transition-all duration-200 hover:bg-[rgba(202,245,222,0.24)]"
                >
                  RETURN TO MARKET MAIN SCREEN
                </button>
                <button
                  onClick={handleCreateAnother}
                  className="touch-target flex-1 cursor-pointer border border-tribe-b-dim bg-[rgba(77,184,212,0.12)] px-4 py-3 font-mono text-xs font-semibold tracking-[0.08em] text-tribe-b transition-all duration-200 hover:bg-[rgba(77,184,212,0.2)]"
                >
                  CREATE ANOTHER MARKET
                </button>
              </div>
            ) : (
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

                {isReviewStep ? (
                  <button
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    className={`touch-target flex-1 border px-4 py-3 font-mono text-xs font-semibold tracking-[0.08em] transition-all duration-200 ${
                      canSubmit
                        ? "cursor-pointer border-mint-dim bg-[rgba(202,245,222,0.15)] text-mint"
                        : "cursor-not-allowed border-border-inactive bg-[rgba(0,0,0,0.3)] text-text-dim"
                    }`}
                  >
                    {submitting ? "SUBMITTING..." : "SUBMIT MARKET"}
                  </button>
                ) : (
                  <button
                    onClick={handleNext}
                    disabled={!canAdvance}
                    className={`touch-target flex-1 border px-4 py-3 font-mono text-xs font-semibold tracking-[0.08em] transition-all duration-200 ${
                      canAdvance
                        ? "cursor-pointer border-mint-dim bg-[rgba(202,245,222,0.12)] text-mint hover:bg-[rgba(202,245,222,0.2)]"
                        : "cursor-not-allowed border-border-inactive bg-[rgba(0,0,0,0.3)] text-text-dim"
                    }`}
                  >
                    NEXT &gt;
                  </button>
                )}
              </div>
            )}

            {submitError && (
              <div className="mt-3 border border-orange-dim bg-[rgba(221,122,31,0.08)] px-4 py-3 text-[0.7rem] tracking-[0.08em] text-orange">
                {submitError}
              </div>
            )}
          </div>

          {!isSuccessStep && <div className="min-w-0">
            <MarketPreview
              title={formData.title}
              description={formData.description}
              marketType={formData.marketType}
              closeDate={closeDateDisplay}
              trustTier={formData.trustTier}
              outcomes={filledOutcomes}
              resolutionSourceType={formData.resolutionSourceType}
              creationBond={creationBondDisplay}
            />
          </div>}
        </main>

        <Footer />
      </div>
    </TerminalScreen>
  );
}
