# Frontier Prediction Market

Community-built prediction market infrastructure for EVE Frontier on Sui.
The stack includes one on-chain Move package, a manifest-driven React frontend,
a sponsored transaction relay, and a phase bot that advances SDVM rounds on
deadline.

This repository is public, testnet-first software. It is meant to stand up to
review by contributors, colleagues, and Move/Sui specialists without requiring
them to reverse-engineer the whole stack first.

## Current Status

- Network: Sui testnet
- Collateral family: external SUFFER (`SFR`)
- Public runtime surfaces: frontend, gas relay, phase bot, Move package
- Governance posture: testnet safety levers still exist and are documented
- Canonical repo health bar: GitHub Actions on `main`

## Repository Map

```text
contracts/       Move runtime modules and Move test modules
frontend/        React + TypeScript app for markets, portfolio, create flow, and airdrop
gas-relay/       Sponsored transaction relay for public-beta flows
phase-bot/       SDVM phase-advancement bot
deployments/     Live deployment manifests and service URLs
docs/            Canonical architecture, runbook, security, and accessibility docs
scripts/         Manifest sync, deployment, and repo-integrity helpers
Dockerfile       Frontend production image
architecture.mermaid
                 Canonical high-level service graph
```

## Architecture Summary

The system has four public runtime surfaces:

1. the on-chain Move package for market lifecycle, trading, disputes, staking, and faucet flows
2. the frontend for market discovery, create flow, portfolio, and airdrop onboarding
3. the gas relay for sponsored public-beta transactions
4. the phase bot for SDVM phase advancement

Start architecture review here:

- [architecture.mermaid](architecture.mermaid)
- [Prediction Market Architecture](docs/PREDICTION_MARKET_ARCHITECTURE.md)
- [SDVM Architecture Principles](docs/SDVM_ARCHITECTURE_PRINCIPLES.md)

## Quick Start

### Prerequisites

- Node.js 22+
- npm
- Sui CLI with Move 2024 support
- testnet SUI for local contract and ops work

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Gas Relay

```bash
cd gas-relay
cp .env.example .env
npm install
npm run dev
```

### Phase Bot

```bash
cd phase-bot
cp .env.example .env
npm install
npm run dev
```

### Contracts

```bash
cd contracts
sui move build
sui move test
```

## Health, Checks, and Releases

GitHub Actions is the canonical repo health bar.

- setup and pre-PR checks live in [Contributing](CONTRIBUTING.md)
- public-route accessibility expectations live in [Accessibility Baseline](docs/ACCESSIBILITY_BASELINE.md)
- live testnet manifests live in [deployments/testnet.json](deployments/testnet.json)
- deployment-contract notes live in [deployments/README.md](deployments/README.md)
- human-readable release history lives in [CHANGELOG.md](CHANGELOG.md)

## Documentation

Start here:

- [Docs Index](docs/INDEX.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)

Canonical runtime docs:

- [Prediction Market Architecture](docs/PREDICTION_MARKET_ARCHITECTURE.md)
- [Frontend Architecture](frontend/FRONTEND_ARCHITECTURE.md)
- [Gas Relay README](gas-relay/README.md)
- [Phase Bot README](phase-bot/README.md)
- [SDVM Testnet Runbook](docs/SDVM_TESTNET_RUNBOOK.md)
- [SDVM Key Management](docs/SDVM_KEY_MANAGEMENT.md)

Historical and internal planning material lives under [docs/archive](docs/archive/README.md).

## Open Source Expectations

This repo is intended to be reviewable in public:

- docs should match current code reality
- contributor instructions should be runnable from a clean checkout
- testnet-only admin levers must be named explicitly, not hidden
- architecture claims should point back to code or the canonical diagrams

If you change behavior, update the matching docs in the same PR.

## Security

This is pre-mainnet software. Do not treat testnet deployment as a security sign-off.

- report vulnerabilities privately via [SECURITY.md](SECURITY.md)
- review the current trust model and known limitations before public deployment
- do not introduce new privileged surfaces without documenting them

## License

MIT. See [LICENSE](LICENSE).

This is an independent community project and is not affiliated with or endorsed by CCP Games.
