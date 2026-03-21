import TerminalScreen from "../components/terminal/TerminalScreen";
import PageHeader from "../components/ui/PageHeader";
import Footer from "../components/ui/Footer";

export default function DisputeHelpPage() {
  return (
    <TerminalScreen>
      <div className="min-h-[100dvh] flex flex-col">
        <PageHeader subtitle="DISPUTE HELP" showBack />

        {/* Content */}
        <main style={{ flex: 1, padding: "2rem", maxWidth: "900px", margin: "0 auto", width: "100%" }}>
          <div
            style={{
              background: "var(--bg-panel)",
              border: "1px solid var(--border-panel)",
              padding: "2rem",
            }}
          >
            <h2
              style={{
                fontSize: "1.4rem",
                fontWeight: 700,
                color: "var(--mint)",
                marginBottom: "1.5rem",
                letterSpacing: "0.1em",
              }}
            >
              HOW DISPUTES WORK
            </h2>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "1.5rem",
                fontSize: "1rem",
                color: "var(--text)",
                lineHeight: "1.8",
              }}
            >
              {/* Step 1 */}
              <div>
                <div
                  style={{
                    fontSize: "0.95rem",
                    fontWeight: 600,
                    color: "var(--mint)",
                    marginBottom: "0.5rem",
                    letterSpacing: "0.08em",
                  }}
                >
                  1. A MARKET RESOLVES
                </div>
                <p style={{ margin: 0, color: "var(--text-muted)" }}>
                  A market closes and resolves with an outcome. You disagree with the resolution.
                </p>
              </div>

              {/* Step 2 */}
              <div>
                <div
                  style={{
                    fontSize: "0.95rem",
                    fontWeight: 600,
                    color: "var(--mint)",
                    marginBottom: "0.5rem",
                    letterSpacing: "0.08em",
                  }}
                >
                  2. YOU FILE A DISPUTE
                </div>
                <p style={{ margin: 0, color: "var(--text-muted)" }}>
                  Click the DISPUTE button on the market and post a bond (varies by market trust tier).
                  This escalates the resolution to the protocol.
                </p>
              </div>

              {/* Step 3 */}
              <div>
                <div
                  style={{
                    fontSize: "0.95rem",
                    fontWeight: 600,
                    color: "var(--mint)",
                    marginBottom: "0.5rem",
                    letterSpacing: "0.08em",
                  }}
                >
                  3. SUFFER TOKENHOLDERS VOTE
                </div>
                <p style={{ margin: 0, color: "var(--text-muted)" }}>
                  SUFFER token holders vote on the correct outcome using commit-reveal voting.
                  This is fully decentralized and on-chain.
                </p>
              </div>

              {/* Step 4 */}
              <div>
                <div
                  style={{
                    fontSize: "0.95rem",
                    fontWeight: 600,
                    color: "var(--mint)",
                    marginBottom: "0.5rem",
                    letterSpacing: "0.08em",
                  }}
                >
                  4. OUTCOME IS DETERMINED
                </div>
                <p style={{ margin: 0, color: "var(--text-muted)" }}>
                  If you are right: you get 75% of the creator's bond + your bond back.
                  <br />
                  If you are wrong: you lose 75% of your bond to the creator.
                </p>
              </div>

              {/* Step 5 */}
              <div>
                <div
                  style={{
                    fontSize: "0.95rem",
                    fontWeight: 600,
                    color: "var(--mint)",
                    marginBottom: "0.5rem",
                    letterSpacing: "0.08em",
                  }}
                >
                  5. VOTES COMPLETE
                </div>
                <p style={{ margin: 0, color: "var(--text-muted)" }}>
                  Voting takes 24-48 hours to complete. Once finished, the new outcome is final.
                </p>
              </div>

              {/* Important note */}
              <div
                style={{
                  padding: "1rem",
                  background: "rgba(221, 122, 31, 0.08)",
                  border: "1px solid var(--orange-dim)",
                  marginTop: "1rem",
                }}
              >
                <div style={{ fontSize: "0.9rem", color: "var(--orange)", fontWeight: 600, marginBottom: "0.5rem" }}>
                  ⚠ NO APPEALS OR CUSTOMER SUPPORT
                </div>
                <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.95rem" }}>
                  This process is fully automated. The protocol is law. Once votes are tallied, the outcome is final.
                  There is no customer support, no appeals, and no human judgment beyond the vote.
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
