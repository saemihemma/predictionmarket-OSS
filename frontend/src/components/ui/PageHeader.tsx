import { Link } from "react-router-dom";
import ConnectButton from "./ConnectButton";

interface PageHeaderProps {
  subtitle?: string;
  actions?: React.ReactNode;
  showBack?: boolean;
}

export default function PageHeader({ subtitle, actions, showBack }: PageHeaderProps) {
  return (
    <header className="border-b border-border-panel px-8 py-4 flex justify-between items-center bg-bg-panel">
      <div>
        <Link to="/markets" className="no-underline">
          <h1 className="text-[1.8rem] font-bold tracking-[0.15em] text-mint m-0">
            THE ORCHESTRATOR
          </h1>
        </Link>
        <span className="text-xs text-text-muted tracking-[0.2em]">
          {subtitle || "PREDICTION MARKET FOR THE FRONTIER"}
        </span>
      </div>
      <div className="flex gap-4 items-center">
        {showBack && (
          <Link to="/markets" className="text-xs tracking-[0.12em] text-text-muted no-underline">
            ← MARKETS
          </Link>
        )}
        {actions}
        {(showBack || actions) && <div className="h-4 w-px bg-border-panel" />}
        <ConnectButton />
      </div>
    </header>
  );
}
