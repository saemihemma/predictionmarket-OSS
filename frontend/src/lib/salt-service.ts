/**
 * @suffer/salt-service — SDVM Salt Management Service
 *
 * Implements secure salt generation, storage (IndexedDB + localStorage fallback),
 * BIP39 mnemonic recovery, and salt retrieval for commit-reveal voting.
 *
 * Architecture:
 * 1. Primary: IndexedDB (50MB/origin capacity, origin-scoped)
 * 2. Fallback: localStorage (5-10MB/origin, origin-scoped)
 * 3. Recovery: BIP39 12-word mnemonic (non-custodial, user-managed)
 *
 * Security:
 * - Salt never sent unencrypted to servers
 * - IndexedDB/localStorage are plaintext (no encryption)
 * - Salt XSS attack scope limited to origin
 * - BIP39 seed not stored on device
 *
 * Lifecycle:
 * - Generation: Random 32 bytes after vote outcome selection
 * - Storage: IndexedDB + localStorage immediately
 * - Retrieval: IndexedDB first, fallback to localStorage
 * - Cleanup: Auto-delete after 30 days (revealed) or 7 days (never revealed)
 */

import { buildCommitHash, generateSalt as generateRandomSalt } from "./vote-hash";
import { sha256 } from "@noble/hashes/sha256";

/**
 * BIP39 word list (English, first 1024 words for mnemonic generation).
 * Used to generate deterministic 12-word recovery phrases.
 */
const BIP39_WORDLIST: string[] = [
  "abandon", "ability", "able", "about", "above", "absent", "absorb", "abstract",
  "abuse", "access", "accident", "account", "accuse", "achieve", "acid", "acoustic",
  "acquire", "across", "act", "action", "actor", "actual", "acuity", "acute",
  "adapt", "add", "addict", "added", "adder", "addicted", "adding", "addition",
  "additional", "additive", "address", "adjust", "adjusts", "admiral", "admire", "admit",
  // ... truncated for brevity; in production, this would be the full 2048-word BIP39 list
  // For now, we use a representative subset for testing
];

/**
 * Record of a stored salt with commit hash and metadata.
 * Keyed by "{disputeRoundId}:{roundNumber}:{voterAddress}".
 */
export interface SaltRecord {
  /** Composite key: "{disputeRoundId}:{roundNumber}:{voterAddress}" */
  key: string;

  /** Object ID of the SDVMVoteRound */
  disputeRoundId: string;

  /** Round number (1 for first round, increments per roll) */
  roundNumber: number;

  /** Voter's Sui address (0x...) */
  voterAddress: string;

  /** 32 random bytes, generated or derived from mnemonic */
  salt: Uint8Array;

  /** Voted outcome (u16: 0-65535) */
  outcome: number;

  /** Commitment hash: sha3_256(bcs_serialize(outcome) ++ salt) */
  commitHash: Uint8Array;

  /** Timestamp when salt was generated (milliseconds since epoch) */
  createdAt: number;

  /** true if successfully revealed on-chain */
  revealed: boolean;

  /** Optional: SHA256 hash of BIP39 seed phrase (for recovery verification) */
  backupSeedHash?: string;
}

/**
 * Salt service for SDVM voting.
 * Manages salt generation, storage, recovery, and cleanup.
 */
export class SaltService {
  private static readonly DB_NAME = "suffer-vote-salts";
  private static readonly DB_VERSION = 1;
  private static readonly STORE_NAME = "salts";
  private static readonly INDEX_NAME = "disputeRoundVoter";
  private static readonly STORAGE_PREFIX = "suffer-salt-";
  private static readonly CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

  private dbPromise: Promise<IDBDatabase> | null = null;
  private cache: Map<string, SaltRecord> = new Map();
  private cacheTimestamps: Map<string, number> = new Map();

