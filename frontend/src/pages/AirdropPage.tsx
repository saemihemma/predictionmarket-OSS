import { useEffect, useMemo, useRef, useState } from "react";
import type { DAppKit, UiWallet } from "@mysten/dapp-kit-core";
import { useCurrentAccount, useDAppKit, useWallets } from "@mysten/dapp-kit-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import airdropFigure from "../assets/airdrop-figure.png";
import sufferClaimMark from "../assets/suffer-claim-mark.png";
import sufferCycleMint from "../assets/suffer-cycle-mint.svg";
import TerminalScreen from "../components/terminal/TerminalScreen";
import Footer from "../components/ui/Footer";
import PageHeader from "../components/ui/PageHeader";
import WalletPicker from "../components/ui/WalletPicker";
import { useCollateralBalance } from "../hooks/useCollateralBalance";
import { useSponsoredTransaction } from "../hooks/useSponsoredTransaction";
import { protocolReadTransport } from "../lib/client";
import { formatCollateralAmount } from "../lib/collateral";
import { buildFaucetClaimTransaction } from "../lib/faucet-transactions";
import { formatAddress } from "../lib/formatting";
import { checkFaucetEligibility, checkRelayHealth, RelayApiError } from "../lib/gas-relay-client";
import { COLLATERAL_SYMBOL, PM_FAUCET_ID, PM_GAS_RELAY_URL } from "../lib/market-constants";
import { connectSelectedWallet } from "../lib/wallet-session";

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPLORER_BASE_URL = "https://testnet.suivision.xyz/txblock";

type ClaimStage = "idle" | "wallet" | "submitting";
type ClaimMode =
  | "loading"
  | "unavailable"
  | "relay_unavailable"
  | "eligibility_unavailable"
  | "noWallet"
  | "disconnected"
  | "no_character"
  | "paused"
  | "empty"
  | "cooldown"
  | "eligible"
  | "claiming"
  | "success";

const LANDING_ART = [
  {
    label: "01 // FRONTIER",
    alt: "Rider of the Frontier",
    art: airdropFigure,
    artClassName: "w-24 sm:w-28",
    shellClassName: "border-border-panel bg-[radial-gradient(circle_at_top,rgba(202,245,222,0.08),rgba(2,5,3,0.2)_56%),rgba(2,5,3,0.58)]",
    textClassName: "text-text",
    imageGlowClassName: "drop-shadow-[0_0_18px_rgba(202,245,222,0.18)]",
  },
  {
    label: "02 // CLAIM",
    alt: "SUFFER claim mark",
    art: sufferClaimMark,
    artClassName: "w-26 sm:w-30",
    shellClassName: "border-orange-dim bg-[radial-gradient(circle_at_top,rgba(221,122,31,0.12),rgba(2,5,3,0.22)_56%),rgba(2,5,3,0.58)]",
    textClassName: "text-orange",
    imageGlowClassName: "drop-shadow-[0_0_22px_rgba(221,122,31,0.28)]",
  },
  {
    label: "03 // RETURN",
    alt: "SUFFER return cycle mark",
    art: sufferCycleMint,
    artClassName: "w-20 sm:w-24",
    shellClassName: "border-border-panel bg-[radial-gradient(circle_at_top,rgba(202,245,222,0.08),rgba(2,5,3,0.2)_56%),rgba(2,5,3,0.58)]",
    textClassName: "text-text",
    imageGlowClassName: "drop-shadow-[0_0_14px_rgba(202,245,222,0.15)]",
  },
] as const;

interface FaucetClaimRecord {
  owner: string;
  lastClaimDayUtc: bigint;
  totalClaimed: bigint;
  claimCount: bigint;
}

interface FaucetSnapshot {
  starterAmount: bigint;
  dailyAmount: bigint;
  paused: boolean;
  poolBalance: bigint;
  totalClaimed: bigint;
  totalClaimCount: bigint;
  trackedWallets: bigint;
  claims: FaucetClaimRecord[];
}

function parseBigIntField(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string" && value) return BigInt(value);
  return 0n;
}

