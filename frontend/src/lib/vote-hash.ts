/**
 * @suffer/vote-hash — Commit-Reveal Hash Library
 *
 * Implements BCS serialization and SHA3-256 hashing for SUFFER SDVM votes.
 * Provides deterministic hash construction that matches Move contract implementation.
 *
 * CRITICAL: BCS serializes u16 as 2 bytes LITTLE-ENDIAN (not big-endian).
 * This implementation corrects the big-endian error in spec Appendix B.
 *
 * Hash formula:
 *   preimage = bcs_serialize_u16(outcome) ++ salt_bytes
 *   hash = sha3_256(preimage)
 *
 * Where bcs_serialize_u16 is little-endian: [outcome & 0xFF, (outcome >> 8) & 0xFF]
 */

import { sha3_256 } from "@noble/hashes/sha3.js";

/**
 * Special outcome value representing explicit abstention.
 * Voters who commit ABSTAIN do not earn rewards but are not slashed.
 * ABSTAIN = 0xFFFF (65535 in decimal, all bits set in u16).
 */
export const OUTCOME_ABSTAIN = 0xffff;

/**
 * Generates a cryptographically secure random salt for vote commitment.
 * Returns 32 bytes of random data suitable for use in commit-reveal voting.
 *
 * @returns A Uint8Array containing 32 random bytes.
 *
 * @example
 * const salt = generateSalt();
 * // salt is now 32 random bytes, ready for commitment
 */
export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

/**
 * Serializes a u16 outcome to 2 bytes using BCS (Binary Canonical Serialization).
 * BCS always uses little-endian byte order for integers.
 *
 * IMPORTANT: The SUFFER_DVM_SPEC.md Appendix B incorrectly specifies big-endian.
 * This implementation uses little-endian, which is the BCS standard and matches
 * the Sui Move @mysten/sui/bcs library.
 *
 * @param outcome - A u16 value (0 to 65535)
 * @returns Uint8Array containing exactly 2 bytes in little-endian order
 *
 * @throws Error if outcome is not a valid u16 (< 0 or > 65535)
 *
 * @example
 * serializeOutcome(0)       // [0x00, 0x00]
 * serializeOutcome(1)       // [0x01, 0x00]
 * serializeOutcome(256)     // [0x00, 0x01]
 * serializeOutcome(0xFFFF)  // [0xFF, 0xFF]  — OUTCOME_ABSTAIN
 */
export function serializeOutcome(outcome: number): Uint8Array {
  if (!Number.isInteger(outcome) || outcome < 0 || outcome > 0xffff) {
    throw new Error(`Invalid u16 outcome: ${outcome}. Must be between 0 and 65535.`);
  }

  // BCS u16 is little-endian: [low byte, high byte]
  const bytes = new Uint8Array(2);
  bytes[0] = outcome & 0xff;          // Low byte
  bytes[1] = (outcome >> 8) & 0xff;   // High byte
  return bytes;
}

/**
 * Builds a commit-reveal hash for an SDVM vote.
 *
 * The hash is computed as:
 *   sha3_256(bcs_serialize_u16(outcome) || salt)
 *
 * Where:
 * - bcs_serialize_u16(outcome) produces 2 bytes in little-endian order
 * - || denotes byte concatenation
 * - sha3_256 is the SHA3-256 cryptographic hash function
 *
 * This hash is submitted during the COMMIT phase and verified during the REVEAL phase.
 *
 * @param outcome - The vote outcome (u16: 0 to 65535). Use OUTCOME_ABSTAIN (0xFFFF) for explicit abstention.
 * @param salt - A Uint8Array of random bytes (typically 32 bytes from generateSalt())
 * @returns Uint8Array containing exactly 32 bytes (SHA3-256 digest)
 *
 * @throws Error if outcome is not a valid u16 or salt is not a Uint8Array
 *
 * @example
 * const salt = generateSalt();
 * const hash = buildCommitHash(1, salt);  // Vote for outcome 1
 * // hash is 32 bytes, ready to submit in commit_vote() transaction
 *
 * @example
 * // Explicit abstention vote
 * const abstainHash = buildCommitHash(OUTCOME_ABSTAIN, salt);
 * // Voter commits abstain but reveals it without rewards/slashing
 */
