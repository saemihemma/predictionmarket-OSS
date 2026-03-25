/**
 * Transaction validator for the public-beta gas relay.
 *
 * The relay only sponsors user-facing prediction-market flows. Admin, emergency,
 * publish, upgrade, and arbitrary transfer operations stay unsponsored.
 */

import { Transaction } from "@mysten/sui/transactions";
import { RateLimiter, extractDisputeRoundId } from "./rate-limiter.js";

const PM_PACKAGE_ID = process.env.PM_PACKAGE_ID ?? "0x0";
const MAX_GAS_BUDGET = parseInt(process.env.MAX_GAS_BUDGET ?? "50000000", 10);
const SUI_FRAMEWORK_PACKAGE_ID = "0x2";

const rateLimiter = new RateLimiter({
  disputeRateLimit: parseInt(process.env.DISPUTE_RATE_LIMIT ?? "100", 10),
  senderRateLimit: parseInt(process.env.SENDER_RATE_LIMIT ?? "20", 10),
  windowMs: 3_600_000,
});
rateLimiter.startPeriodicCleanup?.();

const normalizeAddr = (addr: string) => `0x${addr.replace(/^0x/, "").replace(/^0+/, "") || "0"}`;

const SPONSORED_CALLS = new Map<string, Set<string>>([
  ["pm_market", new Set(["new_creator_influence", "create_and_share_market"])],
  ["pm_source", new Set(["new", "deterministic_default"])],
  [
    "pm_trading",
    new Set([
      "buy",
      "buy_merge",
      "sell",
      "claim",
      "refund_invalid",
      "close_market",
      "sweep_fees",
      "return_creator_bond",
    ]),
  ],
  [
    "pm_resolution",
    new Set([
      "propose_resolution",
      "propose_community_resolution",
      "finalize_resolution",
      "invalidate_deadline_expired",
    ]),
  ],
  [
    "pm_dispute",
    new Set([
      "file_dispute",
      "file_and_share_dispute",
      "create_and_share_sdvm_vote_round",
      "resolve_from_sdvm",
      "try_resolve_dispute",
      "timeout_dispute",
      "close_dispute_on_invalid",
    ]),
  ],
  ["pm_faucet", new Set(["claim"])],
  ["pm_staking", new Set(["stake", "initiate_unstake", "complete_unstake", "clear_settled_dispute"])],
  ["pm_sdvm", new Set(["commit_vote", "reveal_vote", "explicit_abstain", "claim_voter_reward", "cleanup_orphaned_commit"])],
]);

const HELPER_MOVE_CALLS = new Map<string, Set<string>>([
  ["coin", new Set(["into_balance"])],
]);

type CommandShape = {
  $kind?: string;
  MoveCall?: Record<string, unknown>;
  Publish?: unknown;
  Upgrade?: unknown;
  TransferObjects?: unknown;
  MakeMoveVec?: unknown;
  SplitCoins?: unknown;
  MergeCoins?: unknown;
  package?: string;
  module?: string;
  function?: string;
  target?: string;
};

type InputArgumentShape = {
  $kind?: string;
  Input?: number;
  Result?: number;
  NestedResult?: [number, number] | number[];
};

type PureInputShape = {
  $kind?: string;
  Pure?: {
    bytes?: string;
  };
};

type TxDataShape = {
  inputs?: PureInputShape[];
  commands?: CommandShape[];
};

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  faucetClaim?: boolean;
}

function decodePureAddressInput(input: PureInputShape | undefined): string | null {
  const bytes = input?.Pure?.bytes;
  if (!bytes) {
    return null;
  }

  try {
    return normalizeAddr(`0x${Buffer.from(bytes, "base64").toString("hex")}`);
  } catch {
    return null;
  }
}

function extractTransferredResultIndex(argument: unknown): number | null {
  if (!argument || typeof argument !== "object") {
    return null;
  }

  const candidate = argument as InputArgumentShape;
  if (typeof candidate.Result === "number") {
    return candidate.Result;
  }

  if (
    Array.isArray(candidate.NestedResult) &&
    candidate.NestedResult.length === 2 &&
    candidate.NestedResult[1] === 0 &&
    typeof candidate.NestedResult[0] === "number"
  ) {
    return candidate.NestedResult[0];
  }

  return null;
}

