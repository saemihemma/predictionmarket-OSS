import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { Link } from "react-router-dom";
import airdropFigure from "../assets/airdrop-figure.png";
import sufferCoin from "../assets/suffer-coin.png";
import TerminalScreen from "../components/terminal/TerminalScreen";
import Footer from "../components/ui/Footer";
import PageHeader from "../components/ui/PageHeader";
import { formatAddress } from "../lib/formatting";

const STATUS_ITEMS = [
  { label: "NETWORK", value: "TESTNET", tone: "text-tribe-b" },
  { label: "TOKEN", value: "SFR", tone: "text-mint" },
  { label: "WALRUS ICON", value: "LIVE", tone: "text-mint" },
  { label: "AIRDROP SITE", value: "OPEN", tone: "text-orange" },
] as const;

const BRIEFING_ITEMS = [
  "Use the public airdrop site for the latest claim information.",
  "Wallet connection is already available through the shared terminal header.",
  "SUFFER branding stays synced to the live Walrus-hosted identity.",
] as const;

const READINESS_ITEMS = [
  {
    label: "TOKEN",
    value: "SUFFER / SFR",
    note: "Testnet presence is wired into the market identity and shown here as a live branded surface.",
  },
  {
    label: "ICON PATH",
    value: "orchestrator.wal.app",
    note: "Walrus-hosted branding is stable and ready for wallet-facing metadata.",
  },
  {
    label: "CHANNEL",
    value: "PUBLIC SITE",
    note: "Open the external airdrop website for the claim destination and updates.",
  },
] as const;

export default function AirdropPage() {
  const account = useCurrentAccount();
  const walletValue = account ? formatAddress(account.address) : "SYNC REQUIRED";

  return (
    <TerminalScreen>
      <div className="min-h-screen flex flex-col">
        <PageHeader
          subtitle="SUFFER AIRDROP"
          showBack
          actions={
            <span className="touch-target inline-flex items-center border border-orange-dim bg-[rgba(221,122,31,0.08)] px-3 py-2 text-[0.65rem] font-semibold tracking-[0.16em] text-orange">
              PUBLIC SITE
            </span>
          }
        />

        <div className="border-b border-border-grid">
          <div className="page-shell grid gap-3 py-3 text-xs tracking-[0.08em] text-text sm:grid-cols-2 xl:grid-cols-5">
            {STATUS_ITEMS.map((item) => (
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
                    AIRDROP // TERMINAL
                  </span>
                  <span className="text-text-dim">PREVIEW SIGNAL FLOW</span>
                </div>

                <div className="max-w-[42rem]">
                  <h2 className="m-0 text-[2rem] font-bold uppercase leading-[1.02] tracking-[0.12em] text-mint md:text-[3rem]">
                    SUFFER AIRDROP IS LIVE.
                    <br />
                    OPEN THE PUBLIC SITE.
                  </h2>
                  <p className="mt-5 max-w-[36rem] text-sm leading-7 tracking-[0.06em] text-text-muted md:text-[0.95rem]">
                    This internal page keeps the SUFFER identity and wallet context inside the app, while the public airdrop
                    website carries the latest claim destination and updates.
                  </p>
                </div>

                <div className="mt-8 flex flex-wrap items-center gap-4">
                  <a
                    href="https://lineagewar.xyz/airdrop"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="touch-target inline-flex items-center justify-center border-2 border-orange bg-[rgba(221,122,31,0.08)] px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-orange shadow-[0_0_12px_rgba(221,122,31,0.22)] transition-all duration-200 hover:shadow-[0_0_16px_rgba(221,122,31,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
                  >
                    OPEN AIRDROP WEBSITE
                  </a>
                  <Link
                    to="/markets"
                    className="touch-target inline-flex items-center justify-center border border-border-panel px-4 py-3 text-center text-xs font-semibold tracking-[0.14em] text-mint no-underline transition-all duration-200 hover:border-mint hover:shadow-[0_0_12px_rgba(202,245,222,0.15)]"
                  >
                    RETURN TO MARKETS
                  </Link>
                </div>

                <div className="mt-4 max-w-[38rem] text-[0.68rem] leading-6 tracking-[0.08em] text-text-dim">
                  PUBLIC WEBSITE: lineagewar.xyz/airdrop // CLAIM DETAILS AND NEXT STEPS LIVE THERE.
                </div>
              </div>

              <div className="relative z-10 mt-10 grid gap-4 md:grid-cols-3">
                {BRIEFING_ITEMS.map((item, index) => (
                  <div
                    key={item}
                    className="flex min-h-[8.4rem] flex-col justify-between border border-border-panel bg-[rgba(2,5,3,0.45)] p-4"
                  >
                    <span className="text-[0.55rem] tracking-[0.18em] text-text-dim">0{index + 1} // BRIEFING</span>
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
                    FIGURE // PRIMARY FIELD
                  </div>
                  <div className="absolute bottom-[8%] left-[10%] border border-orange-dim/50 bg-[rgba(221,122,31,0.07)] px-3 py-2 text-[0.58rem] tracking-[0.16em] text-orange">
                    SFR SEAL // SECONDARY ORBIT
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-6 grid gap-4 lg:grid-cols-[0.95fr_1.05fr_0.9fr]">
            <div className="border border-border-panel bg-bg-panel p-5">
              <div className="mb-4 text-[0.58rem] tracking-[0.18em] text-text-dim">MISSION PROFILE</div>
              <div className="space-y-3 text-[0.82rem] leading-6 tracking-[0.06em] text-text-muted">
                <p className="m-0">
                  SUFFER is the branded token surface for the market. This page gives the project a clear home inside the app
                  while pointing people to the public airdrop website.
                </p>
                <p className="m-0">
                  The shell stays consistent with the rest of the product, but the message should be easy to scan and simple to
                  act on.
                </p>
              </div>
            </div>

            <div className="border border-border-panel bg-bg-panel p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="text-[0.58rem] tracking-[0.18em] text-text-dim">READINESS GRID</div>
                <div className="text-[0.58rem] tracking-[0.16em] text-orange">NO BACKEND DEPENDENCY</div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {READINESS_ITEMS.map((item) => (
                  <div key={item.label} className="border border-border-panel bg-[rgba(2,5,3,0.5)] p-4">
                    <div className="text-[0.55rem] tracking-[0.16em] text-text-dim">{item.label}</div>
                    <div className="mt-2 text-[0.82rem] font-semibold tracking-[0.1em] text-mint">{item.value}</div>
                    <div className="mt-3 text-[0.7rem] leading-5 tracking-[0.05em] text-text-dim">{item.note}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-border-panel bg-bg-panel p-5">
              <div className="mb-4 text-[0.58rem] tracking-[0.18em] text-text-dim">WALLET SYNC</div>
              <div className="border border-border-panel bg-[rgba(2,5,3,0.55)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3 text-[0.62rem] tracking-[0.16em]">
                  <span className="text-text-dim">CURRENT STATE</span>
                  <span className={`${account ? "text-mint" : "text-orange"} font-semibold`}>
                    {account ? "LINK CONFIRMED" : "AWAITING HANDSHAKE"}
                  </span>
                </div>
                <div className="mt-4 break-all text-[0.88rem] tracking-[0.1em] text-text">
                  {account ? account.address : "CONNECT THROUGH THE HEADER BUTTON"}
                </div>
                <div className="mt-4 text-[0.72rem] leading-5 tracking-[0.05em] text-text-dim">
                  Wallet sync is already handled by the shared header. Open the public airdrop site when you want the latest
                  claim information and next steps.
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
