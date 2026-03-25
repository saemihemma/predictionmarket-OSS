import { formatCollateralAmount } from "../../lib/collateral";
import { COLLATERAL_SYMBOL } from "../../lib/market-constants";
import { cn } from "../../lib/utils";

interface ClaimButtonProps {
  positionId: string;
  value: bigint;
  isClaimed: boolean;
  isClaiming: boolean;
  claimAction: "claim" | "refund_invalid";
  claimError?: string | null;
  onClaim: (positionId: string) => void;
}

export default function ClaimButton({
  positionId,
  value,
  isClaimed,
  isClaiming,
  claimAction,
  claimError,
  onClaim,
}: ClaimButtonProps) {
  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!isClaimed && !isClaiming) onClaim(positionId);
        }}
        className={cn(
          "touch-target min-h-11 w-full py-2 text-center font-mono text-xs font-semibold tracking-wide transition-all duration-300",
          isClaimed && "cursor-default border border-mint bg-[rgba(202,245,222,0.1)] text-mint shadow-[0_0_8px_rgba(202,245,222,0.15)]",
          isClaiming && "claim-glow-pulse cursor-wait border border-mint bg-bg-panel text-mint",
          !isClaimed &&
            !isClaiming &&
            "border border-border-panel bg-[rgba(202,245,222,0.06)] text-mint hover:border-mint-dim hover:shadow-[0_0_10px_rgba(202,245,222,0.12)]",
        )}
        disabled={isClaimed || isClaiming}
      >
        {isClaimed
          ? `CLAIMED ${formatCollateralAmount(value, { withSymbol: true })}`
          : isClaiming
            ? "PROCESSING"
            : claimAction === "refund_invalid"
              ? `REFUND ${COLLATERAL_SYMBOL}`
              : `CLAIM ${COLLATERAL_SYMBOL}`}
      </button>

      {claimError && !isClaimed && !isClaiming && (
        <div className="border border-orange-dim bg-[rgba(221,122,31,0.08)] px-3 py-2 text-left text-xs leading-relaxed text-orange">
          {claimError}
        </div>
      )}
    </div>
  );
}
