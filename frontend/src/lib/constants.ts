export const LIVE_VERIFIER_SNAPSHOT_URL =
  import.meta.env.VITE_LIVE_VERIFIER_SNAPSHOT_URL ??
  import.meta.env.VITE_VERIFIER_SNAPSHOT_URL ??
  "/verifier/latest.json";
export const LIVE_VERIFIER_POLL_INTERVAL_MS = Number(
  import.meta.env.VITE_LIVE_VERIFIER_POLL_INTERVAL_MS ??
    import.meta.env.VITE_VERIFIER_POLL_INTERVAL_MS ??
    (import.meta.env.DEV ? "60000" : "0"),
);
export const SIMULATION_VERIFIER_SNAPSHOT_URL =
  import.meta.env.VITE_SIM_VERIFIER_SNAPSHOT_URL ?? (import.meta.env.DEV ? "/verifier/live.json" : "");
export const SIMULATION_VERIFIER_POLL_INTERVAL_MS = Number(
  import.meta.env.VITE_SIM_VERIFIER_POLL_INTERVAL_MS ?? (import.meta.env.DEV ? "60000" : "0"),
);
// Backward-compatible aliases used by current war/audit pages.
export const VERIFIER_SNAPSHOT_URL = LIVE_VERIFIER_SNAPSHOT_URL;
export const VERIFIER_POLL_INTERVAL_MS = LIVE_VERIFIER_POLL_INTERVAL_MS;

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

export const CONTROL_STATE_NEUTRAL = 0;
export const CONTROL_STATE_CONTESTED = 1;
export const CONTROL_STATE_CONTROLLED = 2;
