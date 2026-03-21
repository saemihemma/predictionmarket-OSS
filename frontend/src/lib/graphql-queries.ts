/**
 * GraphQL query definitions for Sui prediction market data fetching.
 *
 * Queries are designed to replace raw RPC polling with efficient, cursor-based
 * pagination and typed event/object filtering.
 */

/**
 * Fetch market creation events with cursor-based pagination.
 * Used to discover all markets and paginate through them.
 *
 * Returns: marketId from event parsedJson, pagination cursors
 */
export const MARKETS_QUERY = `
  query FetchMarkets($after: String, $first: Int!) {
    events(
      filter: { eventType: $eventType }
      first: $first
      after: $after
    ) {
      edges {
        node {
          eventBcs
          parsedJson
          timestamp
          txDigest
          eventSeq
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

/**
 * Fetch a single market object by ID with full BCS-encoded content.
 * Used for detailed market information and state tracking.
 *
 * Returns: full Market struct fields (title, state, outcomes, etc.)
 */
export const MARKET_DETAIL_QUERY = `
  query FetchMarket($id: SuiAddress!) {
    object(address: $id) {
      address
      version
      digest
      owner {
        ... on AddressOwner {
          owner {
            address
          }
        }
      }
      display {
        key
        value
      }
      bcs {
        bcsBytes
      }
      asMoveObject {
        contents {
          type {
            repr
          }
          fields {
            marketNumber: field(key: "market_number")
            creator: field(key: "creator")
            title: field(key: "title")
            description: field(key: "description")
            resolutionText: field(key: "resolution_text")
            marketType: field(key: "market_type")
            resolutionClass: field(key: "resolution_class")
            trustTier: field(key: "trust_tier")
            outcomeCount: field(key: "outcome_count")
            outcomeLabels: field(key: "outcome_labels")
            closeTimeMs: field(key: "close_time_ms")
            resolveDeadlineMs: field(key: "resolve_deadline_ms")
            disputeWindowMs: field(key: "dispute_window_ms")
            state: field(key: "state")
            frozen: field(key: "frozen")
            createdAtMs: field(key: "created_at_ms")
            outcomeQuantities: field(key: "outcome_quantities")
            totalCollateral: field(key: "total_collateral")
            accruedFees: field(key: "accrued_fees")
            marketTypePolicyId: field(key: "market_type_policy_id")
            resolverPolicyId: field(key: "resolver_policy_id")
            configVersion: field(key: "config_version")
            emergencyPaused: field(key: "emergency_paused")
            sourceDeclaration: field(key: "source_declaration")
            creatorInfluence: field(key: "creator_influence")
          }
        }
      }
    }
  }
`;

/**
 * Fetch trade events for a specific market with pagination.
 * Used for market activity feed and historical trades.
 *
 * Returns: trade event data (trader, direction, outcome, amount, timestamp)
 */
export const MARKET_EVENTS_QUERY = `
  query FetchMarketEvents($eventType: String!, $after: String, $first: Int!) {
    events(
      filter: { eventType: $eventType }
      first: $first
      after: $after
    ) {
      edges {
        node {
          eventBcs
          parsedJson
          timestamp
          txDigest
          eventSeq
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

/**
 * Fetch user's owned objects of a specific type.
 * Used for positions, balance queries, etc.
 *
 * Returns: list of objects owned by address matching the StructType
 */
export const OWNER_OBJECTS_QUERY = `
  query FetchOwnerObjects(
    $owner: SuiAddress!
    $filter: ObjectFilter
    $after: String
    $first: Int!
  ) {
    objects(
      owner: $owner
      filter: $filter
      first: $first
      after: $after
    ) {
      edges {
        node {
          address
          version
          digest
          owner {
            ... on AddressOwner {
              owner {
                address
              }
            }
          }
          asMoveObject {
            contents {
              type {
                repr
              }
              fields {
                id: field(key: "id")
                marketId: field(key: "market_id")
                owner: field(key: "owner")
                outcomeIndex: field(key: "outcome_index")
                quantity: field(key: "quantity")
                netCostBasis: field(key: "net_cost_basis")
                createdAtMs: field(key: "created_at_ms")
              }
            }
          }
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

/**
 * Fetch coin balance for an address.
 * Used for SFR (Suffer coin) balance queries.
 *
 * Returns: total balance and coin count for specified coin type
 */
export const COIN_BALANCE_QUERY = `
  query FetchCoinBalance($owner: SuiAddress!, $coinType: String!) {
    coinConnection(
      owner: $owner
      coinType: $coinType
    ) {
      totalBalance
      edges {
        node {
          address
          balance
          coinObjectCount
        }
      }
    }
  }
`;

/**
 * Alternative: Fetch coins owned by an address of a specific type.
 * More granular than COIN_BALANCE_QUERY, useful if you need individual coin objects.
 */
export const OWNER_COINS_QUERY = `
  query FetchOwnerCoins(
    $owner: SuiAddress!
    $coinType: String!
    $after: String
    $first: Int!
  ) {
    coins(
      owner: $owner
      coinType: $coinType
      first: $first
      after: $after
    ) {
      edges {
        node {
          address
          balance
          coinObjectCount
          previousTransactionBlock {
            digest
          }
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;
