import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import TerminalScreen from "../components/terminal/TerminalScreen";
import TerminalHeader from "../components/terminal/TerminalHeader";
import TerminalPanel from "../components/terminal/TerminalPanel";
import StatRow from "../components/telemetry/StatRow";
import {
  COLLATERAL_SYMBOL,
  PM_PACKAGE_ID,
  PM_REGISTRY_ID,
  PM_CONFIG_ID,
  PM_TREASURY_ID,
  PM_EMERGENCY_MULTISIG_ID,
  PM_RESOLVER_SET_ID,
  PM_MANIFEST_VERSION,
  PM_MANIFEST_HASH,
  PM_BENCHMARK_URL,
} from "../lib/market-constants";
import { getReadTransportStatus, protocolReadTransport } from "../lib/client";
import { getProtocolManifest } from "../lib/protocol-config";

async function fetchObject(id: string) {
  if (!id || id === "0x0") return null;
  try {
    return await protocolReadTransport.getObject(id);
  } catch {
    return null;
  }
}

function truncateId(id: string): string {
  if (!id || id === "0x0" || id.length < 16) return id;
  return `${id.slice(0, 10)}...${id.slice(-6)}`;
}

function RawObjectPanel({ title, objectId }: { title: string; objectId: string }) {
  const [showRaw, setShowRaw] = useState(false);
  const { data } = useQuery({
    queryKey: ["diagnostics", title, objectId],
    queryFn: () => fetchObject(objectId),
    staleTime: 60_000,
    enabled: objectId !== "0x0",
  });

  return (
    <TerminalPanel
      title={title}
      titleRight={
        <button
          onClick={() => setShowRaw((current) => !current)}
          className="font-mono text-[0.55rem] tracking-[0.06em] text-text-dim"
        >
          {showRaw ? "HIDE" : "SHOW RAW"}
        </button>
      }
    >
      {showRaw ? (
        <pre className="m-0 max-h-72 overflow-y-auto whitespace-pre-wrap break-all font-mono text-[0.6rem] text-text-dim">
          {data ? JSON.stringify(data, null, 2) : "No data"}
        </pre>
      ) : (
        <div className="font-mono text-[0.6rem] text-text-dim">
          {objectId === "0x0" ? "Not deployed yet." : data ? "Object loaded. Click SHOW RAW to inspect." : "Loading..."}
        </div>
      )}
    </TerminalPanel>
  );
}

