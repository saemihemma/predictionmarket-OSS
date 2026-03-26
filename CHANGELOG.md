# Changelog

This project is pre-mainnet and still moving quickly, so the changelog is kept
at the level of public repo and deployment-facing milestones rather than every
single internal change.

## 2026-03-26

### Repo hardening

- added GitHub Actions checks for docs, frontend, gas relay, phase bot, and contracts
- tightened public docs so README, CONTRIBUTING, architecture docs, and service READMEs match current code more closely
- added accessibility baseline documentation and public-route accessibility smoke coverage
- documented the remaining intentional Move lint tradeoffs without hiding them
- added issue templates, PR template, security routing, changelog, and code-of-conduct surfaces

### Repo cleanup

- removed stale frontend entrypoints and generated Vite timestamp artifacts
- removed unsupported or misleading ad hoc test surfaces from the default contributor path
- clarified that maintained verification lives with each owning surface and in CI
