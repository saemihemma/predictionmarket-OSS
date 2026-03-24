param(
  [string]$PackageId = "",
  [string]$CollateralCoinType = "0xd28d9306a2d6ec2e8bf86e2a1804dc5ddea43e03a0ce63f55126fc172dff6cc0::suffer::SUFFER",
  [string]$CollateralSymbol = "SFR",
  [string]$CollateralName = "SUFFER",
  [int]$CollateralDecimals = 2,
  [string]$CollateralIconUrl = "https://orchestrator.wal.app/logo.png",
  [string]$OperatorAddress = "",
  [string]$GasRelayUrl = "",
  [string]$PhaseBotHealthUrl = "",
  [string]$PhaseBotReadyUrl = "",
  [long]$OperatorGasFundingMist = 50000000,
  [long]$PublishGasBudgetMist = 600000000,
  [long]$BootstrapGasBudgetMist = 120000000,
  [long]$HandoffGasBudgetMist = 50000000,
  [long]$FaucetTopUpGasBudgetMist = 50000000,
  [long]$TradingFeeBps = 100,
  [long]$SettlementFeeBps = 100,
  [long]$CreationBondCanonical = 25000,
  [long]$CreationBondSourceBound = 50000,
  [long]$CreationBondCreatorResolved = 100000,
  [long]$CreationBondExperimental = 200000,
  [long]$DisputeBondAmount = 500000,
  [long]$DisputeWindowDeterministicMs = 43200000,
  [long]$DisputeWindowDeclaredMs = 43200000,
  [long]$DisputeWindowCreatorMs = 43200000,
  [long]$MinMarketDurationMs = 3600000,
  [long]$MaxMarketDurationMs = 2592000000,
  [long]$MaxOutcomes = 8,
  [long]$LiquidityParam = 100,
  [long]$EscalationTimeoutMs = 43200000,
  [long]$CreatorPriorityWindowMs = 86400000,
  [long]$EmergencyReviewWindowMs = 43200000,
[long]$FaucetStarterAmount = 10000000,
[long]$FaucetDailyAmount = 1000000,
[long]$FaucetTopUpAmount = 500000000,
  [switch]$SkipBuild,
  [switch]$SyncFrontendManifest,
  [switch]$BuildFrontend
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$contractsDir = Join-Path $repoRoot "contracts"
$frontendDir = Join-Path $repoRoot "frontend"
$manifestPath = Join-Path $repoRoot "deployments\testnet.json"
$syncScriptPath = Join-Path $repoRoot "scripts\sync-protocol-manifest.mjs"
$suiCli = Join-Path $HOME ".local\bin\sui.exe"
$node = "C:\Program Files\nodejs\node.exe"
$npm = "C:\Program Files\nodejs\npm.cmd"

if (Test-Path "C:\Program Files\Git\cmd\git.exe") {
  $env:PATH = "C:\Program Files\Git\cmd;C:\Program Files\Git\bin;$env:PATH"
}

function Invoke-SuiJson {
  param(
    [string[]]$CommandArgs,
    [string]$Workdir
  )

  Push-Location $Workdir
  try {
    $previousErrorActionPreference = $ErrorActionPreference
    try {
      $ErrorActionPreference = "Continue"
      $output = & $suiCli @CommandArgs 2>&1
    } finally {
      $ErrorActionPreference = $previousErrorActionPreference
    }
    $text = (@($output) | ForEach-Object { $_.ToString() }) -join "`n"
    if ($LASTEXITCODE -ne 0) {
      throw "sui command failed: $($CommandArgs -join ' ')`n$text"
    }
    $jsonParse = Find-JsonPayload -Text $text
    return $jsonParse.Json
  } finally {
    Pop-Location
  }
}

function Invoke-SuiJsonWithRaw {
  param(
    [string[]]$CommandArgs,
    [string]$Workdir
  )

  Push-Location $Workdir
  try {
    $previousErrorActionPreference = $ErrorActionPreference
    try {
      $ErrorActionPreference = "Continue"
      $output = & $suiCli @CommandArgs 2>&1
    } finally {
      $ErrorActionPreference = $previousErrorActionPreference
    }
    $text = (@($output) | ForEach-Object { $_.ToString() }) -join "`n"
    if ($LASTEXITCODE -ne 0) {
      throw "sui command failed: $($CommandArgs -join ' ')`n$text"
    }
    return Find-JsonPayload -Text $text
  } finally {
    Pop-Location
  }
}

function Invoke-ShellChecked {
  param(
    [string]$Executable,
    [string[]]$CommandArgs,
    [string]$Workdir
  )

  Push-Location $Workdir
  try {
    & $Executable @CommandArgs
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed: $Executable $($CommandArgs -join ' ')"
    }
  } finally {
    Pop-Location
  }
}

