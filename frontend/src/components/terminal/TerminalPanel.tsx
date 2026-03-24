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

const accentClasses: Record<
  PanelAccent,
  {
    border: string;
    header: string;
    title: string;
  }
> = {
  default: {
    border: "border-border-panel",
    header: "text-border-panel",
    title: "text-mint",
  },
  tribeA: {
    border: "border-tribe-a",
    header: "text-tribe-a",
    title: "text-tribe-a",
  },
  tribeB: {
    border: "border-tribe-b",
    header: "text-tribe-b",
    title: "text-tribe-b",
  },
  contested: {
    border: "border-orange",
    header: "text-orange",
    title: "text-orange",
  },
  neutral: {
    border: "border-neutral-state",
    header: "text-neutral-state",
    title: "text-neutral-state",
  },
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
  const accentClassNames = accentClasses[accent];

  return (
    <div className={clsx("terminal-panel", accentClassNames.border, className)} style={style}>
      {title && (
        <div className={clsx("terminal-panel__header", accentClassNames.header)}>
          <span className={clsx("terminal-panel__title", accentClassNames.title)}>
            {title}
          </span>
          {titleRight && <span className="terminal-panel__title-right">{titleRight}</span>}
        </div>
      )}
      <div className={clsx("terminal-panel__body", noPadBottom && "terminal-panel__body--no-pad-bottom")}>
        {children}
      </div>
    </div>
  );
}
