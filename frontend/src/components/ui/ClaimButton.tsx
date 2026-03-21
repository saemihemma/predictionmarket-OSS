import { cn } from "../../lib/utils";

interface ClaimButtonProps {
  marketId: string;
  value: bigint;
  isClaimed: boolean;
  isClaiming: boolean;
  onClaim: (marketId: string) => void;
}

export default function ClaimButton({
  marketId,
  value,
  isClaimed,
  isClaiming,
  onClaim,
}: ClaimButtonProps) {
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isClaimed && !isClaiming) onClaim(marketId);
      }}
      className={cn(
        "w-full py-2 font-mono text-xs font-semibold tracking-wide text-center transition-all duration-300",
        isClaimed && "bg-[rgba(202,245,222,0.1)] border border-mint text-mint shadow-[0_0_8px_rgba(202,245,222,0.15)] cursor-default",
        isClaiming && "bg-bg-panel border border-mint text-mint claim-glow-pulse cursor-wait",
        !isClaimed && !isClaiming && "bg-[rgba(202,245,222,0.06)] border border-border-panel text-mint cursor-pointer hover:border-mint-dim hover:shadow-[0_0_10px_rgba(202,245,222,0.12)]",
      )}
      disabled={isClaimed || isClaiming}
    >
      {isClaimed ? `✓ ${Number(value).toLocaleString()} SFR` : isClaiming ? "CLAIMING" : "CLAIM"}
    </button>
  );
}