function Find-JsonPayload {
  param(
    [string]$Text
  )

  $lines = $Text -split "`r?`n"
  for ($i = 0; $i -lt $lines.Count; $i++) {
    $candidate = ($lines[$i..($lines.Count - 1)] -join "`n").Trim()
    if (-not $candidate) {
      continue
    }

    try {
      $parsed = $candidate | ConvertFrom-Json -ErrorAction Stop
      return @{
        Raw = $candidate
        Json = $parsed
      }
    } catch {
      continue
    }
  }

  throw "Could not locate JSON payload in sui output.`n$Text"
}

function Get-UniqueCreatedObjectId {
  param(
    $Changes,
    [string]$ObjectTypePrefix
  )

  $matches = @($Changes | Where-Object {
      $_.type -eq "created" -and
      $_.PSObject.Properties.Name -contains "objectType" -and
      $_.objectType -like "$ObjectTypePrefix*"
    })

  if ($matches.Count -ne 1) {
    throw "Expected exactly one created object for type prefix '$ObjectTypePrefix', found $($matches.Count)."
  }

  return $matches[0].objectId
}

function Get-PolicyMap {
  param(
    $Events,
    [string]$PackageIdForEvents
  )

  $policyMap = [ordered]@{}
  $targetType = "$PackageIdForEvents::pm_policy::MarketTypePolicyCreatedEvent<*"
  foreach ($event in @($Events | Where-Object { $_.type -like $targetType })) {
    $parsed = $event.parsedJson
    $trustTier = [int]$parsed.trust_tier
    $marketType = [int]$parsed.market_type
    $resolutionClass = [int]$parsed.resolution_class
    $key = "{0}:{1}:{2}" -f $trustTier, $marketType, $resolutionClass
    $policyMap[$key] = $parsed.policy_id
  }

  return $policyMap
}

function Get-UpgradeCapFromPublishedToml {
  param(
    [string]$PublishedTomlPath
  )

  if (-not (Test-Path $PublishedTomlPath)) {
    return ""
  }

  $content = Get-Content $PublishedTomlPath -Raw
  $match = [regex]::Match($content, 'upgrade-capability\s*=\s*"(?<cap>0x[0-9a-fA-F]+)"')
  if ($match.Success) {
    return $match.Groups["cap"].Value
  }

  return ""
}

function Get-AddressGasCoins {
  param(
    [string]$Address
  )

  return @(Invoke-SuiJson -CommandArgs @("client", "gas", $Address, "--json") -Workdir $contractsDir)
}

function Get-AddressSuiBalanceMist {
  param(
    [string]$Address
  )

  $coins = Get-AddressGasCoins -Address $Address
  $total = 0L
  foreach ($coin in $coins) {
    $total += [long]$coin.mistBalance
  }
  return $total
}

function Consolidate-AddressGasCoins {
  param(
    [string]$Address,
    [long]$GasBudgetMist = 50000000
  )

  $gasCoins = @(Get-AddressGasCoins -Address $Address | Sort-Object { [long]$_.mistBalance } -Descending)
  if ($gasCoins.Count -le 1) {
    if ($gasCoins.Count -eq 1) {
      return $gasCoins[0].gasCoinId
    }
    return ""
  }

  Write-Host "Consolidating $($gasCoins.Count) deployer gas coins..." -ForegroundColor Cyan
  $payAllArgs = @(
    "client", "pay-all-sui",
    "--input-coins"
  ) + @($gasCoins | ForEach-Object { $_.gasCoinId }) + @(
    "--recipient", $Address,
    "--gas-budget", "$GasBudgetMist",
    "--json"
  )
  $null = Invoke-SuiJson -CommandArgs $payAllArgs -Workdir $contractsDir

  $consolidatedGasCoinId = Get-LargestGasCoinId -Address $Address -MinimumMistBalance 1
  return $consolidatedGasCoinId
}

function Get-LargestGasCoinId {
  param(
    [string]$Address,
    [long]$MinimumMistBalance = 0
  )

  $coins = Get-AddressGasCoins -Address $Address
  $eligibleCoins = @($coins | Where-Object { [long]$_.mistBalance -ge $MinimumMistBalance } | Sort-Object { [long]$_.mistBalance } -Descending)
  if ($eligibleCoins.Count -eq 0) {
    return ""
  }

  return $eligibleCoins[0].gasCoinId
}

