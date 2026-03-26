import { protocolReadTransport, rpcWriteClient, type NormalizedSuiObjectResponse } from "./client";
import { EVENT_DISPUTE_FILED } from "./market-constants";
import { Market, MarketState, ProposalData, ResolutionClass, type DisputeData, type SDVMData } from "./market-types";

const QUERY_PAGE_LIMIT = 100;

type QueryEventsPage = {
  data?: Array<{
    type?: string;
    parsedJson?: unknown;
  }>;
  nextCursor?: unknown;
  hasNextPage?: boolean;
};

type ParsedDisputeObject = DisputeData & {
  marketId: string;
};

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function readId(value: unknown): string | null {
  if (typeof value === "string" && value) {
    return value;
  }

  const record = readRecord(value);
  if (!record) {
    return null;
  }

  const directId = readString(record.id);
  if (directId) {
    return directId;
  }

  return readId(record.fields);
}

function readArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  const record = readRecord(value);
  if (record && Array.isArray(record.vec)) {
    return record.vec;
  }

  return [];
}

function readOption(value: unknown): unknown | null {
  const vec = readArray(value);
  if (vec.length > 0) {
    return vec[0];
  }

  return value ?? null;
}

function readNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "string" && value) {
    return Number(value);
  }

  const record = readRecord(value);
  if (!record) {
    return fallback;
  }

  if ("value" in record) {
    return readNumber(record.value, fallback);
  }

  return fallback;
}

function readBigInt(value: unknown): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number") {
    return BigInt(value);
  }
  if (typeof value === "string" && value) {
    return BigInt(value);
  }

  const record = readRecord(value);
  if (!record) {
    return 0n;
  }

  if ("value" in record) {
    return readBigInt(record.value);
  }
  if ("fields" in record) {
    return readBigInt(record.fields);
  }

  return 0n;
}

function readHexBytes(value: unknown): string {
  if (typeof value === "string") {
    return value.startsWith("0x") ? value : `0x${value}`;
  }

  const bytes = readArray(value);
  if (bytes.length === 0) {
    return "";
  }

  return `0x${bytes
    .map((entry) => readNumber(entry, 0).toString(16).padStart(2, "0"))
    .join("")}`;
}

function readFields(object: NormalizedSuiObjectResponse | null | undefined): Record<string, unknown> | null {
  const fields = object?.data?.content?.fields;
  return fields ?? null;
}

function toProposalData(market: Market): ProposalData | undefined {
  if (!market.resolution || market.resolutionClass !== ResolutionClass.CREATOR_PROPOSED) {
    return undefined;
  }

  return {
    proposedOutcomeId: market.resolution.resolvedOutcome,
    proposerAddress: market.resolution.resolverAddress,
    proposerType: market.resolution.resolverAddress === market.creator ? "CREATOR" : "COMMUNITY",
    submittedAtMs: market.resolution.resolvedAtMs,
    evidenceHash: market.resolution.evidenceHash,
    disputeWindowEndMs: market.resolution.disputeWindowEndMs,
  };
}

function parseDisputeObject(
  disputeObject: NormalizedSuiObjectResponse | null | undefined,
  disputeWindowMsByMarket: Map<string, number>,
): ParsedDisputeObject | null {
  const fields = readFields(disputeObject);
  if (!fields || !disputeObject?.data?.objectId) {
    return null;
  }

  const marketId = readId(fields.market_id ?? fields.marketId);
  if (!marketId) {
    return null;
  }

  const escalationDeadlineMs = readNumber(fields.escalation_deadline_ms ?? fields.escalationDeadlineMs);
  const filedAtMs = Math.max(0, escalationDeadlineMs - (disputeWindowMsByMarket.get(marketId) ?? 0));

  return {
    id: disputeObject.data.objectId,
    marketId,
    disputer: readString(fields.disputer) ?? "",
    proposedOutcomeId: readNumber(fields.proposed_outcome ?? fields.proposedOutcome),
    reasonHash: readHexBytes(fields.reason_hash ?? fields.reasonHash),
    filedAtMs,
    bondAmount: Number(readBigInt(fields.bond)),
    state: readNumber(fields.state),
    escalationDeadlineMs,
    sdvmVoteRoundId: readId(readOption(fields.sdvm_vote_round_id ?? fields.sdvmVoteRoundId)),
  };
}

