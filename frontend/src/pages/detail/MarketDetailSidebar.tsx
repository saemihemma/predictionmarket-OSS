import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MarketState, Position } from "../../lib/market-types";
import { computeBuyCost, computePriceImpactBps, computeSellProceeds } from "../../lib/amm";
import {
  buildBuyMergeTransaction,
  buildBuyTransaction,
  buildSellTransaction,
} from "../../lib/market-transactions";
import { fetchCollateralCoins, formatCollateralAmount, parseCollateralInput } from "../../lib/collateral";
import { COLLATERAL_SYMBOL } from "../../lib/market-constants";
import { useProtocolRuntimeConfig } from "../../hooks/useProtocolRuntimeConfig";
import { useSponsoredTransaction } from "../../hooks/useSponsoredTransaction";

const DEFAULT_SLIPPAGE_BPS = 500n;
const DEADLINE_WINDOW_MS = 10 * 60 * 1000;

function computeFee(amount: bigint, feeBps: bigint): bigint {
  if (amount <= 0n || feeBps <= 0n) {
    return 0n;
  }

  const calculated = (amount * feeBps) / 10_000n;
  const floored = calculated === 0n ? 1n : calculated;
  return floored > amount ? amount : floored;
}

function applySlippage(amount: bigint, slippageBps: bigint, direction: "up" | "down"): bigint {
  const delta = (amount * slippageBps) / 10_000n;
  return direction === "up" ? amount + delta : amount > delta ? amount - delta : 0n;
}

