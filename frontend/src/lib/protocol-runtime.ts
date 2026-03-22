import { protocolReadTransport } from "./client";
import { protocolManifest } from "./protocol-config";
import { TrustTier } from "./market-types";

export interface ProtocolRuntimeConfig {
  version: number;
  tradingFeeBps: number;
  settlementFeeBps: number;
  creationBondCanonical: number;
  creationBondSourceBound: number;
  creationBondCreatorResolved: number;
  creationBondExperimental: number;
  disputeBondAmount: number;
  disputeWindowDeterministicMs: number;
  disputeWindowDeclaredMs: number;
  disputeWindowCreatorMs: number;
  minMarketDurationMs: number;
  maxMarketDurationMs: number;
  maxOutcomes: number;
  creatorPriorityWindowMs: number;
  liquidityParam: number;
}

type SuiObjectWithFields = {
  data?: {
    content?: {
      fields?: Record<string, unknown>;
    };
  };
};

function readField(fields: Record<string, unknown>, snake: string, camel?: string): unknown {
  return fields[snake] ?? (camel ? fields[camel] : undefined);
}

function requireNumberField(fields: Record<string, unknown>, snake: string, camel?: string): number | null {
  const value = readField(fields, snake, camel);
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function parseProtocolRuntimeConfigObject(obj: unknown): ProtocolRuntimeConfig | null {
  try {
    const fields = (obj as SuiObjectWithFields)?.data?.content?.fields;
    if (!fields) {
      return null;
    }

    const version = requireNumberField(fields, "version");
    const tradingFeeBps = requireNumberField(fields, "trading_fee_bps", "tradingFeeBps");
    const settlementFeeBps = requireNumberField(fields, "settlement_fee_bps", "settlementFeeBps");
    const creationBondCanonical = requireNumberField(fields, "creation_bond_canonical", "creationBondCanonical");
    const creationBondSourceBound = requireNumberField(fields, "creation_bond_source_bound", "creationBondSourceBound");
    const creationBondCreatorResolved = requireNumberField(
      fields,
      "creation_bond_creator_resolved",
      "creationBondCreatorResolved",
    );
    const creationBondExperimental = requireNumberField(
      fields,
      "creation_bond_experimental",
      "creationBondExperimental",
    );
    const disputeBondAmount = requireNumberField(fields, "dispute_bond_amount", "disputeBondAmount");
    const disputeWindowDeterministicMs = requireNumberField(
      fields,
      "dispute_window_deterministic_ms",
      "disputeWindowDeterministicMs",
    );
    const disputeWindowDeclaredMs = requireNumberField(
      fields,
      "dispute_window_declared_ms",
      "disputeWindowDeclaredMs",
    );
    const disputeWindowCreatorMs = requireNumberField(
      fields,
      "dispute_window_creator_ms",
      "disputeWindowCreatorMs",
    );
    const minMarketDurationMs = requireNumberField(fields, "min_market_duration_ms", "minMarketDurationMs");
    const maxMarketDurationMs = requireNumberField(fields, "max_market_duration_ms", "maxMarketDurationMs");
    const maxOutcomes = requireNumberField(fields, "max_outcomes", "maxOutcomes");
    const creatorPriorityWindowMs = requireNumberField(
      fields,
      "creator_priority_window_ms",
      "creatorPriorityWindowMs",
    );
    const liquidityParam = requireNumberField(fields, "liquidity_param", "liquidityParam");

    if (
      version === null ||
      tradingFeeBps === null ||
      settlementFeeBps === null ||
      creationBondCanonical === null ||
      creationBondSourceBound === null ||
      creationBondCreatorResolved === null ||
      creationBondExperimental === null ||
      disputeBondAmount === null ||
      disputeWindowDeterministicMs === null ||
      disputeWindowDeclaredMs === null ||
      disputeWindowCreatorMs === null ||
      minMarketDurationMs === null ||
      maxMarketDurationMs === null ||
      maxOutcomes === null ||
      creatorPriorityWindowMs === null ||
      liquidityParam === null
    ) {
      return null;
    }

    return {
      version,
      tradingFeeBps,
      settlementFeeBps,
      creationBondCanonical,
      creationBondSourceBound,
      creationBondCreatorResolved,
      creationBondExperimental,
      disputeBondAmount,
      disputeWindowDeterministicMs,
      disputeWindowDeclaredMs,
      disputeWindowCreatorMs,
      minMarketDurationMs,
      maxMarketDurationMs,
      maxOutcomes,
      creatorPriorityWindowMs,
      liquidityParam,
    };
  } catch {
    return null;
  }
}

export async function fetchProtocolRuntimeConfig(): Promise<ProtocolRuntimeConfig> {
  const response = await protocolReadTransport.getObject(protocolManifest.configId);

  const parsed = parseProtocolRuntimeConfigObject(response);
  if (!parsed) {
    throw new Error("Unable to parse live protocol config.");
  }

  return parsed;
}

export function getCreationBondMinRawFromConfig(
  config: ProtocolRuntimeConfig,
  trustTier: TrustTier,
): bigint {
  switch (trustTier) {
    case TrustTier.CANONICAL:
      return BigInt(config.creationBondCanonical);
    case TrustTier.SOURCE_BOUND:
      return BigInt(config.creationBondSourceBound);
    case TrustTier.CREATOR_RESOLVED:
      return BigInt(config.creationBondCreatorResolved);
    case TrustTier.EXPERIMENTAL:
    default:
      return BigInt(config.creationBondExperimental);
  }
}

export function getDisputeBondAmountRawFromConfig(config: ProtocolRuntimeConfig): bigint {
  return BigInt(config.disputeBondAmount);
}
