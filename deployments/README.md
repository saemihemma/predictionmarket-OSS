# Deployments

This directory holds the checked-in deployment contract for the public testnet stack.

## Current Source of Truth

- `testnet.json` is the checked-in manifest of package IDs, object IDs, and service URLs
- `scripts/sync-protocol-manifest.mjs` copies the relevant frontend-facing subset into `frontend/public/protocol-manifest.json`

## Why This Exists

The frontend and phase bot both depend on the same deployed family identity.
Keeping that contract checked in makes it reviewable in public instead of hiding
it inside per-service environment variables.

## Boundary

This directory is deployment metadata, not protocol logic.

- on-chain truth still lives in `contracts/`
- runtime consumers still live in `frontend/`, `gas-relay/`, and `phase-bot/`
- if a deployment changes, update the manifest and any affected docs in the same PR
