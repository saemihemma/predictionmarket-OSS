# Frontend

React + Vite frontend for the Frontier Prediction Market and SUFFER onboarding surfaces.

## Current Runtime Surface

The shipped app is manifest-driven:

- `src/main.tsx` initializes the runtime from the synced manifest
- `src/App.tsx` owns the routed surface
- `src/lib/client.ts` is GraphQL-first with a narrow RPC fallback for the few places that still need it

## Routes

Current routes in `src/App.tsx`:

- `/markets` - market index, filters, search, create, and airdrop entry points
- `/markets/create` - market creation wizard
- `/markets/:id` - market detail, trading, proposal, dispute, and resolved states
- `/portfolio` - positions plus claim and refund actions
- `/airdrop` - SUFFER faucet onboarding surface
- `/disputes/help` - dispute flow explainer

`/` redirects to `/markets`.

## Data Hooks

- `useAllMarkets()` paginates `MarketCreatedEvent` and loads market objects
- `useMarketData(id)` fetches a single market plus runtime protocol config
- `usePortfolio(address)` derives open, resolved, and claimable state from owned `PMPosition` objects
- `useMarketPositions(marketId)` powers the detail sidebar for a connected wallet

## Development

```bash
npm install
npm run dev
npm run build
npm run preview
```

## Maintained Checks

The maintained frontend release gate is:

```bash
npm run build
npm run test:a11y
```

If you add a new test surface, wire it into package scripts and CI instead of leaving it as an ad hoc tracked file.

## Known Limits

- wallet-required actions still need a real browser wallet for true end-to-end proof
- SDVM staking, voting, and rewards remain a placeholder UI surface
- portfolio history is reserved for a direct on-chain event feed
- mobile airdrop claiming is intentionally gated to desktop while EVE Vault support is desktop-only
