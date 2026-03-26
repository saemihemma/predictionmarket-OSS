import { formatCollateralAmount } from "./collateral";
import { buildTransactionExplorerUrl } from "./explorer";
import { formatShareLabel } from "./shares";

export type SuccessAccent = "mint" | "tribeB";
export type SummaryTone = SuccessAccent | "default";

export interface TransactionSuccessSummaryRow {
  label: string;
  value: string;
  tone?: SummaryTone;
}

export interface TradeSuccessPayload {
  action: "buy" | "sell";
  outcomeLabel: string;
  shareCount: bigint;
  netAmount: bigint;
  feeAmount: bigint;
  digest: string;
  resultingPositionShares: bigint;
}

export interface TradeSuccessOverlayModel {
  headline: string;
  message: string;
  summaryRows: TransactionSuccessSummaryRow[];
  digest: string;
  explorerUrl: string;
  accent: SuccessAccent;
  primaryActionLabel: string;
}

export function buildTradeSuccessOverlayModel(payload: TradeSuccessPayload): TradeSuccessOverlayModel {
  const accent: SuccessAccent = payload.action === "buy" ? "mint" : "tribeB";

  return {
    headline: payload.action === "buy" ? "BUY CONFIRMED" : "SELL CONFIRMED",
    message:
      payload.action === "buy"
        ? `Your ${payload.outcomeLabel} position is now live on-chain. Continue to return to the market terminal.`
        : `Your ${payload.outcomeLabel} sale has cleared on-chain. Continue to return to the market terminal.`,
    summaryRows: [
      {
        label: "OUTCOME",
        value: payload.outcomeLabel,
        tone: accent,
      },
      {
        label: "SHARES",
        value: formatShareLabel(payload.shareCount),
      },
      {
        label: payload.action === "buy" ? "TOTAL COST" : "NET PROCEEDS",
        value: formatCollateralAmount(payload.netAmount, { withSymbol: true }),
        tone: accent,
      },
      {
        label: "FEE",
        value: formatCollateralAmount(payload.feeAmount, { withSymbol: true }),
      },
      {
        label: "UPDATED POSITION",
        value: formatShareLabel(payload.resultingPositionShares),
        tone: accent,
      },
    ],
    digest: payload.digest,
    explorerUrl: buildTransactionExplorerUrl(payload.digest),
    accent,
    primaryActionLabel: "CONTINUE",
  };
}
