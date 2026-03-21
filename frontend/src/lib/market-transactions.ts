/**
 * Move call builders for prediction market transactions.
 * Matches pm_trading.move, pm_market.move, pm_dispute.move signatures exactly.
 *
 * Coin type: Coin<SUFFER> (prediction_market::suffer::SUFFER)
 * Clock: Sui shared clock object "0x6"
 */

import { Transaction } from "@mysten/sui/transactions";
import {
  PM_PACKAGE_ID,
  PM_REGISTRY_ID,
  PM_CONFIG_ID,
  PM_TREASURY_ID,
  PM_MARKET_TYPE_POLICY_ID,
  PM_RESOLVER_POLICY_ID,
  PM_RESOLVER_SET_ID,
} from "./market-constants";

/** Sui shared clock object ID */
const SUI_CLOCK_OBJECT_ID = "0x6";

function requirePackageId(): string {
  if (!PM_PACKAGE_ID || PM_PACKAGE_ID === "0x0") {
    throw new Error("Set VITE_PM_PACKAGE_ID before building market transactions.");
  }
  return PM_PACKAGE_ID;
}

/**
 * Build a standalone close_market transaction.
 * Permissionless — anyone can call. Useful for syncing on-chain state
 * with reality (e.g., indexers, explorers).
 *
 * NOTE: Resolution/invalidation entry points on-chain now call ensure_closed()
 * internally, so the frontend does NOT need to bundle close_market into any PTB.
 * This builder exists only for explicit state-sync use cases.
 */
