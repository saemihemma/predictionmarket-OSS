# Collateral Swap Migration

## Goal

Swapping from one external collateral coin to another should not require component-by-component frontend edits.

## Required steps

1. Mint or deploy the new collateral coin externally.
2. Publish the prediction-market package if protocol code changed.
3. Bootstrap a new collateral family for the new coin type.
4. Update `deployments/testnet.json`.
5. Sync `frontend/public/protocol-manifest.json`.
6. Rebuild and redeploy the frontend.

The preferred shortcut is now:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\deploy-protocol-family.ps1 `
  -PackageId "0x<existing_prediction_market_package>" `
  -CollateralCoinType "0x<new_coin_package>::module::TOKEN" `
  -CollateralSymbol "NEW" `
  -CollateralName "New Collateral"
```

## Not required anymore

- Editing `market-constants.ts` by hand
- Deriving the collateral coin type from `packageId`
- Renaming `SFR` or `SUFFER` strings across trading pages
- Updating create-market policy IDs in scattered components

## Why this matters

The active collateral family is now a deployment concern, not a component concern. The frontend reads one manifest and derives:

- network
- RPC / GraphQL endpoints
- package ID
- shared object IDs
- collateral symbol, name, decimals, icon
- generic event type strings
- generic object type strings
- market type policy lookup
