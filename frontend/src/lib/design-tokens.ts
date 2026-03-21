/** Typed constants mirroring the CSS custom properties in index.css */

export const tokens = {
  bg: {
    terminal: "#020503",
    panel: "#06110c",
  },
  mint: {
    base: "#caf5de",
    dim: "#6e9f8d",
  },
  orange: {
    base: "#dd5807",
    dim: "#8f3a05",
  },
  yellow: {
    base: "#f2c94c",
    dim: "#9a7c2c",
  },
  neutral: "#4f6b60",
  border: {
    panel: "#2a3a33",
    active: "#caf5de",
    grid: "#0f1e18",
    inactive: "#1b2b24",
    edge: "#6e9f8d",
  },
  text: {
    base: "#caf5de",
    muted: "#6e9f8d",
    dim: "#3d5c50",
  },
} as const;

/** Outcome ID → color token (1 = outcome A, 2 = outcome B) */
export function outcomeColor(outcomeId: number | undefined): string {
  if (outcomeId === 1) return "var(--tribe-a)";
  if (outcomeId === 2) return "var(--tribe-b)";
  return "var(--mint-dim)";
}

/** Outcome A accent (primary outcome color) */
export const OUTCOME_A_COLOR = "var(--tribe-a)";
export const OUTCOME_B_COLOR = "var(--tribe-b)";

/** Legacy aliases for backward compatibility */
export const tribeColor = outcomeColor;
export const TRIBE_A_COLOR = OUTCOME_A_COLOR;
export const TRIBE_B_COLOR = OUTCOME_B_COLOR;
