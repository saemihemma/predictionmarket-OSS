# Frontier Prediction Market

Community-built prediction market infrastructure for EVE Frontier on Sui. The stack includes on-chain market contracts, a sponsored transaction relay, a phase bot for dispute automation, and a React frontend for market creation, trading, staking, and the SUFFER onboarding faucet.

This repository is public, testnet-first software. It is meant to be readable by contributors, Move reviewers, and colleagues evaluating the architecture before deeper protocol work.

## Current Status

- Network: Sui testnet
- Collateral family: external SUFFER (`SFR`)
- Frontend: live and manifest-driven
- Off-chain services: gas relay and phase bot
- Governance posture: testnet safety levers still exist and are documented
- Main trust boundary: on-chain package truth first, docs second

## Repository Map

```text
contracts/      Move package for markets, disputes, staking, faucet, and admin controls
frontend/       React + TypeScript app for markets, portfolio, create flow, and airdrop
gas-relay/      Sponsored transaction relay for public beta flows
phase-bot/      Service that advances SDVM voting phases on deadlines
docs/           Canonical architecture, runbook, security, and accessibility docs
tests/          Attack simulations and repo-level supporting tests
scripts/        Deployment, manifest sync, and repo integrity helpers
architecture.mermaid
                Canonical service graph for the public stack
```

The Move package currently contains 20 source modules in `contracts/sources/`, including the deploy/bootstrap surface, faucet support, market core, dispute flow, staking, and view helpers.

## Architecture Summary

The system has four public surfaces:

1. On-chain Move package for market lifecycle, trading, disputes, staking, and faucet flows.
2. Frontend for market discovery, create flow, airdrop onboarding, and portfolio views.
3. Gas relay for sponsored public-beta transactions.
4. Phase bot for SDVM phase advancement.

Use these as the canonical architecture references:

- [architecture.mermaid](architecture.mermaid)
- [Prediction Market Architecture](docs/PREDICTION_MARKET_ARCHITECTURE.md)
- [SDVM Architecture Principles](docs/SDVM_ARCHITECTURE_PRINCIPLES.md)

## Quick Start

### Prerequisites

- Node.js 22+
- npm
- Sui CLI with Move 2024 support
- Testnet SUI for local contract and ops work

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Gas Relay

```bash
cd gas-relay
npm install
npm run dev
```

### Phase Bot

```bash
cd phase-bot
npm install
npm run dev
```

### Contracts

```bash
cd contracts
sui move build
sui move test
```

## Health and Checks

GitHub Actions is the canonical repo health bar.

- contributor setup and pre-PR checks live in [Contributing](CONTRIBUTING.md)
- public-route accessibility expectations live in [Accessibility Baseline](docs/ACCESSIBILITY_BASELINE.md)
- architecture and trust-boundary review starts in [Prediction Market Architecture](docs/PREDICTION_MARKET_ARCHITECTURE.md)

## Documentation

Start here:

- [Docs Index](docs/INDEX.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)

Important canonical docs:

- [Prediction Market Architecture](docs/PREDICTION_MARKET_ARCHITECTURE.md)
- [SDVM Architecture Principles](docs/SDVM_ARCHITECTURE_PRINCIPLES.md)
- [Testnet Runbook](docs/SDVM_TESTNET_RUNBOOK.md)
- [Key Management](docs/SDVM_KEY_MANAGEMENT.md)
- [Accessibility Baseline](docs/ACCESSIBILITY_BASELINE.md)
- [Frontend Architecture](frontend/FRONTEND_ARCHITECTURE.md)

Historical and internal planning material lives under [docs/archive](docs/archive/README.md).

## Open Source Expectations

This repo is intended to be reviewable in public:

- docs should match current code reality
- contributor instructions should be runnable from a clean checkout
- testnet-only admin levers must be named explicitly, not hidden
- architectural claims should point back to code or the canonical diagrams

If you change behavior, update the matching docs in the same PR.

## Security

This is pre-mainnet software. Do not treat testnet deployment as a security sign-off.

- Report vulnerabilities privately via [SECURITY.md](SECURITY.md)
- Review the current trust model and known limitations before public deployment
- Do not introduce new privileged surfaces without documenting them

## License

MIT. See [LICENSE](LICENSE).

This is an independent community project and is not affiliated with or endorsed by CCP Games.
