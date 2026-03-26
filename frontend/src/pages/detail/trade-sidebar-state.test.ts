import { describe, expect, it } from "vitest";
import {
  deriveTradeUiState,
  getMissingPositionMessage,
  normalizeTradeQuoteError,
  type TradeQuoteState,
} from "./trade-sidebar-state";

function successQuote(): TradeQuoteState {
  return {
    kind: "success",
    grossAmount: 10n,
    netAmount: 11n,
    fee: 1n,
    priceImpactBps: 250,
  };
}

describe("trade sidebar state", () => {
  it("disables sell when the user owns no shares in the selected outcome", () => {
    const state = deriveTradeUiState({
      account: "0x1",
      tradePending: false,
      tradeType: "sell",
      parsedTradeAmount: 1n,
      shareInputError: null,
      selectedPositionQuantity: null,
      outcomeLabel: "PEACE",
      quote: null,
    });

    expect(state.canTrade).toBe(false);
    expect(state.disabledReason).toBe(getMissingPositionMessage("PEACE"));
    expect(state.helperText).toBe(getMissingPositionMessage("PEACE"));
    expect(state.showQuoteSummary).toBe(false);
  });

  it("disables sell when quantity exceeds the current position", () => {
    const state = deriveTradeUiState({
      account: "0x1",
      tradePending: false,
      tradeType: "sell",
      parsedTradeAmount: 4n,
      shareInputError: null,
      selectedPositionQuantity: 2n,
      outcomeLabel: "War",
      quote: null,
    });

    expect(state.canTrade).toBe(false);
    expect(state.disabledReason).toBe("Sell amount exceeds your current position.");
    expect(state.helperText).toBe("Sell amount exceeds your current position.");
  });

  it("maps reserve exhaustion to a user-facing buy message", () => {
    expect(
      normalizeTradeQuoteError({
        tradeType: "buy",
        rawMessage: "AMM: quantity exceeds pool reserve",
        outcomeLabel: "PEACE",
        selectedReserve: 1n,
      }),
    ).toBe(
      "No whole PEACE shares are available from the AMM right now. This side is effectively sold out until later trades rebalance liquidity.",
    );
  });

  it("keeps valid buy and sell paths enabled", () => {
    const buyState = deriveTradeUiState({
      account: "0x1",
      tradePending: false,
      tradeType: "buy",
      parsedTradeAmount: 1n,
      shareInputError: null,
      selectedPositionQuantity: null,
      outcomeLabel: "PEACE",
      quote: successQuote(),
    });
    const sellState = deriveTradeUiState({
      account: "0x1",
      tradePending: false,
      tradeType: "sell",
      parsedTradeAmount: 1n,
      shareInputError: null,
      selectedPositionQuantity: 3n,
      outcomeLabel: "War",
      quote: successQuote(),
    });

    expect(buyState.canTrade).toBe(true);
    expect(buyState.showQuoteSummary).toBe(true);
    expect(sellState.canTrade).toBe(true);
    expect(sellState.showQuoteSummary).toBe(true);
  });
});