function parseFaucetSnapshot(fields: Record<string, unknown>): FaucetSnapshot {
  const claims = Array.isArray(fields.claims)
    ? fields.claims
        .map((entry) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            return null;
          }

          const candidate = entry as Record<string, unknown>;
          const owner = typeof candidate.owner === "string" ? candidate.owner.toLowerCase() : "";
          if (!owner) return null;

          return {
            owner,
            lastClaimDayUtc: parseBigIntField(candidate.last_claim_day_utc),
            totalClaimed: parseBigIntField(candidate.total_claimed),
            claimCount: parseBigIntField(candidate.claim_count),
          } satisfies FaucetClaimRecord;
        })
        .filter((entry): entry is FaucetClaimRecord => Boolean(entry))
    : [];

  return {
    starterAmount: parseBigIntField(fields.starter_amount),
    dailyAmount: parseBigIntField(fields.daily_amount),
    paused: Boolean(fields.paused),
    poolBalance: parseBigIntField(fields.pool),
    totalClaimed: parseBigIntField(fields.total_claimed),
    totalClaimCount: parseBigIntField(fields.total_claim_count),
    trackedWallets: parseBigIntField(fields.tracked_wallets),
    claims,
  };
}

async function fetchFaucetSnapshot(): Promise<FaucetSnapshot> {
  const response = await protocolReadTransport.getObject(PM_FAUCET_ID);
  const fields = response?.data?.content?.fields;
  if (!fields) {
    throw new Error("Faucet object is not available.");
  }

  return parseFaucetSnapshot(fields);
}

function getCurrentUtcDay(nowMs: number): bigint {
  return BigInt(Math.floor(nowMs / DAY_MS));
}

function getNextUtcResetMs(nowMs: number): number {
  return (Math.floor(nowMs / DAY_MS) + 1) * DAY_MS;
}

function formatResetTimestamp(timestampMs: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(new Date(timestampMs));
}

