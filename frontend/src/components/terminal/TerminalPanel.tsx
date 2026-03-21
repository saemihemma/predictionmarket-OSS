import { type ReactNode, type CSSProperties } from "react";
import { clsx } from "clsx";

type PanelAccent = "default" | "tribeA" | "tribeB" | "contested" | "neutral";

interface TerminalPanelProps {
  title?: string;
  children: ReactNode;
  accent?: PanelAccent;
  className?: string;
  style?: CSSProperties;
  /** Render the title bar inline with an optional right-side slot */
  titleRight?: ReactNode;
  /** Remove bottom padding from the content area (e.g. when chart fills to the edge) */
  noPadBottom?: boolean;
}

const accentBorderColor: Record<PanelAccent, string> = {
  default: "var(--border-panel)",
  tribeA: "var(--tribe-a)",
  tribeB: "var(--tribe-b)",
  contested: "var(--orange)",
  neutral: "var(--neutral-state)",
};

const accentTitleColor: Record<PanelAccent, string> = {
  default: "var(--mint)",
  tribeA: "var(--tribe-a)",
  tribeB: "var(--tribe-b)",
  contested: "var(--orange)",
  neutral: "var(--neutral-state)",
};

/**
 * The core reusable bordered panel primitive.
 * Every section of the market display terminal is composed from this component.
 */
export default function TerminalPanel({
  title,
  children,
  accent = "default",
  className,
  style,
  titleRight,
  noPadBottom = false,
}: TerminalPanelProps) {
  const borderColor = accentBorderColor[accent];
  const titleColor = accentTitleColor[accent];

  return (
    <div
      className={clsx("terminal-panel", className)}
      style={{
        borderColor,
        display: "flex",
        flexDirection: "column",
        ...style,
      }}
    >
      {title && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.45rem 0.85rem",
            borderBottom: `1px solid ${borderColor}`,
            background: "rgba(0,0,0,0.25)",
          }}
        >
          <span
            style={{
              fontFamily: "IBM Plex Mono",
              fontSize: "1rem",
              fontWeight: 500,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: titleColor,
            }}
          >
            {title}
          </span>
          {titleRight && (
            <span style={{ color: "var(--text-dim)", fontSize: "0.65rem" }}>
              {titleRight}
            </span>
          )}
        </div>
      )}
      <div style={{ padding: noPadBottom ? "0.85rem 0.85rem 0" : "0.85rem", flex: 1 }}>{children}</div>
    </div>
  );
}
