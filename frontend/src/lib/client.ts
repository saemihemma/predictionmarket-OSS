import { SuiGraphQLClient } from "@mysten/sui/graphql";
import { graphql } from "@mysten/sui/graphql/schema";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { EVENT_MARKET_CREATED } from "./market-constants";
import { getProtocolManifest } from "./protocol-config";

export interface NormalizedSuiObjectResponse {
  data: {
    objectId: string;
    type?: string;
    owner?: unknown;
    content: {
      fields?: Record<string, unknown>;
    };
  } | null;
}

export interface NormalizedCoinBalance {
  coinObjectId: string;
  balance: string;
}

export interface NormalizedWalletBalance {
  coinType: string;
  totalBalance: string;
  coinObjectCount: number;
}

export interface ReadTransportStatus {
  primary: "graphql";
  fallbackAvailable: boolean;
  fallbackUsedThisSession: boolean;
  lastFallbackReason: string | null;
}

interface ReadTransport {
  getObject(id: string): Promise<NormalizedSuiObjectResponse | null>;
  getObjects(ids: string[]): Promise<NormalizedSuiObjectResponse[]>;
  listOwnedObjects(input: { owner: string; type?: string }): Promise<NormalizedSuiObjectResponse[]>;
  listCoins(input: { owner: string; coinType: string }): Promise<NormalizedCoinBalance[]>;
  listWalletBalances(owner: string): Promise<NormalizedWalletBalance[]>;
  listMarketIds(): Promise<string[]>;
  transportStatus(): ReadTransportStatus;
}

const manifest = getProtocolManifest();

const graphqlClient = new SuiGraphQLClient({
  url: manifest.graphqlUrl,
  network: manifest.network,
});

const rpcFallbackClient = new SuiJsonRpcClient({
  url: manifest.rpcUrl,
  network: manifest.network,
});

const MARKET_CREATED_EVENTS_QUERY = graphql(`
  query MarketCreatedEvents($type: String!, $first: Int!, $after: String) {
    events(first: $first, after: $after, filter: { type: $type }) {
      nodes {
        contents {
          type {
            repr
          }
          json
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`);

const transportState: ReadTransportStatus = {
  primary: "graphql",
  fallbackAvailable: true,
  fallbackUsedThisSession: false,
  lastFallbackReason: null,
};

type GraphqlObjectLike = {
  objectId: string;
  type?: string;
  owner?: unknown;
  json?: unknown;
};

type GraphqlCoinLike = {
  objectId: string;
  balance: string;
};

type GraphqlObjectPage = {
  objects: Array<GraphqlObjectLike | Error>;
  hasNextPage: boolean;
  cursor: string | null;
};

type GraphqlCoinPage = {
  objects: GraphqlCoinLike[];
  hasNextPage: boolean;
  cursor: string | null;
};

type MarketCreatedEventNode = {
  contents?: {
    json?: unknown;
    type?: {
      repr?: string | null;
    } | null;
  } | null;
};

type MarketCreatedEventsConnection = {
  nodes: MarketCreatedEventNode[];
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
  };
};

function normalizeFields(fields: unknown): Record<string, unknown> | undefined {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    return undefined;
  }

  return fields as Record<string, unknown>;
}

function normalizeGraphqlObject(object: GraphqlObjectLike): NormalizedSuiObjectResponse {
  return {
    data: {
      objectId: object.objectId,
      type: object.type,
      owner: object.owner,
      content: {
        fields: normalizeFields(object.json),
      },
    },
  };
}

function normalizeGraphqlObjectResult(object: GraphqlObjectLike | Error): NormalizedSuiObjectResponse {
  if (object instanceof Error) {
    return { data: null };
  }

  return normalizeGraphqlObject(object);
}

function normalizeRpcObject(object: unknown): NormalizedSuiObjectResponse {
  const candidate = object as {
    data?: {
      objectId?: string;
      type?: string;
      owner?: unknown;
      content?: {
        fields?: Record<string, unknown>;
      };
    };
  };

  if (!candidate.data) {
    return { data: null };
  }

  return {
    data: {
      objectId: candidate.data.objectId ?? "",
      type: candidate.data.type,
      owner: candidate.data.owner,
      content: {
        fields: candidate.data.content?.fields,
      },
    },
  };
}

function fallbackReason(operation: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `${operation}: ${message}`;
}

function rememberFallback(reason: string) {
  transportState.fallbackUsedThisSession = true;
  transportState.lastFallbackReason = reason;
}

function isObjectNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /not found/i.test(message);
}

async function withGraphqlFallback<T>(
  operation: string,
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
): Promise<T> {
  try {
    return await primary();
  } catch (error) {
    rememberFallback(fallbackReason(operation, error));
    return await fallback();
  }
}

async function getObject(id: string): Promise<NormalizedSuiObjectResponse | null> {
  try {
    const result = await graphqlClient.getObject({
      objectId: id,
      include: { json: true, type: true },
    });
    return normalizeGraphqlObject(result.object);
  } catch (error) {
    if (isObjectNotFoundError(error)) {
      return null;
    }

    return await withGraphqlFallback(
      `getObject(${id})`,
      async () => {
        throw error;
      },
      async () => normalizeRpcObject(await rpcFallbackClient.getObject({ id, options: { showContent: true } })),
    );
  }
}

async function getObjects(ids: string[]): Promise<NormalizedSuiObjectResponse[]> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return [];
  }

  return await withGraphqlFallback(
    "getObjects",
    async () => {
      const result = await graphqlClient.getObjects({
        objectIds: uniqueIds,
        include: { json: true, type: true },
      });
      return result.objects.map((object) => normalizeGraphqlObjectResult(object));
    },
    async () =>
      (await rpcFallbackClient.multiGetObjects({
        ids: uniqueIds,
        options: { showContent: true },
      })).map((object) => normalizeRpcObject(object)),
  );
}

