import {
  buildGenericEventType,
  buildGenericStructType,
  getProtocolManifest,
  protocolManifest,
} from "./protocol-config";

const manifest = getProtocolManifest();

export const PM_PACKAGE_ID = manifest.packageId;
export const PM_REGISTRY_ID = protocolManifest.registryId;
export const PM_CONFIG_ID = protocolManifest.configId;
export const PM_FAUCET_ID = protocolManifest.faucetId ?? "0x0";
export const PM_RESOLVER_POLICY_ID = protocolManifest.resolverPolicyId;
export const PM_TREASURY_ID = protocolManifest.treasuryId;
export const PM_EMERGENCY_MULTISIG_ID = protocolManifest.emergencyMultisigId;
export const PM_RESOLVER_SET_ID = protocolManifest.resolverSetId;
export const PM_STAKING_POOL_ID = protocolManifest.stakingPoolId;
export const PM_GOVERNANCE_TRACKER_ID = protocolManifest.governanceTrackerId;
export const PM_GAS_RELAY_URL = protocolManifest.serviceUrls?.gasRelay ?? "";
export const PM_PHASE_BOT_HEALTH_URL = protocolManifest.serviceUrls?.phaseBotHealth ?? "";
export const PM_PHASE_BOT_READY_URL = protocolManifest.serviceUrls?.phaseBotReady ?? "";

export const PM_MANIFEST_VERSION = protocolManifest.manifestVersion;
export const PM_MANIFEST_HASH = protocolManifest.manifestHash;
export const PM_BENCHMARK_URL = protocolManifest.benchmarkUrl ?? "";

export const COLLATERAL_COIN_TYPE = manifest.collateralCoinType;
export const COLLATERAL_SYMBOL = manifest.collateralSymbol;
export const COLLATERAL_NAME = manifest.collateralName;
export const COLLATERAL_DECIMALS = manifest.collateralDecimals;
export const COLLATERAL_ICON_URL = manifest.collateralIconUrl;

export const PM_MARKET_TYPE = buildGenericStructType("pm_market", "PMMarket");
export const PM_POSITION_TYPE = buildGenericStructType("pm_position", "PMPosition");
export const PM_TREASURY_TYPE = buildGenericStructType("pm_treasury", "PMTreasury");
export const PM_DISPUTE_TYPE = buildGenericStructType("pm_dispute", "PMDispute");
export const PM_RESOLVER_SET_TYPE = buildGenericStructType("pm_dispute", "PMResolverSet");
export const PM_STAKE_POOL_TYPE = buildGenericStructType("pm_staking", "PMStakePool");
export const PM_STAKE_POSITION_TYPE = buildGenericStructType("pm_staking", "PMStakePosition");
export const PM_SDVM_ROUND_TYPE = buildGenericStructType("pm_sdvm", "SDVMVoteRound");
export const PM_SDVM_COMMIT_RECORD_TYPE = buildGenericStructType("pm_sdvm", "SDVMCommitRecord");
export const PM_FAUCET_TYPE = buildGenericStructType("pm_faucet", "PMFaucet");
export const PM_ADMIN_CAP_TYPE = buildGenericStructType("pm_registry", "PMAdminCap");
export const PM_EMERGENCY_CAP_TYPE = buildGenericStructType("pm_admin", "PMEmergencyCap");
export const PM_SDVM_ADMIN_CAP_TYPE = buildGenericStructType("pm_staking", "SDVMAdminCap");
export const PM_VERIFIER_CAP_TYPE = buildGenericStructType("pm_resolution", "PMVerifierCap");

export const EVENT_MARKET_CREATED = buildGenericEventType("pm_market", "MarketCreatedEvent");
export const EVENT_MARKET_FROZEN = buildGenericEventType("pm_market", "MarketFrozenEvent");
export const EVENT_TRADE_EXECUTED = buildGenericEventType("pm_trading", "TradeExecutedEvent");
export const EVENT_MARKET_CLOSED = buildGenericEventType("pm_market", "MarketClosedEvent");
export const EVENT_RESOLUTION_PROPOSED = buildGenericEventType("pm_resolution", "ResolutionProposedEvent");
export const EVENT_DISPUTE_FILED = buildGenericEventType("pm_dispute", "DisputeFiledEvent");
export const EVENT_DISPUTE_RESOLVED = buildGenericEventType("pm_dispute", "DisputeResolvedEvent");
export const EVENT_MARKET_RESOLVED = buildGenericEventType("pm_market", "MarketResolvedEvent");
export const EVENT_MARKET_INVALIDATED = buildGenericEventType("pm_market", "MarketInvalidatedEvent");
export const EVENT_CLAIM_EXECUTED = buildGenericEventType("pm_trading", "ClaimExecutedEvent");
export const EVENT_INVALID_REFUND = buildGenericEventType("pm_trading", "InvalidRefundExecutedEvent");
export const EVENT_EMERGENCY_PAUSE = buildGenericEventType("pm_market", "EmergencyPauseEvent");
export const EVENT_EMERGENCY_INVALIDATION = buildGenericEventType("pm_admin", "EmergencyInvalidationEvent");
export const EVENT_FEES_SWEPT = buildGenericEventType("pm_treasury", "FeesSweptEvent");
export const EVENT_SDVM_ROUND_CREATED = buildGenericEventType("pm_sdvm", "SDVMVoteRoundCreatedEvent");