function Resolve-GasSelection {
  param(
    [string]$Address,
    [long]$RequestedBudgetMist,
    [long]$MinimumBudgetMist = 50000000,
    [long]$ReserveMist = 1000000
  )

  $coins = @(Get-AddressGasCoins -Address $Address | Sort-Object { [long]$_.mistBalance } -Descending)
  if ($coins.Count -eq 0) {
    throw "No SUI gas coins found for $Address"
  }

  $largestCoin = $coins[0]
  $largestBalance = [long]$largestCoin.mistBalance
  $maxBudget = [Math]::Max(0, $largestBalance - $ReserveMist)
  if ($maxBudget -lt $MinimumBudgetMist) {
    throw "Largest gas coin for $Address only has $largestBalance MIST, below minimum usable gas budget $MinimumBudgetMist"
  }

  $resolvedBudget = [Math]::Min($RequestedBudgetMist, $maxBudget)
  if ($resolvedBudget -lt $RequestedBudgetMist) {
    Write-Host "Reducing requested gas budget from $RequestedBudgetMist to $resolvedBudget MIST for $Address" -ForegroundColor Yellow
  }

  return [ordered]@{
    GasCoinId = $largestCoin.gasCoinId
    GasBudgetMist = $resolvedBudget
    GasBalanceMist = $largestBalance
  }
}

function Get-OwnedCoinObjectId {
  param(
    [string]$Address,
    [string]$CoinType
  )

  $result = Invoke-SuiJsonWithRaw -CommandArgs @("client", "balance", $Address, "--coin-type", $CoinType, "--with-coins", "--json") -Workdir $contractsDir
  $parsed = $result.Json
  if ($parsed.Count -lt 1 -or $parsed[0].Count -lt 1) {
    throw "No balance payload returned for coin type $CoinType on $Address"
  }

  foreach ($entry in $parsed[0]) {
    if ($entry.Count -lt 2) {
      continue
    }

    $coins = @($entry[1])
    if ($coins.Count -gt 0 -and $coins[0].PSObject.Properties.Name -contains "coinObjectId") {
      return $coins[0].coinObjectId
    }
  }

  throw "No owned coin object found for $CoinType on $Address"
}

Write-Host "Switching Sui CLI to testnet..." -ForegroundColor Cyan
Invoke-ShellChecked -Executable $suiCli -CommandArgs @("client", "switch", "--env", "testnet") -Workdir $contractsDir

$originalActiveAddress = (& $suiCli client active-address | Select-Object -Last 1).Trim()
$activeAddress = $originalActiveAddress
$resolvedOperatorAddress = if ($OperatorAddress) { $OperatorAddress.Trim() } else { $activeAddress }
if (-not $SkipBuild) {
  Write-Host "Running Move build + tests..." -ForegroundColor Cyan
  Invoke-ShellChecked -Executable $suiCli -CommandArgs @("move", "build") -Workdir $contractsDir
  Invoke-ShellChecked -Executable $suiCli -CommandArgs @("move", "test") -Workdir $contractsDir
}

$resolvedPackageId = $PackageId
$upgradeCapId = "0x0"
$publishedTomlPath = Join-Path $contractsDir "Published.toml"

if (-not $resolvedPackageId) {
  Write-Host "Publishing prediction-market package..." -ForegroundColor Cyan
  $temporaryPubfilePath = Join-Path ([System.IO.Path]::GetTempPath()) ("predictionmarket-publish-{0}.toml" -f ([System.Guid]::NewGuid().ToString("N")))
  try {
    if (Test-Path $temporaryPubfilePath) {
      Remove-Item $temporaryPubfilePath -Force -ErrorAction SilentlyContinue
    }
    $null = Consolidate-AddressGasCoins -Address $activeAddress
    $publishGasSelection = Resolve-GasSelection -Address $activeAddress -RequestedBudgetMist $PublishGasBudgetMist -MinimumBudgetMist 100000000
    $publishArgs = @(
      "client", "test-publish", ".",
      "--build-env", "testnet",
      "--pubfile-path", $temporaryPubfilePath,
      "--gas-budget", "$($publishGasSelection.GasBudgetMist)",
      "--gas", $publishGasSelection.GasCoinId
    )
    $publishArgs += @("--json")
    $publishResult = Invoke-SuiJson -CommandArgs $publishArgs -Workdir $contractsDir
  } finally {
    if (Test-Path $temporaryPubfilePath) {
      Remove-Item $temporaryPubfilePath -Force -ErrorAction SilentlyContinue
    }
  }
  $publishedChange = @($publishResult.objectChanges | Where-Object { $_.type -eq "published" }) | Select-Object -First 1
  if (-not $publishedChange) {
    throw "Could not find published package change in publish result."
  }
  $resolvedPackageId = $publishedChange.packageId
  $upgradeCapId = Get-UniqueCreatedObjectId -Changes $publishResult.objectChanges -ObjectTypePrefix "0x2::package::UpgradeCap"
  Write-Host "Published package $resolvedPackageId" -ForegroundColor Green
} else {
  Write-Host "Using existing package $resolvedPackageId" -ForegroundColor Cyan
  $publishedUpgradeCap = Get-UpgradeCapFromPublishedToml -PublishedTomlPath $publishedTomlPath
  if ($publishedUpgradeCap) {
    $upgradeCapId = $publishedUpgradeCap
  }
}

