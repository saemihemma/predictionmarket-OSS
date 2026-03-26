# Frontend Architecture

This document describes the current frontend as it exists in code today.

## Stack

- Vite
- React 18
- TypeScript
- React Router
- React Query
- Mysten DApp Kit
- Tailwind CSS v4
- terminal design tokens defined in `src/index.css`

## Styling Truth

The frontend does **not** use an inline-styles-only system anymore.

Current styling model:

- Tailwind utility classes for layout, spacing, typography, and state
- CSS custom properties in `src/index.css` for terminal color tokens
- a small number of shared CSS classes for shell chrome and focus behavior

If docs and code disagree, the code wins and this file should be updated.

## Route Map

Current routed pages in `src/App.tsx`:

- `/markets`
- `/markets/create`
- `/markets/:id`
- `/portfolio`
- `/airdrop`
- `/disputes/help`

`/` redirects to `/markets`.

## Shared Shell

Key shared UI surfaces:

- `components/terminal/TerminalScreen.tsx`
- `components/ui/PageHeader.tsx`
- `components/ui/Footer.tsx`
- `components/ui/ConnectButton.tsx`
- `components/ui/WalletPicker.tsx`

The shell establishes the terminal theme, page chrome, wallet access, and common navigation patterns.

## Data and Runtime Model

The frontend is manifest-driven:

1. `main.tsx` initializes the protocol manifest
2. runtime clients are built from that manifest
3. routes fetch live chain and service data through hooks and helper libraries

Important source-of-truth files:

- `src/lib/protocol-config.ts`
- `src/lib/client.ts`
- `src/lib/market-constants.ts`
- `src/hooks/`

The repo no longer keeps a separate mock-data mode document. The maintained read
path is live GraphQL first with the narrow RPC fallback described above.

## Wallet and Sponsored Flow

Wallet connectivity comes from Mysten DApp Kit.

Key rules:

- do not invent hidden wallet defaults
- if a page has wallet-specific guidance, keep it explicit in that page
- sponsored flows should only use the relay-backed path already defined in the hooks and client helpers

Relevant surfaces:

- `src/hooks/useSponsoredTransaction.ts`
- `src/lib/gas-relay-client.ts`
- `src/lib/market-transactions.ts`
- `src/lib/faucet-transactions.ts`

## Accessibility Baseline

Public routes must preserve:

- a visible header and main landmark
- keyboard reachability for primary actions
- visible focus indication
- meaningful alt text only where imagery carries information
- explicit mobile/desktop gating where the user flow truly depends on device class

See:

- [../docs/ACCESSIBILITY_BASELINE.md](../docs/ACCESSIBILITY_BASELINE.md)

## Editing Rules

- prefer updating the existing route/component path instead of creating a parallel variant
- keep copy, docs, and runtime behavior in sync
- avoid introducing style systems that fight Tailwind plus design tokens
- preserve the terminal visual language unless the task is explicitly a redesign
- when behavior changes on a public route, update docs and run `npm run test:a11y`

## Release-Facing Checks

Before calling a frontend change review-ready:

```bash
npm run build
npm run test:a11y
```
