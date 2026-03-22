import { sha256 } from "@noble/hashes/sha2.js";

export async function hashUtf8ToBytes32(input: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(input);

  if (typeof window !== "undefined" && window.crypto?.subtle) {
    const digest = await window.crypto.subtle.digest("SHA-256", bytes);
    return new Uint8Array(digest);
  }

  return sha256(bytes);
}
