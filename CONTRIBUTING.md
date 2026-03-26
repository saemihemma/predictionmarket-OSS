# Contributing to Frontier Prediction Market

Thanks for contributing. This guide is written for engineers, reviewers, and operators who want to work against the current testnet stack without guessing about repo truth.

## Before You Start

Read these first:

- [README](README.md)
- [Docs Index](docs/INDEX.md)
- [Frontend Architecture](frontend/FRONTEND_ARCHITECTURE.md)
- [Security](SECURITY.md)

If your change touches protocol behavior, docs updates are part of the change.

## Prerequisites

- Node.js 22+
- npm
- Git
- Sui CLI with Move 2024 support
- Playwright Chromium for the accessibility smoke (`cd frontend && npm run test:a11y:install`)

## Local Setup

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

## Checks Before Opening a PR

GitHub Actions runs the same baseline on pull requests and `main`. Run the checks
that match your surface area locally before you open a PR.

For any cross-cutting or release-facing change, run:

```bash
cd frontend
npm run test:a11y:install
npm run build
npm run test:a11y

cd ../gas-relay
npm run build
npm test

cd ../phase-bot
npm run build
npm test

cd ../contracts
sui move build
sui move test

cd ..
node scripts/check-docs.mjs
```

If a command is red on `main`, call that out explicitly in the PR instead of
silently skipping it.

## Repo Conventions

### Documentation

- Keep canonical docs small and current.
- Archive historical planning material under `docs/archive/`.
- Do not leave public docs in a half-updated state.
- Prefer linking to canonical docs over copying the same explanation into multiple files.

### Frontend

- The frontend uses Tailwind v4 utilities plus terminal design tokens defined in `frontend/src/index.css`.
- Follow [frontend/FRONTEND_ARCHITECTURE.md](frontend/FRONTEND_ARCHITECTURE.md).
- Preserve keyboard reachability, visible focus states, and route landmarks.
- For public-route changes, run `npm run test:a11y`.

### Move Contracts

- Keep public entrypoints stable unless a change is intentionally breaking and documented.
- Prefer test fixes, lint cleanup, and truth-restoring edits over behavioral churn during hardening work.
- If a Move warning is intentionally left in place, document why.
- Bootstrap/setup helpers may locally allow specific lints when the sender-directed
  transfer or create-and-share pattern is the intentional testnet deploy shape.
- User-facing payout, refund, and claim warnings should remain visible until they
  are removed by a real composability refactor.

### Off-Chain Services

- Keep env contracts explicit in `.env.example` and docs.
- Fail closed for deployment-critical configuration.
- Do not add hidden allowlists or privileged bypasses.

## Pull Requests

A good PR should include:

- what changed
- why it changed
- what was verified
- any known risks or follow-up work

For UI changes, include screenshots or route-level notes.
For protocol or relay changes, include the exact commands run.

## Branching and Commits

- Branch from `main`
- Use descriptive branch names
- Keep commits readable and specific

Examples:

- `docs/sync-readme-with-architecture`
- `fix/move-sdvm-functional-tests`
- `feat/frontend-market-create-success-state`

## Good Contribution Areas

- docs accuracy and onboarding
- accessibility improvements on public routes
- stronger tests for Move, relay, and phase-bot surfaces
- performance or reliability work that does not weaken trust boundaries
- tooling that improves verification or release safety

## Open Protocol Cleanup Work

The main remaining Move lint debt is composability-related: some public payout and
refund flows still transfer coins directly to the transaction sender instead of
returning them to the caller for PTB orchestration.

Track and discuss that work in the public GitHub issue for Move composability
cleanup:

- [Move composability cleanup: replace sender-directed transfers with caller-directed returns](https://github.com/saemihemma/predictionmarket-OSS/issues/1)

## When to Stop and Escalate

Stop and ask for a design decision if:

- a cleanup requires changing a public Move interface
- docs and code disagree and the code intent is unclear
- a proposed simplification would hide a trust boundary or admin lever
- a reviewer would reasonably interpret the change as a behavior rewrite

## Questions

- Use GitHub Issues for bugs and feature requests
- Use Discussions for architecture and design questions
- Use the private security path in [SECURITY.md](SECURITY.md) for vulnerabilities
