# Phase Bot

Automates SDVM voting phase transitions. When a dispute's commit, reveal, or tally deadline passes, the bot submits the on-chain transaction to advance the phase.

## How It Works

On startup the bot bootstraps from chain by querying `RoundCreatedEvent` events to discover active vote rounds. It schedules timers for each phase deadline (with a 30s safety buffer), and falls back to polling if timers miss. Retries use exponential backoff (1s → 4s → 16s).

Phase flow: `COMMIT → REVEAL → TALLY → SETTLED`

## Setup

```bash
cp .env.example .env
# Fill in BOT_KEYPAIR and PM_PACKAGE_ID
npm install
npm run dev
```

## Configuration

See `.env.example` for all options. Required:

- `BOT_KEYPAIR` — base64-encoded Sui keypair (needs gas for transition txs)
- `PM_PACKAGE_ID` — deployed prediction market package ID

Optional: `POLL_INTERVAL_MS` (default 60s), `HEALTH_PORT` (default 3000), `LOG_LEVEL` (default info).

## Endpoints

- `GET /health` — bot status, active rounds, last transition
- `GET /live` — liveness probe
- `GET /ready` — readiness probe

## Docker

```bash
docker build -t phase-bot .
docker run --env-file .env phase-bot
```