export function buildCloseMarketTransaction(params: {
  marketId: string;
}): Transaction {
  const pkg = requirePackageId();
  const tx = new Transaction();
  tx.moveCall({
    target: `${pkg}::pm_trading::close_market`,
    arguments: [
      tx.object(params.marketId),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });
  return tx;
}

// ── Buy ──────────────────────────────────────────────────────────────────

/**
 * Buy outcome tokens → creates a NEW PMPosition (returned from Move).
 *
 * Move: pm_trading::buy(market, config, clock, outcome_index: u16, amount: u64, max_cost: u64, deadline_ms: u64, payment: Coin<SUFFER>, ctx): PMPosition
 */
export function buildBuyTransaction(params: {
  marketId: string;
  outcomeIndex: number;
  amount: bigint;
  maxCost: bigint;
  deadlineMs: bigint;
  paymentCoinId: string;
}): Transaction {
  const pkg = requirePackageId();
  const tx = new Transaction();

  tx.moveCall({
    target: `${pkg}::pm_trading::buy`,
    arguments: [
      tx.object(params.marketId),
      tx.object(PM_CONFIG_ID),
      tx.object(SUI_CLOCK_OBJECT_ID),
      tx.pure.u16(params.outcomeIndex),
      tx.pure.u64(params.amount),
      tx.pure.u64(params.maxCost),
      tx.pure.u64(params.deadlineMs),
      tx.object(params.paymentCoinId),
    ],
  });

  return tx;
}

/**
 * Buy outcome tokens and merge into an existing position.
 *
 * Move: pm_trading::buy_merge(market, config, clock, outcome_index: u16, amount: u64, max_cost: u64, deadline_ms: u64, payment: Coin<SUFFER>, position: &mut PMPosition, ctx)
 */
export function buildBuyMergeTransaction(params: {
  marketId: string;
  outcomeIndex: number;
  amount: bigint;
  maxCost: bigint;
  deadlineMs: bigint;
  paymentCoinId: string;
  positionId: string;
}): Transaction {
  const pkg = requirePackageId();
  const tx = new Transaction();

  tx.moveCall({
    target: `${pkg}::pm_trading::buy_merge`,
    arguments: [
      tx.object(params.marketId),
      tx.object(PM_CONFIG_ID),
      tx.object(SUI_CLOCK_OBJECT_ID),
      tx.pure.u16(params.outcomeIndex),
      tx.pure.u64(params.amount),
      tx.pure.u64(params.maxCost),
      tx.pure.u64(params.deadlineMs),
      tx.object(params.paymentCoinId),
      tx.object(params.positionId),
    ],
  });

  return tx;
}

// ── Sell ──────────────────────────────────────────────────────────────────

/**
 * Sell outcome tokens from an existing position.
 *
 * Move: pm_trading::sell(market, config, clock, position: &mut PMPosition, amount: u64, min_proceeds: u64, deadline_ms: u64, ctx)
 */
export function buildSellTransaction(params: {
  marketId: string;
  positionId: string;
  amount: bigint;
  minProceeds: bigint;
  deadlineMs: bigint;
}): Transaction {
  const pkg = requirePackageId();
  const tx = new Transaction();

  tx.moveCall({
    target: `${pkg}::pm_trading::sell`,
    arguments: [
      tx.object(params.marketId),
      tx.object(PM_CONFIG_ID),
      tx.object(SUI_CLOCK_OBJECT_ID),
      tx.object(params.positionId),
      tx.pure.u64(params.amount),
      tx.pure.u64(params.minProceeds),
      tx.pure.u64(params.deadlineMs),
    ],
  });

  return tx;
}

// ── Claim (resolved market) ──────────────────────────────────────────────

/**
 * Claim payout for a position on a resolved market.
 * Position is CONSUMED (transferred into the call by value).
 *
 * Move: pm_trading::claim(market, config, position: PMPosition, ctx)
 */
export function buildClaimTransaction(params: {
  marketId: string;
  positionId: string;
}): Transaction {
  const pkg = requirePackageId();
  const tx = new Transaction();

  tx.moveCall({
    target: `${pkg}::pm_trading::claim`,
    arguments: [
      tx.object(params.marketId),
      tx.object(PM_CONFIG_ID),
      tx.object(params.positionId),
    ],
  });

  return tx;
}

// ── Invalid refund ───────────────────────────────────────────────────────

/**
 * Refund a position on an invalidated market.
 * Position is CONSUMED. No config param. No settlement fee.
 *
 * Move: pm_trading::refund_invalid(market, position: PMPosition, ctx)
 */
export function buildInvalidRefundTransaction(params: {
  marketId: string;
  positionId: string;
}): Transaction {
  const pkg = requirePackageId();
  const tx = new Transaction();

  tx.moveCall({
    target: `${pkg}::pm_trading::refund_invalid`,
    arguments: [
      tx.object(params.marketId),
      tx.object(params.positionId),
    ],
  });

  return tx;
}

// ── Sweep fees ───────────────────────────────────────────────────────────

/**
 * Sweep accrued fees from a market to the treasury. Permissionless.
 *
 * Move: pm_trading::sweep_fees(market, treasury)
 */
export function buildSweepFeesTransaction(params: {
  marketId: string;
}): Transaction {
  const pkg = requirePackageId();
  const tx = new Transaction();

  tx.moveCall({
    target: `${pkg}::pm_trading::sweep_fees`,
    arguments: [
      tx.object(params.marketId),
      tx.object(PM_TREASURY_ID),
    ],
  });

  return tx;
}

// ── Create market ────────────────────────────────────────────────────────

/**
 * Create a new market. Multi-step PTB:
 * 1. pm_source::new(...) → SourceDeclaration
 * 2. pm_market::new_creator_influence(...) → CreatorInfluence
 * 3. coin::into_balance(creation_bond_coin) → Balance<SUFFER>
 * 4. pm_market::create_market(...) → PMMarket
 *
 * Move: pm_market::create_market(registry, config, policy, resolver_policy,
 *   title, description, resolution_text, outcome_count: u16,
 *   outcome_labels: vector<String>, source_declaration, creator_influence,
 *   close_time_ms: u64, resolve_deadline_ms: u64,
 *   creation_bond: Balance<SUFFER>, clock: &Clock, ctx): PMMarket
 */
export function buildCreateMarketTransaction(params: {
  title: string;
  description: string;
  resolutionText: string;
  outcomeCount: number;
  outcomeLabels: string[];
  closeTimeMs: bigint;
  resolveDeadlineMs: bigint;
  // Source declaration fields
  sourceClass: number;
  sourceUri: string;
  sourceDescription: string;
  evidenceFormat: number;
  sourceArchived: boolean;
  creatorControlsSource: boolean;
  verifierSubmissionRequired: boolean;
  fallbackOnSourceUnavailable: number;
  // Creator influence fields
  influenceLevel: number;
  creatorIsSourceController: boolean;
  disclosureText: string;
  // Bond
  bondCoinId: string;
}): Transaction {
  const pkg = requirePackageId();
  const tx = new Transaction();

  // Step 1: Build SourceDeclaration via pm_source::new
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

  // Step 2: Build CreatorInfluence via pm_market::new_creator_influence
  const [creatorInfluence] = tx.moveCall({
    target: `${pkg}::pm_market::new_creator_influence`,
    arguments: [
      tx.pure.u8(params.influenceLevel),
      tx.pure.bool(params.creatorIsSourceController),
      tx.pure.string(params.disclosureText),
    ],
  });

  // Step 3: Convert bond coin to Balance<SUFFER>
  const [bondBalance] = tx.moveCall({
    target: `0x2::coin::into_balance`,
    typeArguments: [`${pkg}::suffer::SUFFER`],
    arguments: [tx.object(params.bondCoinId)],
  });

  // Step 4: Create the market
  tx.moveCall({
    target: `${pkg}::pm_market::create_market`,
    arguments: [
      tx.object(PM_REGISTRY_ID),
      tx.object(PM_CONFIG_ID),
      tx.object(PM_MARKET_TYPE_POLICY_ID),
      tx.object(PM_RESOLVER_POLICY_ID),
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

// ── File dispute ─────────────────────────────────────────────────────────

/**
 * File a dispute against a market's proposed resolution.
 *
 * Move: pm_dispute::file_dispute(market, config, resolver_set, proposed_outcome: u16,
 *   reason_hash: vector<u8>, bond_coin: Coin<SUFFER>, clock, ctx): PMDispute
 *
 * RT-021: reason_hash must be exactly 32 bytes (256-bit hash).
 */
export function buildDisputeTransaction(params: {
  marketId: string;
  resolverSetId: string;
  proposedOutcome: number;
  reasonHash: Uint8Array;
  bondCoinId: string;
}): Transaction {
  const pkg = requirePackageId();

  // RT-021: Validate evidence hash is exactly 32 bytes
  if (params.reasonHash.length !== 32) {
    throw new Error(`Evidence hash must be exactly 32 bytes, got ${params.reasonHash.length}`);
  }

  const tx = new Transaction();

  tx.moveCall({
    target: `${pkg}::pm_dispute::file_dispute`,
    arguments: [
      tx.object(params.marketId),
      tx.object(PM_CONFIG_ID),
      tx.object(params.resolverSetId),
      tx.pure.u16(params.proposedOutcome),
      tx.pure("vector<u8>", Array.from(params.reasonHash)),
      tx.object(params.bondCoinId),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });

  return tx;
}
