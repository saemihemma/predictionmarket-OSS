# Gas Relay

Sponsors transactions so users can interact with the prediction market without holding SUI for gas.

## How It Works

Users submit signed transactions to the relay. The relay validates them against a whitelist of allowed Move modules (`pm_trading`, `pm_resolution`, `pm_dispute`, `pm_staking`, `pm_sdvm`), attaches a gas coin from a managed pool, co-signs, and submits to Sui.

Validation is 5 layers deep: byte size check, BCS deserialization, package ID whitelist, command deny list (blocks admin functions), and per-sender rate limiting.

## Setup

```bash
cp .env.example .env
# Fill in SPONSOR_KEYPAIR_B64 and PM_PACKAGE_ID
npm install
npm run dev
```

## Configuration

See `.env.example` for all options. Required:

- `SPONSOR_KEYPAIR_B64` — base64-encoded Sui keypair (the gas sponsor)
- `PM_PACKAGE_ID` — deployed prediction market package ID

## Endpoints

- `POST /sponsor` — submit a transaction for gas sponsorship
- `GET /health` — service health + sponsor balance
