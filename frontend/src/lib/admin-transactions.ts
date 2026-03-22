import { Transaction } from "@mysten/sui/transactions";
import { COLLATERAL_COIN_TYPE, PM_CONFIG_ID, PM_REGISTRY_ID } from "./market-constants";
import { assertConfiguredId, assertProtocolPackageId } from "./protocol-config";
import { ProtocolRuntimeConfig } from "./protocol-runtime";

function requireConfigId(): string {
  return assertConfiguredId(PM_CONFIG_ID, "Protocol config ID");
}

function requireRegistryId(): string {
  return assertConfiguredId(PM_REGISTRY_ID, "Protocol registry ID");
}

export function buildUpdateProtocolConfigTransaction(params: {
  adminCapId: string;
  config: ProtocolRuntimeConfig;
}): Transaction {
  const pkg = assertProtocolPackageId();
  const tx = new Transaction();

  tx.moveCall({
    target: `${pkg}::pm_registry::update_config`,
    typeArguments: [COLLATERAL_COIN_TYPE],
    arguments: [
      tx.object(requireConfigId()),
      tx.object(assertConfiguredId(params.adminCapId, "Admin cap ID")),
      tx.pure.u64(params.config.tradingFeeBps),
      tx.pure.u64(params.config.settlementFeeBps),
      tx.pure.u64(params.config.creationBondCanonical),
      tx.pure.u64(params.config.creationBondSourceBound),
      tx.pure.u64(params.config.creationBondCreatorResolved),
      tx.pure.u64(params.config.creationBondExperimental),
      tx.pure.u64(params.config.disputeBondAmount),
      tx.pure.u64(params.config.disputeWindowDeterministicMs),
      tx.pure.u64(params.config.disputeWindowDeclaredMs),
      tx.pure.u64(params.config.disputeWindowCreatorMs),
      tx.pure.u64(params.config.minMarketDurationMs),
      tx.pure.u64(params.config.maxMarketDurationMs),
      tx.pure.u16(params.config.maxOutcomes),
      tx.pure.u64(params.config.creatorPriorityWindowMs),
      tx.pure.u64(params.config.liquidityParam),
    ],
  });

  return tx;
}

export function buildPauseRegistryTransaction(adminCapId: string): Transaction {
  const pkg = assertProtocolPackageId();
  const tx = new Transaction();

  tx.moveCall({
    target: `${pkg}::pm_registry::pause_registry`,
    typeArguments: [COLLATERAL_COIN_TYPE],
    arguments: [tx.object(requireRegistryId()), tx.object(assertConfiguredId(adminCapId, "Admin cap ID"))],
  });

  return tx;
}

export function buildResumeRegistryTransaction(adminCapId: string): Transaction {
  const pkg = assertProtocolPackageId();
  const tx = new Transaction();

  tx.moveCall({
    target: `${pkg}::pm_registry::resume_registry`,
    typeArguments: [COLLATERAL_COIN_TYPE],
    arguments: [tx.object(requireRegistryId()), tx.object(assertConfiguredId(adminCapId, "Admin cap ID"))],
  });

  return tx;
}
