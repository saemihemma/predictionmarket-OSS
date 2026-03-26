# Generic Collateral Ops

## Scope

This repo now treats the prediction market as a generic `Coin<T>` collateral protocol.
The active testnet collateral family is:

- `coinType`: `0xd28d9306a2d6ec2e8bf86e2a1804dc5ddea43e03a0ce63f55126fc172dff6cc0::suffer::SUFFER`
- `symbol`: `SFR`
- `name`: `SUFFER`
- `decimals`: `2`
- `iconUrl`: `https://orchestrator.wal.app/logo.png`

## New Rule

- Protocol logic changes require a package publish or upgrade.
- Collateral swaps do not require Move code edits.
- A collateral swap is:
  1. bootstrap a new family for the chosen `Coin<T>`
  2. write a fresh `deployments/testnet.json`
  3. rebuild or redeploy consumers

## Canonical Artifacts

- Canonical backend manifest: `deployments/testnet.json`
- Runtime economics source: on-chain `PMConfig<Collateral>`
- Backend deploy/bootstrap entrypoint: `scripts/deploy-protocol-family.ps1`
- Manual manifest patcher: `scripts/update-protocol-manifest.ps1`

## Manifest Contract

`deployments/testnet.json` is now for static IDs and service endpoints only.
It should contain:

- `network`
- `rpcUrl`
- `graphqlUrl`
- `manifestVersion`
- `manifestHash`
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
- `upgradeCapId`
- `deployerAddress`
- `operatorAddress`
- `serviceUrls.gasRelay`
- `serviceUrls.phaseBotHealth`
- `serviceUrls.phaseBotReady`
- `marketTypePolicies`

`configValues` is no longer part of the manifest contract.

## Runtime Config

Frontend and service consumers should read live economic values from `PMConfig<Collateral>`, not from generated JSON.
The live fields are:

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

## Trust Model Mapping

The public product promise is community-driven settlement:

- `creator_resolved` => `Source-Backed Community`
- `experimental` => `Open Community`

The public app should not promise operator-managed `verified` or `sourced` settlement.

## Market Policy Keys

`marketTypePolicies` is keyed as:

- `trustTier:marketType:resolutionClass`

Examples:

- `0:0:0` = canonical binary deterministic
- `0:1:0` = canonical categorical deterministic
- `2:0:2` = community binary creator-proposed
- `3:1:2` = open-community categorical creator-proposed

## Deployment Flow

Fresh family bootstrap:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\deploy-protocol-family.ps1 `
  -OperatorAddress "0x..." `
  -GasRelayUrl "https://relay.example" `
  -PhaseBotHealthUrl "https://bot.example/health" `
  -PhaseBotReadyUrl "https://bot.example/ready"
```

Reuse an already-published package:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\deploy-protocol-family.ps1 `
  -PackageId "0x..." `
  -OperatorAddress "0x..."
```

Patch the manifest without touching frontend code:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\update-protocol-manifest.ps1 `
  -PackageId "0x..." `
  -RegistryId "0x..." `
  -ConfigId "0x..." `
  -TreasuryId "0x..." `
  -ResolverSetId "0x..." `
  -ResolverPolicyId "0x..." `
  -EmergencyMultisigId "0x..." `
  -StakingPoolId "0x..." `
  -GovernanceTrackerId "0x..." `
  -FaucetId "0x..." `
  -AdminCapId "0x..." `
  -EmergencyCapId "0x..." `
  -SdvmAdminCapId "0x..." `
  -VerifierCapId "0x..." `
  -UpgradeCapId "0x..." `
  -DeployerAddress "0x..." `
  -OperatorAddress "0x..." `
  -GasRelayUrl "https://relay.example" `
  -PhaseBotHealthUrl "https://bot.example/health" `
  -PhaseBotReadyUrl "https://bot.example/ready" `
  -MarketTypePoliciesJson '{"0:0:0":"0x...","0:1:0":"0x...","1:0:1":"0x...","1:1:1":"0x...","2:0:2":"0x...","2:1:2":"0x...","3:0:2":"0x...","3:1:2":"0x..."}'
```

## Frontend Boundary

Backend deploy scripts no longer auto-sync or auto-build frontend unless explicitly asked with:

- `-SyncFrontendManifest`
- `-BuildFrontend`

That keeps backend deploys from colliding with parallel frontend work.
