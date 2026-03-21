/**
 * Lightweight GraphQL client for Sui's GraphQL RPC.
 * Provides fetch-based querying without heavy dependencies like Apollo.
 *
 * Configuration:
 * - Base URL: VITE_SUI_GRAPHQL_URL env var, fallback to Sui testnet GraphQL endpoint
 * - Automatic error handling with typed response parsing
 */

const GRAPHQL_URL =
  import.meta.env.VITE_SUI_GRAPHQL_URL ?? "https://sui-testnet.mystenlabs.com/graphql";

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: (string | number)[];
  }>;
}

export class GraphQLError extends Error {
  constructor(
    public readonly errors: Array<{
      message: string;
      locations?: Array<{ line: number; column: number }>;
      path?: (string | number)[];
    }>,
  ) {
    super(`GraphQL Error: ${errors.map((e) => e.message).join(", ")}`);
    this.name = "GraphQLError";
  }
}

/**
 * Execute a GraphQL query against Sui's GraphQL RPC.
 *
 * @template T The expected response type
 * @param query GraphQL query string
 * @param variables Optional variables for the query
 * @returns Parsed response data
 * @throws GraphQLError if the server returns errors
 * @throws Error if network request fails
 */
export async function graphqlQuery<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const json = (await response.json()) as GraphQLResponse<T>;

  if (json.errors && json.errors.length > 0) {
    throw new GraphQLError(json.errors);
  }

  if (!json.data) {
    throw new Error("No data in GraphQL response");
  }

  return json.data;
}

/**
 * Get the configured GraphQL URL.
 * Useful for debugging or construction of custom queries.
 */
export function getGraphQLUrl(): string {
  return GRAPHQL_URL;
}
