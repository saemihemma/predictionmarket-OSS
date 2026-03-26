# SDVM Key Management and Multisig Guidance

This document describes the current testnet key posture and the intended future
shape for mainnet-style multisig operations.

## What Is Current

The live stack is still testnet-first.

- the deployer/admin capability is operated by a single trusted testnet operator
- emergency and admin levers still exist for bootstrap safety
- operator secrets must live in a real secret manager or encrypted local key store
- if a testnet admin key is compromised, the expected response is rotate or redeploy, not pretend the old environment is still trustworthy

This is fast-iteration infrastructure, not a decentralized final governance model.

## Testnet Guidance

### Admin Capability

- holder: one designated testnet operator
- storage: encrypted local key store, CI/CD secret manager, or vault
- never store secrets in Git, Slack, email, or shared docs

Example key generation:

```bash
sui keytool generate --key-scheme ed25519
```

### Emergency Capability

Testnet does not require a production-grade emergency multisig. If you need to
exercise emergency flows for rehearsal, use disposable test keys and clearly
mark the environment as rehearsal-only.

## Future Mainnet Direction

Mainnet should not inherit the current testnet trust posture.

The intended future direction is:

- governance-appointed multisig holders
- no single operator as the lasting source of authority
- explicit rotation and incident procedures
- auditable emergency actions

An illustrative holder model is:

| Role | Purpose |
|------|---------|
| Protocol lead | Strong Sui and protocol context |
| Operations lead | Deployment and incident authority |
| Independent reviewer | External check with no direct operational incentive |

This table is illustrative, not a live governance decision.

## Rotation Principles

- testnet: rotate or redeploy quickly if compromise is suspected
- mainnet: rotate on a planned cadence and during any key-compromise event
- every rotation should leave an audit trail and updated operator documentation

## Operational Checklist

Before any serious deployment:

- identify the active operator or multisig holders
- verify secret storage
- verify signers can execute a harmless dry-run transaction
- record the active addresses and capability object IDs in deployment records
- make sure incident responders know how to pause or invalidate safely

## Audit Trail Expectations

Every privileged action should be attributable:

- who initiated it
- which capability or multisig signed it
- what object or market it affected
- where the reasoning or incident record lives

## Boundary Statement

This document is intentionally honest:

- it describes the current testnet reality
- it does not claim that governance or decentralization is finished
- it should be updated before any mainnet-facing rollout
