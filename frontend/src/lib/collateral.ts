import { Transaction } from "@mysten/sui/transactions";
import { protocolReadTransport } from "./client";
import { COLLATERAL_COIN_TYPE, COLLATERAL_DECIMALS, COLLATERAL_SYMBOL } from "./market-constants";

export const COLLATERAL_SCALE = 10n ** BigInt(COLLATERAL_DECIMALS);

export interface CollateralCoinSummary {
  coinObjectId: string;
  balance: bigint;
}

export interface CollateralInventory {
  totalBalance: bigint;
  coinCount: number;
  coinObjectIds: string[];
  coins: CollateralCoinSummary[];
}

export function formatCollateralAmount(
  amount: bigint,
  options: { withSymbol?: boolean; minimumFractionDigits?: number } = {},
): string {
  const { withSymbol = false, minimumFractionDigits = COLLATERAL_DECIMALS } = options;
  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  const whole = absolute / COLLATERAL_SCALE;
  const fraction = absolute % COLLATERAL_SCALE;
  const fractionString = fraction.toString().padStart(COLLATERAL_DECIMALS, "0");
  const rendered =
    minimumFractionDigits <= 0
      ? whole.toLocaleString()
      : `${whole.toLocaleString()}.${fractionString.slice(0, minimumFractionDigits)}`;

  if (withSymbol) {
    return `${negative ? "-" : ""}${rendered} ${COLLATERAL_SYMBOL}`;
  }

  return `${negative ? "-" : ""}${rendered}`;
}

export function parseCollateralInput(input: string): bigint {
  const trimmed = input.trim();
  if (!trimmed || trimmed === ".") {
    return 0n;
  }

  const [wholeRaw = "0", fractionRaw = ""] = trimmed.split(".");
  const whole = BigInt(wholeRaw || "0") * COLLATERAL_SCALE;
  const fraction = BigInt(
    fractionRaw.slice(0, COLLATERAL_DECIMALS).padEnd(COLLATERAL_DECIMALS, "0") || "0",
  );

  return whole + fraction;
}

export async function fetchCollateralCoins(owner: string): Promise<CollateralInventory> {
  const summaries = (
    await protocolReadTransport.listCoins({
      owner,
      coinType: COLLATERAL_COIN_TYPE,
    })
  ).map((coin) => ({
    coinObjectId: coin.coinObjectId,
    balance: BigInt(coin.balance),
  }));

  return {
    totalBalance: summaries.reduce((sum, coin) => sum + coin.balance, 0n),
    coinCount: summaries.length,
    coinObjectIds: summaries.map((coin) => coin.coinObjectId),
    coins: summaries,
  };
}

export async function prepareCollateralCoin(
  tx: Transaction,
  owner: string,
): Promise<ReturnType<Transaction["object"]>> {
  const inventory = await fetchCollateralCoins(owner);
  if (inventory.coinObjectIds.length === 0) {
    throw new Error(`No ${COLLATERAL_SYMBOL} coins found in wallet.`);
  }

  const primary = tx.object(inventory.coinObjectIds[0]);
  if (inventory.coinObjectIds.length > 1) {
    tx.mergeCoins(
      primary,
      inventory.coinObjectIds.slice(1).map((coinObjectId) => tx.object(coinObjectId)),
    );
  }

  return primary;
}