async function listOwnedObjects({
  owner,
  type,
}: {
  owner: string;
  type?: string;
}): Promise<NormalizedSuiObjectResponse[]> {
  return await withGraphqlFallback(
    `listOwnedObjects(${owner})`,
    async () => {
      const objects: NormalizedSuiObjectResponse[] = [];
      let cursor: string | null = null;
      let hasNextPage = true;

      while (hasNextPage) {
        const page = (await graphqlClient.listOwnedObjects({
          owner,
          cursor,
          limit: 100,
          include: { json: true, type: true },
        })) as GraphqlObjectPage;

        page.objects.forEach((object) => {
          if (object instanceof Error) {
            return;
          }

          if (!type || object.type === type) {
            objects.push(normalizeGraphqlObject(object));
          }
        });

        hasNextPage = page.hasNextPage;
        cursor = page.cursor;
      }

      return objects;
    },
    async () =>
      (
        await rpcFallbackClient.getOwnedObjects({
          owner,
          filter: type ? { StructType: type } : undefined,
          options: { showContent: true },
        })
      ).data.map((object) => normalizeRpcObject(object)),
  );
}

async function listCoins({
  owner,
  coinType,
}: {
  owner: string;
  coinType: string;
}): Promise<NormalizedCoinBalance[]> {
  return await withGraphqlFallback(
    `listCoins(${owner})`,
    async () => {
      const coins: NormalizedCoinBalance[] = [];
      let cursor: string | null = null;
      let hasNextPage = true;

      while (hasNextPage) {
        const page = (await graphqlClient.listCoins({
          owner,
          coinType,
          cursor,
          limit: 100,
        })) as GraphqlCoinPage;

        coins.push(
          ...page.objects.map((coin) => ({
            coinObjectId: coin.objectId,
            balance: coin.balance,
          })),
        );

        hasNextPage = page.hasNextPage;
        cursor = page.cursor;
      }

      return coins;
    },
    async () => {
      const coins: NormalizedCoinBalance[] = [];
      let cursor: string | null | undefined = undefined;
      let hasNextPage = true;

      while (hasNextPage) {
        const result = await rpcFallbackClient.getCoins({
          owner,
          coinType,
          cursor,
          limit: 100,
        });

        coins.push(
          ...result.data.map((coin) => ({
            coinObjectId: coin.coinObjectId,
            balance: coin.balance,
          })),
        );

        hasNextPage = Boolean(result.hasNextPage);
        cursor = result.nextCursor;
      }

      return coins;
    },
  );
}

async function listWalletBalances(owner: string): Promise<NormalizedWalletBalance[]> {
  return (
    await rpcFallbackClient.getAllBalances({
      owner,
    })
  ).map((balance) => ({
    coinType: balance.coinType,
    totalBalance: balance.totalBalance,
    coinObjectCount: Number(balance.coinObjectCount ?? 0),
  }));
}

function readMarketId(fields: unknown): string | null {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    return null;
  }

  const candidate = fields as Record<string, unknown>;
  const marketId = candidate.market_id ?? candidate.marketId;
  return typeof marketId === "string" && marketId ? marketId : null;
}

async function listMarketIds(): Promise<string[]> {
  return await withGraphqlFallback(
    "listMarketIds",
    async () => {
      const marketIds = new Set<string>();
      let after: string | null = null;
      let hasNextPage = true;

      while (hasNextPage) {
        const response = await graphqlClient.query({
          query: MARKET_CREATED_EVENTS_QUERY,
          variables: {
            type: EVENT_MARKET_CREATED,
            first: 100,
            after,
          },
        });

        if (response.errors?.length) {
          throw new Error(response.errors.map((entry) => entry.message).join("; "));
        }

        const events = response.data?.events as MarketCreatedEventsConnection | undefined;
        if (!events) {
          return [];
        }

        events.nodes.forEach((event) => {
          const marketId = readMarketId(event.contents?.json);
          if (marketId) {
            marketIds.add(marketId);
          }
        });

        hasNextPage = Boolean(events.pageInfo.hasNextPage);
        after = events.pageInfo.endCursor ?? null;
      }

      return [...marketIds];
    },
    async () => {
      const marketIds = new Set<string>();
      let cursor: { txDigest: string; eventSeq: string } | null = null;
      let hasNextPage = true;

      while (hasNextPage) {
        const result = await rpcFallbackClient.queryEvents({
          query: { MoveEventType: EVENT_MARKET_CREATED },
          limit: 100,
          cursor: cursor ?? undefined,
          order: "descending",
        });

        result.data.forEach((event) => {
          const fields = (event.parsedJson as { market_id?: string; marketId?: string } | null) ?? null;
          const marketId = fields?.market_id ?? fields?.marketId ?? null;
          if (marketId) {
            marketIds.add(marketId);
          }
        });

        hasNextPage = result.hasNextPage;
        cursor = result.nextCursor ?? null;
      }

      return [...marketIds];
    },
  );
}

function transportStatus(): ReadTransportStatus {
  return { ...transportState };
}

export const protocolReadTransport: ReadTransport = {
  getObject,
  getObjects,
  listOwnedObjects,
  listCoins,
  listWalletBalances,
  listMarketIds,
  transportStatus,
};

export const suiClient = graphqlClient;

export function getReadTransportStatus(): ReadTransportStatus {
  return protocolReadTransport.transportStatus();
}
