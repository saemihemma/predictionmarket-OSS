# Using Mock Data

Sample data is included so contributors can explore the UI without deployed contracts.

## How to Enable

One file: `frontend/src/lib/mock/config.ts`

```typescript
export const ENABLE_MOCK_DATA = true;   // sample markets, positions, stats
// export const ENABLE_MOCK_DATA = false; // empty state, ready for live RPC (default)
```

## What It Does

When `true`, hooks return hardcoded markets, positions, and stats from `lib/mock/`:

```
Pages → useMarketData hooks → lib/mock/markets.ts + lib/mock/positions.ts
```

When `false` (default), hooks return empty arrays / undefined — ready for live RPC:

```
Pages → useMarketData hooks → SuiClient RPC → parseMarketFromSuiObject()
```

Pages consume `{ market, isLoading, error }` from hooks and don't know the difference.

## Mock Data Files

| File | Contents |
|------|----------|
| `lib/mock/config.ts` | Kill switch (`ENABLE_MOCK_DATA`) |
| `lib/mock/markets.ts` | 12 sample markets across all states (OPEN, CLOSED, DISPUTED, RESOLVED) |
| `lib/mock/positions.ts` | 5 sample portfolio positions (open, claimable, losing) |

## What Else Uses Mock State

| Component | Mock behavior | Live replacement |
|-----------|--------------|-----------------|
| `ConnectButton.tsx` | Local `useState` with fake address `0xce7c...2fa` and `1,234 SFR` | `@mysten/dapp-kit-react` `useCurrentAccount()` + balance query |
| `MarketCreatePage.tsx` `handleSubmit()` | `console.log(formData)` | `sui:client moveCall` to `create_market` entry function |
| `MarketDetailSidebar.tsx` | `Math.random()` for price impact / activity | Derive from AMM pool state |
| `PortfolioStaking.tsx` | `MOCK_STAKE` constant | `useStaking()` hook with on-chain query |
| `PortfolioHistory.tsx` | `MOCK_HISTORY` constant | Event query for user transactions |

---

## 3. The Parser Already Exists

The handover says "Mock-to-RPC data mapper missing" — **this is wrong.** A parser already exists:

```
File:  src/lib/market-types.ts
Lines: 321-383  parseMarketFromSuiObject(obj: any): Market | null
```

It handles:
- snake_case → camelCase field mapping
- u8 enum → numeric TypeScript enum casting
- Balance objects → BigInt extraction (`fields.total_collateral?.fields?.value`)
- Nested struct unpacking (SourceDeclaration, CreatorInfluence)
- outcome_quantities string[] → BigInt[]

**What it does NOT handle:**
- `resolution` field — returns `null`, says "Populated separately via dynamic field fetch"
- `proposal`, `dispute`, `sdvm` — not parsed (these are frontend-only composites from multiple on-chain objects)
- `userPosition` — not parsed (requires separate PMPosition query)
- `creatorPriorityWindowMs` — not parsed (derived field)
- `creation_bond` — not mapped (Balance on-chain, not in Market interface)
- `community_resolution_bond` / `community_resolution_proposer` — not mapped

---

## 4. Hook-by-Hook Switch Plan

### 4.1 `useAllMarkets()` — Market Index

**Current:** Returns `mockMarkets` array synchronously.

**Target:**
```typescript
export function useAllMarkets() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const client = new SuiClient({ url: SUI_RPC_URL });
    client.getOwnedObjects({
      owner: PM_REGISTRY_ADDRESS,    // or queryEvents for MarketCreated
      filter: { StructType: `${PM_PACKAGE_ID}::pm_market::PMMarket` },
      options: { showContent: true },
    })
    .then(response => {
      const parsed = response.data
        .map(obj => parseMarketFromSuiObject(obj))
        .filter(Boolean) as Market[];
      setMarkets(parsed);
    })
    .catch(setError)
    .finally(() => setIsLoading(false));
  }, []);

  return { markets, isLoading, error };
}
```

**Key decisions needed:**
- PMMarket objects are `key` (not `key, store`) — they're owned by creator, not shared. Query strategy: `getOwnedObjects` per-creator won't scale. Need either:
  - (a) Event indexing: query `MarketCreated` events, collect IDs, batch `multiGetObjects`
  - (b) Shared registry object: PMRegistry stores market IDs (check if this exists)
  - (c) Off-chain indexer: separate service that tracks all markets

**Pagination:** Mock returns all markets at once. RPC will need cursor-based pagination via `response.nextCursor`.

### 4.2 `useMarketData(id)` — Single Market

**Current:** `getMockMarket(id)` — synchronous lookup.