export default function MarketDetailSidebar({
  market,
  probs,
  selectedOutcome,
  setSelectedOutcome,
  tradeAmount,
  setTradeAmount,
  tradeType,
  setTradeType,
  account,
  voteExpanded,
  positions,
  onTradeSuccess,
}: {
  market: any;
  probs: number[];
  selectedOutcome: number;
  setSelectedOutcome: (n: number) => void;
  tradeAmount: string;
  setTradeAmount: (s: string) => void;
  tradeType: "buy" | "sell";
  setTradeType: (t: "buy" | "sell") => void;
  account: string | null;
  voteExpanded: boolean;
  positions: Position[];
  onTradeSuccess: () => void | Promise<void>;
}) {
  const { executeSponsoredTx } = useSponsoredTransaction();
  const { data: protocolConfig } = useProtocolRuntimeConfig();
  const [tradePending, setTradePending] = useState(false);
  const [tradeError, setTradeError] = useState<string | null>(null);

  const selectedPosition = useMemo(
    () => positions.find((position) => position.outcomeIndex === selectedOutcome),
    [positions, selectedOutcome],
  );

  const parsedTradeAmount = useMemo(() => parseCollateralInput(tradeAmount), [tradeAmount]);
  const tradingFeeBps = protocolConfig ? BigInt(protocolConfig.tradingFeeBps) : 0n;

  const quote = useMemo(() => {
    if (parsedTradeAmount <= 0n) {
      return null;
    }

    try {
      if (tradeType === "buy") {
        const cost = computeBuyCost(market.outcomeQuantities, selectedOutcome, parsedTradeAmount);
        const fee = computeFee(cost, tradingFeeBps);
        const totalCost = cost + fee;
        return {
          grossAmount: cost,
          netAmount: totalCost,
          fee,
          priceImpactBps: computePriceImpactBps(market.outcomeQuantities, selectedOutcome, parsedTradeAmount),
        };
      }

      const proceeds = computeSellProceeds(market.outcomeQuantities, selectedOutcome, parsedTradeAmount);
      const fee = computeFee(proceeds, tradingFeeBps);
      return {
        grossAmount: proceeds,
        netAmount: proceeds - fee,
        fee,
        priceImpactBps: computePriceImpactBps(market.outcomeQuantities, selectedOutcome, parsedTradeAmount),
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Unable to quote trade.",
      };
    }
  }, [market.outcomeQuantities, parsedTradeAmount, selectedOutcome, tradeType, tradingFeeBps]);

  const handleExecuteTrade = async () => {
    if (!account) {
      setTradeError("Connect wallet to trade.");
      return;
    }
    if (parsedTradeAmount <= 0n) {
      setTradeError("Enter a trade amount first.");
      return;
    }
    if (tradeType === "sell" && !selectedPosition) {
      setTradeError("No position found for that outcome.");
      return;
    }
    if (tradeType === "sell" && selectedPosition && parsedTradeAmount > selectedPosition.quantity) {
      setTradeError("Sell amount exceeds your current position.");
      return;
    }
    if (quote && "error" in quote) {
      setTradeError(quote.error ?? "Unable to quote trade.");
      return;
    }

    setTradePending(true);
    setTradeError(null);

    try {
      if (tradeType === "buy") {
        const inventory = await fetchCollateralCoins(account);
        const required = quote?.netAmount ?? 0n;
        if (inventory.totalBalance < required) {
          throw new Error(`Not enough ${COLLATERAL_SYMBOL} available for this trade.`);
        }

        const maxCost = applySlippage(required, DEFAULT_SLIPPAGE_BPS, "up");
        const deadlineMs = BigInt(Date.now() + DEADLINE_WINDOW_MS);
        const tx = selectedPosition
          ? buildBuyMergeTransaction({
              marketId: market.id,
              outcomeIndex: selectedOutcome,
              amount: parsedTradeAmount,
              maxCost,
              deadlineMs,
              paymentCoinIds: inventory.coinObjectIds,
              positionId: selectedPosition.id,
            })
          : buildBuyTransaction({
              marketId: market.id,
              outcomeIndex: selectedOutcome,
              amount: parsedTradeAmount,
              maxCost,
              deadlineMs,
              paymentCoinIds: inventory.coinObjectIds,
            });

        await executeSponsoredTx(tx);
      } else if (selectedPosition) {
        const minProceeds = applySlippage(quote?.netAmount ?? 0n, DEFAULT_SLIPPAGE_BPS, "down");
        const deadlineMs = BigInt(Date.now() + DEADLINE_WINDOW_MS);
        const tx = buildSellTransaction({
          marketId: market.id,
          positionId: selectedPosition.id,
          amount: parsedTradeAmount,
          minProceeds,
          deadlineMs,
        });

        await executeSponsoredTx(tx);
      }

      setTradeAmount("");
      await onTradeSuccess();
    } catch (error) {
      setTradeError(error instanceof Error ? error.message : "Trade failed.");
    } finally {
      setTradePending(false);
    }
  };

  const canTrade =
    Boolean(account) &&
    parsedTradeAmount > 0n &&
    !tradePending &&
    !(quote && "error" in quote) &&
    (tradeType === "buy" || Boolean(selectedPosition));

  return (
    <div className="flex flex-col gap-6">
      {market.state === MarketState.DISPUTED && market.sdvm && !voteExpanded ? (
        <div className="text-sm leading-relaxed text-text-muted">
          The dispute objects are live on-chain, but the dedicated stake, vote, and reward UI is not shipped yet. Track it
          from{" "}
          <Link to="/portfolio" className="cursor-pointer text-mint underline">
            Portfolio
          </Link>{" "}
          when that surface lands.
        </div>
      ) : market.state === MarketState.RESOLVED && market.resolution ? (
        <div className="border border-mint-dim bg-bg-panel p-4">
          <h3 className="mb-3 text-[1.1rem] font-bold tracking-[0.1em] text-mint">MARKET RESOLVED</h3>

          <div className="flex flex-col gap-3 text-[0.95rem]">
            <div className="border border-mint-dim bg-[rgba(202,245,222,0.08)] px-2 py-1.5 text-mint">
              FINAL OUTCOME: <span className="font-semibold">{market.outcomeLabels[market.resolution.resolvedOutcome]}</span>
            </div>

            {market.claimableAmount && Number(market.claimableAmount) > 0 && (
              <Link
                to="/portfolio?filter=claimable"
                className="touch-target block min-h-11 border border-border-panel bg-[rgba(202,245,222,0.08)] px-4 py-2 text-center font-mono text-[0.85rem] font-semibold tracking-[0.08em] text-mint no-underline transition-all duration-200 hover:border-mint-dim hover:shadow-[0_0_12px_rgba(202,245,222,0.15)]"
              >
                CLAIM {formatCollateralAmount(BigInt(market.claimableAmount), { withSymbol: true })} -&gt; PORTFOLIO
              </Link>
            )}

            <div className="border border-border-panel bg-[rgba(202,245,222,0.08)] px-2 py-1.5 text-sm text-text-dim">
              Resolver: {market.resolution.resolverAddress?.slice(0, 6)}...{market.resolution.resolverAddress?.slice(-4)}
            </div>
          </div>
        </div>
      ) : market.state === MarketState.OPEN ? (
        <div className="border border-border-panel bg-bg-panel p-4">
          <h3 className="mb-4 text-[1.1rem] font-bold tracking-[0.1em] text-mint">TRADING</h3>

          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              {["buy", "sell"].map((type) => (
                <button
                  key={type}
                  onClick={() => setTradeType(type as "buy" | "sell")}
                  className={`touch-target min-h-11 border px-2 py-1.5 font-mono text-sm font-semibold tracking-[0.08em] transition-all duration-200 ${
                    tradeType === type
                      ? "border-border-active bg-[rgba(202,245,222,0.12)] text-mint"
                      : "border-border-panel bg-transparent text-text-muted"
                  }`}
                >
                  {type.toUpperCase()}
                </button>
              ))}
            </div>

            <div>
              <label className="mb-2 block text-[0.95rem] font-medium text-mint">OUTCOME</label>
              <select
                value={selectedOutcome}
                onChange={(event) => setSelectedOutcome(Number(event.target.value))}
                className="touch-target min-h-11 w-full border border-border-panel bg-bg-terminal px-3 py-2 text-base text-text outline-none"
              >
                {market.outcomeLabels.map((label: string, index: number) => (
                  <option key={index} value={index}>
                    {label} ({(Number(probs[index]) / 100).toFixed(1)}%)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-[0.95rem] font-medium text-mint">QUANTITY ({COLLATERAL_SYMBOL} UNITS)</label>
              <input
                type="number"
                value={tradeAmount}
                onChange={(event) => setTradeAmount(event.target.value)}
                placeholder="0.00"
                className="touch-target min-h-11 w-full border border-border-panel bg-bg-terminal px-3 py-2 text-base text-text outline-none"
              />
            </div>

            {quote && !("error" in quote) && (
              <div className="border border-tribe-b-dim bg-[rgba(77,184,212,0.08)] px-3 py-2 text-[0.95rem] text-text">
                <div className="mb-1 flex justify-between gap-4">
                  <span>{tradeType === "buy" ? "Total Cost" : "Net Proceeds"}:</span>
                  <span>{formatCollateralAmount(quote.netAmount, { withSymbol: true })}</span>
                </div>
                <div className="mb-1 flex justify-between gap-4">
                  <span>Fee:</span>
                  <span>{formatCollateralAmount(quote.fee, { withSymbol: true })}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>Price Impact:</span>
                  <span>{(quote.priceImpactBps / 100).toFixed(2)}%</span>
                </div>
              </div>
            )}

            {quote && "error" in quote && (
              <div className="border border-orange-dim bg-[rgba(221,122,31,0.08)] px-3 py-2 text-[0.95rem] text-orange">
                {quote.error}
              </div>
            )}

            <button
              disabled={!canTrade}
              onClick={handleExecuteTrade}
              className={`touch-target min-h-11 border px-3 py-2 font-mono text-sm font-semibold tracking-[0.08em] transition-all duration-200 ${
                canTrade
                  ? tradeType === "buy"
                    ? "cursor-pointer border-mint-dim bg-[rgba(202,245,222,0.12)] text-mint"
                    : "cursor-pointer border-tribe-b-dim bg-[rgba(77,184,212,0.12)] text-tribe-b"
                  : "cursor-not-allowed border-border-panel bg-[rgba(0,0,0,0.3)] text-text-dim"
              }`}
            >
              {!account
                ? "CONNECT WALLET"
                : tradePending
                  ? "PROCESSING..."
                  : `${tradeType === "buy" ? "BUY" : "SELL"} ${market.outcomeLabels[selectedOutcome]}`}
            </button>

            {tradeError && (
              <div className="border border-orange-dim bg-[rgba(221,122,31,0.08)] px-3 py-2 text-center text-sm text-orange">
                {tradeError}
              </div>
            )}

            {!account && <div className="text-center text-sm text-text-muted">Connect wallet to trade</div>}
          </div>
        </div>
      ) : (
        <div className="border border-border-panel bg-bg-panel p-4">
          <h3 className="mb-3 text-[1.1rem] font-bold tracking-[0.1em] text-mint">STATUS</h3>
          <div className="text-[0.95rem] text-text-muted">
            {market.state === MarketState.CLOSED ? "Market has closed. Awaiting resolution." : "Market is not open for trading."}
          </div>
        </div>
      )}

      <div className="border border-border-panel bg-bg-panel p-4">
        <h3 className="mb-3 text-[1.1rem] font-bold tracking-[0.1em] text-mint">YOUR POSITION</h3>
        {positions.length === 0 ? (
          <div className="text-[0.95rem] text-text-muted">No position</div>
        ) : (
          <div className="flex flex-col gap-2 text-[0.95rem] text-text">
            {positions.map((position) => (
              <div
                key={position.id}
                className="flex items-center justify-between gap-3 border border-border-panel bg-bg-terminal px-3 py-2"
              >
                <span>{market.outcomeLabels[position.outcomeIndex]}</span>
                <span>{formatCollateralAmount(position.quantity, { withSymbol: true })}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border border-border-panel bg-bg-panel p-4">
        <h3 className="mb-3 text-[1.1rem] font-bold tracking-[0.1em] text-mint">RECENT ACTIVITY</h3>
        <div className="text-sm leading-relaxed text-text-dim">
          Live trade feed is manifest-driven now; this panel will populate from on-chain event history once the indexer is
          connected to the active collateral family.
        </div>
      </div>
    </div>
  );
}