function formatCountdown(remainingMs: number): string {
  if (remainingMs <= 0) return "00:00:00";

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const hh = hours.toString().padStart(2, "0");
  const mm = minutes.toString().padStart(2, "0");
  const ss = seconds.toString().padStart(2, "0");

  return days > 0 ? `${days}D ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
}

function formatClaimAmount(amount: bigint): string {
  return formatCollateralAmount(amount, { minimumFractionDigits: 0 });
}

function buildExplorerUrl(digest: string): string {
  return `${EXPLORER_BASE_URL}/${digest}`;
}

function toFriendlyClaimError(error: unknown): string {
  if (error instanceof RelayApiError) {
    if (error.code === "frontier_character_required") {
      return "Create your Frontier account and character first. This faucet only opens for wallets tied to a live Stillness character.";
    }
    if (error.code === "eligibility_unavailable") {
      return error.reason ?? "Frontier eligibility could not be verified right now. Please try again shortly.";
    }
  }

  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (normalized.includes("wallet not connected")) return "Connect your wallet before you claim.";
  if (
    normalized.includes("cancel") ||
    normalized.includes("reject") ||
    normalized.includes("declin") ||
    normalized.includes("denied")
  ) {
    return "Wallet approval was cancelled.";
  }
  if (normalized.includes("already claimed")) return "You have already claimed today. Return after the next UTC reset.";
  if (normalized.includes("paused")) return "Claims are temporarily paused.";
  if (normalized.includes("enough collateral") || normalized.includes("insufficient faucet balance")) {
    return "The faucet is empty right now. Please try again later.";
  }
  if (normalized.includes("frontier character required")) {
    return "Create your Frontier account and character first. This faucet only opens for wallets tied to a live Stillness character.";
  }
  if (normalized.includes("eligibility unavailable")) {
    return "Frontier eligibility could not be verified right now. Please try again shortly.";
  }
  if (normalized.includes("gas relay") || normalized.includes("sponsored execution unavailable")) {
    return "Sponsored claims are unavailable right now.";
  }
  if (normalized.includes("network")) return "Switch your wallet to Sui Testnet and try again.";
  return "Claim could not be completed. Please try again.";
}

export default function AirdropPage() {
  const account = useCurrentAccount();
  const wallets = useWallets();
  const dAppKit = useDAppKit() as DAppKit;
  const claimDeckRef = useRef<HTMLElement | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [walletPickerOpen, setWalletPickerOpen] = useState(false);
  const [connectingWalletName, setConnectingWalletName] = useState<string | null>(null);
  const [claimStage, setClaimStage] = useState<ClaimStage>("idle");
  const [claimError, setClaimError] = useState<string | null>(null);
  const [successDigest, setSuccessDigest] = useState<string | null>(null);
  const [successAmount, setSuccessAmount] = useState<bigint | null>(null);
  const walletValue = account ? formatAddress(account.address) : "NOT CONNECTED";
  const balance = useCollateralBalance();
  const { executeSponsoredTx } = useSponsoredTransaction();
  const relayConfigured = Boolean(PM_GAS_RELAY_URL);
  const relayHealth = useQuery({
    queryKey: ["gas-relay-health", PM_GAS_RELAY_URL],
    queryFn: checkRelayHealth,
    enabled: relayConfigured,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
  const faucetEligibility = useQuery({
    queryKey: ["faucet-eligibility", PM_GAS_RELAY_URL, account?.address],
    queryFn: () => checkFaucetEligibility(account!.address),
    enabled: relayConfigured && Boolean(account?.address) && Boolean(relayHealth.data?.healthy),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const { data: faucet, isLoading: faucetLoading, refetch: refetchFaucet } = useQuery({
    queryKey: ["faucet", PM_FAUCET_ID],
    queryFn: fetchFaucetSnapshot,
    enabled: PM_FAUCET_ID !== "0x0",
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setClaimStage("idle");
    setClaimError(null);
    setSuccessDigest(null);
    setSuccessAmount(null);
  }, [account?.address]);

  const relayReady = relayConfigured && Boolean(relayHealth.data?.healthy);
  const relayUnavailable = relayConfigured && relayHealth.isFetched && !relayReady;
  const currentUtcDay = getCurrentUtcDay(nowMs);
  const nextResetMs = getNextUtcResetMs(nowMs);

  const accountClaim = useMemo(() => {
    const owner = account?.address?.toLowerCase();
    if (!owner || !faucet) return null;
    return faucet.claims.find((claim) => claim.owner === owner) ?? null;
  }, [account?.address, faucet]);

  const hasClaimedToday = accountClaim ? accountClaim.lastClaimDayUtc >= currentUtcDay : false;
  const claimAmount = accountClaim ? faucet?.dailyAmount ?? 0n : faucet?.starterAmount ?? 0n;
  const sameClaimAmountEachDay = faucet ? faucet.starterAmount === faucet.dailyAmount : false;
  const canAffordClaim = faucet ? faucet.poolBalance >= claimAmount : false;
  const nextClaimCountdown = formatCountdown(nextResetMs - nowMs);
  const explorerUrl = successDigest ? buildExplorerUrl(successDigest) : null;
  const claimAmountLabel = !account
    ? "TODAY'S CLAIM"
    : sameClaimAmountEachDay
      ? "TODAY'S CLAIM"
      : accountClaim
        ? "AVAILABLE NOW"
        : "FIRST CLAIM";
  const claimAmountCopy = !account
    ? "Connect wallet to see today's claim state."
    : sameClaimAmountEachDay
      ? "This faucet pays the same amount each UTC day."
      : accountClaim
        ? "Daily claim for this wallet."
        : "First claim for this wallet.";

  const claimMode: ClaimMode =
    claimStage !== "idle"
      ? "claiming"
      : successDigest
        ? "success"
        : faucetLoading ||
            (relayConfigured && relayHealth.isLoading) ||
            (Boolean(account?.address) &&
              relayConfigured &&
              relayReady &&
              (faucetEligibility.isLoading || (!faucetEligibility.data && !faucetEligibility.isFetched)))
          ? "loading"
          : !faucet
            ? "unavailable"
            : !relayConfigured || relayUnavailable
              ? "relay_unavailable"
              : !wallets.length
                ? "noWallet"
                : !account
                  ? "disconnected"
                  : faucet.paused
                    ? "paused"
                    : !canAffordClaim
                      ? "empty"
                      : hasClaimedToday
                        ? "cooldown"
                        : faucetEligibility.data?.status === "unavailable"
                          ? "eligibility_unavailable"
                          : faucetEligibility.data?.status === "no_character"
                            ? "no_character"
                            : "eligible";

  async function handleConnect(wallet: UiWallet) {
    setConnectingWalletName(wallet.name);
    setClaimError(null);
    try {
      await connectSelectedWallet(dAppKit, wallet);
      setWalletPickerOpen(false);
      claimDeckRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      console.error("Wallet connection failed:", error);
      setClaimError("Wallet connection did not complete. Try again.");
    } finally {
      setConnectingWalletName(null);
    }
  }

  async function handleClaim() {
    if (!account || !faucet) {
      setClaimError("Connect your wallet before you claim.");
      return;
    }

    setClaimError(null);
    setSuccessDigest(null);
    setSuccessAmount(null);
    setClaimStage("wallet");

    try {
      const tx = buildFaucetClaimTransaction();
      setClaimStage("submitting");
      const result = await executeSponsoredTx(tx);
      setSuccessDigest(result.digest);
      setSuccessAmount(claimAmount);
      await Promise.all([refetchFaucet(), balance.refetch()]);
    } catch (error) {
      console.error("Faucet claim failed:", error);
      setClaimError(toFriendlyClaimError(error));
    } finally {
      setClaimStage("idle");
    }
  }

  const claimsValue =
    claimMode === "success"
      ? "CONFIRMED"
      : claimMode === "cooldown"
        ? "COOLDOWN"
        : claimMode === "no_character"
          ? "NO CHARACTER"
          : claimMode === "eligibility_unavailable"
            ? "ELIGIBILITY DOWN"
        : claimMode === "eligible"
          ? "READY"
          : claimMode === "claiming"
            ? "IN FLIGHT"
              : claimMode === "disconnected" || claimMode === "noWallet"
                ? "AWAITING WALLET"
                : claimMode === "loading"
                  ? "SYNCING"
                : claimMode === "paused"
                  ? "PAUSED"
                  : claimMode === "empty"
                    ? "EMPTY"
                    : "UNAVAILABLE";

  const claimsTone =
    claimMode === "success" || claimMode === "eligible"
      ? "text-mint"
      : claimMode === "claiming"
        ? "text-tribe-b"
        : claimMode === "cooldown"
          ? "text-yellow"
          : claimMode === "no_character"
            ? "text-orange"
          : claimMode === "disconnected" || claimMode === "noWallet" || claimMode === "loading"
            ? "text-text"
            : "text-orange";

  const landingCards = [
    {
      ...LANDING_ART[0],
      copy: "Only for riders of the Frontier.",
    },
    {
      ...LANDING_ART[1],
      copy: faucet
        ? `${sameClaimAmountEachDay ? "Claim amount" : "Starter claim"}: ${formatClaimAmount(faucet.starterAmount)} ${COLLATERAL_SYMBOL}.`
        : "Claim amount syncing from the faucet.",
    },
    {
      ...LANDING_ART[2],
      copy: faucet
        ? `${sameClaimAmountEachDay ? "Returns daily" : "Daily return"}: ${formatClaimAmount(faucet.dailyAmount)} ${COLLATERAL_SYMBOL}. Resets at ${formatResetTimestamp(nextResetMs)} UTC.`
        : `Claims reset at ${formatResetTimestamp(nextResetMs)} UTC.`,
    },
  ] as const;

  const statusItems = [
    { label: "NETWORK", value: "TESTNET", tone: "text-tribe-b" },
    { label: "TOKEN", value: "SFR", tone: "text-mint" },
    {
      label: "SPONSORSHIP",
      value: relayConfigured ? (relayReady ? "ONLINE" : relayHealth.isLoading ? "CHECKING" : "OFFLINE") : "UNCONFIGURED",
      tone: relayReady ? "text-mint" : relayHealth.isLoading ? "text-text" : "text-orange",
    },
    {
      label: "CLAIMS",
      value: claimsValue,
      tone: claimsTone,
    },
  ] as const;

  let consoleHeadline = "CONNECT TO CLAIM YOUR $SUFFERING.";
  let consoleBody = "Connect your wallet, claim from this console, and watch the reward arrive here after approval.";
  let consoleToneClass = "text-mint";

  if (claimMode === "loading") {
    consoleHeadline = "SYNCING CLAIM CONSOLE.";
    consoleBody = "Reading the faucet, the sponsorship channel, and your wallet signal.";
  } else if (claimMode === "noWallet") {
    consoleHeadline = "NO SUI WALLET DETECTED.";
    consoleBody = "A Sui wallet opens this gate. Install one, return here, and claim on testnet.";
    consoleToneClass = "text-orange";
  } else if (claimMode === "relay_unavailable" || claimMode === "unavailable") {
    consoleHeadline = "SPONSORED CLAIMS ARE UNAVAILABLE.";
    consoleBody = relayConfigured
      ? "The gate is quiet for a moment. Claims reopen here as soon as sponsorship returns."
      : "This deployment has not opened the claim channel yet.";
    consoleToneClass = "text-orange";
  } else if (claimMode === "eligibility_unavailable") {
    consoleHeadline = "FRONTIER ELIGIBILITY IS UNAVAILABLE.";
    consoleBody =
      faucetEligibility.data?.reason ??
      "The Stillness character gate could not be verified right now. Try again in a moment.";
    consoleToneClass = "text-orange";
  } else if (claimMode === "no_character") {
    consoleHeadline = "FRONTIER CHARACTER REQUIRED.";
    consoleBody =
      faucetEligibility.data?.reason ??
      "Create your Frontier account and character first. This faucet only opens for wallets tied to a live Stillness character.";
    consoleToneClass = "text-orange";
  } else if (claimMode === "paused") {
    consoleHeadline = "THE FAUCET IS TEMPORARILY PAUSED.";
    consoleBody = "No claims can be processed until the operator resumes the faucet.";
    consoleToneClass = "text-orange";
  } else if (claimMode === "empty") {
    consoleHeadline = "THE FAUCET IS EMPTY.";
    consoleBody = "The public pool does not currently have enough SFR for the next claim.";
    consoleToneClass = "text-orange";
  } else if (claimMode === "cooldown") {
    consoleHeadline = "YOU'VE ALREADY SUFFERED TODAY.";
    consoleBody = "Return after the next UTC reset. Your next claim window opens automatically when the day rolls over.";
    consoleToneClass = "text-yellow";
  } else if (claimMode === "eligible") {
    consoleHeadline = accountClaim ? "YOUR DAILY SUFFERING IS READY." : "YOUR FIRST SUFFERING IS READY.";
    consoleBody = "Gas is covered. Approve in your wallet and this console will welcome the claim home.";
  } else if (claimMode === "claiming") {
    consoleHeadline = "PROCESSING YOUR CLAIM.";
    consoleBody = "Approve in your wallet, then hold the line while the claim clears on-chain.";
    consoleToneClass = "text-tribe-b";
  } else if (claimMode === "success") {
    consoleHeadline = "CLAIM CONFIRMED.";
    consoleBody = "Your SFR has landed. Step back into the Orchestrator or open the transaction on the explorer.";
  }

  return (
    <TerminalScreen>
      <div className="min-h-screen flex flex-col">
        <PageHeader subtitle="SUFFER AIRDROP" showBack />

        <div className="border-b border-border-grid">
          <div className="page-shell grid gap-3 py-3 text-xs tracking-[0.08em] text-text sm:grid-cols-2 xl:grid-cols-5">
            {statusItems.map((item) => (
              <span key={item.label}>
                {item.label}: <span className={`${item.tone} font-semibold`}>{item.value}</span>
              </span>
            ))}
            <span className="break-all">
              WALLET: <span className={`${account ? "text-mint" : "text-orange"} font-semibold`}>{walletValue}</span>
            </span>
          </div>
        </div>

        <main className="page-shell page-section flex-1">
          <section className="space-y-6">
            <div className="relative overflow-hidden border border-border-panel bg-bg-panel p-6 md:p-8">
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(202,245,222,0.05)_0%,rgba(202,245,222,0)_38%)]" />
              <div className="absolute left-8 right-8 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(202,245,222,0.35),transparent)]" />

              <div className="relative z-10 max-w-[56rem]">
                <div className="text-[0.8rem] font-semibold uppercase tracking-[0.2em] text-orange md:text-[0.95rem]">
                  DO YOU WANT TO SUFFER?
                </div>
                <h2 className="mt-4 m-0 text-[2rem] font-bold uppercase leading-[1.02] tracking-[0.12em] text-mint md:text-[3rem]">
                  <span className="block">CLAIM YOUR $SUFFERING.</span>
                  <span className="mt-1 block">COME BACK EVERY DAY TO $SUFFER MORE.</span>
                </h2>

                <p className="mt-5 max-w-[40rem] text-sm leading-6 tracking-[0.06em] text-text-muted md:text-[0.95rem] md:leading-7">
                  The Orchestrator pays in pain. Claim from this page, answer your wallet's call, and watch the drop arrive in
                  the live console below.
                </p>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => claimDeckRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    className="touch-target inline-flex items-center justify-center border-2 border-orange bg-[rgba(221,122,31,0.12)] px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-orange shadow-[0_0_12px_rgba(221,122,31,0.22)] transition-all duration-200 hover:bg-[rgba(221,122,31,0.18)] hover:shadow-[0_0_16px_rgba(221,122,31,0.36)]"
                  >
                    CLAIM YOUR $SUFFERING
                  </button>
                  <Link
                    to="/markets"
                    className="touch-target inline-flex items-center justify-center border border-mint-dim bg-[rgba(202,245,222,0.08)] px-5 py-3 text-center text-xs font-semibold tracking-[0.18em] text-mint no-underline transition-all duration-200 hover:bg-[rgba(202,245,222,0.14)] hover:shadow-[0_0_14px_rgba(202,245,222,0.16)]"
                  >
                    RETURN TO THE ORCHESTRATOR
                  </Link>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {landingCards.map((item, index) => (
                <div
                  key={item.label}
                  className={`flex min-h-[18.5rem] flex-col overflow-hidden border bg-bg-panel p-4 md:min-h-[20rem] md:p-5 ${
                    index === 1 ? "border-orange-dim shadow-[0_0_18px_rgba(221,122,31,0.08)]" : "border-border-panel"
                  }`}
                >
                  <div
                    className={`flex h-44 items-center justify-center border px-4 py-6 md:h-48 ${item.shellClassName}`}
                  >
                    <img
                      src={item.art}
                      alt={item.alt}
                      className={`${item.artClassName} h-auto object-contain ${item.imageGlowClassName}`}
                    />
                  </div>
                  <div className="mt-4 text-[0.67rem] font-semibold tracking-[0.13em] text-text-muted">{item.label}</div>
                  <p className={`mt-3 m-0 text-[0.95rem] leading-7 tracking-[0.04em] ${item.textClassName}`}>{item.copy}</p>
                </div>
              ))}
            </div>
          </section>

          <section ref={claimDeckRef} className="mt-6 min-h-[100dvh] border border-border-panel bg-bg-panel">
            <div className="border-b border-border-panel">
              <div className="page-shell grid gap-3 py-4 text-[0.72rem] tracking-[0.08em] text-text-dim md:grid-cols-4">
                <div>
                  STARTER:{" "}
                  <span className="font-semibold text-mint">
                    {faucet ? `${formatClaimAmount(faucet.starterAmount)} ${COLLATERAL_SYMBOL}` : "SYNCING"}
                  </span>
                </div>
                <div>
                  DAILY:{" "}
                  <span className="font-semibold text-mint">
                    {faucet ? `${formatClaimAmount(faucet.dailyAmount)} ${COLLATERAL_SYMBOL}` : "SYNCING"}
                  </span>
                </div>
                <div>
                  POOL:{" "}
                  <span className="font-semibold text-mint">
                    {faucet ? `${formatClaimAmount(faucet.poolBalance)} ${COLLATERAL_SYMBOL}` : "SYNCING"}
                  </span>
                </div>
                <div>
                  RESET: <span className="font-semibold text-text">{formatResetTimestamp(nextResetMs)} UTC</span>
                </div>
              </div>
            </div>

            <div className="page-shell grid gap-6 py-6 lg:grid-cols-[1.1fr_0.9fr] lg:py-8">
              <div className="border border-border-panel bg-[rgba(2,5,3,0.5)] p-5 md:p-6">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-[0.68rem] font-semibold tracking-[0.13em] text-text-muted">LIVE CLAIM CONSOLE</div>
                </div>

                <h3 className={`m-0 text-[1.4rem] font-bold uppercase tracking-[0.12em] ${consoleToneClass} md:text-[2rem]`}>
                  {consoleHeadline}
                </h3>
                <p className="mt-4 max-w-[42rem] text-[0.88rem] leading-7 tracking-[0.05em] text-text-muted">{consoleBody}</p>

                <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="border border-border-panel bg-bg-panel p-4">
                    <div className="text-[0.67rem] font-semibold tracking-[0.13em] text-text-muted">WALLET</div>
                    <div className="mt-2 break-words text-[0.92rem] tracking-[0.06em] text-text">
                      {walletValue}
                    </div>
                  </div>
                  <div className="border border-border-panel bg-bg-panel p-4">
                    <div className="text-[0.67rem] font-semibold tracking-[0.13em] text-text-muted">{claimAmountLabel}</div>
                    <div className="mt-2 text-[1rem] font-semibold tracking-[0.08em] text-mint">
                      {faucet ? `${formatClaimAmount(claimAmount)} ${COLLATERAL_SYMBOL}` : "SYNCING"}
                    </div>
                    <div className="mt-2 text-[0.72rem] leading-5 text-text-dim">{claimAmountCopy}</div>
                  </div>
                  <div className="border border-border-panel bg-bg-panel p-4">
                    <div className="text-[0.67rem] font-semibold tracking-[0.13em] text-text-muted">GAS</div>
                    <div className={`mt-2 text-[1rem] font-semibold tracking-[0.08em] ${relayReady ? "text-mint" : "text-orange"}`}>
                      {relayReady ? "SPONSORED" : relayConfigured ? "UNAVAILABLE" : "NOT CONFIGURED"}
                    </div>
                    <div className="mt-2 text-[0.72rem] leading-5 text-text-dim">
                      {relayReady ? "The relay covers gas for this claim." : "Claims reopen here when sponsorship is healthy again."}
                    </div>
                  </div>
                  <div className="border border-border-panel bg-bg-panel p-4">
                    <div className="text-[0.67rem] font-semibold tracking-[0.13em] text-text-muted">NEXT RESET</div>
                    <div className="mt-2 text-[1rem] font-semibold tracking-[0.08em] text-text">{nextClaimCountdown}</div>
                    <div className="mt-2 text-[0.72rem] leading-5 text-text-dim">The daily claim returns at 00:00 UTC.</div>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-4">
                  {claimMode === "disconnected" || claimMode === "noWallet" ? (
                    <button
                      type="button"
                      onClick={() => setWalletPickerOpen(true)}
                      disabled={Boolean(connectingWalletName) || wallets.length === 0}
                      className="touch-target inline-flex min-h-12 items-center justify-center border-2 border-orange bg-[rgba(221,122,31,0.08)] px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-orange disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {wallets.length === 0 ? "NO WALLET DETECTED" : connectingWalletName ? "CONNECTING..." : "CONNECT WALLET TO CLAIM"}
                    </button>
                  ) : claimMode === "eligible" ? (
                    <button
                      type="button"
                      onClick={handleClaim}
                      className="touch-target inline-flex min-h-12 items-center justify-center border-2 border-orange bg-[rgba(221,122,31,0.08)] px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-orange shadow-[0_0_12px_rgba(221,122,31,0.22)] transition-all duration-200 hover:shadow-[0_0_16px_rgba(221,122,31,0.4)]"
                    >
                      CLAIM {formatClaimAmount(claimAmount)} {COLLATERAL_SYMBOL}
                    </button>
                  ) : claimMode === "no_character" ? (
                    <button
                      type="button"
                      disabled
                      className="touch-target inline-flex min-h-12 items-center justify-center border border-orange-dim bg-[rgba(221,122,31,0.08)] px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-orange/80 disabled:cursor-not-allowed"
                    >
                      FRONTIER CHARACTER REQUIRED
                    </button>
                  ) : claimMode === "cooldown" ? (
                    <button
                      type="button"
                      disabled
                      className="touch-target inline-flex min-h-12 items-center justify-center border border-yellow/60 bg-[rgba(219,210,124,0.08)] px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-yellow/80 disabled:cursor-not-allowed"
                    >
                      RETURNS AT 00:00 UTC
                    </button>
                  ) : claimMode === "success" ? (
                    <>
                      <Link
                        to="/markets"
                        className="touch-target inline-flex min-h-12 items-center justify-center border-2 border-orange bg-[rgba(221,122,31,0.08)] px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-orange no-underline"
                      >
                        GO TO THE ORCHESTRATOR
                      </Link>
                      {explorerUrl && (
                        <a
                          href={explorerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="touch-target inline-flex min-h-12 items-center justify-center border border-border-panel px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-mint no-underline"
                        >
                          VIEW TRANSACTION
                        </a>
                      )}
                    </>
                  ) : claimMode === "claiming" ? (
                    <div className="text-[0.78rem] uppercase tracking-[0.14em] text-tribe-b">Wallet approval in progress...</div>
                  ) : (
                    <div className="text-[0.78rem] uppercase tracking-[0.14em] text-orange">
                      {claimMode === "loading"
                        ? "SYNCING CLAIM CHANNEL"
                        : claimMode === "eligibility_unavailable"
                          ? "FRONTIER ELIGIBILITY UNAVAILABLE"
                          : "CLAIMS UNAVAILABLE RIGHT NOW"}
                    </div>
                  )}
                </div>

                {claimMode === "claiming" && (
                  <div className="mt-6 grid gap-3 md:grid-cols-3">
                    <div className="border border-tribe-b bg-[rgba(79,183,237,0.08)] p-4">
                      <div className="text-[0.67rem] font-semibold tracking-[0.13em] text-text-muted">1 // WALLET</div>
                      <div className="mt-2 text-[0.82rem] tracking-[0.08em] text-tribe-b">APPROVE IN WALLET</div>
                    </div>
                    <div className="border border-tribe-b bg-[rgba(79,183,237,0.08)] p-4">
                      <div className="text-[0.67rem] font-semibold tracking-[0.13em] text-text-muted">2 // RELAY</div>
                      <div className="mt-2 text-[0.82rem] tracking-[0.08em] text-tribe-b">
                        {claimStage === "wallet" ? "WAITING FOR SIGNATURE" : "SENDING SPONSORED CLAIM"}
                      </div>
                    </div>
                    <div className="border border-tribe-b bg-[rgba(79,183,237,0.08)] p-4">
                      <div className="text-[0.67rem] font-semibold tracking-[0.13em] text-text-muted">3 // CHAIN</div>
                      <div className="mt-2 text-[0.82rem] tracking-[0.08em] text-tribe-b">CONFIRMING ON-CHAIN</div>
                    </div>
                  </div>
                )}

                {claimError && (
                  <div className="mt-6 border border-orange-dim bg-[rgba(221,122,31,0.08)] px-4 py-3 text-[0.78rem] leading-6 tracking-[0.05em] text-orange">
                    {claimError}
                  </div>
                )}

                {claimMode === "success" && successAmount !== null && (
                  <div className="mt-6 space-y-3">
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="border border-border-panel bg-bg-panel p-4">
                        <div className="text-[0.67rem] font-semibold tracking-[0.13em] text-text-muted">CLAIMED</div>
                        <div className="mt-2 text-[1rem] font-semibold tracking-[0.08em] text-mint">
                          {formatClaimAmount(successAmount)} {COLLATERAL_SYMBOL}
                        </div>
                      </div>
                      <div className="border border-border-panel bg-bg-panel p-4">
                        <div className="text-[0.67rem] font-semibold tracking-[0.13em] text-text-muted">UPDATED BALANCE</div>
                        <div className="mt-2 text-[1rem] font-semibold tracking-[0.08em] text-text">
                          {account ? `${formatCollateralAmount(balance.totalBalance, { minimumFractionDigits: 2 })} ${COLLATERAL_SYMBOL}` : "CONNECT WALLET"}
                        </div>
                      </div>
                      <div className="border border-border-panel bg-bg-panel p-4">
                        <div className="text-[0.67rem] font-semibold tracking-[0.13em] text-text-muted">NEXT CLAIM</div>
                        <div className="mt-2 text-[1rem] font-semibold tracking-[0.08em] text-text">{nextClaimCountdown}</div>
                      </div>
                    </div>
                    <div className="border border-border-panel bg-[rgba(202,245,222,0.04)] px-4 py-3 text-[0.76rem] leading-6 tracking-[0.05em] text-text-muted">
                      Wallets can take a moment to show custom assets. This balance and the explorer transaction are the source of truth while your wallet catches up.
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-4">
                <div className="border border-border-panel bg-[rgba(2,5,3,0.5)] p-5">
                  <div className="mb-4 text-[0.68rem] font-semibold tracking-[0.13em] text-text-muted">HOW IT WORKS</div>
                  <div className="space-y-4 text-[0.8rem] leading-6 tracking-[0.05em] text-text-muted">
                    <p className="m-0">
                      This page is the claim gate. Choose a Sui-compatible wallet, press claim, and approve when your wallet asks.
                    </p>
                    <p className="m-0">
                      The faucet reads its live payout from chain. It resets at 00:00 UTC and opens once per wallet each UTC day.
                    </p>
                    <p className="m-0">When sponsorship is live, gas is covered and the result lands here on the same page.</p>
                  </div>
                </div>

                <div className="border border-border-panel bg-[rgba(2,5,3,0.5)] p-5">
                  <div className="mb-4 text-[0.68rem] font-semibold tracking-[0.13em] text-text-muted">YOUR SIGNALS</div>
                  <div className="grid gap-3">
                    <div className="border border-border-panel bg-bg-panel p-4">
                      <div className="text-[0.67rem] font-semibold tracking-[0.13em] text-text-muted">CURRENT BALANCE</div>
                      <div className="mt-2 text-[0.95rem] font-semibold tracking-[0.08em] text-text">
                        {account ? `${formatCollateralAmount(balance.totalBalance, { minimumFractionDigits: 2 })} ${COLLATERAL_SYMBOL}` : "CONNECT WALLET"}
                      </div>
                    </div>
                    <div className="border border-border-panel bg-bg-panel p-4">
                      <div className="text-[0.67rem] font-semibold tracking-[0.13em] text-text-muted">FAUCET STATS</div>
                      <div className="mt-2 text-[0.82rem] leading-6 tracking-[0.05em] text-text">
                        {faucet ? `${faucet.trackedWallets.toString()} wallets tracked // ${faucet.totalClaimCount.toString()} claims executed` : "SYNCING FAUCET METRICS"}
                      </div>
                    </div>
                    <div className="border border-border-panel bg-bg-panel p-4">
                      <div className="text-[0.67rem] font-semibold tracking-[0.13em] text-text-muted">LAST CLAIMER STATE</div>
                      <div className="mt-2 text-[0.82rem] leading-6 tracking-[0.05em] text-text">
                        {accountClaim
                          ? `Claim count: ${accountClaim.claimCount.toString()} // Total claimed: ${formatClaimAmount(accountClaim.totalClaimed)} ${COLLATERAL_SYMBOL}`
                          : account
                            ? "No prior claims for this wallet yet."
                            : "Connect a wallet to check your claim history."}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>

        {walletPickerOpen && (
          <WalletPicker
            wallets={wallets}
            connectingWalletName={connectingWalletName}
            onClose={() => setWalletPickerOpen(false)}
            onSelect={handleConnect}
            title="CHOOSE A WALLET TO CLAIM"
            description="This faucet runs on Sui testnet. Pick the wallet you want to use and the claim flow will continue here."
          />
        )}

        <Footer />
      </div>
    </TerminalScreen>
  );
}