export function getSponsoredTransferVerdict(params: {
  command: CommandShape;
  txData: TxDataShape;
  sender: string;
  sponsoredBuyCommandIndexes: Set<number>;
}): ValidationResult {
  const { command, txData, sender, sponsoredBuyCommandIndexes } = params;
  const transfer = command.TransferObjects as
    | {
        objects?: unknown[];
        address?: unknown;
      }
    | undefined;

  if (!transfer) {
    return { valid: false, reason: "TransferObjects command missing payload" };
  }

  if (!Array.isArray(transfer.objects) || transfer.objects.length !== 1) {
    return {
      valid: false,
      reason: "Sponsored TransferObjects commands must transfer exactly one freshly created position object.",
    };
  }

  const transferredResultIndex = extractTransferredResultIndex(transfer.objects[0]);
  if (transferredResultIndex === null || !sponsoredBuyCommandIndexes.has(transferredResultIndex)) {
    return {
      valid: false,
      reason: "Sponsored TransferObjects commands may only transfer the direct result of pm_trading::buy.",
    };
  }

  const addressArg = transfer.address as InputArgumentShape | undefined;
  if (typeof addressArg?.Input !== "number") {
    return {
      valid: false,
      reason: "Sponsored TransferObjects commands must transfer the bought position back to the transaction sender.",
    };
  }

  const recipient = decodePureAddressInput(txData.inputs?.[addressArg.Input]);
  if (!recipient || recipient !== normalizeAddr(sender)) {
    return {
      valid: false,
      reason: "Sponsored TransferObjects commands must transfer the bought position back to the transaction sender.",
    };
  }

  return { valid: true };
}

export function getSponsoredMoveCallVerdict(params: {
  targetPackage?: string;
  module?: string;
  fn?: string;
  pmPackageId?: string;
}): ValidationResult {
  const { targetPackage, module, fn, pmPackageId = PM_PACKAGE_ID } = params;

  if (!targetPackage) {
    return { valid: false, reason: "MoveCall has missing package id" };
  }

  if (!module || module.trim() === "") {
    return { valid: false, reason: "MoveCall has missing or empty module name" };
  }

  if (!fn || fn.trim() === "") {
    return { valid: false, reason: "MoveCall has missing or empty function name" };
  }

  const normalizedTargetPackage = normalizeAddr(targetPackage);
  const normalizedPmPackageId = normalizeAddr(pmPackageId);

  if (normalizedTargetPackage === normalizedPmPackageId) {
    const allowedFunctions = SPONSORED_CALLS.get(module);
    if (!allowedFunctions) {
      return {
        valid: false,
        reason: `MoveCall targets module ${module}, not allowed. Allowed: ${[...SPONSORED_CALLS.keys()].join(", ")}`,
      };
    }

    if (!allowedFunctions.has(fn)) {
      return {
        valid: false,
        reason: `MoveCall targets ${module}::${fn}, which is not sponsored for public beta.`,
      };
    }

    return { valid: true, faucetClaim: module === "pm_faucet" && fn === "claim" };
  }

  if (normalizedTargetPackage === SUI_FRAMEWORK_PACKAGE_ID) {
    const allowedFunctions = HELPER_MOVE_CALLS.get(module);
    if (!allowedFunctions || !allowedFunctions.has(fn)) {
      return {
        valid: false,
        reason: `MoveCall targets ${targetPackage}::${module}::${fn}, not allowed. Only approved framework helpers are permitted.`,
      };
    }

    return { valid: true };
  }

  return {
    valid: false,
    reason: `MoveCall targets package ${targetPackage}, not allowed. Only ${pmPackageId} is permitted.`,
  };
}

