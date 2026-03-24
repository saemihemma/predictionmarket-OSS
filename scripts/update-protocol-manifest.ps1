param(
  [Parameter(Mandatory = $true)]
  [string]$PackageId,
  [string]$CollateralCoinType = "0xd28d9306a2d6ec2e8bf86e2a1804dc5ddea43e03a0ce63f55126fc172dff6cc0::suffer::SUFFER",
  [string]$CollateralSymbol = "SFR",
  [string]$CollateralName = "SUFFER",
  [int]$CollateralDecimals = 2,
  [string]$CollateralIconUrl = "https://orchestrator.wal.app/logo.png",
  [string]$RegistryId = "",
  [string]$ConfigId = "",
  [string]$TreasuryId = "",
  [string]$ResolverSetId = "",
  [string]$ResolverPolicyId = "",
  [string]$EmergencyMultisigId = "",
  [string]$StakingPoolId = "",
  [string]$GovernanceTrackerId = "",
  [string]$FaucetId = "",
  [string]$AdminCapId = "",
  [string]$EmergencyCapId = "",
  [string]$SdvmAdminCapId = "",
  [string]$VerifierCapId = "",
  [string]$UpgradeCapId = "",
  [string]$DeployerAddress = "",
  [string]$OperatorAddress = "",
  [string]$ManifestHash = "pending-bootstrap",
  [string]$GasRelayUrl = "",
  [string]$PhaseBotHealthUrl = "",
  [string]$PhaseBotReadyUrl = "",
  [string]$MarketTypePoliciesJson = "",
  [switch]$SyncFrontendManifest
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $repoRoot "deployments\testnet.json"
$syncScriptPath = Join-Path $repoRoot "scripts\sync-protocol-manifest.mjs"

function Set-IfPresent {
  param(
    [Parameter(Mandatory = $true)]
    [hashtable]$Manifest,
    [Parameter(Mandatory = $true)]
    [string]$Key,
    $Value
  )

  if ($null -ne $Value -and $Value -ne "") {
    $Manifest[$Key] = $Value
  }
}

function ConvertTo-OrderedHashtable {
  param(
    [Parameter(Mandatory = $true)]
    $InputObject
  )

  if ($null -eq $InputObject) {
    return $null
  }

  if ($InputObject -is [System.Collections.IDictionary]) {
    $result = [ordered]@{}
    foreach ($key in $InputObject.Keys) {
      $result[$key] = ConvertTo-OrderedHashtable -InputObject $InputObject[$key]
    }
    return $result
  }

  if ($InputObject -is [System.Collections.IEnumerable] -and -not ($InputObject -is [string])) {
    $items = @()
    foreach ($item in $InputObject) {
      $items += ,(ConvertTo-OrderedHashtable -InputObject $item)
    }
    return $items
  }

  if ($InputObject -is [pscustomobject]) {
    $result = [ordered]@{}
    foreach ($property in $InputObject.PSObject.Properties) {
      $result[$property.Name] = ConvertTo-OrderedHashtable -InputObject $property.Value
    }
    return $result
  }

  return $InputObject
}

$manifest = ConvertTo-OrderedHashtable -InputObject (Get-Content $manifestPath -Raw | ConvertFrom-Json)

$manifest.packageId = $PackageId
$manifest.collateralCoinType = $CollateralCoinType
$manifest.collateralSymbol = $CollateralSymbol
$manifest.collateralName = $CollateralName
$manifest.collateralDecimals = $CollateralDecimals
$manifest.collateralIconUrl = $CollateralIconUrl
Set-IfPresent -Manifest $manifest -Key "registryId" -Value $RegistryId
Set-IfPresent -Manifest $manifest -Key "configId" -Value $ConfigId
Set-IfPresent -Manifest $manifest -Key "treasuryId" -Value $TreasuryId
Set-IfPresent -Manifest $manifest -Key "resolverSetId" -Value $ResolverSetId
Set-IfPresent -Manifest $manifest -Key "resolverPolicyId" -Value $ResolverPolicyId
Set-IfPresent -Manifest $manifest -Key "emergencyMultisigId" -Value $EmergencyMultisigId
Set-IfPresent -Manifest $manifest -Key "stakingPoolId" -Value $StakingPoolId
Set-IfPresent -Manifest $manifest -Key "governanceTrackerId" -Value $GovernanceTrackerId
Set-IfPresent -Manifest $manifest -Key "faucetId" -Value $FaucetId
Set-IfPresent -Manifest $manifest -Key "adminCapId" -Value $AdminCapId
Set-IfPresent -Manifest $manifest -Key "emergencyCapId" -Value $EmergencyCapId
Set-IfPresent -Manifest $manifest -Key "sdvmAdminCapId" -Value $SdvmAdminCapId
Set-IfPresent -Manifest $manifest -Key "verifierCapId" -Value $VerifierCapId
Set-IfPresent -Manifest $manifest -Key "upgradeCapId" -Value $UpgradeCapId
Set-IfPresent -Manifest $manifest -Key "deployerAddress" -Value $DeployerAddress
Set-IfPresent -Manifest $manifest -Key "operatorAddress" -Value $OperatorAddress
Set-IfPresent -Manifest $manifest -Key "manifestHash" -Value $ManifestHash
$manifest.manifestVersion = "v5-live-beta-backend"

$serviceUrls = if ($manifest.Contains("serviceUrls") -and $manifest.serviceUrls) {
  ConvertTo-OrderedHashtable -InputObject $manifest.serviceUrls
} else {
  [ordered]@{}
}
Set-IfPresent -Manifest $serviceUrls -Key "gasRelay" -Value $GasRelayUrl
Set-IfPresent -Manifest $serviceUrls -Key "phaseBotHealth" -Value $PhaseBotHealthUrl
Set-IfPresent -Manifest $serviceUrls -Key "phaseBotReady" -Value $PhaseBotReadyUrl
$manifest.serviceUrls = $serviceUrls
if ($manifest.Contains("benchmarkUrl")) {
  $manifest.Remove("benchmarkUrl")
}
if ($manifest.Contains("configValues")) {
  $manifest.Remove("configValues")
}

if ($MarketTypePoliciesJson) {
  $manifest.marketTypePolicies = ConvertTo-OrderedHashtable -InputObject ($MarketTypePoliciesJson | ConvertFrom-Json)
}

$manifest | ConvertTo-Json -Depth 10 | Set-Content $manifestPath

if ($SyncFrontendManifest) {
  node $syncScriptPath | Out-Host
}

Write-Host ""
Write-Host "Updated protocol manifest:" -ForegroundColor Green
Write-Host "  Package:    $($manifest.packageId)"
Write-Host "  Collateral: $($manifest.collateralSymbol) ($($manifest.collateralCoinType))"
Write-Host "  Registry:   $($manifest.registryId)"
Write-Host "  Config:     $($manifest.configId)"
Write-Host "  Treasury:   $($manifest.treasuryId)"
Write-Host "  Faucet:     $($manifest.faucetId)"
Write-Host "  Resolver:   $($manifest.resolverSetId)"
Write-Host "  Staking:    $($manifest.stakingPoolId)"
