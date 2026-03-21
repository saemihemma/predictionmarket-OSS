/**
 * Shared formatting utilities.
 * Extracted from MarketDetailPage inline function.
 */

export function formatNumber(n: bigint): string {
  const num = Number(n);
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
  return num.toString();
}

/**
 * Format a token value for display. Avoids "0.0K" — shows "0" for zero.
 */
export function formatValue(n: bigint): string {
  const num = Number(n);
  if (num === 0) return "0";
  if (Math.abs(num) >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
  if (Math.abs(num) >= 1_000) return (num / 1_000).toFixed(1) + "K";
  return num.toString();
}

/**
 * Format a P&L value with sign prefix. Avoids "0.0K" — shows "0" for zero.
 */
export function formatPnL(n: bigint): string {
  const num = Number(n);
  if (num === 0) return "0";
  const prefix = num > 0 ? "+" : "";
  if (Math.abs(num) >= 1_000_000) return prefix + (num / 1_000_000).toFixed(1) + "M";
  if (Math.abs(num) >= 1_000) return prefix + (num / 1_000).toFixed(1) + "K";
  return prefix + num.toString();
}

export function formatAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return address.slice(0, 6) + "..." + address.slice(-4);
}
