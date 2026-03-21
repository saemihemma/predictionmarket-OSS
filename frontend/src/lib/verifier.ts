export interface VerifierTribeScore {
  id: number;
  name: string;
  points: number;
  color: string;
}

export interface VerifierSystemControl {
  id: string;
  name: string;
  state: number;
  controller?: number;
  pointsPerTick: number;
}

export interface VerifierSystemDisplayConfig {
  systemId: string;
  displayName?: string;
  publicRuleText: string;
}

export interface VerifierChartSeries {
  tribeId: number;
  dataKey: string;
  name: string;
  color: string;
}

export interface VerifierChartPoint {
  tick: number;
  timestamp: number;
  [key: string]: number | string;
}

export interface VerifierTickPlanEntry {
  tickTimestampMs: number;
  systemId: number;
}

export interface VerifierSnapshotCommitment {
  warId: number;
  systemId: number;
  tickTimestampMs: number;
  state: string;
  controllerTribeId: number | null;
  pointsAwarded: number;
  snapshotHash: string;
}

export interface VerifierPointAward {
  tribeId: number;
  points: number;
}

export interface VerifierSnapshot {
  snapshotVersion: number;
  warId: number;
  systemId: number;
  tickTimestampMs: number;
  state: string;
  controllerTribeId: number | null;
  pointsAwarded: VerifierPointAward[];
  config: {
    warConfigObjectId?: string;
    phaseObjectId?: string | null;
    systemConfigObjectId?: string;
    warConfigVersion: number;
    phaseId: number | null;
    systemConfigVersion: number;
  };
  resolution: {
    topTribeId: number | null;
    topScore: number;
    secondTribeId: number | null;
    secondScore: number;
    requiredMargin: number;
  };
  presenceRows: Array<{
    tribeId: number;
    presenceScore: number;
    qualifyingAssemblyCount: number;
  }>;
  explanation: {
    pointsPerTick: number;
    allowedAssemblyFamilies: string[];
    allowedAssemblyTypeIds: number[];
    allowedStorageTypeIds: number[];
    storageRequirementMode: string;
    requiredItemTypeIds: number[];
    takeMargin: number;
    holdMargin: number;
  };
}

export interface VerifierScoreboardPayload {
  warName: string;
  lastTickMs: number;
  tickRateMinutes?: number;
  tribeScores: VerifierTribeScore[];
  systems: VerifierSystemControl[];
  chartData: VerifierChartPoint[];
  chartSeries: VerifierChartSeries[];
  commitments?: VerifierSnapshotCommitment[];
  snapshots?: VerifierSnapshot[];
}

export interface VerifierAuditInputSummary {
  candidateCollection: {
    mode: string;
    detail?: string;
    path?: string | null;
    objectCount?: number;
  };
  activeSystems: {
    mode: string;
    detail?: string;
    path?: string | null;
    objectCount?: number;
  };
  ownerResolution: {
    mode: string;
    detail?: string;
    path?: string | null;
    objectCount?: number;
  };
  locationResolution: {
    mode: string;
    detail?: string;
    path?: string | null;
    objectCount?: number;
  };
}

export interface VerifierAuditSummary {
  artifactVersion: number;
  generatedAtMs: number;
  verifierVersion: string;
  sourceMode: string;
  indexPath: string | null;
  latestTickArtifactPath: string | null;
  latestReceiptPath: string | null;
  inputs: VerifierAuditInputSummary;
}

export interface VerifierScoreboardEnvelope {
  scoreboard: VerifierScoreboardPayload | null;
  config?: Record<string, unknown>;
  tickPlan?: VerifierTickPlanEntry[];
  commitments?: VerifierSnapshotCommitment[];
  snapshots?: VerifierSnapshot[];
  systemDisplayConfigs?: VerifierSystemDisplayConfig[];
  audit?: VerifierAuditSummary;
}

export interface VerifierAuditIndex {
  artifactVersion: number;
  generatedAtMs: number;
  verifierVersion: string;
  sourceMode: string;
  latestTickMs: number | null;
  availableTicks: Array<{
    tickTimestampMs: number;
    path: string;
    receiptPath: string;
    systemCount: number;
  }>;
  trackedSystems: Array<{ id: string; name: string }>;
  latestPath: string | null;
}

