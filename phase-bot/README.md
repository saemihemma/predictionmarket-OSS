# Phase Bot

Automates SDVM phase progression for the active collateral family.

## What It Does

The bot discovers `SDVMVoteRoundCreatedEvent<Collateral>` events, loads each live round object, and advances rounds when deadlines expire:

- `COMMIT` -> `advance_to_reveal_phase`
- `REVEAL` -> `advance_to_tally_phase`
- `TALLY` -> `tally_votes(round, stakingPool, clock)`

After tally it refetches state so rolled rounds and settled rounds are not confused.

## Configuration Sources

The bot is env-first in deployed environments. It can read from:

- explicit env overrides
- `PM_MANIFEST_PATH` pointing at `deployments/testnet.json` for local development only

Required effective values:

- `SUI_RPC_URL`
- `BOT_KEYPAIR`
- `PM_PACKAGE_ID`
- `PM_COLLATERAL_COIN_TYPE`
- `PM_STAKING_POOL_ID`

In deployed environments, these values must be set explicitly and the bot fails closed if they are missing.

## Routes

- `GET /health`
- `GET /live`
- `GET /ready`

## Development

```bash
cp .env.example .env
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Tests

```bash
npm test
```

## Health Semantics

- `/live` means the process is up
- `/ready` means the bot finished startup and is actively polling
- `/health` returns bot status details and should be used for operator diagnostics