**Target:**
```typescript
export function useMarketData(id: string) {
  const [market, setMarket] = useState<Market | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const client = new SuiClient({ url: SUI_RPC_URL });
    client.getObject({
      id,
      options: { showContent: true },
    })
    .then(response => {
      const parsed = parseMarketFromSuiObject(response);
      if (parsed) {
        // Enrich with derived fields
        const creatorPriorityDeadlineMs = parsed.closeTimeMs + 86400000;
        const timeUntilCommunityCanProposeMs = Math.max(0, creatorPriorityDeadlineMs - Date.now());
        setMarket({
          ...parsed,
          creatorPriorityDeadlineMs: creatorPriorityDeadlineMs,
          timeUntilCommunityCanProposeMs,
        } as Market & { creatorPriorityDeadlineMs: number; timeUntilCommunityCanProposeMs: number });
      }
    })
    .catch(setError)
    .finally(() => setIsLoading(false));
  }, [id]);

  return { market, isLoading, error };
}
```

**Additional queries needed for full market detail:**
1. Resolution record — dynamic field on PMMarket (separate `getDynamicFieldObject` call)
2. Proposal/dispute — may be separate objects or events; depends on Move implementation
3. SDVM vote round — `SDVMVoteRound` is a shared object, query by dispute_id
4. User position — `PMPosition` owned by user, filter by market_id

### 4.3 `usePortfolio()` — User Positions

**Current:** Hardcoded 5 mock positions inside the hook body.

**Target:**
```typescript
export function usePortfolio(userAddress: string) {
  // Query all PMPosition objects owned by userAddress
  // Then for each position, fetch the market title (batch via multiGetObjects)
  // Map to Position interface
}
```

**Shape mismatch:**
| Hook Position field | On-chain PMPosition field | Transform |
|---|---|---|
| `marketId` | `market_id` | ID → string |
| `marketTitle` | *(not on position)* | Separate market fetch required |
| `outcome` | `outcome_index` | Index → outcomeLabels[index] (requires market fetch) |
| `shares` | `quantity` | u64 → bigint |
| `value` | *(not on position)* | Compute: quantity × current price from pool |
| `pnl` | `net_cost_basis` | Compute: value - net_cost_basis |
| `state` | *(derived)* | From parent market state: OPEN→"open", RESOLVED+won→"claimable", etc. |

This is the most complex hook to switch because every position requires its parent market context.

### 4.4 `useMarketStats()` — Aggregate Stats

**Current:** Derives from `useAllMarkets()` + `usePortfolio()` + 35 fake random addresses.

**Target:** Needs an indexer or event aggregation query. Individual RPC calls won't give you "active traders" efficiently.

**Options:**
- (a) Derive from events: count unique addresses in `MarketTraded` events (expensive RPC)
- (b) Off-chain indexer: best for real-time stats
- (c) Keep derived from `useAllMarkets()` for now, drop fake trader count, show real market count + volume

**Recommendation:** Option (c) for testnet launch. Indexer for mainnet.

---

## 5. On-Chain → TypeScript Field Mapping Reference

### PMMarket (Move) → Market (TypeScript)

| Move field (snake_case) | TS field (camelCase) | Type transform |
|---|---|---|
| `id` | `id` | UID → `obj.data.objectId` string |
| `market_number` | `marketNumber` | u64 → number |
| `creator` | `creator` | address → string |
| `title` | `title` | String → string |
| `description` | `description` | String → string |
| `resolution_text` | `resolutionText` | String → string |
| `market_type` | `marketType` | u8 → MarketType (numeric enum) |
| `resolution_class` | `resolutionClass` | u8 → ResolutionClass |
| `trust_tier` | `trustTier` | u8 → TrustTier |
| `outcome_count` | `outcomeCount` | u16 → number |
| `outcome_labels` | `outcomeLabels` | vector\<String\> → string[] |
| `source_declaration` | `sourceDeclaration` | nested struct → SourceDeclaration |
| `creator_influence` | `creatorInfluence` | nested struct → CreatorInfluence |
| `close_time_ms` | `closeTimeMs` | u64 → number |
| `resolve_deadline_ms` | `resolveDeadlineMs` | u64 → number |
| `dispute_window_ms` | `disputeWindowMs` | u64 → number |
| `state` | `state` | u8 → MarketState (numeric enum) |
| `frozen` | `frozen` | bool → boolean |
| `created_at_ms` | `createdAtMs` | u64 → number |
| `outcome_quantities` | `outcomeQuantities` | vector\<u64\> → bigint[] |
| `total_collateral` | `totalCollateral` | Balance\<SUFFER\> → bigint (`.fields.value`) |
| `accrued_fees` | `accruedFees` | Balance\<SUFFER\> → bigint (`.fields.value`) |
| `total_cost_basis_sum` | `totalCostBasisSum` | u64 → bigint |
| `invalidation_snapshot_collateral` | `invalidationSnapshotCollateral` | Option\<u64\> → bigint \| null |
| `emergency_paused` | `emergencyPaused` | bool → boolean |
| `market_type_policy_id` | `marketTypePolicyId` | ID → string |
| `resolver_policy_id` | `resolverPolicyId` | ID → string |
| `config_version` | `configVersion` | u64 → number |
| `resolution` | `resolution` | Option\<PMResolutionRecord\> → ResolutionRecord \| null |

