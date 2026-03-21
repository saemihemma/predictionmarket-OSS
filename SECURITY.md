# Security Policy

This document describes how to report security vulnerabilities responsibly and what is covered by our security process.

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please file a private security advisory on GitHub or contact the maintainer directly. When reporting, include:

- **Subject:** "[Frontier Prediction Market] Security Vulnerability Report"
- **Description:** Clear, detailed explanation of the vulnerability
- **Impact:** What could an attacker accomplish?
- **Reproduction:** Steps to reproduce (if possible)
- **Proof of Concept:** Code or transaction hash (optional but helpful)
- **Your Contact:** Name and way to reach you

**Please do not:**
- Open a public GitHub issue
- Post on Discord, Twitter, or other public channels
- Deploy or test the vulnerability on mainnet
- Attempt to exploit the vulnerability for gain

**We will:**
- Acknowledge receipt within 48 hours
- Triage and investigate the vulnerability
- Keep you informed of progress
- Credit you in the advisory (unless you prefer anonymity)
- Aim to release a fix within 30 days of confirmation

## What to Report

**Report these issues:**
- Smart contract bugs (integer overflow, access control bypass, reentrancy, etc.)
- Token handling vulnerabilities (minting/burning without authorization, balance issues)
- Cryptographic weaknesses (signature verification failures, hash collision exploits)
- Access control issues (unauthorized state transitions, private key exposure)
- Vote manipulation in SDVM (commit-reveal bypass, tally manipulation)
- Staking or slashing logic exploits (unfair slash rates, reward duplication)
- Oracle or price feed attacks (on-chain CPMM manipulation, deterministic outcome exploits)

**Do not report these:**
- UI bugs or usability issues
- Performance or gas optimization suggestions
- Feature requests
- Documentation improvements
- General design questions or feedback

For non-security issues, use [GitHub Issues](https://github.com/saemihemma/predictionmarket-OSS/issues).

## Security Considerations

### Pre-Mainnet Status

This software is **pre-mainnet** and not yet battle-tested. Before deploying to mainnet:

1. **Conduct a professional security audit** — Hire a reputable blockchain security firm to audit all Move contracts
2. **Run extensive testnet testing** — Deploy to Sui testnet for 3+ months with realistic market volumes
3. **Monitor metrics** — Track voter participation (GAT thresholds), slashing events, dispute patterns, and resolution accuracy
4. **Validate parameters** — Ensure bond amounts, slash rates, and voting timers are appropriate for your use case
5. **Establish governance** — Create a process for updating parameters, pausing markets, or invalidating disputes via multisig

### Known Limitations

- **Low voter participation is a system risk:** The 65% supermajority applies only to *revealed* votes. If only 10% of stakers participate, an attacker needs just 6.5% of total stake. The GAT thresholds (5%→3%→1% per roll) provide some defense, but monitor participation closely.
- **God levers exist on testnet:** Admin controls (AdminResolve, AdminSlashOverride, AdminQuorumOverride) are necessary for bootstrap but represent centralization risk. Remove these for mainnet.
- **No formal verification:** Move contracts have been reviewed but not formally verified. Critical functions should be audited by experts.
- **Off-chain services are trusted:** The gas relay and phase bot are off-chain. A compromised relay can deny service. A compromised bot can delay phase transitions. Monitor and secure these carefully.

### Slashing & Economic Security

- **Incorrect votes:** Slashed 0.1% of stake
- **Non-reveals:** Slashed 1% of stake (10x penalty for low participation)
- **Emergency unstake:** 5% penalty

If participation is low, slashing amounts may not incentivize correct voting. Monitor and adjust parameters via god levers before mainnet.

### Staking Cooldown

Users have a **48-hour cooldown** after unstaking before they can claim their stake. This prevents "vote and exit" attacks. However, users can still exit before disputed markets are fully resolved if they filed disputes before unstaking.

### Three-Tier Resolution

The four-tier resolution system is:

1. **Deterministic (on-chain data)** — Highest trust
2. **Declared Source (verifier)** — Moderate trust
3. **Creator Proposed + SDVM Voting** — Trust in staker consensus
4. **Emergency Invalidation** — Centralized multisig override

Mainnet should minimize use of Tier 4. Remove or replace with DAO governance.

## Vulnerability Disclosure Timeline

- **Day 0:** Vulnerability reported
- **Day 1-2:** Triage and confirmation
- **Day 3-30:** Fix development and testing
- **Day 30+:** Security advisory published; patch released
- **Embargo:** 30 days from fix release before public disclosure (adjusted for severity)

Critical vulnerabilities may have shorter timelines.

## Bug Bounty Program

**Status:** Coming soon (TBD).

We plan to establish a formal bug bounty program with rewards for critical and high-severity vulnerabilities. Check back for details.

## Security Audit History

- **2026-03 (Red Team):** Internal red team testing completed. See `docs/archive/` for reports.
- **2026-04 (Planned):** Professional security audit (TBD)

## Secure Coding Practices

When contributing, follow these practices:

- **Validate inputs:** Check market IDs, outcome indices, amounts, and timestamps
- **Use safe math:** Move's u64/u128 prevent overflow, but verify invariants
- **Minimize trusted parties:** Avoid creating new admin capabilities; use existing governance
- **Test edge cases:** Empty markets, zero amounts, expired deadlines, concurrent votes
- **Avoid hardcoded addresses:** Use configuration objects instead
- **Document assumptions:** Explain why a constraint is safe

See [CONTRIBUTING.md](CONTRIBUTING.md) for code standards.

## Responsible Disclosure

We follow coordinated vulnerability disclosure (CVD). This means:

1. You report privately
2. We fix the issue
3. We publish an advisory and patch simultaneously
4. You are credited (unless you prefer anonymity)

This protects users from 0-days while ensuring the security community learns from the vulnerability.

## Questions or Clarification?

For security process questions (not vulnerability reports), file a GitHub discussion or contact the maintainer directly.

---

**Last Updated:** 2026-03-19
