# SDVM Attack Simulations

This directory contains supporting adversarial test artifacts for SDVM and gas-relay behavior.

## What This Is

- `attack-runner.ts`
  - deterministic simulation coverage for several SDVM attack scenarios
  - written as research and regression support material, not as part of the canonical release matrix
- `rate-limiter-stress.test.ts`
  - stress-oriented tests for the relay rate-limiter logic

## What This Is Not

- not the canonical architecture doc
- not the security policy
- not the release gate for the public stack
- not a guarantee that every historical red-team deliverable still exists in this folder

## Repo Truth

These files are useful supporting material, but the current canonical reviewer path is:

- [README](../../README.md)
- [Docs Index](../../docs/INDEX.md)
- [Security](../../SECURITY.md)
- [Contributing](../../CONTRIBUTING.md)

If a future change promotes any of these simulations into the release gate, update
the contributor checks and CI workflow in the same PR.
