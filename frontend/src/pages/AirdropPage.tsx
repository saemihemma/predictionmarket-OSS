import { useEffect, useMemo, useRef, useState } from "react";
import { useCurrentAccount, useDAppKit, useWallets } from "@mysten/dapp-kit-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import airdropFigure from "../assets/airdrop-figure.png";
import sufferCoin from "../assets/suffer-coin.png";
import TerminalScreen from "../components/terminal/TerminalScreen";
import Footer from "../components/ui/Footer";
import PageHeader from "../components/ui/PageHeader";
import { useCollateralBalance } from "../hooks/useCollateralBalance";
import { useServiceHealth } from "../hooks/useServiceHealth";
import { useSponsoredTransaction } from "../hooks/useSponsoredTransaction";
import { protocolReadTransport } from "../lib/client";
import { formatCollateralAmount } from "../lib/collateral";
import { buildFaucetClaimTransaction } from "../lib/faucet-transactions";
import { formatAddress } from "../lib/formatting";
import { COLLATERAL_SYMBOL, PM_FAUCET_ID, PM_GAS_RELAY_URL } from "../lib/market-constants";

const DAY_MS = 24 * 60 * 60 * 1000;
const PUBLIC_AIRDROP_URL = "https://lineagewar.xyz/airdrop";
const EXPLORER_BASE_URL = "https://suiexplorer.com/txblock";

type ClaimStage = "idle" | "wallet" | "submitting";

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
  return `${EXPLORER_BASE_URL}/${digest}?network=testnet`;
}

