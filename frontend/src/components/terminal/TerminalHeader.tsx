import { type ReactNode } from "react";
import { motion } from "framer-motion";

interface HeaderMeta {
  label: string;
  value: string;
}

interface TerminalHeaderProps {
  title: string;
  meta?: HeaderMeta[];
  status?: "ACTIVE" | "PAUSED" | "ENDED" | "STANDBY";
  /** Optional right-side slot: e.g. back link, live badge */
  right?: ReactNode;
}

const statusColor: Record<string, string> = {
  ACTIVE: "var(--mint)",
  PAUSED: "var(--yellow)",
  ENDED: "var(--text-dim)",
  STANDBY: "var(--neutral-state)",
};

/**
 * Top metadata strip — market/event title, cycle/date labels, status indicator.
 * Applied once per route, inside TerminalScreen.
 */
export default function TerminalHeader({
  title,
  meta = [],
  status,
  right,
}: TerminalHeaderProps) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "0.5rem",
        padding: "0.65rem 1.25rem",
        borderBottom: "1px solid var(--border-panel)",
        background: "rgba(6, 17, 12, 0.9)",
        backdropFilter: "blur(2px)",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      {/* Left: title + meta */}
      <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", flexWrap: "wrap" }}>
        <h1
          style={{
            fontFamily: "IBM Plex Mono",
            fontSize: "0.7rem",
            fontWeight: 500,
            letterSpacing: "0.14em",
            lineHeight: 1,
            color: "var(--mint)",
            margin: 0,
          }}
        >
          <span style={{ color: "var(--text-dim)" }}>// </span>
          {title.toUpperCase()}
        </h1>

        {meta.map((m) => (
          <div
            key={m.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              fontFamily: "IBM Plex Mono",
              fontSize: "0.65rem",
            }}
          >
            <span style={{ color: "var(--text-dim)", letterSpacing: "0.1em" }}>
              {m.label}
            </span>
            <span style={{ color: "var(--text-muted)" }}>{m.value}</span>
          </div>
        ))}
      </div>

      {/* Right slot */}
      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        {status && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
              fontFamily: "IBM Plex Mono",
              fontSize: "0.65rem",
              letterSpacing: "0.12em",
              color: statusColor[status] ?? "var(--text-muted)",
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: statusColor[status] ?? "var(--text-muted)",
                boxShadow:
                  status === "ACTIVE"
                    ? "0 0 6px var(--mint)"
                    : "none",
                animation: status === "ACTIVE" ? "pulse 2s ease-in-out infinite" : "none",
              }}
            />
            {status}
          </div>
        )}
        {right}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </motion.header>
  );
}
