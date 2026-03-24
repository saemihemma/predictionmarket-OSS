const DEFAULT_STILLNESS_CHARACTER_TYPE =
  "0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c::character::Character";
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 200;

type EligibilityStatus = "eligible" | "no_character" | "unavailable";

export interface FrontierEligibilityResult {
  status: EligibilityStatus;
  reason?: string;
}

interface EligibilityConfig {
  graphqlUrl: string;
  characterType: string;
  authHeader?: string;
  authValue?: string;
  cacheTtlMs: number;
  pageSize: number;
}

type StillnessNode = {
  asMoveObject?: {
    contents?: {
      json?: Record<string, unknown>;
    };
  };
};

type StillnessPage = {
  nodes?: StillnessNode[];
  pageInfo?: {
    hasNextPage?: boolean;
    endCursor?: string | null;
  };
};

type StillnessResponse = {
  data?: {
    objects?: StillnessPage;
  };
  errors?: Array<{ message?: string }>;
};

type CachedEligibilityIndex = {
  fetchedAtMs: number;
  addresses: Set<string>;
};

const LIVE_CHARACTERS_QUERY = `
  query LiveCharacters($first: Int = 50, $after: String, $type: String!) {
    objects(first: $first, after: $after, filter: { type: $type }) {
      nodes {
        address
        asMoveObject {
          contents {
            type {
              repr
            }
            json
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

let eligibilityCache: CachedEligibilityIndex | null = null;
let refreshPromise: Promise<Set<string>> | null = null;

function normalizeAddress(value: string): string {
  const trimmed = value.trim().toLowerCase();
  return `0x${trimmed.replace(/^0x/, "")}`;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readEligibilityConfig(): EligibilityConfig | null {
  const graphqlUrl = process.env.STILLNESS_GRAPHQL_URL?.trim() ?? "";
  if (!graphqlUrl) {
    return null;
  }

  return {
    graphqlUrl,
    characterType: (process.env.STILLNESS_CHARACTER_TYPE ?? DEFAULT_STILLNESS_CHARACTER_TYPE).trim(),
    authHeader: process.env.STILLNESS_GRAPHQL_AUTH_HEADER?.trim() || undefined,
    authValue: process.env.STILLNESS_GRAPHQL_AUTH_VALUE?.trim() || undefined,
    cacheTtlMs: parsePositiveInt(process.env.STILLNESS_CACHE_TTL_MS, DEFAULT_CACHE_TTL_MS),
    pageSize: Math.min(parsePositiveInt(process.env.STILLNESS_PAGE_SIZE, DEFAULT_PAGE_SIZE), 500),
  };
}

function buildHeaders(config: EligibilityConfig): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.authHeader && config.authValue) {
    headers[config.authHeader] = config.authValue;
  }
  return headers;
}

function parseCharacterAddresses(page: StillnessPage | undefined, addresses: Set<string>): void {
  for (const node of page?.nodes ?? []) {
    const value = node.asMoveObject?.contents?.json?.character_address;
    if (typeof value === "string" && value.trim()) {
      addresses.add(normalizeAddress(value));
    }
  }
}

async function fetchEligibilityIndex(config: EligibilityConfig): Promise<Set<string>> {
  const addresses = new Set<string>();
  let after: string | null = null;

  do {
    const response = await fetch(config.graphqlUrl, {
      method: "POST",
      headers: buildHeaders(config),
      body: JSON.stringify({
        query: LIVE_CHARACTERS_QUERY,
        variables: {
          first: config.pageSize,
          after,
          type: config.characterType,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Stillness GraphQL returned ${response.status}`);
    }

    const payload = (await response.json()) as StillnessResponse;
    if (payload.errors?.length) {
      throw new Error(payload.errors.map((entry) => entry.message ?? "Unknown GraphQL error").join("; "));
    }

    const page = payload.data?.objects;
    parseCharacterAddresses(page, addresses);
    after = page?.pageInfo?.hasNextPage ? page.pageInfo.endCursor ?? null : null;
  } while (after);

  return addresses;
}

function cacheIsFresh(config: EligibilityConfig): boolean {
  return Boolean(eligibilityCache) && Date.now() - (eligibilityCache?.fetchedAtMs ?? 0) < config.cacheTtlMs;
}

async function ensureEligibilityIndex(config: EligibilityConfig): Promise<Set<string>> {
  if (cacheIsFresh(config) && eligibilityCache) {
    return eligibilityCache.addresses;
  }

  if (!refreshPromise) {
    refreshPromise = fetchEligibilityIndex(config)
      .then((addresses) => {
        eligibilityCache = {
          fetchedAtMs: Date.now(),
          addresses,
        };
        return addresses;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

export async function getFrontierEligibility(sender: string): Promise<FrontierEligibilityResult> {
  const config = readEligibilityConfig();
  if (!config) {
    return {
      status: "unavailable",
      reason: "Frontier eligibility is not configured on this relay.",
    };
  }

  const normalizedSender = normalizeAddress(sender);

  try {
    const addresses = await ensureEligibilityIndex(config);
    return addresses.has(normalizedSender)
      ? { status: "eligible" }
      : {
          status: "no_character",
          reason: "Create your Frontier account and character first to become eligible for the faucet.",
        };
  } catch (error) {
    console.warn("[gas-relay] frontier eligibility refresh failed:", error);

    if (eligibilityCache?.addresses.has(normalizedSender)) {
      return {
        status: "eligible",
        reason: "Frontier eligibility is temporarily using cached Stillness data.",
      };
    }

    return {
      status: "unavailable",
      reason: "Frontier eligibility could not be verified right now. Please try again shortly.",
    };
  }
}
