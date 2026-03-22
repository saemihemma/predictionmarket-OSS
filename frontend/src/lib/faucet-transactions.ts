import { Transaction } from "@mysten/sui/transactions";
import { COLLATERAL_COIN_TYPE, COLLATERAL_SYMBOL, PM_FAUCET_ID } from "./market-constants";
import { assertConfiguredId, assertProtocolPackageId } from "./protocol-config";

const SUI_CLOCK_OBJECT_ID = "0x6";

function mergeCoinInputs(tx: Transaction, coinObjectIds: string[]) {
  if (coinObjectIds.length === 0) {
    throw new Error(`No ${COLLATERAL_SYMBOL} coin objects were provided.`);
  }

  const primary = tx.object(coinObjectIds[0]);
  if (coinObjectIds.length > 1) {
    tx.mergeCoins(
      primary,
      coinObjectIds.slice(1).map((coinObjectId) => tx.object(coinObjectId)),
    );
  }

  return primary;
}

function requireFaucetId(): string {
  return assertConfiguredId(PM_FAUCET_ID, "Faucet ID");
}

export function buildFaucetClaimTransaction(): Transaction {
  const pkg = assertProtocolPackageId();
  const tx = new Transaction();

  tx.moveCall({
    target: `${pkg}::pm_faucet::claim`,
    typeArguments: [COLLATERAL_COIN_TYPE],
    arguments: [tx.object(requireFaucetId()), tx.object(SUI_CLOCK_OBJECT_ID)],
  });

  return tx;
}

export function buildFaucetTopUpTransaction(params: {
  coinObjectIds: string[];
  amount: bigint;
  adminCapId: string;
}): Transaction {
  const pkg = assertProtocolPackageId();
  const tx = new Transaction();
  const sourceCoin = mergeCoinInputs(tx, params.coinObjectIds);
  const [topUpCoin] = tx.splitCoins(sourceCoin, [tx.pure.u64(params.amount)]);

  tx.moveCall({
    target: `${pkg}::pm_faucet::top_up`,
    typeArguments: [COLLATERAL_COIN_TYPE],
    arguments: [
      tx.object(requireFaucetId()),
      tx.object(assertConfiguredId(params.adminCapId, "Admin cap ID")),
      topUpCoin,
    ],
  });

  return tx;
}

export function buildUpdateFaucetAmountsTransaction(params: {
  adminCapId: string;
  starterAmount: bigint;
  dailyAmount: bigint;
}): Transaction {
  const pkg = assertProtocolPackageId();
  const tx = new Transaction();

  tx.moveCall({
    target: `${pkg}::pm_faucet::update_amounts`,
    typeArguments: [COLLATERAL_COIN_TYPE],
    arguments: [
      tx.object(requireFaucetId()),
      tx.object(assertConfiguredId(params.adminCapId, "Admin cap ID")),
      tx.pure.u64(params.starterAmount),
      tx.pure.u64(params.dailyAmount),
    ],
  });

  return tx;
}

export function buildPauseFaucetTransaction(adminCapId: string): Transaction {
  const pkg = assertProtocolPackageId();
  const tx = new Transaction();

  tx.moveCall({
    target: `${pkg}::pm_faucet::pause`,
    typeArguments: [COLLATERAL_COIN_TYPE],
    arguments: [tx.object(requireFaucetId()), tx.object(assertConfiguredId(adminCapId, "Admin cap ID"))],
  });

  return tx;
}

export function buildResumeFaucetTransaction(adminCapId: string): Transaction {
  const pkg = assertProtocolPackageId();
  const tx = new Transaction();

  tx.moveCall({
    target: `${pkg}::pm_faucet::resume`,
    typeArguments: [COLLATERAL_COIN_TYPE],
    arguments: [tx.object(requireFaucetId()), tx.object(assertConfiguredId(adminCapId, "Admin cap ID"))],
  });

  return tx;
}

export function buildWithdrawFaucetTransaction(params: {
  adminCapId: string;
  amount: bigint;
  recipient: string;
}): Transaction {
  const pkg = assertProtocolPackageId();
  const tx = new Transaction();

  tx.moveCall({
    target: `${pkg}::pm_faucet::withdraw`,
    typeArguments: [COLLATERAL_COIN_TYPE],
    arguments: [
      tx.object(requireFaucetId()),
      tx.object(assertConfiguredId(params.adminCapId, "Admin cap ID")),
      tx.pure.u64(params.amount),
      tx.pure.address(params.recipient),
    ],
  });

  return tx;
}