Write-Host "Bootstrapping collateral family for $CollateralSymbol..." -ForegroundColor Cyan
$bootstrapGasSelection = Resolve-GasSelection -Address $activeAddress -RequestedBudgetMist $BootstrapGasBudgetMist -MinimumBudgetMist 50000000
$bootstrapArgs = @(
  "client", "call",
  "--package", $resolvedPackageId,
  "--module", "pm_deploy",
  "--function", "bootstrap_default_family",
  "--type-args", $CollateralCoinType,
  "--args",
  "$TradingFeeBps",
  "$SettlementFeeBps",
  "$CreationBondCanonical",
  "$CreationBondSourceBound",
  "$CreationBondCreatorResolved",
  "$CreationBondExperimental",
  "$DisputeBondAmount",
  "$DisputeWindowDeterministicMs",
  "$DisputeWindowDeclaredMs",
  "$DisputeWindowCreatorMs",
  "$MinMarketDurationMs",
  "$MaxMarketDurationMs",
  "$MaxOutcomes",
  "$CreatorPriorityWindowMs",
  "$LiquidityParam",
  "$EscalationTimeoutMs",
  "$EmergencyReviewWindowMs",
  "$FaucetStarterAmount",
  "$FaucetDailyAmount",
  "0x6",
  "--gas-budget", "$($bootstrapGasSelection.GasBudgetMist)",
  "--gas", $bootstrapGasSelection.GasCoinId
)
$bootstrapArgs += @("--json")
$bootstrapResult = Invoke-SuiJson -CommandArgs $bootstrapArgs -Workdir $contractsDir

$registryId = Get-UniqueCreatedObjectId -Changes $bootstrapResult.objectChanges -ObjectTypePrefix "$resolvedPackageId::pm_registry::PMRegistry<"
$configId = Get-UniqueCreatedObjectId -Changes $bootstrapResult.objectChanges -ObjectTypePrefix "$resolvedPackageId::pm_registry::PMConfig<"
$treasuryId = Get-UniqueCreatedObjectId -Changes $bootstrapResult.objectChanges -ObjectTypePrefix "$resolvedPackageId::pm_treasury::PMTreasury<"
$resolverSetId = Get-UniqueCreatedObjectId -Changes $bootstrapResult.objectChanges -ObjectTypePrefix "$resolvedPackageId::pm_dispute::PMResolverSet<"
$resolverPolicyId = Get-UniqueCreatedObjectId -Changes $bootstrapResult.objectChanges -ObjectTypePrefix "$resolvedPackageId::pm_policy::PMResolverPolicy<"
$emergencyMultisigId = Get-UniqueCreatedObjectId -Changes $bootstrapResult.objectChanges -ObjectTypePrefix "$resolvedPackageId::pm_admin::PMEmergencyMultisig<"
$stakingPoolId = Get-UniqueCreatedObjectId -Changes $bootstrapResult.objectChanges -ObjectTypePrefix "$resolvedPackageId::pm_staking::PMStakePool<"
$governanceTrackerId = Get-UniqueCreatedObjectId -Changes $bootstrapResult.objectChanges -ObjectTypePrefix "$resolvedPackageId::pm_sdvm::SDVMGovernanceTracker<"
$faucetId = Get-UniqueCreatedObjectId -Changes $bootstrapResult.objectChanges -ObjectTypePrefix "$resolvedPackageId::pm_faucet::PMFaucet<"
$adminCapId = Get-UniqueCreatedObjectId -Changes $bootstrapResult.objectChanges -ObjectTypePrefix "$resolvedPackageId::pm_registry::PMAdminCap<"
$emergencyCapId = Get-UniqueCreatedObjectId -Changes $bootstrapResult.objectChanges -ObjectTypePrefix "$resolvedPackageId::pm_admin::PMEmergencyCap<"
$sdvmAdminCapId = Get-UniqueCreatedObjectId -Changes $bootstrapResult.objectChanges -ObjectTypePrefix "$resolvedPackageId::pm_staking::SDVMAdminCap<"
$verifierCapId = Get-UniqueCreatedObjectId -Changes $bootstrapResult.objectChanges -ObjectTypePrefix "$resolvedPackageId::pm_resolution::PMVerifierCap<"
$marketTypePolicies = Get-PolicyMap -Events $bootstrapResult.events -PackageIdForEvents $resolvedPackageId

