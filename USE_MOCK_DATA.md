# Frontend Data Mode

Mock-data mode has been removed from the shipped frontend.

## Current Read Path

- The live frontend reads from Sui GraphQL first.
- Market discovery pages `MarketCreatedEvent` through GraphQL and then loads market objects by ID.
- Portfolio, protocol config, and collateral inventory reads also go through the shared transport in `frontend/src/lib/client.ts`.
- A temporary emergency RPC fallback still exists, but only inside `frontend/src/lib/client.ts`.

## Why This File Still Exists

Older planning docs referenced a mock-data toggle and an eventual switch to live RPC. That is no longer the architecture in this repo:

- the mock-data files were removed
- the frontend is GraphQL-first now
- pages continue to consume hook interfaces instead of transport details

## Event Notes

When reading `MarketCreatedEvent` through Sui GraphQL, use `Event.contents.json.market_id`.

Do not rely on older JSON-RPC-only assumptions like:

- `parsedJson`
- `eventSeq`
- `txDigest`

Those may still appear inside the temporary RPC fallback path, but they are not the primary read architecture anymore.
