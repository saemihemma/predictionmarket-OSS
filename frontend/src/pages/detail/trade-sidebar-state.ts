export type TradeType = "buy" | "sell";

export interface TradeQuoteSuccess {
  kind: "success";
  grossAmount: bigint;
  netAmount: bigint;
  fee: bigint;
  priceImpactBps: number;
}

export interface TradeQuoteError {
  kind: "error";
  rawMessage: string;
  message: string;
}

export type TradeQuoteState = TradeQuoteSuccess | TradeQuoteError | null;

interface NormalizeTradeQuoteErrorInput {
  tradeType: TradeType;
  rawMessage: string;
  outcomeLabel: string;
  selectedReserve?: bigint | null;
}

interface DeriveTradeUiStateInput {
  account: string | null;
  tradePending: boolean;
  tradeType: TradeType;
  parsedTradeAmount: bigint;
  shareInputError: string | null;
  selectedPositionQuantity: bigint | null;
  outcomeLabel: string;
  quote: TradeQuoteState;
}

export interface TradeUiState {
  canTrade: boolean;
  disabledReason: string | null;
  helperText: string | null;
  tooltipText: string | null;
  quoteError: string | null;
  showQuoteSummary: boolean;
}

function isPoolReserveError(message: string): boolean {
  return message.toLowerCase().includes("quantity exceeds pool reserve");
}

export function getMissingPositionMessage(outcomeLabel: string): string {
  return `You don't own any ${outcomeLabel} shares yet. Buy ${outcomeLabel} first before you can sell.`;
}

export function normalizeTradeQuoteError({
  tradeType,
  rawMessage,
  outcomeLabel,
  selectedReserve,
}: NormalizeTradeQuoteErrorInput): string {
  if (tradeType === "buy" && isPoolReserveError(rawMessage)) {
    if ((selectedReserve ?? 0n) <= 1n) {
      return `No whole ${outcomeLabel} shares are available from the AMM right now. This side is effectively sold out until later trades rebalance liquidity.`;
    }

    return `That order is larger than the AMM can fill right now. Try a smaller quantity.`;
  }

  return rawMessage || "Unable to quote trade.";
}

export function deriveTradeUiState({
  account,
  tradePending,
  tradeType,
  parsedTradeAmount,
  shareInputError,
  selectedPositionQuantity,
  outcomeLabel,
  quote,
}: DeriveTradeUiStateInput): TradeUiState {
  const missingPosition = tradeType === "sell" && selectedPositionQuantity === null;
  const exceedsPosition =
    tradeType === "sell" &&
    selectedPositionQuantity !== null &&
    parsedTradeAmount > selectedPositionQuantity;

  let disabledReason: string | null = null;
  if (!account) {
    disabledReason = "Connect wallet to trade.";
  } else if (shareInputError) {
    disabledReason = shareInputError;
  } else if (parsedTradeAmount <= 0n) {
    disabledReason = "Enter a trade amount first.";
  } else if (missingPosition) {
    disabledReason = getMissingPositionMessage(outcomeLabel);
  } else if (exceedsPosition) {
    disabledReason = "Sell amount exceeds your current position.";
  } else if (quote?.kind === "error") {
    disabledReason = quote.message;
  }

  return {
    canTrade:
      Boolean(account) &&
      !tradePending &&
      !shareInputError &&
      parsedTradeAmount > 0n &&
      !missingPosition &&
      !exceedsPosition &&
      quote?.kind !== "error",
    disabledReason,
    helperText:
      missingPosition || exceedsPosition || !account
        ? disabledReason
        : null,
    tooltipText: disabledReason,
    quoteError: quote?.kind === "error" ? quote.message : null,
    showQuoteSummary: quote?.kind === "success",
  };
}
