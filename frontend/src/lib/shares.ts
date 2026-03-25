export function normalizeShareInput(input: string): string {
  return input.trim().replace(/[\s,_]/g, "");
}

export function parseShareInput(input: string): bigint {
  const trimmed = normalizeShareInput(input);
  if (!trimmed) {
    return 0n;
  }

  if (!/^\d+$/.test(trimmed)) {
    if (/^\d*\.\d+$/.test(trimmed)) {
      throw new Error("Share quantity must be a whole number.");
    }

    throw new Error("Invalid share quantity.");
  }

  return BigInt(trimmed);
}

export function formatShareAmount(amount: bigint): string {
  return amount.toLocaleString("en-US");
}

export function formatShareLabel(amount: bigint): string {
  return `${formatShareAmount(amount)} ${amount === 1n ? "SHARE" : "SHARES"}`;
}
