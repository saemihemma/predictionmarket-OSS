/**
 * Market state machine — human-readable labels, available actions per state,
 * transition messages, and the CTA matrix.
 *
 * Emergency pause is a FRONTEND-DERIVED OVERLAY, not an onchain lifecycle state.
 * The v3 spec lifecycle is: OPEN, CLOSED, RESOLUTION_PENDING, DISPUTED, RESOLVED, INVALID.
 * Emergency pause is derived from whatever signal the deployed contract exposes.
 * Do not hard-code a field name until the Move side confirms the shape.
 */

import { MarketState, MARKET_STATE_LABELS } from "./market-types";

// ── Action types ────────────────────────────────────────────────────────

export type MarketAction =
  | "buy"
  | "sell"
  | "claim"
  | "refund"
  | "dispute"
  | "view_dispute_status"
  | "view_diagnostics";

export interface ActionMeta {
  action: MarketAction;
  label: string;
  primary: boolean;
}

// ── State descriptions (plain language for UI) ──────────────────────────

export const MARKET_STATE_DESCRIPTIONS: Record<MarketState, string> = {
  [MarketState.OPEN]: "Market is open for trading",
  [MarketState.CLOSED]: "Trading has ended — awaiting resolution",
  [MarketState.RESOLUTION_PENDING]: "Resolution submitted — dispute window open",
  [MarketState.DISPUTED]: "Resolution contested — dispute in progress",
  [MarketState.RESOLVED]: "Market resolved — claims open for winning positions",
  [MarketState.INVALID]: "Market invalidated — refunds available",
};

// ── CTA matrix ──────────────────────────────────────────────────────────

const ACTIONS_BY_STATE: Record<MarketState, ActionMeta[]> = {
  [MarketState.OPEN]: [
    { action: "buy", label: "BUY", primary: true },
    { action: "sell", label: "SELL", primary: true },
  ],
  [MarketState.CLOSED]: [],
  [MarketState.RESOLUTION_PENDING]: [
    { action: "dispute", label: "FILE DISPUTE", primary: true },
  ],
  [MarketState.DISPUTED]: [
    { action: "view_dispute_status", label: "VIEW DISPUTE", primary: false },
  ],
  [MarketState.RESOLVED]: [
    { action: "claim", label: "CLAIM", primary: true },
  ],
  [MarketState.INVALID]: [
    { action: "refund", label: "CLAIM REFUND", primary: true },
  ],
};

const EMERGENCY_PAUSED_ACTIONS: ActionMeta[] = [
  { action: "view_diagnostics", label: "VIEW DIAGNOSTICS", primary: false },
];

/**
 * Returns the available actions for a market given its current state.
 * Emergency pause blocks ALL actions regardless of lifecycle state.
 */
export function getAvailableActions(
  state: MarketState,
  _isCreator: boolean,
  isWalletConnected: boolean,
  isEmergencyPaused: boolean,
): ActionMeta[] {
  if (isEmergencyPaused) return EMERGENCY_PAUSED_ACTIONS;

  const actions = ACTIONS_BY_STATE[state] ?? [];

  // Write actions require wallet — filter them out if disconnected
  // (the UI should show WalletConnectTerminal instead)
  if (!isWalletConnected) {
    return actions.filter(
      (a) => !["buy", "sell", "claim", "refund", "dispute"].includes(a.action),
    );
  }

  return actions;
}

/**
 * Returns true if the market is in a terminal state (no further transitions).
 */
export function isTerminalState(state: MarketState): boolean {
  return state === MarketState.RESOLVED || state === MarketState.INVALID;
}

/**
 * Human-readable transition message for live state change notifications.
 */
export function getStateTransitionMessage(
  oldState: MarketState,
  newState: MarketState,
): string {
  const from = MARKET_STATE_LABELS[oldState] ?? "UNKNOWN";
  const to = MARKET_STATE_LABELS[newState] ?? "UNKNOWN";

  // Specific messages for common transitions
  if (oldState === MarketState.OPEN && newState === MarketState.CLOSED) {
    return "MARKET CLOSED — Trading has ended";
  }
  if (newState === MarketState.RESOLUTION_PENDING) {
    return "RESOLUTION PROPOSED — Dispute window is now open";
  }
  if (newState === MarketState.DISPUTED) {
    return "RESOLUTION CONTESTED — Dispute filed";
  }
  if (newState === MarketState.RESOLVED) {
    return "MARKET RESOLVED — Claims are now open";
  }
  if (newState === MarketState.INVALID) {
    return "MARKET INVALIDATED — Refunds available";
  }

  return `State changed: ${from} → ${to}`;
}

/**
 * Returns true if local wall-clock time has passed the market close time.
 * Used for optimistic CTA disabling before the on-chain state catches up
 * (Sui has no cron — MarketClosed is emitted on first interaction after close).
 */
export function isOptimisticallyClosed(closeTimeMs: number): boolean {
  return Date.now() >= closeTimeMs;
}

/**
 * Emergency pause check. Returns true if the market's emergency pause signal
 * is active. The exact field/shape is TBD — this helper abstracts it so
 * components don't hard-code field access.
 */
export function isEmergencyPaused(market: { emergencyPaused: boolean }): boolean {
  return Boolean(market.emergencyPaused);
}
