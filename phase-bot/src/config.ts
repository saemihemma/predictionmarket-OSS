import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface DeploymentManifest {
  rpcUrl?: string;
  packageId?: string;
  collateralCoinType?: string;
  stakingPoolId?: string;
  serviceUrls?: {
    phaseBotHealth?: string;
    phaseBotReady?: string;
    gasRelay?: string;
  };
}

export interface LoadedPhaseBotConfig {
  rpcUrl: string;
  botKeypair: string;
  pmPackageId: string;
  collateralCoinType: string;
  stakingPoolId: string;
  pollIntervalMs: number;
  healthPort: number;
  logLevel: string;
  manifestPath?: string;
}

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const defaultManifestPath = path.resolve(currentDir, "../../deployments/testnet.json");

function readManifest(manifestPath: string): DeploymentManifest | null {
  if (!fs.existsSync(manifestPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(manifestPath, "utf8")) as DeploymentManifest;
}

function isDeployedEnvironment(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    Boolean(process.env.RAILWAY_PROJECT_ID) ||
    Boolean(process.env.RAILWAY_ENVIRONMENT_NAME)
  );
}

export function loadPhaseBotConfig(): LoadedPhaseBotConfig {
  const deployed = isDeployedEnvironment();
  const manifestPath = process.env.PM_MANIFEST_PATH ?? (!deployed ? defaultManifestPath : undefined);
  const manifest = manifestPath ? readManifest(manifestPath) : null;

  const botKeypair = process.env.BOT_KEYPAIR;
  const rpcUrl = process.env.SUI_RPC_URL ?? manifest?.rpcUrl ?? (!deployed ? "https://fullnode.testnet.sui.io:443" : undefined);
  const pmPackageId = process.env.PM_PACKAGE_ID ?? manifest?.packageId;
  const collateralCoinType = process.env.PM_COLLATERAL_COIN_TYPE ?? manifest?.collateralCoinType;
  const stakingPoolId = process.env.PM_STAKING_POOL_ID ?? manifest?.stakingPoolId;

  if (!botKeypair) {
    throw new Error("BOT_KEYPAIR environment variable not set");
  }
  if (!rpcUrl) {
    throw new Error("SUI_RPC_URL environment variable not set for deployed phase-bot.");
  }
  if (!pmPackageId) {
    throw new Error("Prediction market package ID not found. Set PM_PACKAGE_ID.");
  }
  if (!collateralCoinType) {
    throw new Error("Collateral coin type not found. Set PM_COLLATERAL_COIN_TYPE.");
  }
  if (!stakingPoolId) {
    throw new Error("Staking pool ID not found. Set PM_STAKING_POOL_ID.");
  }

  return {
    rpcUrl,
    botKeypair,
    pmPackageId,
    collateralCoinType,
    stakingPoolId,
    pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS ?? "60000", 10),
    healthPort: parseInt(process.env.HEALTH_PORT ?? "3000", 10),
    logLevel: process.env.LOG_LEVEL ?? "info",
    manifestPath: manifest ? manifestPath : undefined,
  };
}
