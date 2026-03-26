# Accessibility Baseline

This document defines the minimum accessibility bar for the public frontend routes.

## Covered Routes

- `/`
- `/markets`
- `/markets/create`
- `/airdrop`

## Required Baseline

### Structure

- one clear page header
- one main landmark per route
- headings that reflect page structure instead of decorative text alone

### Keyboard

- primary actions must be reachable by keyboard
- interactive elements must have visible focus indication
- modal or picker surfaces must be closable by keyboard when appropriate

### Content

- decorative images use empty alt text
- informative images use meaningful alt text
- device restrictions must be stated explicitly when they affect task completion
- error and success states must be readable without relying on color alone

### Visual

- no contrast regressions in the terminal theme
- focus outlines must remain visible on dark backgrounds
- mobile desktop-only gating must be clear and not misleading

## Automated Smoke

Run:

```bash
cd frontend
npm run test:a11y:install
npm run test:a11y
```

This smoke checks:

- route rendering
- landmark presence
- basic keyboard reachability
- mobile airdrop desktop-only messaging
- axe-core violations on the public routes

## Manual Keyboard Checklist

Run this before broad public exposure:

1. Tab through `/markets` and confirm the create and airdrop actions are reachable.
2. Tab through `/markets/create` and confirm the wizard controls, date picker, and submit path remain reachable.
3. Tab through `/airdrop` on desktop and confirm claim, return, token copy, and link actions are reachable.
4. Open `/airdrop` on mobile width and confirm the desktop-only message is visible and the disabled claim action is clearly disabled.
5. Confirm focus remains visible on all primary buttons and links.

## Failure Policy

If a public-route accessibility smoke fails, treat that as release-facing work, not optional polish.