### PMPosition (Move) → Position (TypeScript)

| Move field | TS field | Type transform |
|---|---|---|
| `id` | `id` | UID → string |
| `market_id` | `marketId` | ID → string |
| `owner` | `owner` | address → string |
| `outcome_index` | `outcomeIndex` | u16 → number |
| `quantity` | `quantity` | u64 → bigint |
| `net_cost_basis` | `netCostBasis` | u64 → bigint |
| `created_at_ms` | `createdAtMs` | u64 → number |

### Balance\<SUFFER\> Extraction

Sui serializes Balance objects as nested structs. The parser handles this:
```typescript
BigInt(fields.total_collateral?.fields?.value ?? fields.total_collateral ?? 0)
```

Both paths are needed because the RPC may return the raw value or the nested form depending on `showContent` options and Sui version.

---

## 6. Gaps in the Parser

Things `parseMarketFromSuiObject()` doesn't currently handle that will be needed:

1. **Resolution record** — Stored as `Option<PMResolutionRecord>` on-chain. Parser returns `null`. Need to either:
   - Parse inline if the Option is populated in the object response
   - Fetch via dynamic field if stored separately

2. **Proposal / Dispute / SDVM** — These are composite frontend fields assembled from multiple on-chain objects. The hook needs to:
   - Query dispute objects by market_id
   - Query SDVMVoteRound by dispute_id
   - Assemble into ProposalData, DisputeData, SDVMData interfaces

3. **creation_bond / community_resolution_bond** — On-chain Balance fields not mapped to the TS Market interface. If needed for UI (e.g., showing bond amounts), add to Market interface or fetch separately.

4. **creatorPriorityWindowMs** — Currently hardcoded to 86400000 in both mock and hook enrichment. On-chain, this might come from PMResolverPolicy. Confirm source.

---

## 7. Implementation Order

```
1. ✅ Fix V1 (MarketDetailPage direct import)      — DONE 2026-03-20
2. ✅ Fix V2 (delete stale index.ts mock exports)    — DONE 2026-03-20
3. ✅ Fix V3 (rename mockPositions variable)        — DONE 2026-03-20
4. Add SuiClient dependency                        — npm install @mysten/sui.js
5. Create src/lib/sui-config.ts                    — RPC URL, package ID, registry address
6. Switch useAllMarkets()                          — needs market discovery strategy decision
7. Switch useMarketData(id)                        — straightforward, parser exists
8. Switch usePortfolio(userAddress)                — complex, needs market context per position
9. Switch useMarketStats()                         — derive from live useAllMarkets for now
10. Add real loading/error states to all hooks     — useState + useEffect pattern
11. Replace handleSubmit in MarketCreatePage       — V4: moveCall to create_market
12. Replace ConnectButton mock state               — V5: dapp-kit useCurrentAccount()
13. Test with deployed testnet contracts
```

Steps 1-3 are done. Steps 6-12 can be done incrementally (one hook at a time, others stay mock). The interface contract means pages don't care which hooks are live vs mock.

---

## 8. Resolved Design Decisions

### 8.1 Market Discovery — Sui GraphQL + Event Indexing

**Decision:** Use Sui GraphQL API to query `MarketCreatedEvent` events, collect market IDs, then `multiGetObjects` to batch-fetch all market objects.

**Why:**
- PMMarket is a **shared object** (`transfer::share_object` in pm_market.move:606). Every market is globally addressable.
- PMRegistry tracks `total_markets_created` (a counter) but does **not** store market IDs. Events are the registry.
- GraphQL gives filtering, field selection, and cursor pagination in one query. Fewer round trips than raw RPC `queryEvents`.
- At testnet scale (<500 markets), `multiGetObjects` with all IDs is one call. No dedicated indexer needed.
- At mainnet scale (10k+), add a lightweight indexer service. That's a future problem.

