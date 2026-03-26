# Security

This project is still pre-mainnet and testnet-first.

## Report a Vulnerability

Use one of these private paths:

- open a private GitHub security advisory for this repository
- contact the maintainer directly with a confidential report

Please do not disclose vulnerabilities publicly before coordination.

## Current Security Posture

- not mainnet-ready
- no professional external audit yet
- testnet admin and emergency levers still exist
- off-chain services are trusted parts of the live stack
- `sui move test` and the CI checks should be green before calling the repo hardened

## Scope

In scope:

- Move contract correctness and access control
- bond, fee, dispute, staking, and faucet abuse paths
- sponsored-transaction abuse in the gas relay
- phase-bot actions that alter dispute lifecycle timing
- operator or deployment mistakes that expose privileged behavior

Out of scope:

- general UX bugs
- feature requests
- spelling or docs issues without security impact

## Contact

- use GitHub Issues for non-sensitive questions
- use the private path above for actual vulnerabilities
