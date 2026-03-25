import { Transaction } from "@mysten/sui/transactions";
import {
  COLLATERAL_COIN_TYPE,
  COLLATERAL_SYMBOL,
  PM_CONFIG_ID,
  PM_REGISTRY_ID,
  PM_RESOLVER_POLICY_ID,
  PM_RESOLVER_SET_ID,
  PM_TREASURY_ID,
} from "./market-constants";
import {
  assertConfiguredId,
  assertProtocolPackageId,
  getMarketTypePolicyId,
} from "./protocol-config";
import { MarketType, ResolutionClass, TrustTier } from "./market-types";

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

function requireConfigId(): string {
  return assertConfiguredId(PM_CONFIG_ID, "Protocol config ID");
}

function requireRegistryId(): string {
  return assertConfiguredId(PM_REGISTRY_ID, "Protocol registry ID");
}

function requireResolverPolicyId(): string {
  return assertConfiguredId(PM_RESOLVER_POLICY_ID, "Resolver policy ID");
}

function requireTreasuryId(): string {
  return assertConfiguredId(PM_TREASURY_ID, "Treasury ID");
}

export function buildCloseMarketTransaction(params: {
  marketId: string;
}): Transaction {
  const pkg = assertProtocolPackageId();
  const tx = new Transaction();

  tx.moveCall({
    target: `${pkg}::pm_trading::close_market`,
    typeArguments: [COLLATERAL_COIN_TYPE],
    arguments: [tx.object(params.marketId), tx.object(SUI_CLOCK_OBJECT_ID)],
  });

  return tx;
}

export function buildBuyTransaction(params: {
  marketId: string;
  outcomeIndex: number;
  amount: bigint;
  maxCost: bigint;
  deadlineMs: bigint;
  paymentCoinIds: string[];
}): Transaction {
  const pkg = assertProtocolPackageId();
  const tx = new Transaction();
  const paymentCoin = mergeCoinInputs(tx, params.paymentCoinIds);

  tx.moveCall({
    target: `${pkg}::pm_trading::buy`,
    typeArguments: [COLLATERAL_COIN_TYPE],
    arguments: [
      tx.object(params.marketId),
      tx.object(requireConfigId()),
      tx.object(SUI_CLOCK_OBJECT_ID),
      tx.pure.u16(params.outcomeIndex),
      tx.pure.u64(params.amount),
      tx.pure.u64(params.maxCost),
      tx.pure.u64(params.deadlineMs),
      paymentCoin,
    ],
  });

  return tx;
}

export function buildBuyMergeTransaction(params: {
  marketId: string;
  outcomeIndex: number;
  amount: bigint;
  maxCost: bigint;
  deadlineMs: bigint;
  paymentCoinIds: string[];
  positionId: string;
}): Transaction {
  const pkg = assertProtocolPackageId();
  const tx = new Transaction();
  const paymentCoin = mergeCoinInputs(tx, params.paymentCoinIds);

  tx.moveCall({
    target: `${pkg}::pm_trading::buy_merge`,
    typeArguments: [COLLATERAL_COIN_TYPE],
    arguments: [
      tx.object(params.marketId),
      tx.object(requireConfigId()),
      tx.object(SUI_CLOCK_OBJECT_ID),
      tx.pure.u16(params.outcomeIndex),
      tx.pure.u64(params.amount),
      tx.pure.u64(params.maxCost),
      tx.pure.u64(params.deadlineMs),
      paymentCoin,
      tx.object(params.positionId),
    ],
  });

  return tx;
}

export function buildSellTransaction(params: {
  marketId: string;
  positionId: string;
  amount: bigint;
  minProceeds: bigint;
  deadlineMs: bigint;
}): Transaction {
  const pkg = assertProtocolPackageId();
  const tx = new Transaction();

  tx.moveCall({
    target: `${pkg}::pm_trading::sell`,
    typeArguments: [COLLATERAL_COIN_TYPE],
    arguments: [
      tx.object(params.marketId),
      tx.object(requireConfigId()),
      tx.object(SUI_CLOCK_OBJECT_ID),
      tx.object(params.positionId),
      tx.pure.u64(params.amount),
      tx.pure.u64(params.minProceeds),
      tx.pure.u64(params.deadlineMs),
    ],
  });

  return tx;
}

export function buildClaimTransaction(params: {
  marketId: string;
  positionId: string;
}): Transaction {
  const pkg = assertProtocolPackageId();
  const tx = new Transaction();

  tx.moveCall({
    target: `${pkg}::pm_trading::claim`,
    typeArguments: [COLLATERAL_COIN_TYPE],
    arguments: [
      tx.object(params.marketId),
      tx.object(requireConfigId()),
      tx.object(params.positionId),
    ],
  });

  return tx;
}

