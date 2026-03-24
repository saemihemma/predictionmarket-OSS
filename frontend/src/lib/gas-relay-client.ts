/**
 * Gas relay client — sponsors transactions so users don't need SUI for gas.
 *
 * Flow:
 * 1. Build PTB locally (Transaction object)
 * 2. Extract TransactionKind bytes (commands only, no gas info)
 * 3. POST to relay /v1/sponsor → get full tx bytes with sponsor gas
 * 4. User signs the full tx bytes with their wallet
 * 5. POST to relay /v1/execute with user signature → relay co-signs + submits
 */

import { protocolManifest } from "./protocol-config";

function getRelayUrl(): string {
  const relayUrl = protocolManifest.serviceUrls?.gasRelay ?? "";
  if (!relayUrl) {
    throw new Error("Gas relay is not configured for this deployment.");
  }
  return relayUrl;
}
const RELAY_API_KEY = import.meta.env.VITE_GAS_RELAY_API_KEY ?? "";

function relayHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (RELAY_API_KEY) {
    headers["x-api-key"] = RELAY_API_KEY;
  }
  return headers;
}

export class RelayApiError extends Error {
  status: number;
  code?: string;
  reason?: string;

  constructor(message: string, status: number, code?: string, reason?: string) {
    super(message);
    this.name = "RelayApiError";
    this.status = status;
    this.code = code;
    this.reason = reason;
  }
}

interface RelayErrorPayload {
  error?: string;
  code?: string;
  reason?: string;
}

async function throwRelayError(res: Response): Promise<never> {
  const err = (await res.json().catch(() => ({}))) as RelayErrorPayload;
  throw new RelayApiError(
    err.error ?? `Relay request failed: ${res.status}`,
    res.status,
    err.code,
    err.reason,
  );
}

export interface SponsorResponse {
  txBytes: string; // Base64 full transaction bytes with sponsor gas
  sponsorAddress: string;
  gasCoinId: string; // Leased coin ID — must pass back to /execute
}

export interface ExecuteResponse {
  digest: string;
  effects: unknown;
  events: unknown;
}

export interface FaucetEligibilityResponse {
  status: "eligible" | "no_character" | "unavailable" | "campaign_ended";
  reason?: string;
}

export interface RelayHealthResponse {
  status: string;
  healthy: boolean;
  faucetCampaignEnded?: boolean;
  faucetCampaignEndsAt?: string;
}

/**
 * Step 1: Send transaction kind to relay for gas sponsorship.
 */
export async function sponsorTransaction(
  txKindBytes: string, // base64 encoded TransactionKind
  sender: string,
  gasBudget?: number,
): Promise<SponsorResponse> {
  const res = await fetch(`${getRelayUrl()}/v1/sponsor`, {
    method: "POST",
    headers: relayHeaders(),
    body: JSON.stringify({ txBytes: txKindBytes, sender, gasBudget }),
  });

  if (!res.ok) {
    await throwRelayError(res);
  }

  return res.json();
}

/**
 * Step 2: Send user-signed transaction to relay for co-signing and execution.
 */
export async function executeSponsored(
  txBytes: string, // Base64 full tx bytes (same as from sponsor)
  userSignature: string, // Base64 user signature
  gasCoinId: string, // Leased coin ID from sponsor response
): Promise<ExecuteResponse> {
  const res = await fetch(`${getRelayUrl()}/v1/execute`, {
    method: "POST",
    headers: relayHeaders(),
    body: JSON.stringify({ txBytes, userSignature, gasCoinId }),
  });

  if (!res.ok) {
    await throwRelayError(res);
  }

  return res.json();
}

export async function checkFaucetEligibility(sender: string): Promise<FaucetEligibilityResponse> {
  const relayUrl = protocolManifest.serviceUrls?.gasRelay ?? "";
  if (!relayUrl) {
    return {
      status: "unavailable",
      reason: "Gas relay is not configured for this deployment.",
    };
  }

  try {
    const res = await fetch(`${relayUrl}/v1/faucet-eligibility?sender=${encodeURIComponent(sender)}`, {
      headers: relayHeaders(),
    });

    if (!res.ok) {
      await throwRelayError(res);
    }

    return (await res.json()) as FaucetEligibilityResponse;
  } catch (error) {
    if (error instanceof RelayApiError) {
      return {
        status: "unavailable",
        reason: error.reason ?? error.message,
      };
    }

    return {
      status: "unavailable",
      reason: "Frontier eligibility could not be verified right now.",
    };
  }
}

/**
 * Check relay health.
 */
export async function checkRelayHealth(): Promise<RelayHealthResponse> {
  const relayUrl = protocolManifest.serviceUrls?.gasRelay ?? "";
  if (!relayUrl) {
    return { status: "not_configured", healthy: false };
  }

  try {
    const res = await fetch(`${relayUrl}/health`);
    return res.json();
  } catch {
    return { status: "unreachable", healthy: false };
  }
}
