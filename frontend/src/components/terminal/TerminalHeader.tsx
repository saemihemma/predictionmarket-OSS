import { type ReactNode } from "react";
import { motion } from "framer-motion";
import { clsx } from "clsx";

interface HeaderMeta {
  label: string;
  value: string;
}

interface TerminalHeaderProps {
  title: string;
  meta?: HeaderMeta[];
  status?: "ACTIVE" | "PAUSED" | "ENDED" | "STANDBY";
  right?: ReactNode;
}

const statusClasses: Record<string, string> = {
  ACTIVE: "text-mint",
  PAUSED: "text-yellow",
  ENDED: "text-text-dim",
  STANDBY: "text-neutral-state",
};

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
      className="terminal-header sticky top-0 z-[100] border-b border-border-panel bg-[rgba(6,17,12,0.9)]"
    >
      <div className="page-shell flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-2">
          <h1 className="m-0 font-mono text-[0.65rem] font-medium leading-none tracking-[0.14em] text-mint sm:text-[0.7rem]">
            <span className="text-text-dim">// </span>
            {title.toUpperCase()}
          </h1>

          {meta.map((item) => (
            <div key={item.label} className="flex items-center gap-2 font-mono text-[0.65rem]">
              <span className="tracking-[0.1em] text-text-dim">{item.label}</span>
              <span className="text-text-muted">{item.value}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 sm:justify-end">
          {status && (
            <div className={clsx("flex items-center gap-1.5 font-mono text-[0.65rem] tracking-[0.12em]", statusClasses[status])}>
              <span className={clsx("terminal-status-dot", status === "ACTIVE" && "terminal-status-dot--active")} />
              {status}
            </div>
          )}
          {right}
        </div>
      </div>
    </motion.header>
  );
}
