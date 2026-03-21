/**
 * Shared polling interval constants for React Query hooks.
 * All market-related queries should use these to prevent stale-state races
 * between market data and position data.
 *
 * With Sui GraphQL reads being cheap (direct full-node queries),
 * 5s is a reasonable interval for active trading views.
 */

/** Active view: market detail, trading panel, positions */
export const POLL_INTERVAL_ACTIVE_MS = 5_000;
export const STALE_TIME_ACTIVE_MS = 3_000;

/** List view: market listings, balance */
export const POLL_INTERVAL_LIST_MS = 10_000;
export const STALE_TIME_LIST_MS = 5_000;

/** Background: history, activity feed */
export const POLL_INTERVAL_BACKGROUND_MS = 15_000;
export const STALE_TIME_BACKGROUND_MS = 10_000;
