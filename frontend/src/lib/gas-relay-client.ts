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

const RELAY_URL = import.meta.env.VITE_GAS_RELAY_URL ?? "http://localhost:3001";
const RELAY_API_KEY = import.meta.env.VITE_GAS_RELAY_API_KEY ?? "";

function relayHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (RELAY_API_KEY) {
    headers["x-api-key"] = RELAY_API_KEY;
  }
  return headers;
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

/**
 * Step 1: Send transaction kind to relay for gas sponsorship.
 */
export async function sponsorTransaction(
  txKindBytes: string, // base64 encoded TransactionKind
  sender: string,
  gasBudget?: number,
): Promise<SponsorResponse> {
  const res = await fetch(`${RELAY_URL}/v1/sponsor`, {
    method: "POST",
    headers: relayHeaders(),
    body: JSON.stringify({ txBytes: txKindBytes, sender, gasBudget }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Sponsor request failed" }));
    throw new Error(err.error ?? `Sponsor failed: ${res.status}`);
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
  const res = await fetch(`${RELAY_URL}/v1/execute`, {
    method: "POST",
    headers: relayHeaders(),
    body: JSON.stringify({ txBytes, userSignature, gasCoinId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Execute request failed" }));
    throw new Error(err.error ?? `Execute failed: ${res.status}`);
  }

  return res.json();
}

/**
 * Check relay health.
 */
export async function checkRelayHealth(): Promise<{ status: string; healthy: boolean }> {
  try {
    const res = await fetch(`${RELAY_URL}/health`);
    return res.json();
  } catch {
    return { status: "unreachable", healthy: false };
  }
}