export async function validateTransactionRequest(
  txKindBytes: string,
  sender: string,
  gasBudget?: number,
): Promise<ValidationResult> {
  if (gasBudget && gasBudget > MAX_GAS_BUDGET) {
    return { valid: false, reason: `Gas budget ${gasBudget} exceeds maximum ${MAX_GAS_BUDGET}` };
  }

  if (!txKindBytes || txKindBytes.length < 10) {
    return { valid: false, reason: "Transaction bytes missing or too short" };
  }

  if (txKindBytes.length > 100_000) {
    return { valid: false, reason: "Transaction bytes too large" };
  }

  let txData: TxDataShape;
  try {
    const tx = Transaction.fromKind(txKindBytes);
    txData = tx.getData() as TxDataShape;

    if (!txData.commands || txData.commands.length === 0) {
      return { valid: false, reason: "Transaction has no commands" };
    }

    if (txData.commands.length > 16) {
      return { valid: false, reason: `Too many commands (${txData.commands.length}). Max 16.` };
    }
  } catch (err) {
    return {
      valid: false,
      reason: `Failed to deserialize transaction: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  let disputeRoundId: string | undefined;
  let faucetClaim = false;
  let usesIntoBalanceHelper = false;
  const sponsoredBuyCommandIndexes = new Set<number>();

  for (const [commandIndex, command] of (txData.commands ?? []).entries()) {
    if (command.$kind === "MoveCall" || command.MoveCall) {
      const moveCall = (command.MoveCall ?? command) as CommandShape;
      const targetPackage = moveCall.package ?? moveCall.target?.split("::")[0];
      const module = moveCall.module ?? moveCall.target?.split("::")[1];
      const fn = moveCall.function ?? moveCall.target?.split("::")[2];
      const verdict = getSponsoredMoveCallVerdict({ targetPackage, module, fn });
      if (!verdict.valid) {
        return verdict;
      }

      if (normalizeAddr(targetPackage ?? "") === normalizeAddr(SUI_FRAMEWORK_PACKAGE_ID)) {
        usesIntoBalanceHelper = true;
        continue;
      }

      if (module === "pm_market" && fn === "create_and_share_market" && !usesIntoBalanceHelper) {
        return {
          valid: false,
          reason: "Market creation sponsorship requires converting the collateral coin into a balance first.",
        };
      }

      faucetClaim ||= Boolean(verdict.faucetClaim);

      if (module === "pm_trading" && fn === "buy") {
        sponsoredBuyCommandIndexes.add(commandIndex);
      }

      if ((module === "pm_sdvm" || module === "pm_dispute") && !disputeRoundId) {
        disputeRoundId = extractDisputeRoundId(txData as Record<string, unknown>, PM_PACKAGE_ID);
      }
      continue;
    }

    if (command.$kind === "Publish" || command.Publish) {
      return { valid: false, reason: "Publish commands not allowed" };
    }

    if (command.$kind === "Upgrade" || command.Upgrade) {
      return { valid: false, reason: "Upgrade commands not allowed" };
    }

    if (command.$kind === "TransferObjects" || command.TransferObjects) {
      const verdict = getSponsoredTransferVerdict({
        command,
        txData,
        sender,
        sponsoredBuyCommandIndexes,
      });
      if (!verdict.valid) {
        return verdict;
      }
      continue;
    }

    if (
      command.$kind === "MakeMoveVec" ||
      command.MakeMoveVec ||
      command.$kind === "SplitCoins" ||
      command.SplitCoins ||
      command.$kind === "MergeCoins" ||
      command.MergeCoins
    ) {
      continue;
    }
  }

  if (disputeRoundId) {
    if (!rateLimiter.checkRateLimit(disputeRoundId, sender)) {
      const disputeCount = rateLimiter.getDisputeCount(disputeRoundId);
      const senderCount = rateLimiter.getSenderCount(sender);
      const stats = rateLimiter.getStats();

      return {
        valid: false,
        reason:
          `Rate limit exceeded: dispute_round_id=${disputeRoundId} has ${disputeCount} calls ` +
          `(limit: 100/hr), sender=${sender} has ${senderCount} calls (limit: 20/hr). ` +
          `Active disputes: ${stats.activeDisputeBuckets}, active senders: ${stats.activeSenderBuckets}`,
      };
    }

    rateLimiter.recordRequest(disputeRoundId, sender);
    return { valid: true, faucetClaim };
  }

  if (!rateLimiter.checkRateLimit("_global", sender)) {
    const senderCount = rateLimiter.getSenderCount(sender);
    return {
      valid: false,
      reason: `Rate limit exceeded: sender=${sender} has ${senderCount} calls (limit: 20/hr)`,
    };
  }

  rateLimiter.recordRequest("_global", sender);
  return { valid: true, faucetClaim };
}
