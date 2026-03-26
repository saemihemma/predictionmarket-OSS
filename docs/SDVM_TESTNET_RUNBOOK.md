# SDVM Testnet Runbook

## Purpose

This is the current backend runbook for the testnet-live prediction market stack:

- generic collateral prediction market package
- community-driven dispute flow
- SFR onboarding faucet
- gas relay
- phase bot

It replaces the older SUFFER-only phased rollout notes.

## Public Beta Model

- launch target: `Sui testnet`
- collateral: external `SFR`
- settlement: creator/community proposal, dispute, SDVM
- operator role: admin/emergency/testnet safety only
- public trust semantics: `community + sources`, not operator resolution

## Required On-Chain Objects

The active family must expose these IDs in `deployments/testnet.json`:

- `packageId`
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

## Operator Wallet Split

Expected custody model:

- deploy wallet keeps `UpgradeCap` only
- operator wallet holds:
  - `PMAdminCap`
  - `PMEmergencyCap`
  - `SDVMAdminCap`
  - `PMVerifierCap`
  - SFR inventory for faucet top-ups
  - enough testnet SUI for admin PTBs

## Deploy / Bootstrap

Run:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\deploy-protocol-family.ps1 `
  -OperatorAddress "0x..." `
  -GasRelayUrl "https://relay.example" `
  -PhaseBotHealthUrl "https://bot.example/health" `
  -PhaseBotReadyUrl "https://bot.example/ready"
```

What it does:

- switches CLI to testnet
- runs `sui move build` and `sui move test`
- publishes the package unless `-PackageId` is supplied
- bootstraps registry, config, treasury, resolver, policies, staking, governance tracker, and faucet
- hands admin/emergency/verifier caps to the operator wallet
- optionally prefunds the faucet from operator-owned SFR
- writes `deployments/testnet.json`

## Runtime Config Rules

- Static IDs come from `deployments/testnet.json`
- Live economics come from on-chain `PMConfig<Collateral>`
- Frontend should refetch `PMConfig` after admin updates
- Do not treat manifest `configValues` as canonical anymore

## Faucet Ops

The faucet is `starter + daily`:

- first claim gets `starter_amount`
- next claims are limited to one per UTC day and use `daily_amount`

Admin controls are on-chain:

- `pm_faucet::pause`
- `pm_faucet::resume`
- `pm_faucet::update_amounts`
- `pm_faucet::top_up`
- `pm_faucet::withdraw`

Health checks:

- faucet object exists
- `available_balance > 0`
- operator wallet still holds enough SFR to top up again

## Gas Relay Ops

Service endpoint contract:

- base URL in manifest: `serviceUrls.gasRelay`
- `GET /v1/faucet-eligibility`
- `POST /v1/sponsor`
- `POST /v1/execute`
- `GET /health`

Allowed public-beta modules:

- `pm_market`
- `pm_source`
- `pm_trading`
- `pm_resolution`
- `pm_dispute`
- `pm_faucet`
- `pm_staking`
- `pm_sdvm`

Allowed PTB plumbing:

- `SplitCoins`
- `MergeCoins`
- `MakeMoveVec`

Blocked classes:

- `Publish`
- `Upgrade`
- arbitrary `TransferObjects`
- admin/emergency flows

## Phase Bot Ops

Environment may come from `PM_MANIFEST_PATH` or explicit overrides.
The bot must know:

- `rpcUrl`
- `packageId`
- `collateralCoinType`
- `stakingPoolId`

The bot tracks:

- `SDVMVoteRoundCreatedEvent<Collateral>`

And advances:

- `COMMIT` expired -> `advance_to_reveal_phase`
- `REVEAL` expired -> `advance_to_tally_phase`
- `TALLY` -> `tally_votes(round, stakingPool, clock)`

Health endpoints:

- `/health`
- `/live`
- `/ready`

## Pre-Launch Checks

Before calling the stack live on testnet:

1. `sui move test` passes.
2. `gas-relay` build + test pass and sponsor wallet has testnet SUI.
3. `phase-bot` build + test pass and bot wallet has testnet SUI.
4. deployer wallet has enough testnet SUI to publish/bootstrap.
5. operator wallet has enough testnet SUI for admin actions.
6. operator wallet has SFR inventory for faucet top-ups.
7. `deployments/testnet.json` is v5 and has no `configValues`.
8. `faucetId` is non-empty for a live faucet launch.
9. `serviceUrls.gasRelay` is non-empty and relay `/health` is green.
10. `serviceUrls.phaseBotHealth` and `serviceUrls.phaseBotReady` are non-empty and both endpoints are green.

## Incident Response

Registry pause:

- use `PMAdminCap` to pause via `pm_registry::pause_registry`
- unpause after remediation via `pm_registry::resume_registry`

Faucet drain or abuse:

- pause faucet
- top up or update amounts
- resume faucet

Phase bot outage:

- restart the bot
- verify `/ready`
- if a round deadline was missed, rerun the matching on-chain phase transition manually

Relay outage:

- restore sponsor wallet funding
- restart relay
- confirm `/health`

## Current Known External Dependency

Fresh package publish on testnet requires enough SUI on the deploy wallet.
If publish fails with `InsufficientGas`, the backend code path is not the blocker anymore; the deploy wallet simply needs more testnet SUI before rerunning the deploy script.
