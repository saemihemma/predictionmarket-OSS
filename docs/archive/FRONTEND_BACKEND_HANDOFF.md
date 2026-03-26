# Frontend / Backend Handoff

## Boundary

Backend owns:

- `contracts/`
- `scripts/`
- `deployments/`
- `gas-relay/`
- `phase-bot/`

Frontend owns:

- `frontend/src/pages`
- `frontend/src/components`
- layout, CSS, responsive behavior, page composition

This handoff defines the backend contract frontend should consume without needing more backend decisions.

## Static Inputs

Read these from `deployments/testnet.json`:

- `packageId`
- `collateralCoinType`
- `collateralSymbol`
- `collateralName`
- `collateralDecimals`
- `collateralIconUrl`
- `registryId`
- `configId`
- `treasuryId`
- `resolverSetId`
- `resolverPolicyId`
- `emergencyMultisigId`
- `stakingPoolId`
- `governanceTrackerId`
- `faucetId`
- `adminCapId`
- `emergencyCapId`
- `sdvmAdminCapId`
- `verifierCapId`
- `serviceUrls.gasRelay`
- `serviceUrls.phaseBotHealth`
- `serviceUrls.phaseBotReady`
- `marketTypePolicies`

Frontend should not derive `collateralCoinType` from `packageId`.
If `faucetId` is an empty string, treat the faucet as unavailable rather than inventing a `0x0` placeholder.
If any `serviceUrls.*` value is an empty string, treat that service as not deployed instead of falling back to a guessed public URL.

## Runtime Config

Treat `PMConfig<Collateral>` as the live source of economic truth.
Frontend should fetch the shared config object by `configId` and map these fields:

- `trading_fee_bps`
- `settlement_fee_bps`
- `creation_bond_canonical`
- `creation_bond_source_bound`
- `creation_bond_creator_resolved`
- `creation_bond_experimental`
- `dispute_bond_amount`
- `dispute_window_deterministic_ms`
- `dispute_window_declared_ms`
- `dispute_window_creator_ms`
- `min_market_duration_ms`
- `max_market_duration_ms`
- `max_outcomes`
- `creator_priority_window_ms`
- `liquidity_param`
- `version`

Do not read runtime economics from manifest JSON.

## Public Trust Model

Public create flow should expose:

- `Source-Backed Community`
- `Open Community`

Mapping:

- `Source-Backed Community` -> trust tier `creator_resolved`
- `Open Community` -> trust tier `experimental`

Source links are evidence metadata, not operator guarantees.

## Policy Lookup

Market policy is resolved via:

- `marketTypePolicies["trustTier:marketType:resolutionClass"]`

Expected public combinations:

- source-backed community binary -> `2:0:2`
- source-backed community categorical -> `2:1:2`
- open community binary -> `3:0:2`
- open community categorical -> `3:1:2`

## Faucet Contract

Shared object type:

- `pm_faucet::PMFaucet<Collateral>`

Relevant read fields:

- `starter_amount`
- `daily_amount`
- `paused`
- `available_balance`
- `total_claimed`
- `total_claim_count`
- `tracked_wallets`

User claim entrypoint:

- `pm_faucet::claim<Collateral>(faucet, clock, ctx)`

Admin entrypoints:

- `pause`
- `resume`
- `update_amounts`
- `top_up`
- `withdraw`

Expected product behavior:

- first claim gets starter amount
- later claims are limited to once per UTC day

## Relay Contract

Relay base URL:

- `serviceUrls.gasRelay`

Routes:

- `POST /v1/sponsor`
- `POST /v1/execute`
- `GET /health`

Relay should be used for:

- market create
- trade
- claim
- invalid refund
- creator/community proposal
- dispute
- faucet claim
- stake / unstake
- commit / reveal

Do not route admin or emergency actions through the sponsor path.

## Phase Bot Contract

Readiness URLs from manifest:

- `serviceUrls.phaseBotHealth`
- `serviceUrls.phaseBotReady`

UI expectations:

- use these for operator diagnostics only
- public user flows should not hard-fail page render if they are unavailable

## Operator Auth Model

Admin UI should key off actual owned capability objects, not only address equality.
Relevant owned objects:

- `PMAdminCap`
- `PMEmergencyCap`
- `SDVMAdminCap`
- `PMVerifierCap`

Treasury ownership alone is not sufficient admin auth.

## Rebuild Rules

Frontend needs a rebuild when:

- package/object/service IDs change
- collateral metadata changes
- a new family manifest is generated

Frontend does not need code edits when collateral changes if it already consumes:

- manifest static IDs
- `PMConfig` runtime economics
- manifest-driven token labels/icon/type