function parseRoundObject(roundObject: NormalizedSuiObjectResponse | null | undefined): SDVMData | null {
  const fields = readFields(roundObject);
  if (!fields || !roundObject?.data?.objectId) {
    return null;
  }

  const phaseValue = readNumber(fields.phase);
  const phase =
    phaseValue === 0 ? "COMMIT" : phaseValue === 1 ? "REVEAL" : phaseValue === 2 ? "TALLY" : "SETTLED";

  return {
    roundId: roundObject.data.objectId,
    disputeId: readId(fields.dispute_id ?? fields.disputeId) ?? "",
    roundNumber: readNumber(fields.round_number ?? fields.roundNumber, 1),
    phase,
    commitDeadlineMs: readNumber(fields.commit_deadline_ms ?? fields.commitDeadlineMs),
    revealDeadlineMs: readNumber(fields.reveal_deadline_ms ?? fields.revealDeadlineMs),
    hardDeadlineMs: readNumber(fields.hard_deadline_ms ?? fields.hardDeadlineMs),
    talliedOutcome: (() => {
      const option = readOption(fields.admin_resolved_outcome ?? fields.adminResolvedOutcome);
      return option == null ? null : readNumber(option);
    })(),
    participantCount: readArray(fields.committed_voters ?? fields.committedVoters).length,
    totalStakeParticipating: readNumber(
      fields.total_revealed_weight ?? fields.totalRevealedWeight ?? fields.total_committed_weight ?? fields.totalCommittedWeight,
    ),
    totalStakeSnapshot: readNumber(fields.total_staked_snapshot ?? fields.totalStakedSnapshot),
    expedited: Boolean(fields.expedited),
  };
}

async function queryLatestDisputeIdsByMarket(marketIds: string[]): Promise<Map<string, string>> {
  const remaining = new Set(marketIds);
  const disputesByMarket = new Map<string, string>();
  let cursor: unknown | undefined;
  let hasNextPage = true;

  while (hasNextPage && remaining.size > 0) {
    const page = (await rpcWriteClient.queryEvents({
      query: { MoveEventType: EVENT_DISPUTE_FILED },
      limit: QUERY_PAGE_LIMIT,
      cursor: cursor as never,
      order: "descending",
    })) as QueryEventsPage;

    for (const event of page.data ?? []) {
      const parsed = readRecord(event.parsedJson);
      if (!parsed) {
        continue;
      }

      const marketId = readId(parsed.market_id ?? parsed.marketId);
      const disputeId = readId(parsed.dispute_id ?? parsed.disputeId);
      if (!marketId || !disputeId || !remaining.has(marketId)) {
        continue;
      }

      disputesByMarket.set(marketId, disputeId);
      remaining.delete(marketId);
    }

    cursor = page.nextCursor;
    hasNextPage = Boolean(page.hasNextPage);
  }

  return disputesByMarket;
}

export function extractEventField(
  events: unknown,
  eventType: string,
  fieldName: string,
): string | null {
  if (!Array.isArray(events)) {
    return null;
  }

  for (const entry of events) {
    const record = readRecord(entry);
    if (!record || readString(record.type) !== eventType) {
      continue;
    }

    const parsed = readRecord(record.parsedJson);
    const fieldValue = parsed?.[fieldName];
    const id = readId(fieldValue);
    if (id) {
      return id;
    }

    const stringValue = readString(fieldValue);
    if (stringValue) {
      return stringValue;
    }
  }

  return null;
}

export async function hydrateMarketsWithLifecycle(markets: Market[]): Promise<Market[]> {
  if (markets.length === 0) {
    return [];
  }

  const proposalHydrated = markets.map((market) => ({
    ...market,
    proposal: toProposalData(market),
  }));

  const disputedMarkets = proposalHydrated.filter((market) => market.state === MarketState.DISPUTED);
  if (disputedMarkets.length === 0) {
    return proposalHydrated;
  }

  const disputeIdsByMarket = await queryLatestDisputeIdsByMarket(disputedMarkets.map((market) => market.id));
  if (disputeIdsByMarket.size === 0) {
    return proposalHydrated;
  }

  const disputeWindowMsByMarket = new Map(proposalHydrated.map((market) => [market.id, market.disputeWindowMs]));
  const disputeObjects = await protocolReadTransport.getObjects([...disputeIdsByMarket.values()]);
  const disputesByMarket = new Map<string, ParsedDisputeObject>();
  const roundIds = new Set<string>();

  for (const disputeObject of disputeObjects) {
    const parsed = parseDisputeObject(disputeObject, disputeWindowMsByMarket);
    if (!parsed) {
      continue;
    }

    disputesByMarket.set(parsed.marketId, parsed);
    if (parsed.sdvmVoteRoundId) {
      roundIds.add(parsed.sdvmVoteRoundId);
    }
  }

  const roundsByDispute = new Map<string, SDVMData>();
  if (roundIds.size > 0) {
    const roundObjects = await protocolReadTransport.getObjects([...roundIds]);
    for (const roundObject of roundObjects) {
      const parsed = parseRoundObject(roundObject);
      if (!parsed) {
        continue;
      }

      roundsByDispute.set(parsed.disputeId, parsed);
    }
  }

  return proposalHydrated.map((market) => {
    const dispute = disputesByMarket.get(market.id);
    return {
      ...market,
      dispute,
      sdvm: dispute ? roundsByDispute.get(dispute.id) : undefined,
    };
  });
}
