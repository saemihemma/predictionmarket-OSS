# Demo Mode — Mock Market Data

This directory contains mock market data used for demo mode. The frontend loads this data when no on-chain connection is available, allowing full UI exploration without deploying contracts.

## What Is Demo Mode?

Demo mode enables you to:

- Explore the entire frontend UI without Sui wallet or testnet access
- Test market creation, trading, staking, and voting flows
- Verify responsive design across devices
- Review visual elements (colors, typography, component layout)
- Prototype new features before on-chain implementation

## Running Demo Mode

```bash
cd frontend
npm install
npm run dev
# → localhost:5173
```

The frontend automatically loads mock data on startup. You'll see:

- **Market List:** 10-15 sample markets in various states (OPEN, CLOSED, DISPUTED, RESOLVED)
- **Trading Dashboard:** Sample positions, profit/loss calculations, trade history
- **Staking/Voting:** Mock SDVM voting interface with commit-reveal flows
- **Create Market Wizard:** Full 7-step market creation flow (doesn't actually deploy)

## Mock Data Structure

Mock data is organized as follows:

- **Markets:** Binary and categorical outcomes with realistic probabilities
- **Positions:** User holdings in various markets and their P&L
- **SDVM Votes:** Sample voting rounds in different phases (COMMIT, REVEAL, TALLY, SETTLED)
- **Staking:** Mock stakes with cooldown timers and pending disputes
- **User Portfolio:** Aggregated account stats (total value, win rate, earnings)

## Extending Mock Data

To add or modify mock markets:

1. Locate `mock-markets.ts` in `src/`
2. Add new market objects following the existing schema
3. Export them from `src/mock-data.ts`
4. Component files will automatically reference them

Example:

```typescript
const mockMarkets = [
  {
    id: "0x1234...",
    title: "Will EVE's economy hit 1B ISK by EOY?",
    outcomes: ["YES", "NO"],
    probabilities: [0.65, 0.35],
    volume: 50000,
    state: "OPEN",
    // ...
  },
  // Add more...
];
```

## Switching Between Demo and Live

The frontend checks for:
1. Environment variable `VITE_ENABLE_MOCK_DATA=true` (enables demo)
2. Valid Sui connection (if available, uses live chain)

In `.env.local`:
```
VITE_ENABLE_MOCK_DATA=true        # Enable demo
VITE_SUI_RPC_URL=https://...      # Live chain (optional)
```

## Limitations

Demo mode does **not** actually:

- Deploy contracts or interact with blockchain
- Execute trades or update positions
- Store data (all changes lost on refresh)
- Verify cryptographic signatures or voting hashes
- Charge or reward tokens

It is purely for **visual and UX testing**.

## Testing Checklist

Use demo mode to verify:

- [ ] Market list renders correctly at all breakpoints (desktop, tablet, mobile)
- [ ] Market cards display all required fields (title, outcomes, probabilities, volume, close time)
- [ ] Create market wizard completes all 7 steps without errors
- [ ] Trading panel calculates correct buy cost and sell proceeds
- [ ] Staking interface shows pool balance and pending rewards
- [ ] SDVM voting shows commit hash, reveal form, and tally results
- [ ] Colors match STYLEGUIDE.md (--mint, --orange, --tribe-b, --yellow)
- [ ] Typography is readable (no squinting; body font size is 15px)
- [ ] Footer contains all required links and displays correct package ID placeholder
- [ ] Responsive design stacks properly on mobile (< 768px)

## For Production

Before deploying to mainnet:

1. Remove mock data
2. Set `VITE_ENABLE_MOCK_DATA=false`
3. Connect to published contract package
4. Test with real wallet and transactions
5. Conduct security review of on-chain integration
