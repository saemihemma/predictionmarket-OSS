import { MarketType, ResolutionClass, TrustTier } from "./market-types";

export interface ProtocolManifest {
  network: string;
  rpcUrl: string;
  graphqlUrl: string;
  manifestVersion: string;
  manifestHash: string;
  benchmarkUrl?: string;
  packageId: string;
  collateralCoinType: string;
  collateralSymbol: string;
  collateralName: string;
  collateralDecimals: number;
  collateralIconUrl: string;
  registryId: string;
  configId: string;
  treasuryId: string;
  faucetId?: string;
  resolverSetId: string;
  resolverPolicyId: string;
  emergencyMultisigId: string;
  stakingPoolId: string;
  governanceTrackerId: string;
  adminCapId: string;
  emergencyCapId: string;
  sdvmAdminCapId: string;
  verifierCapId: string;
  upgradeCapId?: string;
  deployerAddress?: string;
  operatorAddress?: string;
  serviceUrls?: {
    gasRelay?: string;
    phaseBotHealth?: string;
    phaseBotReady?: string;
  };
  marketTypePolicies: Record<string, string>;
}

export interface PolicyLookupInput {
  trustTier: TrustTier;
  marketType: MarketType;
  resolutionClass: ResolutionClass;
}

const PUBLIC_MANIFEST_PATH = `${import.meta.env.BASE_URL}protocol-manifest.json`;

let loadedProtocolManifest: ProtocolManifest | null = null;
let manifestLoadPromise: Promise<ProtocolManifest> | null = null;

function validateProtocolManifest(manifest: unknown): ProtocolManifest {
  if (!manifest || typeof manifest !== "object") {
    throw new Error("Protocol manifest response was not an object.");
  }

  const candidate = manifest as Partial<ProtocolManifest>;
  if (
    typeof candidate.network !== "string" ||
    typeof candidate.rpcUrl !== "string" ||
    typeof candidate.graphqlUrl !== "string" ||
    typeof candidate.packageId !== "string" ||
    typeof candidate.collateralCoinType !== "string" ||
    typeof candidate.configId !== "string" ||
    typeof candidate.registryId !== "string" ||
    typeof candidate.marketTypePolicies !== "object" ||
    candidate.marketTypePolicies === null
  ) {
    throw new Error("Protocol manifest is missing required fields.");
  }

  return candidate as ProtocolManifest;
}

async function loadProtocolManifest(): Promise<ProtocolManifest> {
  const response = await fetch(PUBLIC_MANIFEST_PATH, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Failed to load protocol manifest from ${PUBLIC_MANIFEST_PATH} (${response.status}).`);
  }

  const manifest = validateProtocolManifest(await response.json());
  loadedProtocolManifest = manifest;
  return manifest;
}

export async function initializeProtocolManifest(): Promise<ProtocolManifest> {
  if (loadedProtocolManifest) {
    return loadedProtocolManifest;
  }

  if (!manifestLoadPromise) {
    manifestLoadPromise = loadProtocolManifest();
  }

  try {
    return await manifestLoadPromise;
  } finally {
    manifestLoadPromise = null;
  }
}

export function getProtocolManifest(): ProtocolManifest {
  if (!loadedProtocolManifest) {
    throw new Error("Protocol manifest has not been initialized yet.");
  }

  return loadedProtocolManifest;
}

export const protocolManifest = new Proxy({} as ProtocolManifest, {
  get(_target, prop) {
    return Reflect.get(getProtocolManifest(), prop);
  },
});

export function buildPolicyKey(input: PolicyLookupInput): string {
  return `${input.trustTier}:${input.marketType}:${input.resolutionClass}`;
}

export function getMarketTypePolicyId(input: PolicyLookupInput): string {
  const key = buildPolicyKey(input);
  const policyId = getProtocolManifest().marketTypePolicies[key];
  if (!policyId) {
    throw new Error(`No market type policy configured for ${key}.`);
  }
  return policyId;
}

export function assertConfiguredId(id: string, label: string): string {
  if (!id || id === "0x0") {
    throw new Error(`${label} is not configured in the protocol manifest yet.`);
  }
  return id;
}

export function assertProtocolPackageId(): string {
  return assertConfiguredId(getProtocolManifest().packageId, "Protocol package ID");
}

export function hasLiveProtocolDeployment(): boolean {
  const manifest = getProtocolManifest();
  return manifest.packageId !== "0x0" && manifest.registryId !== "0x0";
}

export function buildGenericStructType(moduleName: string, structName: string): string {
  const manifest = getProtocolManifest();
  return `${manifest.packageId}::${moduleName}::${structName}<${manifest.collateralCoinType}>`;
}

export function buildGenericEventType(moduleName: string, structName: string): string {
  return buildGenericStructType(moduleName, structName);
}

export function getRequiredResolutionClassForTier(trustTier: TrustTier): ResolutionClass {
  switch (trustTier) {
    case TrustTier.CANONICAL:
      return ResolutionClass.DETERMINISTIC;
    case TrustTier.SOURCE_BOUND:
      return ResolutionClass.DECLARED_SOURCE;
    case TrustTier.CREATOR_RESOLVED:
    case TrustTier.EXPERIMENTAL:
    default:
      return ResolutionClass.CREATOR_PROPOSED;
  }
}

export function getTokenScale(decimals = getProtocolManifest().collateralDecimals): bigint {
  return 10n ** BigInt(decimals);
}