**Implementation pattern for `useAllMarkets()`:**
```typescript
// 1. Query all MarketCreatedEvent events via GraphQL
const events = await graphqlClient.query({
  events: {
    filter: { MoveEventType: `${PM_PACKAGE_ID}::pm_market::MarketCreatedEvent` },
    // cursor pagination if needed
  }
});

// 2. Extract market IDs
const marketIds = events.map(e => e.parsedJson.market_id);

// 3. Batch fetch all market objects
const objects = await suiClient.multiGetObjects({
  ids: marketIds,
  options: { showContent: true },
});

// 4. Parse each through existing parser
const markets = objects
  .map(obj => parseMarketFromSuiObject(obj))
  .filter(Boolean);
```

### 8.2 Proposal/Dispute/SDVM — Data Hierarchy

**Decision:** Resolution is inline on the market object. Disputes and SDVM rounds are separate objects fetched conditionally.

Confirmed from contract code:

| Data | Storage | Fetch cost |
|---|---|---|
| **Resolution** | Inline field on PMMarket: `resolution: Option<PMResolutionRecord>` | Free — comes with any `getObject` call |
| **Dispute** | Separate object: `PMDispute has key`, linked via `market_id: ID` | 1 extra call, only when `state == DISPUTED` |
| **SDVM Vote Round** | Separate shared object: `SDVMVoteRound has key`, linked via `dispute_id: ID` (stored on PMDispute as `sdvm_vote_round_id: Option<ID>`) | 1 extra call, only when dispute has escalated to SDVM |

**Fetch chain for `useMarketData(id)`:**
```
getObject(market_id) → PMMarket (includes resolution inline)
  → if state == DISPUTED:
      queryEvents(DisputeFiledEvent, { market_id }) → dispute_id
      getObject(dispute_id) → PMDispute
        → if sdvm_vote_round_id.is_some():
            getObject(sdvm_vote_round_id) → SDVMVoteRound
```

Most markets will be OPEN or RESOLVED — one call. Disputed markets cost 2-3 calls. Acceptable.

### 8.3 Wallet Integration — Already Wired

**Decision:** No additional setup needed.

`package.json` already includes:
- `@mysten/dapp-kit-react` (^2.0.0) — wallet connection hooks, `useCurrentAccount()`
- `@mysten/sui` (^2.0.0) — SuiClient for RPC/GraphQL

`ConnectButton` component exists (deduplicated 2026-03-20, now owns connect/disconnect state + dropdown). Replace internal `useState` mock with `useCurrentAccount()` from dapp-kit for wallet address and `useSuiClientQuery` for balance.

### 8.4 Data Freshness — 30s Poll, Same Fetch Path

**Decision:** One shared fetch function per hook. Called on mount, on 30s interval, and after user's own transactions. No event subscriptions. No WebSocket.

**Why:** Users sitting on a page need to see new markets and price changes without manually refreshing. At hackathon scale the cost is negligible (~1 GraphQL call per user per 30s), and it makes the app feel alive during demos.

**Critical rule: one fetch function, multiple callers.** The 30s poll must use the exact same GraphQL query and parser as the initial page load. No separate code paths. This keeps the data shape identical regardless of how the fetch was triggered.

**Pattern (applies to all hooks):**
```typescript
export function useAllMarkets() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Single fetch function — used by mount, interval, and manual refresh
  const fetchMarkets = useCallback(async () => {
    try {
      // Same GraphQL query as section 8.1
      const events = await graphqlClient.query({ /* MarketCreatedEvent */ });
      const marketIds = events.map(e => e.parsedJson.market_id);
      const objects = await suiClient.multiGetObjects({
        ids: marketIds,
        options: { showContent: true },
      });
      const parsed = objects
        .map(obj => parseMarketFromSuiObject(obj))
        .filter(Boolean) as Market[];
      setMarkets(parsed);
      setError(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMarkets();                              // initial load
    const id = setInterval(fetchMarkets, 30000); // 30s poll
    return () => clearInterval(id);              // cleanup
  }, [fetchMarkets]);

  return { markets, isLoading, error, refetch: fetchMarkets };
}
```

**The three triggers:**
1. **Mount** — `useEffect` fires `fetchMarkets()` on first render.
2. **Interval** — `setInterval` re-fires the same function every 30s.
3. **Post-action** — After a user's TX confirms, call `refetch()` from the hook return value for immediate update.

All three execute the same function. Same GraphQL query, same parser, same state update. No divergence possible.

**Why not event subscriptions or WebSocket:** Overengineering. The 30s poll covers the "someone else created a market" case. The post-action `refetch()` covers the "I just traded" case. Together they handle every scenario at this scale.

**When to revisit:** If RPC costs become a concern at mainnet scale (thousands of concurrent users), switch the interval to a longer period or add conditional polling (only poll if tab is focused). Not before.

---

**End of document**