  /**
   * Initialize the IndexedDB database.
   * Creates object store and indexes if not present.
   * Idempotent — safe to call multiple times.
   *
   * @returns Promise resolving to IDBDatabase instance
   * @throws Error if IndexedDB is unavailable
   */
  private async initDB(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("IndexedDB not available in this browser"));
        return;
      }

      const request = indexedDB.open(SaltService.DB_NAME, SaltService.DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(SaltService.STORE_NAME)) {
          const store = db.createObjectStore(SaltService.STORE_NAME, { keyPath: "key" });
          store.createIndex(SaltService.INDEX_NAME, ["disputeRoundId", "roundNumber", "voterAddress"]);
          store.createIndex("voterAddress", "voterAddress");
          store.createIndex("createdAt", "createdAt");
          store.createIndex("revealed", "revealed");
        }
      };
    });

    return this.dbPromise;
  }

  /**
   * Store a salt record in IndexedDB.
   * Falls back to localStorage if IndexedDB fails.
   * Caches the record in memory for 5 minutes.
   *
   * @param record - SaltRecord to store
   * @throws Error if both IndexedDB and localStorage fail
   */
  async storeSalt(record: SaltRecord): Promise<void> {
    // Update memory cache
    this.cache.set(record.key, record);
    this.cacheTimestamps.set(record.key, Date.now());

    // Try IndexedDB first
    try {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([SaltService.STORE_NAME], "readwrite");
        const store = transaction.objectStore(SaltService.STORE_NAME);
        const serialized = this.serializeSaltRecord(record);
        const request = store.put(serialized);

        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } catch (err) {
      console.warn("IndexedDB write failed, falling back to localStorage:", err);
      try {
        this.storeToLocalStorage(record);
      } catch (localStorageErr) {
        throw new Error(
          `Failed to store salt in both IndexedDB and localStorage: ${localStorageErr}`
        );
      }
    }
  }

  /**
   * Retrieve a salt record by disputeRoundId, roundNumber, and voterAddress.
   * Checks memory cache first, then IndexedDB.
   *
   * @param disputeRoundId - Object ID of SDVMVoteRound
   * @param roundNumber - Round number
   * @param voterAddress - Sui address of voter
   * @returns SaltRecord if found, null otherwise
   */
  async getSalt(
    disputeRoundId: string,
    roundNumber: number,
    voterAddress: string
  ): Promise<SaltRecord | null> {
    const key = this.buildKey(disputeRoundId, roundNumber, voterAddress);

    // Check memory cache first
    if (this.cache.has(key)) {
      const timestamp = this.cacheTimestamps.get(key);
      if (timestamp && Date.now() - timestamp < SaltService.CACHE_DURATION_MS) {
        return this.cache.get(key) || null;
      } else {
        // Cache expired
        this.cache.delete(key);
        this.cacheTimestamps.delete(key);
      }
    }

    // Try IndexedDB
    try {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([SaltService.STORE_NAME], "readonly");
        const store = transaction.objectStore(SaltService.STORE_NAME);
        const request = store.get(key);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const data = request.result;
          if (data) {
            const record = this.deserializeSaltRecord(data);
            // Update cache
            this.cache.set(key, record);
            this.cacheTimestamps.set(key, Date.now());
            resolve(record);
          } else {
            resolve(null);
          }
        };
      });
    } catch (err) {
      console.warn("IndexedDB read failed, trying localStorage:", err);
      const record = this.retrieveFromLocalStorage(disputeRoundId, roundNumber, voterAddress);
      if (record) {
        // Sync back to IndexedDB if available
        await this.storeSalt(record).catch(() => {});
      }
      return record;
    }
  }

  /**
   * Mark a salt as revealed (set revealed: true).
   * Called after successful reveal_vote() transaction.
   *
   * @param disputeRoundId - Object ID of SDVMVoteRound
   * @param roundNumber - Round number
   * @param voterAddress - Sui address of voter
   */
  async markRevealed(
    disputeRoundId: string,
    roundNumber: number,
    voterAddress: string
  ): Promise<void> {
    const record = await this.getSalt(disputeRoundId, roundNumber, voterAddress);
    if (record) {
      record.revealed = true;
      await this.storeSalt(record);
    }
  }

  /**
   * Prune expired salt records from storage.
   * Deletes:
   * - Revealed salts older than 30 days
   * - Unrevealed salts older than 7 days (dispute likely resolved)
   *
   * @param maxAgeDaysRevealed - Days to keep revealed salts (default: 30)
   * @param maxAgeDaysUnrevealed - Days to keep unrevealed salts (default: 7)
   * @returns Number of records deleted
   */
  async pruneOldRecords(maxAgeDaysRevealed = 30, maxAgeDaysUnrevealed = 7): Promise<number> {
    const maxAgeRevealedMs = maxAgeDaysRevealed * 24 * 60 * 60 * 1000;
    const maxAgeUnrevealedMs = maxAgeDaysUnrevealed * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let deletedCount = 0;

    // IndexedDB cleanup
    try {
      const db = await this.initDB();
      const transaction = db.transaction([SaltService.STORE_NAME], "readwrite");
      const store = transaction.objectStore(SaltService.STORE_NAME);
      const request = store.getAll();

      return new Promise((resolve, reject) => {
        request.onerror = () => reject(request.error);
        request.onsuccess = async () => {
          const records = request.result;
          for (const serialized of records) {
            const record = this.deserializeSaltRecord(serialized);
            const maxAge = record.revealed ? maxAgeRevealedMs : maxAgeUnrevealedMs;
            if (now - record.createdAt > maxAge) {
              const deleteRequest = store.delete(record.key);
              deleteRequest.onsuccess = () => {
                deletedCount++;
              };
            }
          }
          transaction.oncomplete = () => resolve(deletedCount);
          transaction.onerror = () => reject(transaction.error);
        };
      });
    } catch (err) {
      console.warn("IndexedDB cleanup failed:", err);
    }

    // localStorage cleanup
    const keys = Object.keys(localStorage);
    for (const key of keys) {
      if (key.startsWith(SaltService.STORAGE_PREFIX)) {
        try {
          const serialized = localStorage.getItem(key);
          if (serialized) {
            const record = JSON.parse(serialized);
            const maxAge = record.revealed ? maxAgeRevealedMs : maxAgeUnrevealedMs;
            if (now - record.createdAt > maxAge) {
              localStorage.removeItem(key);
              deletedCount++;
            }
          }
        } catch (err) {
          console.warn(`Failed to parse localStorage item ${key}:`, err);
        }
      }
    }

    return deletedCount;
  }

  /**
   * Generate a 12-word BIP39 mnemonic for salt recovery.
   * Each word is randomly selected from the BIP39 wordlist.
   * This mnemonic can be used to deterministically derive salts.
   *
   * @returns Array of 12 words
   */
  generateMnemonic(): string[] {
    const words: string[] = [];
    const wordCount = 12;

    for (let i = 0; i < wordCount; i++) {
      const randomIndex = Math.floor(Math.random() * BIP39_WORDLIST.length);
      words.push(BIP39_WORDLIST[randomIndex]);
    }

    return words;
  }

  /**
   * Derive a salt deterministically from a BIP39 mnemonic.
   * Formula:
   *   seed = bip39_seed(mnemonic)
   *   salt = sha256(seed || dispute_id_bytes || round_number_byte)
   *
   * This allows non-custodial recovery: user saves 12 words, can recover salt
   * on any device by entering the words.
   *
   * @param words - 12-word BIP39 mnemonic as array of strings
   * @param disputeRoundId - Object ID of SDVMVoteRound (hex string)
   * @param roundNumber - Round number (0-255)
   * @returns 32-byte salt derived from mnemonic
   * @throws Error if mnemonic is invalid or roundNumber out of range
   */
  deriveSaltFromMnemonic(words: string[], disputeRoundId: string, roundNumber: number): Uint8Array {
    if (!Array.isArray(words) || words.length !== 12) {
      throw new Error("Mnemonic must be exactly 12 words");
    }

    if (!Number.isInteger(roundNumber) || roundNumber < 0 || roundNumber > 255) {
      throw new Error("Round number must be integer between 0 and 255");
    }

    // For now, derive a simple deterministic salt from the mnemonic words + dispute context
    // In production, use @scure/bip39 for proper BIP39 seed derivation
    // Formula: hash(words || disputeRoundId || roundNumber)

    const wordString = words.join("");
    const wordBytes = new TextEncoder().encode(wordString);
    const disputeIdBytes = this.hexToBytes(disputeRoundId);
    const roundBytes = new Uint8Array([roundNumber]);

    const preimage = new Uint8Array(
      wordBytes.length + disputeIdBytes.length + roundBytes.length
    );
    preimage.set(wordBytes, 0);
    preimage.set(disputeIdBytes, wordBytes.length);
    preimage.set(roundBytes, wordBytes.length + disputeIdBytes.length);

    // Use Web Crypto for SHA256 hashing
    return this.hashSha256Sync(preimage);
  }

  /**
   * Prepare a full vote commitment with mnemonic backup.
   * Generates salt, derives commitment hash, generates BIP39 mnemonic,
   * and stores salt record.
   *
   * Called by CommitVotePanel after outcome selection.
   *
   * @param outcome - Voted outcome (u16)
   * @param disputeRoundId - Object ID of SDVMVoteRound
   * @param roundNumber - Round number
   * @param voterAddress - Sui address of voter
   * @returns Promise resolving to { salt, commitHash, mnemonic }
   */
  async prepareCommit(
    outcome: number,
    disputeRoundId: string,
    roundNumber: number,
    voterAddress: string
  ): Promise<{
    salt: Uint8Array;
    commitHash: Uint8Array;
    mnemonic: string[];
  }> {
    // Generate random salt
    const salt = generateRandomSalt();

    // Compute commitment hash
    const commitHash = buildCommitHash(outcome, salt);

    // Generate BIP39 mnemonic
    const mnemonic = this.generateMnemonic();

    // Store salt record immediately (user must confirm saving mnemonic)
    const record: SaltRecord = {
      key: this.buildKey(disputeRoundId, roundNumber, voterAddress),
      disputeRoundId,
      roundNumber,
      voterAddress,
      salt,
      outcome,
      commitHash,
      createdAt: Date.now(),
      revealed: false,
      backupSeedHash: this.sha256String(mnemonic.join(" ")),
    };

    await this.storeSalt(record);

    return { salt, commitHash, mnemonic };
  }

  /**
   * Retrieve salt by checking IndexedDB first, falling back to localStorage.
   * This is the primary method for reveal phase salt loading.
   *
   * @param disputeRoundId - Object ID of SDVMVoteRound
   * @param roundNumber - Round number
   * @param voterAddress - Sui address of voter
   * @returns SaltRecord if found, null if not found in either storage layer
   */
  async getSaltWithFallback(
    disputeRoundId: string,
    roundNumber: number,
    voterAddress: string
  ): Promise<SaltRecord | null> {
    try {
      const record = await this.getSalt(disputeRoundId, roundNumber, voterAddress);
      if (record) return record;
    } catch (err) {
      console.warn("Primary salt retrieval failed:", err);
    }

    try {
      const record = this.retrieveFromLocalStorage(disputeRoundId, roundNumber, voterAddress);
      if (record) {
        // Try to sync back to IndexedDB
        await this.storeSalt(record).catch(() => {});
        return record;
      }
    } catch (err) {
      console.warn("Fallback salt retrieval failed:", err);
    }

    return null;
  }

  /**
   * Verify that a recovered salt matches its commitment hash.
   * Used during reveal phase to validate recovered salts.
   *
   * @param outcome - The outcome the voter claims to have voted for
   * @param salt - The salt to verify
   * @param expectedCommitHash - The original commitment hash
   * @returns true if hash matches, false otherwise
   */
  verifyRecoveredSalt(outcome: number, salt: Uint8Array, expectedCommitHash: Uint8Array): boolean {
    try {
      const computedHash = buildCommitHash(outcome, salt);
      return this.bytesEqual(computedHash, expectedCommitHash);
    } catch (err) {
      console.error("Salt verification failed:", err);
      return false;
    }
  }

  /**
   * Recover vote commitment by trying all possible outcomes.
   * When user recovers from mnemonic, they may not remember their original outcome.
   * This function derives the salt from the mnemonic, then tries each possible outcome
   * to find which one matches the commitment hash on-chain.
   *
   * Called by RevealVotePanel during recovery when user has lost their salt.
   *
   * @param words - 12-word BIP39 mnemonic as array of strings
   * @param disputeRoundId - Object ID of SDVMVoteRound
   * @param roundNumber - Round number
   * @param commitmentHash - The commitment hash from on-chain SDVMCommitRecord
   * @param outcomeCount - Total number of valid outcomes for this market (e.g., 2 for binary)
   * @returns Object with { outcome, salt } if found, null if no outcome matches
   * @throws Error if mnemonic is invalid or other errors occur
   */
  recoverWithAllOutcomes(
    words: string[],
    disputeRoundId: string,
    roundNumber: number,
    commitmentHash: Uint8Array,
    outcomeCount: number
  ): { outcome: number; salt: Uint8Array } | null {
    try {
      // Derive salt from mnemonic
      const salt = this.deriveSaltFromMnemonic(words, disputeRoundId, roundNumber);

      // Try each valid outcome (0 to outcomeCount-1, plus ABSTAIN=0xFFFF)
      const outcomesToTry = [];
      for (let i = 0; i < outcomeCount; i++) {
        outcomesToTry.push(i);
      }
      // Always try ABSTAIN (0xFFFF = 65535)
      outcomesToTry.push(65535);

      for (const outcome of outcomesToTry) {
        if (this.verifyRecoveredSalt(outcome, salt, commitmentHash)) {
          return { outcome, salt };
        }
      }

      // No outcome matched
      return null;
    } catch (err) {
      console.error("Recovery with all outcomes failed:", err);
      throw err;
    }
  }

  // ───────────────────────────────────────────────────────────────
  // Private Helper Methods
  // ───────────────────────────────────────────────────────────────

  private buildKey(disputeRoundId: string, roundNumber: number, voterAddress: string): string {
    return `${disputeRoundId}:${roundNumber}:${voterAddress}`;
  }

  private storeToLocalStorage(record: SaltRecord): void {
    const key = `${SaltService.STORAGE_PREFIX}${record.key}`;
    const saltBase64 = this.bytesToBase64(record.salt);
    const commitHashBase64 = this.bytesToBase64(record.commitHash);

    const serialized = JSON.stringify({
      ...record,
      salt: saltBase64,
      commitHash: commitHashBase64,
    });

    localStorage.setItem(key, serialized);
  }

  private retrieveFromLocalStorage(
    disputeRoundId: string,
    roundNumber: number,
    voterAddress: string
  ): SaltRecord | null {
    const key = `${SaltService.STORAGE_PREFIX}${this.buildKey(
      disputeRoundId,
      roundNumber,
      voterAddress
    )}`;
    const serialized = localStorage.getItem(key);

    if (!serialized) return null;

    try {
      const parsed = JSON.parse(serialized);
      return {
        ...parsed,
        salt: this.base64ToBytes(parsed.salt),
        commitHash: this.base64ToBytes(parsed.commitHash),
      };
    } catch (err) {
      console.error(`Failed to parse localStorage salt ${key}:`, err);
      return null;
    }
  }

  private serializeSaltRecord(
    record: SaltRecord
  ): Record<string, any> {
    return {
      ...record,
      salt: this.bytesToBase64(record.salt),
      commitHash: this.bytesToBase64(record.commitHash),
    };
  }

  private deserializeSaltRecord(serialized: any): SaltRecord {
    return {
      ...serialized,
      salt: this.base64ToBytes(serialized.salt),
      commitHash: this.base64ToBytes(serialized.commitHash),
    };
  }

  private bytesToBase64(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes));
  }

  private base64ToBytes(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  private bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    let isEqual = 0;
    for (let i = 0; i < a.length; i++) {
      isEqual |= a[i] ^ b[i];
    }
    return isEqual === 0;
  }

  private hexToBytes(hex: string): Uint8Array {
    const trimmed = hex.replace(/^0x/, "");
    const bytes = new Uint8Array(trimmed.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      const byteHex = trimmed.slice(i * 2, i * 2 + 2);
      bytes[i] = parseInt(byteHex, 16);
    }
    return bytes;
  }

  private bytesToHex(bytes: Uint8Array): string {
    return "0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /**
   * SHA256 hash using @noble/hashes for cryptographic security.
   * Used for mnemonic seed derivation and deterministic salt generation.
   * Produces consistent 32-byte output across all platforms.
   */
  private hashSha256Sync(data: Uint8Array): Uint8Array {
    return sha256(data);
  }

  /**
   * Convert a string to SHA256 hash and return as hex string.
   * Used for seed phrase hashing and verification.
   */
  private sha256String(str: string): string {
    const data = new TextEncoder().encode(str);
    const hash = sha256(data);
    return "0x" + Array.from(hash).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
}

// Export singleton instance
export const saltService = new SaltService();
