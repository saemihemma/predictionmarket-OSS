/** Control state → CSS var and label resolution */

export const CONTROL_STATE_NEUTRAL = 0;
export const CONTROL_STATE_CONTESTED = 1;
export const CONTROL_STATE_CONTROLLED = 2;

export type ControlState = 0 | 1 | 2;

function tribeColorForController(controller: number | undefined, tribeColorById?: Record<number, string>): string {
  if (controller === undefined) {
    return "var(--mint)";
  }
  return tribeColorById?.[controller] ?? (controller === 2 ? "var(--tribe-b)" : "var(--tribe-a)");
}

export function stateColor(state: number, controller?: number, tribeColorById?: Record<number, string>): string {
  if (state === CONTROL_STATE_NEUTRAL) return "var(--neutral-state)";
  if (state === CONTROL_STATE_CONTESTED) return "var(--orange)";
  if (state === CONTROL_STATE_CONTROLLED) {
    return tribeColorForController(controller, tribeColorById);
  }
  return "var(--text-muted)";
}

export function stateBorderColor(state: number, controller?: number, tribeColorById?: Record<number, string>): string {
  if (state === CONTROL_STATE_NEUTRAL) return "var(--neutral-state)";
  if (state === CONTROL_STATE_CONTESTED) return "var(--orange)";
  if (state === CONTROL_STATE_CONTROLLED) {
    return tribeColorForController(controller, tribeColorById);
  }
  return "var(--border-panel)";
}

export function stateLabel(state: number): string {
  if (state === CONTROL_STATE_NEUTRAL) return "NEUTRAL";
  if (state === CONTROL_STATE_CONTESTED) return "CONTESTED";
  if (state === CONTROL_STATE_CONTROLLED) return "CONTROLLED";
  return "UNKNOWN";
}

export function stateBgColor(state: number, controller?: number, tribeColorById?: Record<number, string>): string {
  if (state === CONTROL_STATE_NEUTRAL) return "rgba(79, 107, 96, 0.08)";
  if (state === CONTROL_STATE_CONTESTED) return "rgba(221, 122, 31, 0.06)";
  if (state === CONTROL_STATE_CONTROLLED) {
    const color = tribeColorForController(controller, tribeColorById);
    if (color === "var(--tribe-b)") return "rgba(77, 184, 212, 0.06)";
    if (color === "var(--tribe-a)") return "rgba(242, 201, 76, 0.06)";
    return "rgba(255, 255, 255, 0.04)";
  }
  return "transparent";
}
