# Contributing to Frontier Prediction Market

Thank you for your interest in contributing! This document describes how to set up your development environment, follow coding standards, and submit contributions.

## Development Environment

### Prerequisites

- [Sui CLI](https://docs.sui.io/build/install) (Move 2024 edition)
- [Node.js](https://nodejs.org/) 18+ and npm
- Git

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/saemihemma/predictionmarket-OSS.git
   cd predictionmarket-OSS
   ```

2. Install dependencies for all components:
   ```bash
   # Frontend
   cd frontend
   npm install

   # Gas relay
   cd ../gas-relay
   npm install

   # Phase bot
   cd ../phase-bot
   npm install
   ```

3. Build contracts:
   ```bash
   cd ../contracts
   sui move build
   ```

4. Run tests (optional):
   ```bash
   sui move test
   ```

## Coding Standards

### Move (Contracts)

- Follow the [Sui Move Style Guide](https://docs.sui.io/concepts/sui-move-guide)
- Use meaningful variable names
- Add comments for complex logic
- Test with `sui move test`
- Ensure `sui move build` succeeds without warnings

### TypeScript (Frontend, Gas Relay, Phase Bot)

- Follow the existing code style (use Prettier if configured)
- Use TypeScript strict mode
- Add JSDoc comments for public functions
- Test with `npm run test` (if available)
- Reference `frontend/FRONTEND_ARCHITECTURE.md` for UI/UX conventions

### Documentation (Markdown)

- Use clear, concise language
- Include code examples where helpful
- Update relevant docs when changing behavior
- Use relative paths for internal links

## Development Workflow

### Creating a Branch

1. Branch from `main`:
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feature/your-feature-name
   ```

2. Use descriptive branch names:
   - `feature/multi-outcome-markets`
   - `fix/amm-precision-bug`
   - `docs/improve-architecture-guide`

### Making Changes

1. **For frontend changes:**
   - Follow `frontend/FRONTEND_ARCHITECTURE.md` for component conventions
   - Verify responsive design at 768px breakpoint
   - Test with mock data before connecting to contracts

2. **For contract changes:**
   - Add comments explaining non-obvious logic
   - Run `sui move test` to verify correctness
   - Update relevant docs in `docs/`

3. **For off-chain services (gas-relay, phase-bot):**
   - Ensure error handling and logging
   - Document environment variables in `.env.example`
   - Test with mock contract interactions

### Committing Changes

Write clear commit messages:

```
Short description (50 chars max)

Longer explanation of the change, including:
- What problem does this solve?
- How does it work?
- Any breaking changes?
```

Example:
```
Implement multi-outcome market creation UI

Add support for creating categorical markets with 3-16 outcomes.
Follows STYLEGUIDE.md for component design and color palette.
Extends pm_market.move::create_market to handle outcome_labels parameter.
```

### Submitting a Pull Request

1. Push your branch:
   ```bash
   git push origin feature/your-feature-name
   ```

2. Open a pull request on GitHub
   - Describe what you changed and why
   - Link any related issues
   - Include test results or screenshots (for UI changes)

3. Respond to review feedback
   - Address requested changes
   - Ask for clarification if needed
   - Push additional commits as needed

4. Maintainers will merge once approved

## Architecture Overview

### Smart Contracts (Move)

The contract package `prediction_market` contains 18 modules organized in layers:

- **Token Foundation:** `suffer.move` — SUFFER token and treasury
- **Market Core:** `pm_market.move`, `pm_trading.move`, `pm_math.move`, `pm_position.move`
- **Resolution & Dispute:** `pm_resolution.move`, `pm_dispute.move`
- **Voting & Staking:** `pm_sdvm.move`, `pm_staking.move`
- **Configuration:** `pm_registry.move`, `pm_policy.move`, `pm_admin.move`

Key modules:
- `pm_market.move` — Market creation and state transitions
- `pm_trading.move` — Buy/sell/claim/refund flows
- `pm_sdvm.move` — Commit-reveal voting (COMMIT → REVEAL → TALLY → SETTLED)
- `pm_staking.move` — Stake pool and slashing mechanics

For detailed architecture, see [PREDICTION_MARKET_ARCHITECTURE.md](docs/PREDICTION_MARKET_ARCHITECTURE.md) and [SDVM_ARCHITECTURE_PRINCIPLES.md](docs/SDVM_ARCHITECTURE_PRINCIPLES.md).

### Frontend (React + TypeScript)

- **Pages:** Market list, create market wizard, trading dashboard, staking/voting interface
- **Components:** Market cards, trading panels, outcome charts, vote commit/reveal forms
- **State:** React hooks (useState, useContext) for local state; SUI SDK for on-chain data
- **Styling:** Tailwind CSS with CRT theme tokens defined in `index.css`

See `frontend/FRONTEND_ARCHITECTURE.md` for component structure and conventions.

### Off-Chain Services

- **Gas Relay:** Node.js Express server sponsoring transactions so users don't need SUI tokens
- **Phase Bot:** Automated service advancing voting phases when deadlines pass

## Testing

### Frontend

- Enable mock data for UI exploration: set `ENABLE_MOCK_DATA = true` in `frontend/src/lib/mock/config.ts` (see [USE_MOCK_DATA.md](USE_MOCK_DATA.md))
- Run dev server: `cd frontend && npm run dev`
- Verify UI responsiveness at mobile (768px) and desktop widths

### Contracts

```bash
cd contracts
sui move test
```

Look for failing tests and fix before submitting PR.

### Integration

For full end-to-end testing, you'll need:
1. Sui testnet wallet with SUI and SUFFER tokens
2. Published contract package
3. Frontend configured to point to published package
4. Gas relay and phase bot running (optional)

## Common Contribution Areas

### Good First Issues

These are self-contained improvements that don't require deep system knowledge:

- **Extract hardcoded timeouts to env vars** — gas-relay has rate limits (DISPUTE_RATE_LIMIT, SENDER_RATE_LIMIT) and lease timeouts hardcoded in `lib/tx-validator.ts` and `lib/coin-pool.ts`. Phase-bot has transition buffer (30s) and backoff delays hardcoded in `bot.ts`. Move these to `.env.example` with sensible defaults. Entry: `gas-relay/src/lib/`, `phase-bot/src/bot.ts`

- **Mobile responsive design** — The frontend uses `768px` as the mobile breakpoint. Several pages need testing and layout fixes at narrow widths (cards should stack, grids collapse). Entry: `frontend/src/pages/`, `frontend/src/index.css`

- **Loading and empty states** — When `ENABLE_MOCK_DATA = false` and no contracts are deployed, pages show empty content with no explanation. Add "No markets yet" / "Connect wallet to see positions" / "Deploy contracts to get started" states. Entry: `frontend/src/pages/`

### Medium Complexity

- **Phase-bot event subscription** — The bot currently uses polling to detect phase deadlines. There's an intentional TODO for Sui event subscription integration, which would reduce latency and RPC load. Entry: `phase-bot/src/bot.ts` line ~668

- **Portfolio position enrichment** — `usePortfolio()` returns raw position data but needs parent market context (title, outcome labels, current price) to compute display values. Requires batching market fetches for each position. Entry: `frontend/src/hooks/useMarketData.ts`

- **Parser gaps** — `parseMarketFromSuiObject()` doesn't handle resolution records, proposals, disputes, or SDVM vote rounds. These are separate on-chain objects that need conditional fetching. Entry: `frontend/src/lib/market-types.ts` lines 321+, and the fetch chain documented in `USE_MOCK_DATA.md` §8.2

### Deeper Work

- **Multi-outcome market testing (N>2)** — The CPMM math supports up to 16 categorical outcomes but testing is limited to binary. Verify no u128 overflow in `pm_math.move::compute_product_except_iterative()`, add integration tests for N=3,4,5 outcome trading and disputes. Entry: `contracts/sources/pm_math.move`

- **Custom resolution sources** — Currently supports on-chain deterministic and verifier-declared sources. External API oracles (sports, weather, etc.) need tamper-proof data pipelines and resolver capability in `pm_source.move`. Entry: `contracts/sources/pm_source.move`

- **God lever decentralization** — 5 admin overrides exist for testnet safety, each with documented removal criteria. Contributions that validate these criteria or propose DAO governance alternatives are especially valued. See `docs/SDVM_ARCHITECTURE_PRINCIPLES.md`

## Questions or Issues?

- Read the [documentation index](docs/INDEX.md)
- Ask in [GitHub Discussions](https://github.com/saemihemma/predictionmarket-OSS/discussions)
- Report bugs in [GitHub Issues](https://github.com/saemihemma/predictionmarket-OSS/issues)
- Review existing issues before opening a new one

## Code of Conduct

Be respectful, inclusive, and constructive. We welcome contributors of all backgrounds and experience levels.

---

Thank you for contributing to Frontier Prediction Market!
