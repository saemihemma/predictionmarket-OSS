import { type ReactNode } from "react";

interface StatRowProps {
  label: string;
  value: ReactNode;
  valueColor?: string;
  mono?: boolean;
}

/**
 * A single label + value row in IBM Plex Mono.
 * The workhorse of telemetry data display.
 */
export default function StatRow({
  label,
  value,
  valueColor = "var(--text)",
  mono = true,
}: StatRowProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: "1rem",
        padding: "0.25rem 0",
        borderBottom: "1px solid var(--border-grid)",
        fontFamily: mono ? "IBM Plex Mono" : undefined,
        fontSize: "0.75rem",
      }}
    >
      <span style={{ color: "var(--text-dim)", letterSpacing: "0.06em", flexShrink: 0 }}>
        {label}
      </span>
      <span
        style={{
          color: valueColor,
          textAlign: "right",
          fontWeight: 500,
        }}
      >
        {value}
      </span>
    </div>
  );
}
