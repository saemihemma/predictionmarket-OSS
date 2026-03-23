# SUFFER Prediction Markets Frontend

React + Vite frontend for THE ORCHESTRATOR prediction market app.

## Current Status

- The shipped routes are wired to live Sui testnet GraphQL reads, with a temporary RPC fallback isolated to `src/lib/client.ts`.
- Shared mobile responsiveness has been audited across the routed UI.
- Market creation, portfolio, diagnostics, dispute help, and airdrop preview routes build and render cleanly.
- The dedicated SDVM staking / vote / reward UI is still a placeholder surface.

As of **March 21, 2026**, the published testnet package currently returns zero `MarketCreatedEvent` records, so `/markets` shows an honest empty state until live markets are seeded.

## Routes

- `/markets` — market index, filters, search, create and airdrop entry points
- `/markets/create` — seven-step market creation wizard
- `/markets/:id` — market detail, trading, proposal, dispute, and resolved states
- `/portfolio` — positions, claim / refund actions, proposal-required surfaces, staking placeholder, history placeholder
- `/airdrop` — locked preview surface for the SUFFER claim channel
- `/disputes/help` — dispute flow explainer
- `/markets/diagnostics` — protocol object and manifest diagnostics

## Live Data Hooks

- `useAllMarkets()` paginates `MarketCreatedEvent` and loads market objects
- `useMarketData(id)` fetches a single market plus runtime protocol config
- `usePortfolio(address)` derives open, resolved, and claimable portfolio state from owned `PMPosition` objects
- `useMarketPositions(marketId)` powers the detail sidebar for a connected wallet

## Development

```bash
npm install
npm run dev
npm run build
npm run preview
```

## Known Limitations

- Live testnet may be empty, which prevents end-to-end detail-flow QA from the market index
- Wallet-required actions need a real browser wallet and cannot be fully proven in a headless audit
- SDVM staking / voting / rewards remain placeholder UI
- Portfolio history is reserved for a direct on-chain event feed
- Airdrop claim is intentionally locked and not a live claim flow