export interface VerifierTickAuditArtifact {
  artifactVersion: number;
  generatedAtMs: number;
  verifierVersion: string;
  sourceMode: string;
  tickTimestampMs: number;
  warId: number;
  tickPlan: VerifierTickPlanEntry[];
  commitments: VerifierSnapshotCommitment[];
  snapshots: VerifierSnapshot[];
  scoreboard: {
    tick: number;
    timestamp: number;
    tribeScores: VerifierTribeScore[];
  } | null;
  inputs: VerifierAuditInputSummary;
  systems: Array<{
    systemId: number;
    snapshot: VerifierSnapshot;
    commitment: VerifierSnapshotCommitment;
    resolution: VerifierSnapshot["resolution"] & { pointsAwarded?: number };
    presenceRows: Array<{
      warId: number;
      systemId: number;
      tickTimestampMs: number;
      tribeId: number;
      presenceScore: number;
      qualifyingAssemblyCount: number;
      assemblies: Array<{
        assemblyId: string;
        assemblyFamily: string;
        assemblyTypeId: number;
        status: string;
        countsForPresence: boolean;
        storageRulePassed: boolean;
        excludedReason: string | null;
      }>;
    }>;
    candidateAssemblies: Array<{
      assemblyId: string;
      systemId: number;
      ownerCharacterId: string;
      tribeId: number;
      assemblyFamily: string;
      assemblyTypeId: number;
      storageTypeId: number | null;
      status: string;
      inventory: Array<{ itemTypeId: number; quantity: number }>;
      provenance?: {
        candidateSource: string;
        systemSource: string;
        ownerCharacterSource: string;
        tribeSource: string;
        assemblyMetadataSource: string;
        statusSource: string;
        inventorySource: string;
        locationSource?: string | null;
      };
    }>;
    editorialDisplay: VerifierSystemDisplayConfig | null;
  }>;
  receiptPath: string;
}

export interface VerifierTickReceipt {
  artifactVersion: number;
  generatedAtMs: number;
  inputPath: string;
  rpcUrl: string;
  sender: string;
  mode: "dry-run" | "execute";
  tickTimestampMs: number;
  manifestCount: number;
  results: Array<{
    mode: "dry-run" | "execute";
    systemId: number;
    tickTimestampMs: number;
    digest?: string;
    effects?: unknown;
    balanceChanges?: unknown[];
  }>;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load verifier data from ${url}`);
  }
  return (await response.json()) as T;
}

export async function fetchVerifierEnvelope(url: string): Promise<VerifierScoreboardEnvelope> {
  const payload = await fetchJson<VerifierScoreboardEnvelope>(url);
  if (!payload.scoreboard) {
    throw new Error(`Verifier payload at ${url} did not include a scoreboard section`);
  }
  return payload;
}

export async function fetchVerifierScoreboard(url: string): Promise<VerifierScoreboardPayload> {
  const payload = await fetchVerifierEnvelope(url);
  return payload.scoreboard!;
}

export function buildAuditIndexUrl(snapshotUrl: string): string {
  const url = new URL(snapshotUrl, window.location.origin);
  const pathname = url.pathname;
  const lastSlash = pathname.lastIndexOf("/");
  const directory = lastSlash >= 0 ? pathname.slice(0, lastSlash) : "";
  const filename = lastSlash >= 0 ? pathname.slice(lastSlash + 1) : pathname;
  const stem = filename.replace(/\.[^.]+$/, "");
  return `${directory}/audit/${stem}/index.json`;
}

export function buildAuditArtifactUrl(indexUrl: string, relativePath: string): string {
  return new URL(relativePath, new URL(indexUrl, window.location.origin)).toString();
}

export async function fetchAuditIndex(url: string): Promise<VerifierAuditIndex> {
  return fetchJson<VerifierAuditIndex>(url);
}

export async function fetchTickAuditArtifact(url: string): Promise<VerifierTickAuditArtifact> {
  return fetchJson<VerifierTickAuditArtifact>(url);
}

export async function fetchTickReceipt(url: string): Promise<VerifierTickReceipt> {
  return fetchJson<VerifierTickReceipt>(url);
}