export default function MarketDiagnosticsPage() {
  const account = useCurrentAccount();
  const transport = getReadTransportStatus();
  const manifest = getProtocolManifest();

  return (
    <TerminalScreen>
      <div className="min-h-screen">
        <TerminalHeader
          title="MARKET DIAGNOSTICS"
          meta={[{ label: "TYPE", value: "TRUST SURFACE" }]}
          status="ACTIVE"
          right={
            <Link to="/markets" className="font-mono text-[0.65rem] tracking-[0.1em] text-text-dim no-underline">
              &larr; MARKETS
            </Link>
          }
        />

        <div className="border-b border-border-panel">
          <div className="page-shell flex flex-wrap justify-center gap-x-6 gap-y-2 py-2 font-mono text-[0.6rem] tracking-[0.08em] text-text-dim">
            <span>
              MANIFEST <span className="text-mint">{PM_MANIFEST_VERSION}</span>
            </span>
            <span>
              // <span className="text-mint-dim">{PM_MANIFEST_HASH}</span>
            </span>
            {PM_BENCHMARK_URL && (
              <a
                href={PM_BENCHMARK_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="border-b border-border-panel text-text-dim no-underline"
              >
                BENCHMARKS ^
              </a>
            )}
          </div>
        </div>

        <div className="page-shell page-section panel-stack panel-stack--diagnostics">
          <div className="flex flex-col gap-3">
            <TerminalPanel title="CONTRACT IDS">
              <div className="flex flex-col gap-0.5">
                <StatRow label="PACKAGE" value={truncateId(PM_PACKAGE_ID)} valueColor="var(--mint)" />
                <StatRow label="REGISTRY" value={truncateId(PM_REGISTRY_ID)} />
                <StatRow label="CONFIG" value={truncateId(PM_CONFIG_ID)} />
                <StatRow label="TREASURY" value={truncateId(PM_TREASURY_ID)} />
                <StatRow label="COLLATERAL" value={COLLATERAL_SYMBOL} valueColor="var(--mint)" />
              </div>
            </TerminalPanel>

            <TerminalPanel title="EMERGENCY AUTHORITY" accent="contested">
              <div className="flex flex-col gap-0.5">
                <StatRow
                  label="MULTISIG"
                  value={truncateId(PM_EMERGENCY_MULTISIG_ID)}
                  valueColor={PM_EMERGENCY_MULTISIG_ID === "0x0" ? "var(--text-dim)" : "var(--orange)"}
                />
                <StatRow
                  label="STATUS"
                  value={PM_EMERGENCY_MULTISIG_ID === "0x0" ? "NOT DEPLOYED" : "ANCHORED"}
                  valueColor={PM_EMERGENCY_MULTISIG_ID === "0x0" ? "var(--text-dim)" : "var(--mint)"}
                />
              </div>
              <div className="mt-2 font-mono text-[0.6rem] leading-6 text-text-dim">
                Emergency pause is immediate. Emergency invalidation requires a 24h review window. PMAdminCap cannot invoke
                emergency actions.
              </div>
            </TerminalPanel>

            <TerminalPanel title="CONNECTION">
              <div className="flex flex-col gap-0.5">
                <StatRow label="READ TRANSPORT" value={`${transport.primary.toUpperCase()} PRIMARY`} valueColor="var(--mint)" />
                <StatRow label="GRAPHQL ENDPOINT" value={manifest.graphqlUrl} valueColor="var(--text-dim)" />
                <StatRow
                  label="FALLBACK USED"
                  value={transport.fallbackUsedThisSession ? "YES" : "NO"}
                  valueColor={transport.fallbackUsedThisSession ? "var(--orange)" : "var(--mint)"}
                />
                <StatRow
                  label="LAST FALLBACK"
                  value={transport.lastFallbackReason ?? "NONE"}
                  valueColor={transport.lastFallbackReason ? "var(--orange)" : "var(--text-dim)"}
                />
                <StatRow
                  label="WALLET"
                  value={
                    account?.address
                      ? `${account.address.slice(0, 10)}...${account.address.slice(-4)}`
                      : "NOT CONNECTED"
                  }
                  valueColor={account ? "var(--mint)" : "var(--text-dim)"}
                />
              </div>
            </TerminalPanel>
          </div>

          <div className="flex flex-col gap-3">
            <TerminalPanel title="RESOLVER SET">
              <div className="flex flex-col gap-0.5">
                <StatRow
                  label="OBJECT"
                  value={truncateId(PM_RESOLVER_SET_ID)}
                  valueColor={PM_RESOLVER_SET_ID === "0x0" ? "var(--text-dim)" : "var(--yellow)"}
                />
                <StatRow label="TYPE" value="GLOBAL (v1)" valueColor="var(--text-dim)" />
              </div>
              <div className="mt-2 font-mono text-[0.6rem] leading-6 text-text-dim">
                v1 uses a global appointed resolver set. Public votes, simple majority with quorum. No token voting.
                Per-policy resolver sets are planned for v2.
              </div>
            </TerminalPanel>

            <RawObjectPanel title="REGISTRY OBJECT" objectId={PM_REGISTRY_ID} />
            <RawObjectPanel title="CONFIG OBJECT" objectId={PM_CONFIG_ID} />
          </div>
        </div>

        <div className="border-t border-border-panel">
          <div className="page-shell flex flex-wrap justify-center gap-x-6 gap-y-2 py-3 font-mono text-[0.55rem] tracking-[0.06em] text-text-dim">
            <span>PREDICTION MARKET {PM_MANIFEST_VERSION}</span>
            <span>// {PM_MANIFEST_HASH}</span>
            <Link to="/markets" className="text-text-dim no-underline">
              &larr; BACK
            </Link>
          </div>
        </div>
      </div>
    </TerminalScreen>
  );
}
