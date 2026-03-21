/**
 * Live countdown timer. Uses UTC internally — no timezone drift.
 * targetMs is epoch milliseconds (UTC). Diff computed against Date.now() (also UTC).
 * Updates every second when < 1 day, every 30s when < 7d, every 60s otherwise.
 *
 * Extracted from MarketDetailPage + PortfolioPage (were duplicated).
 */
import { useState, useEffect } from "react";

export default function CountdownTimer({ targetMs }: { targetMs: number }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const remaining = targetMs - Date.now();
    const interval = remaining < 24 * 60 * 60 * 1000 ? 1000 : remaining < 7 * 24 * 60 * 60 * 1000 ? 30000 : 60000;
    const timer = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(timer);
  }, [targetMs]);

  const remaining = targetMs - now;

  if (remaining <= 0) {
    return (
      <span className="text-xs text-orange font-semibold tracking-[0.08em]">
        CLOSED
      </span>
    );
  }

  const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
  const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
  const seconds = Math.floor((remaining % (60 * 1000)) / 1000);

  let display: string;
  if (days > 0) {
    display = `${days}d ${hours}h ${minutes}m`;
  } else if (hours > 0) {
    display = `${hours}h ${minutes}m ${seconds}s`;
  } else {
    display = `${minutes}m ${seconds}s`;
  }

  // Color: green if >24h, yellow if <24h, orange if <1h
  const colorClass = remaining > 24 * 60 * 60 * 1000 ? "text-mint-dim" : remaining > 60 * 60 * 1000 ? "text-yellow" : "text-orange";

  return (
    <span className={`text-sm font-semibold tracking-[0.06em] tabular-nums ${colorClass}`}>
      {display}
    </span>
  );
}