if ($marketTypePolicies.Count -lt 8) {
  throw "Expected 8 market type policies from bootstrap, found $($marketTypePolicies.Count)."
}

if ($resolvedOperatorAddress -and $resolvedOperatorAddress -ne $activeAddress) {
  $operatorTransferObjects = @("@$adminCapId", "@$emergencyCapId", "@$sdvmAdminCapId", "@$verifierCapId")
  $requiredOperatorTransferBalance = $HandoffGasBudgetMist
  $operatorSuiBalance = Get-AddressSuiBalanceMist -Address $resolvedOperatorAddress
  $shouldFundOperator = $OperatorGasFundingMist -gt 0 -and $operatorSuiBalance -lt $OperatorGasFundingMist
  if ($shouldFundOperator) {
    $requiredOperatorTransferBalance = $OperatorGasFundingMist + $HandoffGasBudgetMist
  }

  $null = Consolidate-AddressGasCoins -Address $activeAddress
  $handoffGasSelection = Resolve-GasSelection -Address $activeAddress -RequestedBudgetMist $HandoffGasBudgetMist -MinimumBudgetMist 25000000
  $deployerGasCoinId = $handoffGasSelection.GasCoinId
  if (-not $deployerGasCoinId -or [long]$handoffGasSelection.GasBalanceMist -lt $requiredOperatorTransferBalance) {
    throw "Could not find a deployer gas coin with at least $requiredOperatorTransferBalance MIST to hand off operator gas/caps"
  }

  $handoffPtbArgs = @(
    "client", "ptb",
    "--gas-coin", "@$deployerGasCoinId",
    "--gas-budget", "$($handoffGasSelection.GasBudgetMist)"
  )
  if ($shouldFundOperator) {
    $handoffPtbArgs += @(
      "--split-coins", "gas", "[$OperatorGasFundingMist]",
      "--assign", "operator_gas_coin"
    )
    $operatorTransferObjects = @("operator_gas_coin.0") + $operatorTransferObjects
  }

  $operatorTransferArg = "[" + ($operatorTransferObjects -join ", ") + "]"
  $handoffPtbArgs += @(
    "--transfer-objects", $operatorTransferArg, "@$resolvedOperatorAddress",
    "--json"
  )

  Write-Host "Handing off operator caps$($(if ($shouldFundOperator) { ' and starter gas' } else { '' })) to $resolvedOperatorAddress..." -ForegroundColor Cyan
  $null = Invoke-SuiJson -CommandArgs $handoffPtbArgs -Workdir $contractsDir
}