function toFriendlyClaimError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (normalized.includes("wallet not connected")) return "Connect your wallet before you claim.";
  if (normalized.includes("already claimed")) return "You have already claimed today. Return after the next UTC reset.";
  if (normalized.includes("paused")) return "Claims are temporarily paused.";
  if (normalized.includes("enough collateral") || normalized.includes("insufficient faucet balance")) {
    return "The faucet is empty right now. Please try again later.";
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
  const dAppKit = useDAppKit() as any;
  const claimDeckRef = useRef<HTMLElement | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [connectBusy, setConnectBusy] = useState(false);
  const [claimStage, setClaimStage] = useState<ClaimStage>("idle");
  const [claimError, setClaimError] = useState<string | null>(null);
  const [successDigest, setSuccessDigest] = useState<string | null>(null);
  const [successAmount, setSuccessAmount] = useState<bigint | null>(null);
  const walletValue = account ? formatAddress(account.address) : "SYNC REQUIRED";
  const relayHealth = useServiceHealth("gas-relay", PM_GAS_RELAY_URL);
  const balance = useCollateralBalance();
  const { executeSponsoredTx } = useSponsoredTransaction();
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

  const relayConfigured = Boolean(PM_GAS_RELAY_URL);
  const relayReady = relayConfigured && Boolean(relayHealth.data?.ok);
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
  const canAffordClaim = faucet ? faucet.poolBalance >= claimAmount : false;
  const nextClaimCountdown = formatCountdown(nextResetMs - nowMs);
  const explorerUrl = successDigest ? buildExplorerUrl(successDigest) : null;

  const claimMode =
    claimStage !== "idle"
      ? "claiming"
      : successDigest
        ? "success"
        : !wallets.length
          ? "noWallet"
          : !account
            ? "disconnected"
            : faucetLoading || (relayConfigured && relayHealth.isLoading)
              ? "loading"
              : !faucet
                ? "unavailable"
                : !relayConfigured || relayUnavailable
                  ? "unavailable"
                  : faucet.paused
                    ? "paused"
                    : !canAffordClaim
                      ? "empty"
                      : hasClaimedToday
                        ? "cooldown"
                        : "eligible";

  async function handleConnect() {
    if (wallets.length === 0) return;
    setConnectBusy(true);
    setClaimError(null);
    try {
      await dAppKit.connectWallet({ wallet: wallets[0] });
      claimDeckRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      console.error("Wallet connection failed:", error);
      setClaimError("Wallet connection did not complete. Try again.");
    } finally {
      setConnectBusy(false);
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

  const statusItems = [
    { label: "NETWORK", value: "TESTNET", tone: "text-tribe-b" },
    { label: "TOKEN", value: "SFR", tone: "text-mint" },
    {
      label: "SPONSORSHIP",
      value: relayConfigured ? (relayReady ? "ONLINE" : relayHealth.isLoading ? "CHECKING" : "OFFLINE") : "UNCONFIGURED",
      tone: relayReady ? "text-mint" : "text-orange",
    },
    {
      label: "CLAIMS",
      value:
        claimMode === "success"
          ? "CONFIRMED"
          : claimMode === "cooldown"
            ? "COOLDOWN"
            : claimMode === "eligible"
              ? "READY"
              : claimMode === "claiming"
                ? "IN FLIGHT"
                : "STANDBY",
      tone:
        claimMode === "success" || claimMode === "eligible"
          ? "text-mint"
          : claimMode === "claiming"
            ? "text-tribe-b"
            : claimMode === "cooldown"
              ? "text-yellow"
              : "text-orange",
    },
  ] as const;

  const briefingItems = [
    `Starter claim: ${faucet ? `${formatClaimAmount(faucet.starterAmount)} ${COLLATERAL_SYMBOL}` : "SYNCING"}`,
    `Daily return: ${faucet ? `${formatClaimAmount(faucet.dailyAmount)} ${COLLATERAL_SYMBOL}` : "SYNCING"}`,
    `Claims reset at ${formatResetTimestamp(nextResetMs)} UTC.`,
  ] as const;

  let consoleHeadline = "CONNECT TO CLAIM YOUR $SUFFERING.";
  let consoleBody = "Stay on this page. The wallet modal is the only popup. After that, the claim result lands right here.";
  let consoleToneClass = "text-mint";

  if (claimMode === "loading") {
    consoleHeadline = "SYNCING CLAIM CONSOLE.";
    consoleBody = "Loading faucet balance, sponsorship status, and your wallet context.";
  } else if (claimMode === "noWallet") {
    consoleHeadline = "NO SUI WALLET DETECTED.";
    consoleBody = "Install a Sui wallet to claim on testnet. Once it is available, connect here and stay on this page.";
    consoleToneClass = "text-orange";
  } else if (claimMode === "unavailable") {
    consoleHeadline = "SPONSORED CLAIMS ARE UNAVAILABLE.";
    consoleBody = relayConfigured
      ? "The relay is not healthy right now, so claims are fail-closed until sponsorship is back."
      : "The relay URL is not configured in this deployment yet, so claims are intentionally disabled.";
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
    consoleBody = "Gas is sponsored. You will approve in your wallet, then this console will confirm the on-chain claim.";
  } else if (claimMode === "claiming") {
    consoleHeadline = "PROCESSING YOUR CLAIM.";
    consoleBody = "Approve in your wallet, then wait while the sponsored transaction is submitted and confirmed.";
    consoleToneClass = "text-tribe-b";
  } else if (claimMode === "success") {
    consoleHeadline = "CLAIM CONFIRMED.";
    consoleBody = "Your SFR is on-chain now. You can head back to the Orchestrator or open the transaction in the explorer.";
  }

  return (
    <TerminalScreen>
      <div className="min-h-screen flex flex-col">
        <PageHeader
          subtitle="SUFFER AIRDROP"
          showBack
          actions={
            <a
              href={PUBLIC_AIRDROP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="touch-target inline-flex items-center border border-orange-dim bg-[rgba(221,122,31,0.08)] px-3 py-2 text-[0.65rem] font-semibold tracking-[0.16em] text-orange no-underline"
            >
              PUBLIC SITE
            </a>
          }
        />

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
          <section className="grid items-stretch gap-6 lg:grid-cols-[1.08fr_0.92fr]">
            <div className="relative flex flex-col justify-between overflow-hidden border border-border-panel bg-bg-panel p-6 md:p-8">
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(202,245,222,0.05)_0%,rgba(202,245,222,0)_38%)]" />
              <div className="absolute left-8 right-8 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(202,245,222,0.35),transparent)]" />

              <div className="relative z-10">
                <div className="mb-6 flex flex-wrap items-center gap-3 text-[0.6rem] tracking-[0.18em]">
                  <span className="border border-mint-dim bg-[rgba(202,245,222,0.08)] px-2 py-1 text-mint">
                    ONLY FOR THOSE FEELING PAIN IN THE FRONTIER
                  </span>
                  <span className="text-text-dim">DAILY ONBOARDING FAUCET // TESTNET</span>
                </div>

                <div className="max-w-[42rem]">
                  <h2 className="m-0 text-[2rem] font-bold uppercase leading-[1.02] tracking-[0.12em] text-mint md:text-[3rem]">
                    DO YOU WANT TO $SUFFER?
                    <br />
                    CLAIM YOUR $SUFFERING.
                    <br />
                    COME BACK EVERY DAY TO
                    <br />
                    SUFFER MORE.
                  </h2>
                  <p className="mt-5 max-w-[38rem] text-sm leading-7 tracking-[0.06em] text-text-muted md:text-[0.95rem]">
                    The Orchestrator pays in pain. Claim on the same page, approve in your wallet, and watch the result land
                    in the live console below.
                  </p>
                </div>

                <div className="mt-8 flex flex-wrap items-center gap-4">
                  <button
                    type="button"
                    onClick={() => claimDeckRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    className="touch-target inline-flex items-center justify-center border-2 border-orange bg-[rgba(221,122,31,0.08)] px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-orange shadow-[0_0_12px_rgba(221,122,31,0.22)] transition-all duration-200 hover:shadow-[0_0_16px_rgba(221,122,31,0.4)]"
                  >
                    CLAIM YOUR $SUFFERING
                  </button>
                  <Link
                    to="/markets"
                    className="touch-target inline-flex items-center justify-center border border-border-panel px-4 py-3 text-center text-xs font-semibold tracking-[0.14em] text-mint no-underline transition-all duration-200 hover:border-mint hover:shadow-[0_0_12px_rgba(202,245,222,0.15)]"
                  >
                    RETURN TO THE ORCHESTRATOR
                  </Link>
                </div>

                <div className="mt-4 max-w-[38rem] text-[0.68rem] leading-6 tracking-[0.08em] text-text-dim">
                  GAS SPONSORED ON SUI TESTNET // NO PAGE SWITCH AFTER CLICK // RESETS DAILY AT 00:00 UTC.
                </div>
              </div>

              <div className="relative z-10 mt-10 grid gap-4 md:grid-cols-3">
                {briefingItems.map((item, index) => (
                  <div
                    key={item}
                    className="flex min-h-[8.4rem] flex-col justify-between border border-border-panel bg-[rgba(2,5,3,0.45)] p-4"
                  >
                    <span className="text-[0.55rem] tracking-[0.18em] text-text-dim">0{index + 1} // FIELD NOTE</span>
                    <p className="m-0 text-[0.78rem] leading-6 tracking-[0.06em] text-text">{item}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="airdrop-hero-shell relative min-h-[24rem] overflow-hidden border border-border-panel bg-bg-panel p-5 md:min-h-[34rem] md:p-6">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(202,245,222,0.1)_0%,rgba(202,245,222,0)_58%)]" />
              <div className="relative z-10 flex h-full items-center justify-center p-4">
                <div className="relative aspect-square w-full max-w-[33rem]">
                  <div className="absolute inset-[5%] rounded-full border border-mint-dim/40" />
                  <div className="absolute inset-[8%] rounded-full border border-mint-dim/30" />
                  <div className="absolute inset-[13%] rounded-full border border-mint-dim/20" />

                  <img
                    src={airdropFigure}
                    alt="SUFFER airdrop hero figure"
                    className="absolute inset-[6%] h-[88%] w-[88%] object-contain drop-shadow-[0_0_24px_rgba(202,245,222,0.18)]"
                  />

                  <div className="airdrop-badge-float absolute bottom-[12%] right-[3%] w-[29%] md:bottom-[8%] md:right-[2%]">
                    <div className="border border-mint-dim/50 bg-[rgba(2,5,3,0.78)] p-2 shadow-[0_0_28px_rgba(202,245,222,0.14)]">
                      <img src={sufferCoin} alt="SUFFER token mark" className="h-auto w-full object-contain" />
                    </div>
                  </div>

                  <div className="absolute left-[6%] top-[10%] border border-mint-dim/40 bg-[rgba(2,5,3,0.66)] px-3 py-2 text-[0.58rem] tracking-[0.16em] text-text-dim">
                    HERO // PRIMARY FIELD
                  </div>
                  <div className="absolute bottom-[8%] left-[10%] border border-orange-dim/50 bg-[rgba(221,122,31,0.07)] px-3 py-2 text-[0.58rem] tracking-[0.16em] text-orange">
                    SFR SEAL // SECONDARY ORBIT
                  </div>
                </div>
              </div>
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
                  <div className="text-[0.58rem] tracking-[0.18em] text-text-dim">LIVE CLAIM CONSOLE</div>
                  <div className="text-[0.58rem] tracking-[0.16em] text-orange">STAY ON THIS PAGE</div>
                </div>

                <h3 className={`m-0 text-[1.4rem] font-bold uppercase tracking-[0.12em] ${consoleToneClass} md:text-[2rem]`}>
                  {consoleHeadline}
                </h3>
                <p className="mt-4 max-w-[42rem] text-[0.88rem] leading-7 tracking-[0.05em] text-text-muted">{consoleBody}</p>

                <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="border border-border-panel bg-bg-panel p-4">
                    <div className="text-[0.55rem] tracking-[0.16em] text-text-dim">WALLET</div>
                    <div className="mt-2 break-all text-[0.88rem] tracking-[0.08em] text-text">
                      {account ? account.address : "CONNECT TO CLAIM"}
                    </div>
                  </div>
                  <div className="border border-border-panel bg-bg-panel p-4">
                    <div className="text-[0.55rem] tracking-[0.16em] text-text-dim">AVAILABLE NOW</div>
                    <div className="mt-2 text-[1rem] font-semibold tracking-[0.08em] text-mint">
                      {faucet ? `${formatClaimAmount(claimAmount)} ${COLLATERAL_SYMBOL}` : "SYNCING"}
                    </div>
                    <div className="mt-2 text-[0.68rem] leading-5 text-text-dim">
                      {accountClaim ? "Daily return amount for this wallet." : "Starter amount for a first claim."}
                    </div>
                  </div>
                  <div className="border border-border-panel bg-bg-panel p-4">
                    <div className="text-[0.55rem] tracking-[0.16em] text-text-dim">GAS</div>
                    <div className={`mt-2 text-[1rem] font-semibold tracking-[0.08em] ${relayReady ? "text-mint" : "text-orange"}`}>
                      {relayReady ? "SPONSORED" : relayConfigured ? "UNAVAILABLE" : "NOT CONFIGURED"}
                    </div>
                    <div className="mt-2 text-[0.68rem] leading-5 text-text-dim">
                      {relayReady ? "The relay pays gas for this claim." : "Claims fail closed until sponsorship is healthy."}
                    </div>
                  </div>
                  <div className="border border-border-panel bg-bg-panel p-4">
                    <div className="text-[0.55rem] tracking-[0.16em] text-text-dim">NEXT RESET</div>
                    <div className="mt-2 text-[1rem] font-semibold tracking-[0.08em] text-text">{nextClaimCountdown}</div>
                    <div className="mt-2 text-[0.68rem] leading-5 text-text-dim">Resets at 00:00 UTC every day.</div>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-4">
                  {claimMode === "disconnected" || claimMode === "noWallet" ? (
                    <button
                      type="button"
                      onClick={handleConnect}
                      disabled={connectBusy || wallets.length === 0}
                      className="touch-target inline-flex min-h-12 items-center justify-center border-2 border-orange bg-[rgba(221,122,31,0.08)] px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-orange disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {wallets.length === 0 ? "NO WALLET DETECTED" : connectBusy ? "CONNECTING..." : "CONNECT WALLET TO CLAIM"}
                    </button>
                  ) : claimMode === "eligible" ? (
                    <button
                      type="button"
                      onClick={handleClaim}
                      className="touch-target inline-flex min-h-12 items-center justify-center border-2 border-orange bg-[rgba(221,122,31,0.08)] px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-orange shadow-[0_0_12px_rgba(221,122,31,0.22)] transition-all duration-200 hover:shadow-[0_0_16px_rgba(221,122,31,0.4)]"
                    >
                      CLAIM {formatClaimAmount(claimAmount)} {COLLATERAL_SYMBOL}
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
                    <a
                      href={PUBLIC_AIRDROP_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="touch-target inline-flex min-h-12 items-center justify-center border border-border-panel px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-mint no-underline"
                    >
                      OPEN PUBLIC SITE
                    </a>
                  )}

                  <a
                    href={PUBLIC_AIRDROP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[0.7rem] uppercase tracking-[0.14em] text-text-dim"
                  >
                    lineagewar.xyz/airdrop
                  </a>
                </div>

                {claimMode === "claiming" && (
                  <div className="mt-6 grid gap-3 md:grid-cols-3">
                    <div className="border border-tribe-b bg-[rgba(79,183,237,0.08)] p-4">
                      <div className="text-[0.55rem] tracking-[0.16em] text-text-dim">1 // WALLET</div>
                      <div className="mt-2 text-[0.82rem] tracking-[0.08em] text-tribe-b">APPROVE IN WALLET</div>
                    </div>
                    <div className="border border-tribe-b bg-[rgba(79,183,237,0.08)] p-4">
                      <div className="text-[0.55rem] tracking-[0.16em] text-text-dim">2 // RELAY</div>
                      <div className="mt-2 text-[0.82rem] tracking-[0.08em] text-tribe-b">
                        {claimStage === "wallet" ? "WAITING FOR SIGNATURE" : "SENDING SPONSORED CLAIM"}
                      </div>
                    </div>
                    <div className="border border-tribe-b bg-[rgba(79,183,237,0.08)] p-4">
                      <div className="text-[0.55rem] tracking-[0.16em] text-text-dim">3 // CHAIN</div>
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
                  <div className="mt-6 grid gap-3 md:grid-cols-3">
                    <div className="border border-border-panel bg-bg-panel p-4">
                      <div className="text-[0.55rem] tracking-[0.16em] text-text-dim">CLAIMED</div>
                      <div className="mt-2 text-[1rem] font-semibold tracking-[0.08em] text-mint">
                        {formatClaimAmount(successAmount)} {COLLATERAL_SYMBOL}
                      </div>
                    </div>
                    <div className="border border-border-panel bg-bg-panel p-4">
                      <div className="text-[0.55rem] tracking-[0.16em] text-text-dim">UPDATED BALANCE</div>
                      <div className="mt-2 text-[1rem] font-semibold tracking-[0.08em] text-text">
                        {account ? `${formatCollateralAmount(balance.totalBalance, { minimumFractionDigits: 2 })} ${COLLATERAL_SYMBOL}` : "SYNC REQUIRED"}
                      </div>
                    </div>
                    <div className="border border-border-panel bg-bg-panel p-4">
                      <div className="text-[0.55rem] tracking-[0.16em] text-text-dim">NEXT CLAIM</div>
                      <div className="mt-2 text-[1rem] font-semibold tracking-[0.08em] text-text">{nextClaimCountdown}</div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-4">
                <div className="border border-border-panel bg-[rgba(2,5,3,0.5)] p-5">
                  <div className="mb-4 text-[0.58rem] tracking-[0.18em] text-text-dim">HOW IT WORKS</div>
                  <div className="space-y-4 text-[0.8rem] leading-6 tracking-[0.05em] text-text-muted">
                    <p className="m-0">
                      Press the button, stay on this page, and approve in your wallet. There is no second claim route hiding behind the hero.
                    </p>
                    <p className="m-0">
                      If you are eligible, the relay sponsors gas and the console confirms the claim inline. If you already claimed today, you land in cooldown instead of a raw contract error.
                    </p>
                    <p className="m-0">Return after the next UTC reset for the daily claim amount.</p>
                  </div>
                </div>

                <div className="border border-border-panel bg-[rgba(2,5,3,0.5)] p-5">
                  <div className="mb-4 text-[0.58rem] tracking-[0.18em] text-text-dim">YOUR SIGNALS</div>
                  <div className="grid gap-3">
                    <div className="border border-border-panel bg-bg-panel p-4">
                      <div className="text-[0.55rem] tracking-[0.16em] text-text-dim">CURRENT BALANCE</div>
                      <div className="mt-2 text-[0.95rem] font-semibold tracking-[0.08em] text-text">
                        {account ? `${formatCollateralAmount(balance.totalBalance, { minimumFractionDigits: 2 })} ${COLLATERAL_SYMBOL}` : "CONNECT TO LOAD"}
                      </div>
                    </div>
                    <div className="border border-border-panel bg-bg-panel p-4">
                      <div className="text-[0.55rem] tracking-[0.16em] text-text-dim">FAUCET STATS</div>
                      <div className="mt-2 text-[0.82rem] leading-6 tracking-[0.05em] text-text">
                        {faucet ? `${faucet.trackedWallets.toString()} wallets tracked // ${faucet.totalClaimCount.toString()} claims executed` : "SYNCING FAUCET METRICS"}
                      </div>
                    </div>
                    <div className="border border-border-panel bg-bg-panel p-4">
                      <div className="text-[0.55rem] tracking-[0.16em] text-text-dim">LAST CLAIMER STATE</div>
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

        <Footer />
      </div>
    </TerminalScreen>
  );
}
