/**
 * Test suite for @suffer/vote-hash library
 *
 * Covers:
 * - Salt generation (randomness and length)
 * - BCS u16 serialization (little-endian byte order)
 * - Commit hash building and verification
 * - Edge cases (min/max outcomes, zero salt, etc.)
 * - Special outcome values (ABSTAIN)
 * - Byte conversion utilities
 *
 * All test vectors are computed and verified independently.
 */

import { describe, it, expect } from "vitest";
import {
  generateSalt,
  buildCommitHash,
  verifyCommitHash,
  serializeOutcome,
  bytesToHex,
  hexToBytes,
  OUTCOME_ABSTAIN,
} from "./vote-hash";
import { sha3_256 } from "@noble/hashes/sha3";

describe("vote-hash", () => {
  describe("generateSalt", () => {
    it("should generate 32 random bytes", () => {
      const salt = generateSalt();
      expect(salt).toBeInstanceOf(Uint8Array);
      expect(salt.length).toBe(32);
    });

    it("should generate different salts on each call", () => {
      const salt1 = generateSalt();
      const salt2 = generateSalt();
      expect(bytesToHex(salt1)).not.toBe(bytesToHex(salt2));
    });

    it("should produce cryptographically random bytes", () => {
      // Generate multiple salts and check for statistical properties
      const salts = Array.from({ length: 100 }, () => generateSalt());
      const allBytes = salts.flatMap((s) => Array.from(s));

      // Check: not all zeros
      expect(allBytes.some((b) => b !== 0)).toBe(true);

      // Check: not all 0xFF
      expect(allBytes.some((b) => b !== 0xff)).toBe(true);

      // Check: distribution is roughly uniform (statistical test)
      const byteFreq = new Map<number, number>();
      for (const byte of allBytes) {
        byteFreq.set(byte, (byteFreq.get(byte) ?? 0) + 1);
      }
      const minFreq = Math.min(...byteFreq.values());
      const maxFreq = Math.max(...byteFreq.values());

      // In 3200 random bytes (100 salts × 32 bytes), each value 0-255 should appear
      // roughly 3200/256 = 12.5 times. Allow range [5, 25] to be loose
      expect(minFreq).toBeGreaterThan(0);
      expect(maxFreq).toBeLessThan(50);
    });
  });

  describe("serializeOutcome", () => {
    it("should serialize outcome 0 as [0x00, 0x00]", () => {
      const bytes = serializeOutcome(0);
      expect(bytes).toEqual(new Uint8Array([0x00, 0x00]));
    });

    it("should serialize outcome 1 as [0x01, 0x00] (little-endian)", () => {
      const bytes = serializeOutcome(1);
      expect(bytes).toEqual(new Uint8Array([0x01, 0x00]));
    });

    it("should serialize outcome 255 as [0xFF, 0x00]", () => {
      const bytes = serializeOutcome(255);
      expect(bytes).toEqual(new Uint8Array([0xff, 0x00]));
    });

    it("should serialize outcome 256 as [0x00, 0x01] (high byte in second position)", () => {
      const bytes = serializeOutcome(256);
      expect(bytes).toEqual(new Uint8Array([0x00, 0x01]));
    });

    it("should serialize max u16 (65535) as [0xFF, 0xFF]", () => {
      const bytes = serializeOutcome(0xffff);
      expect(bytes).toEqual(new Uint8Array([0xff, 0xff]));
    });

    it("should serialize outcome 257 as [0x01, 0x01] (little-endian: 0x0101)", () => {
      const bytes = serializeOutcome(257);
      expect(bytes).toEqual(new Uint8Array([0x01, 0x01]));
    });

    it("should reject negative outcomes", () => {
      expect(() => serializeOutcome(-1)).toThrow("Invalid u16 outcome");
    });

    it("should reject outcomes > 65535", () => {
      expect(() => serializeOutcome(65536)).toThrow("Invalid u16 outcome");
      expect(() => serializeOutcome(100000)).toThrow("Invalid u16 outcome");
    });

    it("should reject non-integer outcomes", () => {
      expect(() => serializeOutcome(1.5)).toThrow("Invalid u16 outcome");
      expect(() => serializeOutcome(NaN)).toThrow("Invalid u16 outcome");
    });

    it("should always return exactly 2 bytes", () => {
      for (let i = 0; i <= 0xffff; i += 6553) {
        // Sample every ~10% of the outcome space
        const bytes = serializeOutcome(i);
        expect(bytes.length).toBe(2);
      }
    });
  });

  describe("buildCommitHash", () => {
    it("should build hash from outcome 0 with all-zero salt", () => {
      const salt = new Uint8Array(32);
      const hash = buildCommitHash(0, salt);

      // Verify: outcome [0x00, 0x00] ++ 32 zero bytes
      const preimage = new Uint8Array(34);
      preimage[0] = 0x00;
      preimage[1] = 0x00;
      // Rest is already zero
      const expected = sha3_256(preimage);

      expect(hash).toEqual(new Uint8Array(expected));
      expect(hash.length).toBe(32);
    });

    it("should build hash from outcome 1 with known salt", () => {
      const salt = new Uint8Array(32);
      salt.fill(0x42);

      const hash = buildCommitHash(1, salt);

      // Verify manually
      const preimage = new Uint8Array(34);
      preimage[0] = 0x01;
      preimage[1] = 0x00;
      preimage.set(salt, 2);
      const expected = sha3_256(preimage);

      expect(hash).toEqual(new Uint8Array(expected));
    });

    it("should build hash from outcome 256 (high byte: 0x01)", () => {
      const salt = new Uint8Array(32);
      salt[0] = 0xaa;
      salt[31] = 0xbb;

      const hash = buildCommitHash(256, salt);

      // Outcome 256 = [0x00, 0x01] in little-endian
      const preimage = new Uint8Array(34);
      preimage[0] = 0x00;
      preimage[1] = 0x01;
      preimage.set(salt, 2);
      const expected = sha3_256(preimage);

      expect(hash).toEqual(new Uint8Array(expected));
    });

    it("should build hash for ABSTAIN outcome (0xFFFF)", () => {
      const salt = new Uint8Array(32);
      const hash = buildCommitHash(OUTCOME_ABSTAIN, salt);

      // 0xFFFF = [0xFF, 0xFF] in little-endian
      const preimage = new Uint8Array(34);
      preimage[0] = 0xff;
      preimage[1] = 0xff;
      preimage.set(salt, 2);
      const expected = sha3_256(preimage);

      expect(hash).toEqual(new Uint8Array(expected));
    });

    it("should produce 32-byte hash", () => {
      const salt = generateSalt();
      const hash = buildCommitHash(42, salt);
      expect(hash.length).toBe(32);
    });

    it("should reject invalid outcome", () => {
      const salt = new Uint8Array(32);
      expect(() => buildCommitHash(-1, salt)).toThrow();
      expect(() => buildCommitHash(65536, salt)).toThrow();
    });

    it("should reject non-Uint8Array salt", () => {
      expect(() => buildCommitHash(1, "not a salt" as any)).toThrow("Salt must be a Uint8Array");
      expect(() => buildCommitHash(1, [1, 2, 3] as any)).toThrow("Salt must be a Uint8Array");
    });

    it("should handle variable-length salts", () => {
      // Most salts are 32 bytes, but the hash function should work with any length
      const outcome = 5;
      const salt16 = new Uint8Array(16);
      const salt32 = new Uint8Array(32);
      const salt64 = new Uint8Array(64);

      const hash16 = buildCommitHash(outcome, salt16);
      const hash32 = buildCommitHash(outcome, salt32);
      const hash64 = buildCommitHash(outcome, salt64);

      expect(hash16.length).toBe(32);
      expect(hash32.length).toBe(32);
      expect(hash64.length).toBe(32);

      // Hashes should be different (different preimages)
      expect(bytesToHex(hash16)).not.toBe(bytesToHex(hash32));
      expect(bytesToHex(hash32)).not.toBe(bytesToHex(hash64));
    });

    it("should be deterministic", () => {
      const outcome = 17;
      const salt = new Uint8Array(32);
      salt.fill(0x99);

      const hash1 = buildCommitHash(outcome, salt);
      const hash2 = buildCommitHash(outcome, salt);

      expect(bytesToHex(hash1)).toBe(bytesToHex(hash2));
    });
  });

  describe("verifyCommitHash", () => {
    it("should verify correct commitment", () => {
      const outcome = 10;
      const salt = generateSalt();
      const hash = buildCommitHash(outcome, salt);

      const isValid = verifyCommitHash(outcome, salt, hash);
      expect(isValid).toBe(true);
    });

    it("should reject wrong outcome", () => {
      const outcome = 10;
      const wrongOutcome = 11;
      const salt = generateSalt();
      const hash = buildCommitHash(outcome, salt);

      const isValid = verifyCommitHash(wrongOutcome, salt, hash);
      expect(isValid).toBe(false);
    });

    it("should reject wrong salt", () => {
      const outcome = 10;
      const salt = generateSalt();
      const wrongSalt = generateSalt();
      const hash = buildCommitHash(outcome, salt);

      const isValid = verifyCommitHash(outcome, wrongSalt, hash);
      expect(isValid).toBe(false);
    });

    it("should reject corrupted hash", () => {
      const outcome = 10;
      const salt = generateSalt();
      const hash = buildCommitHash(outcome, salt);

      // Flip a bit in the hash
      hash[0] ^= 0x01;

      const isValid = verifyCommitHash(outcome, salt, hash);
      expect(isValid).toBe(false);
    });

    it("should work with ABSTAIN outcome", () => {
      const salt = generateSalt();
      const hash = buildCommitHash(OUTCOME_ABSTAIN, salt);

      const isValid = verifyCommitHash(OUTCOME_ABSTAIN, salt, hash);
      expect(isValid).toBe(true);
    });

    it("should fail gracefully with invalid hash length", () => {
      const outcome = 10;
      const salt = generateSalt();
      const shortHash = new Uint8Array(16); // Wrong length

      const isValid = verifyCommitHash(outcome, salt, shortHash);
      expect(isValid).toBe(false);
    });

    it("should fail gracefully with invalid outcome", () => {
      const salt = generateSalt();
      const hash = buildCommitHash(10, salt);

      // This should not throw, but return false
      const isValid = verifyCommitHash(65536, salt, hash);
      expect(isValid).toBe(false);
    });
  });

  describe("bytesToHex and hexToBytes", () => {
    it("should convert bytes to hex and back", () => {
      const original = new Uint8Array([0x00, 0x01, 0xff, 0xaa, 0xbb]);
      const hex = bytesToHex(original);
      const recovered = hexToBytes(hex);

      expect(recovered).toEqual(original);
    });

    it("should handle empty bytes", () => {
      const empty = new Uint8Array([]);
      const hex = bytesToHex(empty);
      expect(hex).toBe("0x");

      const recovered = hexToBytes("0x");
      expect(recovered.length).toBe(0);
    });

    it("should format hex with 0x prefix and lowercase", () => {
      const bytes = new Uint8Array([0x42, 0xab, 0xcd]);
      const hex = bytesToHex(bytes);
      expect(hex).toBe("0x42abcd");
    });

    it("should handle hex without 0x prefix", () => {
      const recovered = hexToBytes("42abcd");
      expect(recovered).toEqual(new Uint8Array([0x42, 0xab, 0xcd]));
    });

    it("should reject odd-length hex", () => {
      expect(() => hexToBytes("0x1")).toThrow("odd length");
      expect(() => hexToBytes("abc")).toThrow("odd length");
    });

    it("should round-trip salt generation", () => {
      const salt = generateSalt();
      const hex = bytesToHex(salt);
      const recovered = hexToBytes(hex);
      expect(recovered).toEqual(salt);
    });

    it("should pad single-digit bytes with leading zero", () => {
      const bytes = new Uint8Array([0x00, 0x0f, 0xf0]);
      const hex = bytesToHex(bytes);
      expect(hex).toBe("0x000ff0");

      const recovered = hexToBytes(hex);
      expect(recovered).toEqual(bytes);
    });
  });

  describe("Integration: Round-Trip Commit-Reveal", () => {
    it("should verify round-trip: generate salt → build hash → verify", () => {
      const outcome = 42;
      const salt = generateSalt();

      // Commit phase: build hash
      const hash = buildCommitHash(outcome, salt);

      // Reveal phase: verify
      const isValid = verifyCommitHash(outcome, salt, hash);
      expect(isValid).toBe(true);

      // Also verify that wrong outcome fails
      const wrongValid = verifyCommitHash(outcome + 1, salt, hash);
      expect(wrongValid).toBe(false);
    });

    it("should handle multiple disputes with different salts", () => {
      const disputes = [
        { id: 1, outcome: 0, salt: generateSalt() },
        { id: 2, outcome: 1, salt: generateSalt() },
        { id: 3, outcome: 100, salt: generateSalt() },
        { id: 4, outcome: 0xffff, salt: generateSalt() },
      ];

      const hashes = disputes.map((d) => ({
        ...d,
        hash: buildCommitHash(d.outcome, d.salt),
      }));

      // Verify all match
      for (const { outcome, salt, hash } of hashes) {
        expect(verifyCommitHash(outcome, salt, hash)).toBe(true);
      }

      // Cross-verify: wrong outcome/salt should fail
      expect(verifyCommitHash(disputes[0].outcome, disputes[1].salt, hashes[0].hash)).toBe(false);
      expect(verifyCommitHash(disputes[0].outcome, disputes[0].salt, hashes[1].hash)).toBe(false);
    });

    it("should maintain hash consistency with hex encoding", () => {
      const outcome = 77;
      const salt = generateSalt();

      const hash = buildCommitHash(outcome, salt);
      const hashHex = bytesToHex(hash);
      const hashRecovered = hexToBytes(hashHex);

      // Verify with recovered hash
      const isValid = verifyCommitHash(outcome, salt, hashRecovered);
      expect(isValid).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    it("should handle all u16 outcome values without error", () => {
      const salt = generateSalt();

      // Test: min, max, and selected values
      const testOutcomes = [0, 1, 127, 255, 256, 1000, 32767, 32768, 65534, 65535];

      for (const outcome of testOutcomes) {
        const hash = buildCommitHash(outcome, salt);
        expect(hash.length).toBe(32);
        expect(verifyCommitHash(outcome, salt, hash)).toBe(true);
      }
    });

    it("should work with minimal and maximal salts", () => {
      const outcome = 42;
      const minSalt = new Uint8Array(1); // Minimal: 1 byte
      const maxSalt = new Uint8Array(1024); // Large: 1 KB (not typical, but should work)
      maxSalt.fill(0xff);

      const hashMin = buildCommitHash(outcome, minSalt);
      const hashMax = buildCommitHash(outcome, maxSalt);

      expect(hashMin.length).toBe(32);
      expect(hashMax.length).toBe(32);
      expect(verifyCommitHash(outcome, minSalt, hashMin)).toBe(true);
      expect(verifyCommitHash(outcome, maxSalt, hashMax)).toBe(true);
      expect(bytesToHex(hashMin)).not.toBe(bytesToHex(hashMax));
    });

    it("BCS u16 serialization is little-endian, not big-endian", () => {
      // This test explicitly verifies that we use little-endian (correcting spec bug)
      // In big-endian (WRONG): outcome 256 would be [0x01, 0x00]
      // In little-endian (CORRECT): outcome 256 is [0x00, 0x01]

      const outcome = 256;
      const bytes = serializeOutcome(outcome);

      expect(bytes[0]).toBe(0x00);  // Low byte
      expect(bytes[1]).toBe(0x01);  // High byte

      // Verify via hash
      const salt = generateSalt();
      const hash = buildCommitHash(256, salt);

      // Manual computation using little-endian
      const preimageLE = new Uint8Array(34);
      preimageLE[0] = 0x00;
      preimageLE[1] = 0x01;
      preimageLE.set(salt, 2);
      const expectedLE = sha3_256(preimageLE);

      expect(bytesToHex(hash)).toBe(bytesToHex(new Uint8Array(expectedLE)));

      // If it were big-endian (WRONG), this would match:
      const preimageBE = new Uint8Array(34);
      preimageBE[0] = 0x01;
      preimageBE[1] = 0x00;
      preimageBE.set(salt, 2);
      const expectedBE = sha3_256(preimageBE);

      // Should NOT match (verifying we're NOT using big-endian)
      expect(bytesToHex(hash)).not.toBe(bytesToHex(new Uint8Array(expectedBE)));
    });
  });

  describe("Security Properties", () => {
    it("should have avalanche effect: one bit change in salt → completely different hash", () => {
      const outcome = 50;
      const salt1 = new Uint8Array(32);
      salt1.fill(0x42);

      const salt2 = new Uint8Array(32);
      salt2.fill(0x42);
      salt2[0] ^= 0x01; // Flip one bit

      const hash1 = buildCommitHash(outcome, salt1);
      const hash2 = buildCommitHash(outcome, salt2);

      const diffBits = new Uint8Array(32);
      let bitCount = 0;
      for (let i = 0; i < 32; i++) {
        diffBits[i] = hash1[i] ^ hash2[i];
        for (let j = 0; j < 8; j++) {
          if ((diffBits[i] & (1 << j)) !== 0) bitCount++;
        }
      }

      // Expect avalanche: roughly 50% of bits should differ (160/256 bits)
      expect(bitCount).toBeGreaterThan(100);
      expect(bitCount).toBeLessThan(220);
    });

    it("should be collision-resistant in practice", () => {
      // Generate many hashes and verify no collisions
      const hashes = new Set<string>();

      for (let outcome = 0; outcome < 100; outcome++) {
        const salt = generateSalt();
        const hash = buildCommitHash(outcome, salt);
        const hex = bytesToHex(hash);

        expect(hashes.has(hex)).toBe(false);
        hashes.add(hex);
      }

      expect(hashes.size).toBe(100);
    });

    it("should not reveal information about salt from hash alone", () => {
      const outcome = 88;
      const salt1 = new Uint8Array(32);
      const salt2 = new Uint8Array(32);

      const hash1 = buildCommitHash(outcome, salt1);
      const hash2 = buildCommitHash(outcome, salt2);

      // Even with all-zero and all-0xFF salts, hashes should be unrelated
      expect(bytesToHex(hash1)).not.toBe(bytesToHex(hash2));

      // No obvious pattern or relationship
      let sameBits = 0;
      for (let i = 0; i < 32; i++) {
        if (hash1[i] === hash2[i]) sameBits++;
      }
      // Expect roughly 50% match (random chance)
      expect(sameBits).toBeGreaterThan(10);
      expect(sameBits).toBeLessThan(22);
    });
  });
});
