import { Link } from "react-router-dom";
import ConnectButton from "./ConnectButton";

interface PageHeaderProps {
  subtitle?: string;
  actions?: React.ReactNode;
  showBack?: boolean;
}

export default function PageHeader({ subtitle, actions, showBack }: PageHeaderProps) {
  return (
    <header className="border-b border-border-panel bg-bg-panel">
      <div className="page-shell flex flex-col gap-4 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <Link to="/markets" className="no-underline">
            <h1 className="m-0 text-[1.15rem] font-bold tracking-[0.12em] text-mint sm:text-[1.5rem] lg:text-[1.8rem]">
              THE ORCHESTRATOR
            </h1>
          </Link>
          <span className="mt-1 block text-[0.65rem] tracking-[0.16em] text-text-muted sm:text-xs sm:tracking-[0.2em]">
            {subtitle || "PREDICTION MARKET FOR THE FRONTIER"}
          </span>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          <div className="flex flex-wrap items-stretch gap-2 sm:items-center">
            {showBack && (
              <Link
                to="/markets"
                className="touch-target inline-flex min-h-11 items-center justify-center px-3 text-xs tracking-[0.12em] text-text-muted no-underline"
              >
                &larr; MARKETS
              </Link>
            )}
            {actions && <div className="flex flex-1 flex-wrap gap-2 sm:flex-none">{actions}</div>}
            {(showBack || actions) && <div className="hidden h-4 w-px bg-border-panel sm:block" />}
          </div>
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
