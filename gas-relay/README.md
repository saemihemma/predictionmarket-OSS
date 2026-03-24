# Gas Relay

Sponsors public-beta transactions so users can interact with the prediction market without holding testnet SUI.

## Public-Beta Scope

The relay is intended for user flows only:

- market creation
- trade
- claim
- invalid refund
- creator/community proposal
- dispute filing
- faucet claim
- stake / unstake
- commit / reveal voting

It does not sponsor:

- package publish or upgrade
- admin actions
- emergency actions
- arbitrary object transfers
- phase-bot maintenance calls

## Validation Model

Requests pass through:

1. request size limits
2. BCS transaction decoding
3. package whitelist
4. command deny list
5. sender/dispute rate limiting

Allowed PTB command plumbing includes:

- `SplitCoins`
- `MergeCoins`
- `MakeMoveVec`

Blocked PTB commands include:

- `Publish`
- `Upgrade`
- arbitrary `TransferObjects`

## Routes

- `POST /v1/sponsor`
- `POST /v1/execute`
- `GET /health`

## Required Configuration

Copy `.env.example` to `.env` and set:

- `SPONSOR_KEYPAIR`
- `PM_PACKAGE_ID`

Optional but recommended:

- `SUI_RPC_URL`
- `MAX_GAS_BUDGET`
- `MIN_SPONSOR_BALANCE`
- `LOW_BALANCE_THRESHOLD`
- `DISPUTE_RATE_LIMIT`
- `SENDER_RATE_LIMIT`
- `ALLOWED_ORIGIN`
- `API_KEY`

For deployed environments, `ALLOWED_ORIGIN` should be a full origin with scheme, for example `https://orchestrator.lineagewar.xyz`.

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

## Health Checks

`GET /health` reports:

- service status
- sponsor balance
- coin pool status

`GET /health` returns `200` only when the sponsor wallet is healthy and the coin pool still has available gas coins. It returns `503` for degraded or not-ready sponsorship states.

## Tests

```bash
npm test
```