export function buildInvalidRefundTransaction(params: {
  marketId: string;
  positionId: string;
}): Transaction {
  const pkg = assertProtocolPackageId();
  const tx = new Transaction();

  tx.moveCall({
    target: `${pkg}::pm_trading::refund_invalid`,
    typeArguments: [COLLATERAL_COIN_TYPE],
    arguments: [tx.object(params.marketId), tx.object(params.positionId)],
  });

  return tx;
}

export function buildSweepFeesTransaction(params: {
  marketId: string;
}): Transaction {
  const pkg = assertProtocolPackageId();
  const tx = new Transaction();

  tx.moveCall({
    target: `${pkg}::pm_trading::sweep_fees`,
    typeArguments: [COLLATERAL_COIN_TYPE],
    arguments: [tx.object(params.marketId), tx.object(requireTreasuryId())],
  });

  return tx;
}

export function buildCreateMarketTransaction(params: {
  title: string;
  description: string;
  resolutionText: string;
  marketType: MarketType;
  trustTier: TrustTier;
  resolutionClass: ResolutionClass;
  outcomeCount: number;
  outcomeLabels: string[];
  closeTimeMs: bigint;
  resolveDeadlineMs: bigint;
  sourceClass: number;
  sourceUri: string;
  sourceDescription: string;
  evidenceFormat: number;
  sourceArchived: boolean;
  creatorControlsSource: boolean;
  verifierSubmissionRequired: boolean;
  fallbackOnSourceUnavailable: number;
  influenceLevel: number;
  creatorIsSourceController: boolean;
  disclosureText: string;
  bondCoinIds: string[];
  bondAmount: bigint;
}): Transaction {
  const pkg = assertProtocolPackageId();
  const tx = new Transaction();
  const marketTypePolicyId = getMarketTypePolicyId({
    trustTier: params.trustTier,
    marketType: params.marketType,
    resolutionClass: params.resolutionClass,
  });

  const [sourceDecl] = tx.moveCall({
    target: `${pkg}::pm_source::new`,
    arguments: [
      tx.pure.u8(params.sourceClass),
      tx.pure.string(params.sourceUri),
      tx.pure.string(params.sourceDescription),
      tx.pure.u8(params.evidenceFormat),
      tx.pure.bool(params.sourceArchived),
      tx.pure.bool(params.creatorControlsSource),
      tx.pure.bool(params.verifierSubmissionRequired),
      tx.pure.u8(params.fallbackOnSourceUnavailable),
    ],
  });

  const [creatorInfluence] = tx.moveCall({
    target: `${pkg}::pm_market::new_creator_influence`,
    arguments: [
      tx.pure.u8(params.influenceLevel),
      tx.pure.bool(params.creatorIsSourceController),
      tx.pure.string(params.disclosureText),
    ],
  });

  const bondSourceCoin = mergeCoinInputs(tx, params.bondCoinIds);
  const [bondCoin] = tx.splitCoins(bondSourceCoin, [tx.pure.u64(params.bondAmount)]);
  const [bondBalance] = tx.moveCall({
    target: "0x2::coin::into_balance",
    typeArguments: [COLLATERAL_COIN_TYPE],
    arguments: [bondCoin],
  });

  tx.moveCall({
    target: `${pkg}::pm_market::create_and_share_market`,
    typeArguments: [COLLATERAL_COIN_TYPE],
    arguments: [
      tx.object(requireRegistryId()),
      tx.object(requireConfigId()),
      tx.object(assertConfiguredId(marketTypePolicyId, "Market type policy ID")),
      tx.object(requireResolverPolicyId()),
      tx.pure.string(params.title),
      tx.pure.string(params.description),
      tx.pure.string(params.resolutionText),
      tx.pure.u16(params.outcomeCount),
      tx.pure("vector<string>", params.outcomeLabels),
      sourceDecl,
      creatorInfluence,
      tx.pure.u64(params.closeTimeMs),
      tx.pure.u64(params.resolveDeadlineMs),
      bondBalance,
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });

  return tx;
}

export function buildDisputeTransaction(params: {
  marketId: string;
  proposedOutcome: number;
  reasonHash: Uint8Array;
  bondCoinIds: string[];
  resolverSetId?: string;
}): Transaction {
  const pkg = assertProtocolPackageId();
  if (params.reasonHash.length !== 32) {
    throw new Error(`Evidence hash must be exactly 32 bytes, got ${params.reasonHash.length}`);
  }

  const tx = new Transaction();
  const bondCoin = mergeCoinInputs(tx, params.bondCoinIds);
  const resolverSetId = params.resolverSetId ?? PM_RESOLVER_SET_ID;

  tx.moveCall({
    target: `${pkg}::pm_dispute::file_dispute`,
    typeArguments: [COLLATERAL_COIN_TYPE],
    arguments: [
      tx.object(params.marketId),
      tx.object(requireConfigId()),
      tx.object(assertConfiguredId(resolverSetId, "Resolver set ID")),
      tx.pure.u16(params.proposedOutcome),
      tx.pure("vector<u8>", Array.from(params.reasonHash)),
      bondCoin,
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });

  return tx;
}

export function buildProposeResolutionTransaction(params: {
  marketId: string;
  outcome: number;
  evidenceHash: Uint8Array;
}): Transaction {
  const pkg = assertProtocolPackageId();
  const tx = new Transaction();

  tx.moveCall({
    target: `${pkg}::pm_resolution::propose_resolution`,
    typeArguments: [COLLATERAL_COIN_TYPE],
    arguments: [
      tx.object(params.marketId),
      tx.pure.u16(params.outcome),
      tx.pure("vector<u8>", Array.from(params.evidenceHash)),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });

  return tx;
}

export function buildCommunityProposeResolutionTransaction(params: {
  marketId: string;
  outcome: number;
  evidenceHash: Uint8Array;
  bondCoinIds: string[];
  bondAmount: bigint;
}): Transaction {
  const pkg = assertProtocolPackageId();
  const tx = new Transaction();
  const bondSourceCoin = mergeCoinInputs(tx, params.bondCoinIds);
  const [bondCoin] = tx.splitCoins(bondSourceCoin, [tx.pure.u64(params.bondAmount)]);

  tx.moveCall({
    target: `${pkg}::pm_resolution::propose_community_resolution`,
    typeArguments: [COLLATERAL_COIN_TYPE],
    arguments: [
      tx.object(params.marketId),
      tx.object(requireConfigId()),
      tx.pure.u16(params.outcome),
      tx.pure("vector<u8>", Array.from(params.evidenceHash)),
      bondCoin,
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });

  return tx;
}

export function buildResolveDeterministicTransaction(params: {
  marketId: string;
  verifierCapId: string;
  outcome: number;
  evidenceHash: Uint8Array;
}): Transaction {
  const pkg = assertProtocolPackageId();
  const tx = new Transaction();

  tx.moveCall({
    target: `${pkg}::pm_resolution::resolve_deterministic`,
    typeArguments: [COLLATERAL_COIN_TYPE],
    arguments: [
      tx.object(params.marketId),
      tx.object(assertConfiguredId(params.verifierCapId, "Verifier cap ID")),
      tx.pure.u16(params.outcome),
      tx.pure("vector<u8>", Array.from(params.evidenceHash)),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });

  return tx;
}

export function buildResolveDeclaredTransaction(params: {
  marketId: string;
  verifierCapId: string;
  outcome: number;
  evidenceHash: Uint8Array;
}): Transaction {
  const pkg = assertProtocolPackageId();
  const tx = new Transaction();

  tx.moveCall({
    target: `${pkg}::pm_resolution::resolve_declared`,
    typeArguments: [COLLATERAL_COIN_TYPE],
    arguments: [
      tx.object(params.marketId),
      tx.object(assertConfiguredId(params.verifierCapId, "Verifier cap ID")),
      tx.pure.u16(params.outcome),
      tx.pure("vector<u8>", Array.from(params.evidenceHash)),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });

  return tx;
}

export function buildFinalizeResolutionTransaction(params: {
  marketId: string;
}): Transaction {
  const pkg = assertProtocolPackageId();
  const tx = new Transaction();

  tx.moveCall({
    target: `${pkg}::pm_resolution::finalize_resolution`,
    typeArguments: [COLLATERAL_COIN_TYPE],
    arguments: [tx.object(params.marketId), tx.object(SUI_CLOCK_OBJECT_ID)],
  });

  return tx;
}

export function buildInvalidateDeadlineExpiredTransaction(params: {
  marketId: string;
}): Transaction {
  const pkg = assertProtocolPackageId();
  const tx = new Transaction();

  tx.moveCall({
    target: `${pkg}::pm_resolution::invalidate_deadline_expired`,
    typeArguments: [COLLATERAL_COIN_TYPE],
    arguments: [
      tx.object(params.marketId),
      tx.object(requireTreasuryId()),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });

  return tx;
}

export function buildReturnCreatorBondTransaction(params: {
  marketId: string;
}): Transaction {
  const pkg = assertProtocolPackageId();
  const tx = new Transaction();

  tx.moveCall({
    target: `${pkg}::pm_trading::return_creator_bond`,
    typeArguments: [COLLATERAL_COIN_TYPE],
    arguments: [tx.object(params.marketId)],
  });

  return tx;
}
