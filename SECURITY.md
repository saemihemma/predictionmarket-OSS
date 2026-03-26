# Security Policy

This repository is pre-mainnet software. Report vulnerabilities privately and assume the public testnet deployment still carries bootstrap-era trust assumptions.

## Reporting a Vulnerability

Please do one of the following:

- open a private GitHub security advisory for this repository
- contact the maintainer directly with a confidential report

Include:

- clear description of the issue
- impact and affected surface
- reproduction steps or transaction details when possible
- suggested mitigation if you have one

Please do not post vulnerabilities publicly before coordination.

## Response Expectations

- acknowledgment target: within 48 hours
- initial triage target: within 7 days
- coordinated fix and disclosure target: severity-dependent

There is no formal paid bug bounty at the moment.

## In Scope

- Move contract correctness and access control
- token handling and bond accounting
- dispute, staking, and voting manipulation
- sponsored transaction abuse in the gas relay
- phase-bot actions that can alter dispute lifecycle behavior
- key-handling or deployment-trust mistakes that expose privileged actions

## Out of Scope

- general UX bugs
- feature requests
- spelling or documentation issues without security impact
- local test-only breakage with no production path

## Current Security Posture

This is the honest current state of the repo:

- testnet-first, not mainnet-ready
- admin and emergency levers still exist for bootstrap safety
- off-chain services are trusted parts of the deployed system
- no professional external audit has been completed yet
- `sui move test` must be green before presenting the protocol as technically hardened

## Known Trust Boundaries

Before broader exposure, reviewers should understand these boundaries:

- the Move package is the source of truth for market, staking, dispute, and faucet state
- the gas relay can deny service or restrict sponsored flows if misconfigured
- the phase bot is operationally important for timely SDVM phase advancement
- testnet admin and emergency caps are still part of the live control plane

These are documented, intentional testnet assumptions - not hidden decentralization claims.

## Mainnet Readiness Requirements

At minimum:

1. professional external audit
2. sustained testnet soak with realistic usage
3. green verification matrix from a clean checkout
4. explicit governance and de-privileging plan
5. documented incident and rollback procedures

## Secure Contribution Guidance

- avoid adding new privileged paths without documenting them
- prefer explicit configuration over hidden fallbacks
- test failure modes, not just happy paths
- keep docs aligned with real security posture
- do not describe testnet safety levers as if they are already decentralized

## Contact

For non-sensitive security process questions, use GitHub Discussions or Issues.
For actual vulnerabilities, use the private reporting path above.
