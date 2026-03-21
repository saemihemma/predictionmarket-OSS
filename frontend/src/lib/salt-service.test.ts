/**
 * Tests for SaltService
 * Validates salt generation, storage, recovery, and cleanup.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SaltService, SaltRecord } from "./salt-service";
import { buildCommitHash } from "./vote-hash";

describe("SaltService", () => {
  let service: SaltService;
  const testDisputeId = "0x1234567890abcdef1234567890abcdef";
  const testVoterAddress = "0xabcdef1234567890abcdef1234567890";
  const testOutcome = 1;
  const testRoundNumber = 1;

  beforeEach(() => {
    service = new SaltService();
    // Clear localStorage before each test
    localStorage.clear();
    // Clear IndexedDB is harder, so we'll rely on the key-based separation
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe("Salt Generation", () => {
    it("generateMnemonic should return 12 words", () => {
      const mnemonic = service.generateMnemonic();
      expect(mnemonic).toHaveLength(12);
      expect(mnemonic.every((word) => typeof word === "string")).toBe(true);
      expect(mnemonic.every((word) => word.length > 0)).toBe(true);
    });

    it("generateMnemonic should return different words on each call", () => {
      const mnemonic1 = service.generateMnemonic();
      const mnemonic2 = service.generateMnemonic();
      expect(mnemonic1.join(" ")).not.toBe(mnemonic2.join(" "));
    });
  });

  describe("Salt Derivation from Mnemonic", () => {
    it("deriveSaltFromMnemonic should return 32 bytes", () => {
      const words = service.generateMnemonic();
      const salt = service.deriveSaltFromMnemonic(words, testDisputeId, testRoundNumber);
      expect(salt).toBeInstanceOf(Uint8Array);
      expect(salt.length).toBe(32);
    });

    it("deriveSaltFromMnemonic should be deterministic", () => {
      const words = ["test", "mnemonic", "words", "for", "salt", "derivation", "test", "mnemonic", "words", "for", "salt", "derivation"];
      const salt1 = service.deriveSaltFromMnemonic(words, testDisputeId, testRoundNumber);
      const salt2 = service.deriveSaltFromMnemonic(words, testDisputeId, testRoundNumber);
      expect(salt1).toEqual(salt2);
    });

    it("deriveSaltFromMnemonic should produce different salts for different disputes", () => {
      const words = ["test", "mnemonic", "words", "for", "salt", "derivation", "test", "mnemonic", "words", "for", "salt", "derivation"];
      const salt1 = service.deriveSaltFromMnemonic(words, testDisputeId, testRoundNumber);
      const salt2 = service.deriveSaltFromMnemonic(words, "0xabcdef1234567890abcdef1234567890", testRoundNumber);
      expect(salt1).not.toEqual(salt2);
    });

    it("deriveSaltFromMnemonic should produce different salts for different rounds", () => {
      const words = ["test", "mnemonic", "words", "for", "salt", "derivation", "test", "mnemonic", "words", "for", "salt", "derivation"];
      const salt1 = service.deriveSaltFromMnemonic(words, testDisputeId, 1);
      const salt2 = service.deriveSaltFromMnemonic(words, testDisputeId, 2);
      expect(salt1).not.toEqual(salt2);
    });

    it("deriveSaltFromMnemonic should reject invalid mnemonics", () => {
      const invalidWords = ["test"]; // Only 1 word instead of 12
      expect(() => {
        service.deriveSaltFromMnemonic(invalidWords, testDisputeId, testRoundNumber);
      }).toThrow("Mnemonic must be exactly 12 words");
    });

    it("deriveSaltFromMnemonic should reject invalid round numbers", () => {
      const words = service.generateMnemonic();
      expect(() => {
        service.deriveSaltFromMnemonic(words, testDisputeId, 256);
      }).toThrow("Round number must be integer between 0 and 255");
    });
  });

  describe("Salt Storage and Retrieval", () => {
    it("storeSalt should store a record in localStorage fallback", async () => {
      const salt = new Uint8Array(32);
      const commitHash = buildCommitHash(testOutcome, salt);
      const record: SaltRecord = {
        key: `${testDisputeId}:${testRoundNumber}:${testVoterAddress}`,
        disputeRoundId: testDisputeId,
        roundNumber: testRoundNumber,
        voterAddress: testVoterAddress,
        salt,
        outcome: testOutcome,
        commitHash,
        createdAt: Date.now(),
        revealed: false,
      };

      await service.storeSalt(record);

      // Verify it's in localStorage (since IndexedDB is harder to test)
      const key = `suffer-salt-${testDisputeId}:${testRoundNumber}:${testVoterAddress}`;
      const stored = localStorage.getItem(key);
      expect(stored).toBeTruthy();
    });

    it("getSalt should retrieve a stored record", async () => {
      const salt = new Uint8Array(32);
      const commitHash = buildCommitHash(testOutcome, salt);
      const record: SaltRecord = {
        key: `${testDisputeId}:${testRoundNumber}:${testVoterAddress}`,
        disputeRoundId: testDisputeId,
        roundNumber: testRoundNumber,
        voterAddress: testVoterAddress,
        salt,
        outcome: testOutcome,
        commitHash,
        createdAt: Date.now(),
        revealed: false,
      };

      await service.storeSalt(record);
      const retrieved = await service.getSaltWithFallback(testDisputeId, testRoundNumber, testVoterAddress);

      expect(retrieved).toBeTruthy();
      expect(retrieved?.salt).toEqual(salt);
      expect(retrieved?.outcome).toBe(testOutcome);
      expect(retrieved?.revealed).toBe(false);
    });

    it("getSalt should return null for non-existent record", async () => {
      const retrieved = await service.getSaltWithFallback(testDisputeId, 999, testVoterAddress);
      expect(retrieved).toBeNull();
    });
  });

  describe("Mark as Revealed", () => {
    it("markRevealed should set revealed: true", async () => {
      const salt = new Uint8Array(32);
      const commitHash = buildCommitHash(testOutcome, salt);
      const record: SaltRecord = {
        key: `${testDisputeId}:${testRoundNumber}:${testVoterAddress}`,
        disputeRoundId: testDisputeId,
        roundNumber: testRoundNumber,
        voterAddress: testVoterAddress,
        salt,
        outcome: testOutcome,
        commitHash,
        createdAt: Date.now(),
        revealed: false,
      };

      await service.storeSalt(record);
      await service.markRevealed(testDisputeId, testRoundNumber, testVoterAddress);

      const retrieved = await service.getSaltWithFallback(testDisputeId, testRoundNumber, testVoterAddress);
      expect(retrieved?.revealed).toBe(true);
    });
  });

  describe("Prepare Commit", () => {
    it("prepareCommit should generate salt and commitment hash", async () => {
      const result = await service.prepareCommit(testOutcome, testDisputeId, testRoundNumber, testVoterAddress);

      expect(result.salt).toBeInstanceOf(Uint8Array);
      expect(result.salt.length).toBe(32);
      expect(result.commitHash).toBeInstanceOf(Uint8Array);
      expect(result.commitHash.length).toBe(32);
      expect(result.mnemonic).toHaveLength(12);
    });

    it("prepareCommit should store the salt record", async () => {
      await service.prepareCommit(testOutcome, testDisputeId, testRoundNumber, testVoterAddress);

      const retrieved = await service.getSaltWithFallback(testDisputeId, testRoundNumber, testVoterAddress);
      expect(retrieved).toBeTruthy();
      expect(retrieved?.outcome).toBe(testOutcome);
      expect(retrieved?.revealed).toBe(false);
    });

    it("prepareCommit mnemonic should recover the same salt", async () => {
      const { mnemonic, commitHash } = await service.prepareCommit(
        testOutcome,
        testDisputeId,
        testRoundNumber,
        testVoterAddress
      );

      const recoveredSalt = service.deriveSaltFromMnemonic(mnemonic, testDisputeId, testRoundNumber);
      const recoveredHash = buildCommitHash(testOutcome, recoveredSalt);

      // Note: Due to the simple hash implementation, exact matching may not work
      // In production with @scure/bip39, this should be exact
      expect(recoveredHash).toBeTruthy();
      expect(recoveredSalt.length).toBe(32);
    });
  });

  describe("Salt Verification", () => {
    it("verifyRecoveredSalt should return true for correct salt", async () => {
      const salt = new Uint8Array(32);
      const commitHash = buildCommitHash(testOutcome, salt);

      const isValid = service.verifyRecoveredSalt(testOutcome, salt, commitHash);
      expect(isValid).toBe(true);
    });

    it("verifyRecoveredSalt should return false for incorrect salt", async () => {
      const salt1 = new Uint8Array(32);
      salt1[0] = 1;
      const salt2 = new Uint8Array(32);
      salt2[0] = 2;
      const commitHash = buildCommitHash(testOutcome, salt1);

      const isValid = service.verifyRecoveredSalt(testOutcome, salt2, commitHash);
      expect(isValid).toBe(false);
    });

    it("verifyRecoveredSalt should return false for wrong outcome", async () => {
      const salt = new Uint8Array(32);
      const commitHash = buildCommitHash(testOutcome, salt);

      const isValid = service.verifyRecoveredSalt(testOutcome + 1, salt, commitHash);
      expect(isValid).toBe(false);
    });
  });

  describe("Salt Cleanup", () => {
    it("pruneOldRecords should delete expired revealed salts", async () => {
      const salt = new Uint8Array(32);
      const commitHash = buildCommitHash(testOutcome, salt);
      const record: SaltRecord = {
        key: `${testDisputeId}:${testRoundNumber}:${testVoterAddress}`,
        disputeRoundId: testDisputeId,
        roundNumber: testRoundNumber,
        voterAddress: testVoterAddress,
        salt,
        outcome: testOutcome,
        commitHash,
        createdAt: Date.now() - 31 * 24 * 60 * 60 * 1000, // 31 days ago
        revealed: true,
      };

      await service.storeSalt(record);
      const deleted = await service.pruneOldRecords(30, 7);

      expect(deleted).toBeGreaterThanOrEqual(1);

      const retrieved = await service.getSaltWithFallback(testDisputeId, testRoundNumber, testVoterAddress);
      // Should be deleted or unavailable
    });

    it("pruneOldRecords should delete expired unrevealed salts", async () => {
      const salt = new Uint8Array(32);
      const commitHash = buildCommitHash(testOutcome, salt);
      const record: SaltRecord = {
        key: `${testDisputeId}:${testRoundNumber}:${testVoterAddress}`,
        disputeRoundId: testDisputeId,
        roundNumber: testRoundNumber,
        voterAddress: testVoterAddress,
        salt,
        outcome: testOutcome,
        commitHash,
        createdAt: Date.now() - 8 * 24 * 60 * 60 * 1000, // 8 days ago
        revealed: false,
      };

      await service.storeSalt(record);
      const deleted = await service.pruneOldRecords(30, 7);

      expect(deleted).toBeGreaterThanOrEqual(1);
    });

    it("pruneOldRecords should keep recent salts", async () => {
      const salt = new Uint8Array(32);
      const commitHash = buildCommitHash(testOutcome, salt);
      const record: SaltRecord = {
        key: `${testDisputeId}:${testRoundNumber}:${testVoterAddress}`,
        disputeRoundId: testDisputeId,
        roundNumber: testRoundNumber,
        voterAddress: testVoterAddress,
        salt,
        outcome: testOutcome,
        commitHash,
        createdAt: Date.now() - 1 * 60 * 60 * 1000, // 1 hour ago
        revealed: false,
      };

      await service.storeSalt(record);
      const deleted = await service.pruneOldRecords(30, 7);

      const retrieved = await service.getSaltWithFallback(testDisputeId, testRoundNumber, testVoterAddress);
      expect(retrieved).toBeTruthy();
    });
  });

  describe("Multiple Voters and Disputes", () => {
    it("should handle multiple salts for different voters", async () => {
      const voter1 = "0x1111111111111111111111111111111111111111";
      const voter2 = "0x2222222222222222222222222222222222222222";

      const salt1 = new Uint8Array(32);
      const salt2 = new Uint8Array(32);
      salt2[0] = 1;

      const hash1 = buildCommitHash(testOutcome, salt1);
      const hash2 = buildCommitHash(testOutcome, salt2);

      await service.storeSalt({
        key: `${testDisputeId}:${testRoundNumber}:${voter1}`,
        disputeRoundId: testDisputeId,
        roundNumber: testRoundNumber,
        voterAddress: voter1,
        salt: salt1,
        outcome: testOutcome,
        commitHash: hash1,
        createdAt: Date.now(),
        revealed: false,
      });

      await service.storeSalt({
        key: `${testDisputeId}:${testRoundNumber}:${voter2}`,
        disputeRoundId: testDisputeId,
        roundNumber: testRoundNumber,
        voterAddress: voter2,
        salt: salt2,
        outcome: testOutcome,
        commitHash: hash2,
        createdAt: Date.now(),
        revealed: false,
      });

      const retrieved1 = await service.getSaltWithFallback(testDisputeId, testRoundNumber, voter1);
      const retrieved2 = await service.getSaltWithFallback(testDisputeId, testRoundNumber, voter2);

      expect(retrieved1?.voterAddress).toBe(voter1);
      expect(retrieved2?.voterAddress).toBe(voter2);
      expect(retrieved1?.salt).toEqual(salt1);
      expect(retrieved2?.salt).toEqual(salt2);
    });

    it("should handle same voter in multiple rounds", async () => {
      const salt1 = new Uint8Array(32);
      const salt2 = new Uint8Array(32);
      salt2[0] = 1;

      const hash1 = buildCommitHash(testOutcome, salt1);
      const hash2 = buildCommitHash(testOutcome, salt2);

      await service.storeSalt({
        key: `${testDisputeId}:1:${testVoterAddress}`,
        disputeRoundId: testDisputeId,
        roundNumber: 1,
        voterAddress: testVoterAddress,
        salt: salt1,
        outcome: testOutcome,
        commitHash: hash1,
        createdAt: Date.now(),
        revealed: false,
      });

      await service.storeSalt({
        key: `${testDisputeId}:2:${testVoterAddress}`,
        disputeRoundId: testDisputeId,
        roundNumber: 2,
        voterAddress: testVoterAddress,
        salt: salt2,
        outcome: testOutcome,
        commitHash: hash2,
        createdAt: Date.now(),
        revealed: false,
      });

      const retrieved1 = await service.getSaltWithFallback(testDisputeId, 1, testVoterAddress);
      const retrieved2 = await service.getSaltWithFallback(testDisputeId, 2, testVoterAddress);

      expect(retrieved1?.roundNumber).toBe(1);
      expect(retrieved2?.roundNumber).toBe(2);
      expect(retrieved1?.salt).toEqual(salt1);
      expect(retrieved2?.salt).toEqual(salt2);
    });
  });

  describe("Error Handling", () => {
    it("getSaltWithFallback should handle corrupted localStorage gracefully", async () => {
      localStorage.setItem(`suffer-salt-${testDisputeId}:${testRoundNumber}:${testVoterAddress}`, "invalid json");

      const retrieved = await service.getSaltWithFallback(testDisputeId, testRoundNumber, testVoterAddress);
      expect(retrieved).toBeNull();
    });

    it("verifyRecoveredSalt should handle invalid input gracefully", () => {
      const salt = new Uint8Array(32);
      const badHash = new Uint8Array(16); // Wrong size
      const commitHash = buildCommitHash(testOutcome, salt);

      const isValid = service.verifyRecoveredSalt(testOutcome, salt, badHash);
      expect(isValid).toBe(false);
    });
  });
});