export function buildCommitHash(outcome: number, salt: Uint8Array): Uint8Array {
  if (!(salt instanceof Uint8Array)) {
    throw new Error("Salt must be a Uint8Array");
  }

  // Serialize outcome as little-endian u16
  const outcomeBytes = serializeOutcome(outcome);

  // Concatenate: outcome_bytes ++ salt_bytes
  const preimage = new Uint8Array(2 + salt.length);
  preimage.set(outcomeBytes, 0);
  preimage.set(salt, 2);

  // SHA3-256 hash
  return new Uint8Array(sha3_256(preimage));
}

/**
 * Verifies that a revealed vote matches its original commitment hash.
 *
 * This is called during the REVEAL phase to ensure the voter didn't change their vote.
 * Recomputes the hash from the revealed outcome and salt, then compares to the original commitment.
 *
 * @param outcome - The revealed vote outcome (u16)
 * @param salt - The salt used in the original commitment
 * @param expectedHash - The original commitment hash (from the COMMIT phase)
 * @returns true if the hash matches (vote is valid), false if mismatch (vote is invalid/slashed)
 *
 * @example
 * // During reveal phase:
 * const isValid = verifyCommitHash(outcome, salt, storedCommitmentHash);
 * if (!isValid) {
 *   // Voter tried to change their vote or salt is wrong
 *   // They will be slashed
 * } else {
 *   // Hash matches, proceed with vote reveal
 * }
 */
export function verifyCommitHash(
  outcome: number,
  salt: Uint8Array,
  expectedHash: Uint8Array,
): boolean {
  try {
    const computedHash = buildCommitHash(outcome, salt);
    // Compare byte-by-byte (constant time)
    return bytesEqual(computedHash, expectedHash);
  } catch {
    // Invalid outcome, salt, or hash format
    return false;
  }
}

/**
 * Constant-time byte array comparison.
 * Prevents timing attacks by comparing all bytes even if early mismatch found.
 *
 * @param a - First byte array
 * @param b - Second byte array
 * @returns true if arrays are equal in length and content, false otherwise
 *
 * @internal Used by verifyCommitHash to prevent timing-based attacks
 */
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;

  let isEqual = 0;
  for (let i = 0; i < a.length; i++) {
    isEqual |= a[i] ^ b[i];
  }
  return isEqual === 0;
}

/**
 * Converts a byte array to a hexadecimal string for display/comparison.
 * Useful for logging, debugging, and user-facing hash displays.
 *
 * @param bytes - The byte array to convert
 * @returns Hexadecimal string with "0x" prefix (lowercase)
 *
 * @example
 * const salt = generateSalt();
 * const hash = buildCommitHash(1, salt);
 * console.log("Commitment hash: " + bytesToHex(hash));
 * // Output: "Commitment hash: 0x3f7e1a2b..."
 */
export function bytesToHex(bytes: Uint8Array): string {
  return "0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Converts a hexadecimal string to a byte array.
 * Used when recovering hashes or salts from storage (hex-encoded format).
 *
 * @param hex - Hexadecimal string (with or without "0x" prefix)
 * @returns Uint8Array representation of the hex string
 *
 * @throws Error if the hex string is invalid or odd length
 *
 * @example
 * const hash = hexToBytes("0x3f7e1a2b...");
 * const isValid = verifyCommitHash(outcome, salt, hash);
 */
export function hexToBytes(hex: string): Uint8Array {
  const trimmed = hex.replace(/^0x/, "");
  if (trimmed.length % 2 !== 0) {
    throw new Error(`Invalid hex string: odd length "${hex}"`);
  }

  const bytes = new Uint8Array(trimmed.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const byteHex = trimmed.slice(i * 2, i * 2 + 2);
    bytes[i] = parseInt(byteHex, 16);
  }
  return bytes;
}
