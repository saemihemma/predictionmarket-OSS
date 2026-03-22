import { protocolReadTransport } from "./client";
import {
  EVIDENCE_FORMAT_LABELS,
  type EvidenceFormat,
  SOURCE_CLASS_LABELS,
  type SourceClass,
} from "./market-types";

export interface ProtocolMarketTypePolicy {
  id: string;
  trustTier: number;
  marketType: number;
  resolutionClass: number;
  requiredOutcomeCount: number;
  maxOutcomes: number;
  requiredSourceClass: SourceClass;
  requiredEvidenceFormat: EvidenceFormat;
  active: boolean;
}

type SuiObjectWithFields = {
  data?: {
    objectId?: string;
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

function requireBooleanField(fields: Record<string, unknown>, snake: string, camel?: string): boolean | null {
  const value = readField(fields, snake, camel);
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    if (value === "true") {
      return true;
    }
    if (value === "false") {
      return false;
    }
  }
  return null;
}

export function parseMarketTypePolicyObject(obj: unknown): ProtocolMarketTypePolicy | null {
  const data = (obj as SuiObjectWithFields)?.data;
  const fields = data?.content?.fields;
  if (!data?.objectId || !fields) {
    return null;
  }

  const trustTier = requireNumberField(fields, "trust_tier", "trustTier");
  const marketType = requireNumberField(fields, "market_type", "marketType");
  const resolutionClass = requireNumberField(fields, "resolution_class", "resolutionClass");
  const requiredOutcomeCount = requireNumberField(fields, "required_outcome_count", "requiredOutcomeCount");
  const maxOutcomes = requireNumberField(fields, "max_outcomes", "maxOutcomes");
  const requiredSourceClass = requireNumberField(fields, "required_source_class", "requiredSourceClass");
  const requiredEvidenceFormat = requireNumberField(
    fields,
    "required_evidence_format",
    "requiredEvidenceFormat",
  );
  const active = requireBooleanField(fields, "active");

  if (
    trustTier === null ||
    marketType === null ||
    resolutionClass === null ||
    requiredOutcomeCount === null ||
    maxOutcomes === null ||
    requiredSourceClass === null ||
    requiredEvidenceFormat === null ||
    active === null
  ) {
    return null;
  }

  return {
    id: data.objectId,
    trustTier,
    marketType,
    resolutionClass,
    requiredOutcomeCount,
    maxOutcomes,
    requiredSourceClass: requiredSourceClass as SourceClass,
    requiredEvidenceFormat: requiredEvidenceFormat as EvidenceFormat,
    active,
  };
}

export async function fetchMarketTypePolicy(policyId: string): Promise<ProtocolMarketTypePolicy> {
  const response = await protocolReadTransport.getObject(policyId);
  const parsed = parseMarketTypePolicyObject(response);
  if (!parsed) {
    throw new Error(`Unable to parse market type policy ${policyId}.`);
  }
  return parsed;
}

export function getPolicySourceTypeLabel(policy: ProtocolMarketTypePolicy): string {
  return SOURCE_CLASS_LABELS[policy.requiredSourceClass] ?? "Unknown Source";
}

export function getPolicyEvidenceFormatLabel(policy: ProtocolMarketTypePolicy): string {
  return EVIDENCE_FORMAT_LABELS[policy.requiredEvidenceFormat] ?? "Unknown Evidence";
}
