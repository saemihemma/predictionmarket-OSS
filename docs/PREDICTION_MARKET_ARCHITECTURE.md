# Prediction Market Architecture

This document is the canonical architecture overview for the current testnet stack.

## What This Is

Frontier Prediction Market is a Sui-based market stack with four public runtime surfaces:

1. Move package for market lifecycle, trading, disputes, staking, and faucet logic
2. React frontend for market discovery, create flow, portfolio, and airdrop onboarding
3. Gas relay for sponsored public-beta transaction paths
4. Phase bot for SDVM phase advancement

The code is testnet-live. Docs should match code, not the other way around.

## Canonical Service Graph

Use the root diagram as the canonical high-level graph:

- [../architecture.mermaid](../architecture.mermaid)

This document explains the same architecture in prose so contributors and reviewers can navigate the repo without reverse-engineering every module first.

## On-Chain Package

The `prediction_market` package currently includes 20 Move source modules in `contracts/sources/`.

### Core groups

- Market core: `pm_market`, `pm_trading`, `pm_math`, `pm_position`
- Resolution and disputes: `pm_resolution`, `pm_dispute`, `pm_source`
- Voting and staking: `pm_sdvm`, `pm_staking`
- Configuration and admin: `pm_registry`, `pm_policy`, `pm_rules`, `pm_admin`, `pm_treasury`, `pm_events`, `pm_view`, `pm_deploy`
- Supporting flows: `pm_faucet`, `swap_pool`

### Runtime truth

- market state lives on-chain
- bond and fee rules come from on-chain config objects
- public beta flow still uses testnet admin and emergency levers
- the package is generic over the external collateral family used by the deployment

## Frontend

The frontend is a Vite + React + TypeScript app that reads a synced protocol manifest and then fetches live data from the deployed family.

Primary user-facing routes:

- `/markets`
- `/markets/create`
- `/markets/:id`
- `/portfolio`
- `/airdrop`
- `/disputes/help`

Key frontend architectural traits:

- Tailwind v4 utilities with terminal design tokens in `frontend/src/index.css`
- React Router route-level pages
- React Query for remote data orchestration
- Mysten DApp Kit for wallet connectivity
- sponsored execution path for selected public-beta transactions

See [../frontend/FRONTEND_ARCHITECTURE.md](../frontend/FRONTEND_ARCHITECTURE.md) for component and data-layer details.

## Gas Relay

The gas relay is an Express service that sponsors a narrow allowlist of public-beta actions.

Responsibilities:

- validate sponsored transaction shape
- reject out-of-policy calls
- sponsor and execute approved transactions
- expose health state used by the frontend and operators

This service is part of the deployed trust boundary. It is not just convenience infrastructure.

## Phase Bot

The phase bot monitors vote rounds and advances them when deadlines pass.

Responsibilities:

- detect expired COMMIT phases
- detect expired REVEAL phases
- trigger tally when ready
- expose health and readiness endpoints

The bot is operationally important but does not define protocol truth. On-chain state remains authoritative.

## Testnet-Only Admin Levers

The repo should be honest about these:

- registry pause and resume
- emergency dispute or resolution overrides
- staking admin controls
- faucet pause, amount updates, and top-ups

These are bootstrap and safety levers, not evidence of finished decentralization.

## Current Move Lint Tradeoffs

The Move package now builds and tests cleanly, but a few lints still surface in
review.

Two categories matter:

- intentional bootstrap/setup helpers
  - some create-and-share or deploy-time helper flows are intentionally local,
    testnet-oriented, and may carry a function-level lint allow with an
    explanation
- remaining composability debt
  - some user-facing payout, refund, and claim flows still transfer coins
    directly to the transaction sender instead of returning them to the caller
    for PTB orchestration

Those remaining warnings are not hidden or accidental. They are current design
tradeoffs, not build failures, and they should stay visible until a real
composability refactor removes them. The public follow-up thread is tracked in
[issue #1](https://github.com/saemihemma/predictionmarket-OSS/issues/1).

## Contributor Map

If you are new to the repo:

- start with [../README.md](../README.md)
- use [SDVM Architecture Principles](SDVM_ARCHITECTURE_PRINCIPLES.md) for dispute and voting review
- use [SDVM Testnet Runbook](SDVM_TESTNET_RUNBOOK.md) for deployment and live-ops context
- use [../CONTRIBUTING.md](../CONTRIBUTING.md) for contributor checks and the current open cleanup work
