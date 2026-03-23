import TerminalScreen from "../components/terminal/TerminalScreen";
import PageHeader from "../components/ui/PageHeader";
import Footer from "../components/ui/Footer";
import { COLLATERAL_NAME, COLLATERAL_SYMBOL } from "../lib/market-constants";

const STEPS = [
  {
    title: "1. A MARKET RESOLVES",
    body: "A market closes and resolves with an outcome. You disagree with the resolution.",
  },
  {
    title: "2. YOU FILE A DISPUTE",
    body: "Click the DISPUTE button on the market and post a bond (varies by market trust tier). The protocol dispute object is already live; the dedicated dispute UI is still coming online.",
  },
  {
    title: "3. TOKENHOLDERS VOTE",
    body: `${COLLATERAL_SYMBOL} token holders will vote on the correct outcome using commit-reveal voting. The on-chain objects are live; the dedicated vote, stake, and reward screens are not shipped yet.`,
  },
  {
    title: "4. OUTCOME IS DETERMINED",
    body: "If you are right: you get 75% of the creator's bond plus your bond back. If you are wrong: you lose 75% of your bond to the creator.",
  },
  {
    title: "5. VOTES COMPLETE",
    body: "Voting takes 24-48 hours to complete once the live protocol flow is active. Once finished, the new outcome is final.",
  },
] as const;

export default function DisputeHelpPage() {
  return (
    <TerminalScreen>
      <div className="min-h-screen flex flex-col">
        <PageHeader subtitle="DISPUTE HELP" showBack />

        <main className="page-shell page-shell--narrow page-section flex-1">
          <div className="border border-border-panel bg-bg-panel p-5 sm:p-8">
            <h2 className="mb-6 text-[1.2rem] font-bold tracking-[0.1em] text-mint sm:text-[1.4rem]">HOW DISPUTES WORK</h2>
            <p className="mb-6 text-sm leading-7 text-text-muted sm:text-base">
              The dispute and protocol objects are live on-chain today. What is still missing is the dedicated stake, vote,
              and reward UI, so this page describes the flow before that interface lands for {COLLATERAL_NAME}.
            </p>

            <div className="flex flex-col gap-6 text-base leading-7 text-text">
              {STEPS.map((step) => (
                <section key={step.title}>
                  <div className="mb-2 text-[0.95rem] font-semibold tracking-[0.08em] text-mint">{step.title}</div>
                  <p className="m-0 text-sm leading-7 text-text-muted sm:text-base">{step.body}</p>
                </section>
              ))}

              <div className="mt-2 border border-orange-dim bg-[rgba(221,122,31,0.08)] p-4">
                <div className="mb-2 text-[0.9rem] font-semibold text-orange">WARNING // NO APPEALS OR CUSTOMER SUPPORT</div>
                <p className="m-0 text-sm leading-7 text-text-muted sm:text-[0.95rem]">
                  This process is fully automated. The protocol is law. Once votes are tallied, the outcome is final. There is
                  no customer support, no appeals, and no human judgment beyond the vote.
                </p>
              </div>
            </div>
          </div>
        </main>

        <Footer />
      </div>
    </TerminalScreen>
  );
}
