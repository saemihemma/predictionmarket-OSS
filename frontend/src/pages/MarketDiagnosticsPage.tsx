/**
 * /markets/diagnostics — P0 trust surface (Gate 5).
 * Where skeptical users verify that authority assumptions are not hidden.
 * Shows: manifest hash, contract IDs, emergency authority, resolver set, benchmarks.
 * No wallet required. All IBM Plex Mono, monochrome mint.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import TerminalScreen from "../components/terminal/TerminalScreen";
import TerminalHeader from "../components/terminal/TerminalHeader";
import TerminalPanel from "../components/terminal/TerminalPanel";
import StatRow from "../components/telemetry/StatRow";
import {
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
import { suiClient } from "../lib/client";

const MONO_DIM: React.CSSProperties = {
  fontFamily: "IBM Plex Mono",
  fontSize: "0.6rem",
  color: "var(--text-dim)",
};

const RAW_TOGGLE_STYLE: React.CSSProperties = {
  fontFamily: "IBM Plex Mono",
  fontSize: "0.55rem",
  color: "var(--text-dim)",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  letterSpacing: "0.06em",
};

const RAW_PRE_STYLE: React.CSSProperties = {
  ...MONO_DIM,
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
  maxHeight: 300,
  overflowY: "auto",
  margin: 0,
};

async function fetchObject(id: string) {
  if (!id || id === "0x0") return null;
  try {
    return await suiClient.getObject({ id, options: { showContent: true } });
  } catch {
    return null;
  }
}

function truncateId(id: string): string {
  if (!id || id === "0x0" || id.length < 16) return id;
  return `${id.slice(0, 10)}\u2026${id.slice(-6)}`;
}

function RawObjectPanel({
  title,
  objectId,
}: {
  title: string;
  objectId: string;
}) {
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
        <button onClick={() => setShowRaw(!showRaw)} style={RAW_TOGGLE_STYLE}>
          {showRaw ? "HIDE" : "SHOW RAW"}
        </button>
      }
    >
      {showRaw ? (
        <pre style={RAW_PRE_STYLE}>
          {data ? JSON.stringify(data, null, 2) : "No data"}
        </pre>
      ) : (
        <div style={MONO_DIM}>
          {objectId === "0x0"
            ? "Not deployed yet."
            : data
              ? "Object loaded. Click SHOW RAW to inspect."
              : "Loading\u2026"}
        </div>
      )}
    </TerminalPanel>
  );
}

export default function MarketDiagnosticsPage() {
  const account = useCurrentAccount();
  const rpcUrl = import.meta.env.VITE_SUI_RPC ?? "(default testnet)";

  return (
    <TerminalScreen>
      <div style={{ position: "relative", minHeight: "100dvh" }}>
        <TerminalHeader
          title="MARKET DIAGNOSTICS"
          meta={[{ label: "TYPE", value: "TRUST SURFACE" }]}
          status="ACTIVE"
          right={
            <Link
              to="/markets"
              style={{
                fontFamily: "IBM Plex Mono",
                fontSize: "0.65rem",
                letterSpacing: "0.1em",
                color: "var(--text-dim)",
                textDecoration: "none",
              }}
            >
              \u2190 MARKETS
            </Link>
          }
        />

        {/* Manifest banner */}
        <div
          style={{
            padding: "0.5rem 1rem",
            borderBottom: "1px solid var(--border-panel)",
            fontFamily: "IBM Plex Mono",
            fontSize: "0.6rem",
            letterSpacing: "0.08em",
            color: "var(--text-dim)",
            display: "flex",
            justifyContent: "center",
            gap: "1.5rem",
          }}
        >
          <span>
            MANIFEST{" "}
            <span style={{ color: "var(--mint)" }}>{PM_MANIFEST_VERSION}</span>
          </span>
          <span>
            //{" "}
            <span style={{ color: "var(--mint-dim)" }}>{PM_MANIFEST_HASH}</span>
          </span>
          {PM_BENCHMARK_URL && (
            <a
              href={PM_BENCHMARK_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "var(--text-dim)",
                textDecoration: "none",
                borderBottom: "1px solid var(--border-panel)",
              }}
            >
              BENCHMARKS \u2197
            </a>
          )}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "1rem",
            padding: "1rem",
          }}
        >
          {/* Left column */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
            }}
          >
            {/* Contract IDs */}
            <TerminalPanel title="CONTRACT IDS">
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.1rem",
                }}
              >
                <StatRow
                  label="PACKAGE"
                  value={truncateId(PM_PACKAGE_ID)}
                  valueColor="var(--mint)"
                />
                <StatRow label="REGISTRY" value={truncateId(PM_REGISTRY_ID)} />
                <StatRow label="CONFIG" value={truncateId(PM_CONFIG_ID)} />
                <StatRow label="TREASURY" value={truncateId(PM_TREASURY_ID)} />
              </div>
            </TerminalPanel>

            {/* Emergency Authority (Gate 2 / Gate 5) */}
            <TerminalPanel title="EMERGENCY AUTHORITY" accent="contested">
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.1rem",
                }}
              >
                <StatRow
                  label="MULTISIG"
                  value={truncateId(PM_EMERGENCY_MULTISIG_ID)}
                  valueColor={
                    PM_EMERGENCY_MULTISIG_ID === "0x0"
                      ? "var(--text-dim)"
                      : "var(--orange)"
                  }
                />
                <StatRow
                  label="STATUS"
                  value={
                    PM_EMERGENCY_MULTISIG_ID === "0x0"
                      ? "NOT DEPLOYED"
                      : "ANCHORED"
                  }
                  valueColor={
                    PM_EMERGENCY_MULTISIG_ID === "0x0"
                      ? "var(--text-dim)"
                      : "var(--mint)"
                  }
                />
              </div>
              <div
                style={{
                  ...MONO_DIM,
                  marginTop: "0.5rem",
                  lineHeight: 1.6,
                }}
              >
                Emergency pause is immediate. Emergency invalidation requires a
                24h review window. PMAdminCap cannot invoke emergency actions.
              </div>
            </TerminalPanel>

            {/* Connection */}
            <TerminalPanel title="CONNECTION">
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.1rem",
                }}
              >
                <StatRow
                  label="RPC ENDPOINT"
                  value={rpcUrl}
                  valueColor="var(--text-dim)"
                />
                <StatRow
                  label="WALLET"
                  value={
                    account?.address
                      ? `${account.address.slice(0, 10)}\u2026${account.address.slice(-4)}`
                      : "NOT CONNECTED"
                  }
                  valueColor={account ? "var(--mint)" : "var(--text-dim)"}
                />
              </div>
            </TerminalPanel>
          </div>

          {/* Right column */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
            }}
          >
            {/* Resolver Set */}
            <TerminalPanel title="RESOLVER SET">
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.1rem",
                }}
              >
                <StatRow
                  label="OBJECT"
                  value={truncateId(PM_RESOLVER_SET_ID)}
                  valueColor={
                    PM_RESOLVER_SET_ID === "0x0"
                      ? "var(--text-dim)"
                      : "var(--yellow)"
                  }
                />
                <StatRow
                  label="TYPE"
                  value="GLOBAL (v1)"
                  valueColor="var(--text-dim)"
                />
              </div>
              <div
                style={{
                  ...MONO_DIM,
                  marginTop: "0.5rem",
                  lineHeight: 1.6,
                }}
              >
                v1 uses a global appointed resolver set. Public votes, simple
                majority with quorum. No token voting. Per-policy resolver sets
                planned for v2.
              </div>
            </TerminalPanel>

            {/* Raw objects */}
            <RawObjectPanel title="REGISTRY OBJECT" objectId={PM_REGISTRY_ID} />
            <RawObjectPanel title="CONFIG OBJECT" objectId={PM_CONFIG_ID} />
          </div>
        </div>

        {/* Footer: manifest + version */}
        <div
          style={{
            padding: "0.75rem 1rem",
            borderTop: "1px solid var(--border-panel)",
            display: "flex",
            justifyContent: "center",
            gap: "1.5rem",
            fontFamily: "IBM Plex Mono",
            fontSize: "0.55rem",
            letterSpacing: "0.06em",
            color: "var(--text-dim)",
          }}
        >
          <span>PREDICTION MARKET {PM_MANIFEST_VERSION}</span>
          <span>// {PM_MANIFEST_HASH}</span>
          <Link
            to="/markets"
            style={{ color: "var(--text-dim)", textDecoration: "none" }}
          >
            \u2190 BACK
          </Link>
        </div>
      </div>
    </TerminalScreen>
  );
}