if ($FaucetTopUpAmount -gt 0) {
  $operatorCollateralCoinId = Get-OwnedCoinObjectId -Address $resolvedOperatorAddress -CoinType $CollateralCoinType
  Write-Host "Switching active address to operator wallet for faucet prefund..." -ForegroundColor Cyan
  try {
    Invoke-ShellChecked -Executable $suiCli -CommandArgs @("client", "switch", "--address", $resolvedOperatorAddress) -Workdir $contractsDir
    $activeAddress = $resolvedOperatorAddress

    $operatorGasBalance = Get-AddressSuiBalanceMist -Address $resolvedOperatorAddress
    if ($operatorGasBalance -le 0) {
      throw "Operator wallet $resolvedOperatorAddress has no SUI for faucet top-up"
    }

    $topUpGasSelection = Resolve-GasSelection -Address $resolvedOperatorAddress -RequestedBudgetMist $FaucetTopUpGasBudgetMist -MinimumBudgetMist 10000000

    $topUpPtbArgs = @(
      "client", "ptb",
      "--gas-coin", "@$($topUpGasSelection.GasCoinId)",
      "--gas-budget", "$($topUpGasSelection.GasBudgetMist)",
      "--split-coins", "@$operatorCollateralCoinId", "[$FaucetTopUpAmount]",
      "--assign", "faucet_top_up_coin",
      "--move-call", "$resolvedPackageId::pm_faucet::top_up", "<$CollateralCoinType>", "@$faucetId", "@$adminCapId", "faucet_top_up_coin.0",
      "--json"
    )
    Write-Host "Prefunding faucet $faucetId with $FaucetTopUpAmount raw collateral..." -ForegroundColor Cyan
    $null = Invoke-SuiJson -CommandArgs $topUpPtbArgs -Workdir $contractsDir
  } finally {
    if ($originalActiveAddress -and $originalActiveAddress -ne $resolvedOperatorAddress) {
      Write-Host "Restoring active address to deploy wallet..." -ForegroundColor Cyan
      Invoke-ShellChecked -Executable $suiCli -CommandArgs @("client", "switch", "--address", $originalActiveAddress) -Workdir $contractsDir
      $activeAddress = $originalActiveAddress
    }
  }
}

$manifest = [ordered]@{
  network = "testnet"
  rpcUrl = "https://fullnode.testnet.sui.io:443"
  graphqlUrl = "https://sui-testnet.mystenlabs.com/graphql"
  manifestVersion = "v5-live-beta-backend"
  manifestHash = $bootstrapResult.digest
  packageId = $resolvedPackageId
  collateralCoinType = $CollateralCoinType
  collateralSymbol = $CollateralSymbol
  collateralName = $CollateralName
  collateralDecimals = $CollateralDecimals
  collateralIconUrl = $CollateralIconUrl
  registryId = $registryId
  configId = $configId
  treasuryId = $treasuryId
  resolverSetId = $resolverSetId
  resolverPolicyId = $resolverPolicyId
  emergencyMultisigId = $emergencyMultisigId
  stakingPoolId = $stakingPoolId
  governanceTrackerId = $governanceTrackerId
  faucetId = $faucetId
  adminCapId = $adminCapId
  emergencyCapId = $emergencyCapId
  sdvmAdminCapId = $sdvmAdminCapId
  verifierCapId = $verifierCapId
  upgradeCapId = $upgradeCapId
  deployerAddress = $originalActiveAddress
  operatorAddress = $resolvedOperatorAddress
  serviceUrls = [ordered]@{
    gasRelay = $GasRelayUrl
    phaseBotHealth = $PhaseBotHealthUrl
    phaseBotReady = $PhaseBotReadyUrl
  }
  marketTypePolicies = $marketTypePolicies
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $manifestPath) | Out-Null
$manifest | ConvertTo-Json -Depth 10 | Set-Content $manifestPath

if ($SyncFrontendManifest) {
  Write-Host "Syncing manifest into frontend-generated assets..." -ForegroundColor Cyan
  Invoke-ShellChecked -Executable $node -CommandArgs @($syncScriptPath) -Workdir $repoRoot
}

if ($BuildFrontend) {
  Write-Host "Running frontend build..." -ForegroundColor Cyan
  Invoke-ShellChecked -Executable $npm -CommandArgs @("run", "build") -Workdir $frontendDir
}

Write-Host ""
Write-Host "Prediction market collateral family deployed." -ForegroundColor Green
Write-Host "  Package:           $resolvedPackageId"
Write-Host "  Registry:          $registryId"
Write-Host "  Config:            $configId"
Write-Host "  Treasury:          $treasuryId"
Write-Host "  Faucet:            $faucetId"
Write-Host "  Resolver Set:      $resolverSetId"
Write-Host "  Resolver Policy:   $resolverPolicyId"
Write-Host "  Emergency Multi:   $emergencyMultisigId"
Write-Host "  Staking Pool:      $stakingPoolId"
Write-Host "  Governance:        $governanceTrackerId"
Write-Host "  Admin Cap:         $adminCapId"
Write-Host "  Emergency Cap:     $emergencyCapId"
Write-Host "  SDVM Admin Cap:    $sdvmAdminCapId"
Write-Host "  Verifier Cap:      $verifierCapId"
Write-Host "  Upgrade Cap:       $upgradeCapId"
Write-Host "  Operator Address:  $resolvedOperatorAddress"
if (-not $SyncFrontendManifest -and -not $BuildFrontend) {
  Write-Host "  Frontend Sync:     skipped (run explicitly when frontend owner is ready)" -ForegroundColor Yellow
}
