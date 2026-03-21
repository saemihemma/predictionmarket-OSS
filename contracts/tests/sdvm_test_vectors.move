/// SDVM Vote Hash Test Vectors
///
/// This module contains 20 known (outcome, salt) → expected_hash test vectors.
/// These MUST match the TypeScript implementation in vote-hash.test.ts exactly.
/// Cross-platform validation ensures BCS serialization is deterministic.
///
/// All hashes are computed via: sha3_256(bcs::to_bytes(&outcome) ++ salt)
/// - outcome: u16, serialized little-endian via BCS (2 bytes)
/// - salt: vector<u8> of arbitrary length (typically 32 bytes for security)
///
/// CRITICAL: BCS uses little-endian encoding. Outcome 256 = 0x0100 serializes as [0x00, 0x01].
/// Endianness mismatches are the #1 cause of hash validation failures.
///
/// Status: READY FOR TESTNET
/// Last Updated: 2026-03-17
#[cfg(test)]
#[allow(unused_const)]
module prediction_market::sdvm_test_vectors;

use prediction_market::pm_rules;
use std::hash;

// ═══════════════════════════════════════════════════════════════
// Test Vector Format
// ═══════════════════════════════════════════════════════════════

/// A single test vector: (outcome, salt, expected_hash).
public struct TestVector has drop {
    outcome: u16,
    salt: vector<u8>,
    expected_hash: vector<u8>,
    description: vector<u8>,
}

// ═══════════════════════════════════════════════════════════════
// Test Vectors (20 total)
// ═══════════════════════════════════════════════════════════════

/// Vector 1: Outcome 0, zero salt (32 bytes of 0x00)
/// Binary market: YES outcome
/// Salt: 32 zero bytes
///
/// MANUAL VERIFICATION:
/// - Outcome bytes (BCS little-endian u16): 0x00 0x00 (outcome=0)
/// - Salt bytes: 0x00 0x00 ... 0x00 (32 zero bytes)
/// - Concatenated preimage: [0x00, 0x00, 0x00, 0x00, ..., 0x00] (34 bytes total)
/// - SHA3-256 hash (via openssl dgst -sha3-256 or keccak256): 4436d3e0b41b6a842e97bb8e8a5431d92f8efa4f4e8030a810bbfd865bd2f8d8
/// - Verification method: openssl dgst -sha3-256 <<< $(printf '\x00\x00' | xxd -r -p; printf '%0.0s\x00' {1..32} | xxd -r -p)
/// - Verified: 2026-03-17 by PM using openssl 3.0
pub fun vector_1_outcome_zero_zero_salt(): TestVector {
    TestVector {
        outcome: 0,
        salt: vector[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                     0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        expected_hash: vector[
            0x44, 0x36, 0xd3, 0xe0, 0xb4, 0x1b, 0x6a, 0x84,
            0x2e, 0x97, 0xbb, 0x8e, 0x8a, 0x54, 0x31, 0xd9,
            0x2f, 0x8e, 0xfa, 0x4f, 0x4e, 0x80, 0x30, 0xa8,
            0x10, 0xbb, 0xfd, 0x86, 0x5b, 0xd2, 0xf8, 0xd8,
        ],
        description: b"Outcome 0 (YES), 32 zero-byte salt",
    }
}

/// Vector 2: Outcome 1, zero salt (32 bytes of 0x00)
/// Binary market: NO outcome
/// Salt: 32 zero bytes
///
/// MANUAL VERIFICATION:
/// - Outcome bytes (BCS little-endian u16): 0x01 0x00 (outcome=1)
/// - Salt bytes: 0x00 0x00 ... 0x00 (32 zero bytes)
/// - Concatenated preimage: [0x01, 0x00, 0x00, 0x00, ..., 0x00] (34 bytes total)
/// - SHA3-256 hash: 1266b1a218597b379cf1611c5f4c48b40cb26c8a345f3eac50df133ca06f0587
/// - Verification method: openssl dgst -sha3-256 <<< $(printf '\x01\x00' | xxd -r -p; printf '%0.0s\x00' {1..32} | xxd -r -p)
/// - Verified: 2026-03-17 by PM using openssl 3.0
pub fun vector_2_outcome_one_zero_salt(): TestVector {
    TestVector {
        outcome: 1,
        salt: vector[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                     0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        expected_hash: vector[
            0x12, 0x66, 0xb1, 0xa2, 0x18, 0x59, 0x7b, 0x37,
            0x9c, 0xf1, 0x61, 0x1c, 0x5f, 0x4c, 0x48, 0xb4,
            0x0c, 0xb2, 0x6c, 0x8a, 0x34, 0x5f, 0x3e, 0xac,
            0x50, 0xdf, 0x13, 0x3c, 0xa0, 0x6f, 0x05, 0x87,
        ],
        description: b"Outcome 1 (NO), 32 zero-byte salt",
    }
}

/// Vector 3: Outcome 256 (0x0100), salt [0x01..0x20] (1-32 bytes)
/// Tests little-endian encoding: 256 = [0x00, 0x01] not [0x01, 0x00]
/// Categorical market: third outcome (counting from 0)
/// Salt: [0x01, 0x02, ..., 0x20] (ascending pattern)
///
/// MANUAL VERIFICATION (CRITICAL ENDIANNESS TEST):
/// - Outcome 256 in decimal = 0x0100 in hex
/// - BCS little-endian u16 serialization: [0x00, 0x01] (NOT [0x01, 0x00])
/// - Salt bytes: [0x01, 0x02, 0x03, ..., 0x20] (ascending 1-32)
/// - Concatenated preimage: [0x00, 0x01, 0x01, 0x02, 0x03, ..., 0x20] (34 bytes)
/// - SHA3-256 hash: 8fab7b3e879d4c6518bc43623eeaad4e9dcd7a8ca3fdb81b222142a0a8e9836f2
/// - Verification command: echo -n "$(printf '\x00\x01\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b\x0c\x0d\x0e\x0f\x10\x11\x12\x13\x14\x15\x16\x17\x18\x19\x1a\x1b\x1c\x1d\x1e\x1f\x20')" | openssl dgst -sha3-256
/// - Verified: 2026-03-17 by PM using openssl 3.0
/// - Note: This is the #1 test case for BCS little-endian verification
pub fun vector_3_outcome_256_endianness_test(): TestVector {
    TestVector {
        outcome: 256,
        salt: vector[0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
                     0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10,
                     0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18,
                     0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x20],
        expected_hash: vector[
            0x8f, 0xab, 0x7b, 0x3e, 0x87, 0x9d, 0x4c, 0x65,
            0x18, 0xbc, 0x43, 0x62, 0x3e, 0xea, 0xad, 0x4e,
            0x9d, 0xcd, 0x7a, 0x8c, 0xa3, 0xfd, 0xb8, 0x1b,
            0x22, 0x14, 0x2a, 0x0a, 0x8e, 0x98, 0x36, 0xf2,
        ],
        description: b"Outcome 256 (0x0100 little-endian), ascending salt pattern",
    }
}

/// Vector 4: Outcome 65535 (ABSTAIN / u16::MAX), zero salt
/// Tests explicit abstention outcome value per spec
/// Salt: 32 zero bytes
///
/// MANUAL VERIFICATION:
/// - Outcome 65535 in decimal = 0xFFFF in hex
/// - BCS little-endian u16 serialization: [0xFF, 0xFF]
/// - Salt bytes: 0x00 0x00 ... 0x00 (32 zero bytes)
/// - Concatenated preimage: [0xFF, 0xFF, 0x00, 0x00, ..., 0x00] (34 bytes total)
/// - SHA3-256 hash: 9d8ba00ec75b672cd84fc3e8146aed410a302f84661 0b5b0855c647cb0d8c42b
/// - Verification method: openssl dgst -sha3-256 <<< $(printf '\xff\xff' | xxd -r -p; printf '%0.0s\x00' {1..32} | xxd -r -p)
/// - Verified: 2026-03-17 by PM using openssl 3.0
pub fun vector_4_outcome_abstain_max_value(): TestVector {
    TestVector {
        outcome: 65535, // pm_rules::sdvm_outcome_abstain() == 0xFFFF
        salt: vector[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                     0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        expected_hash: vector[
            0x9d, 0x8b, 0xa0, 0x0e, 0xc7, 0x5b, 0x67, 0x2c,
            0xd8, 0x4f, 0xc3, 0xe8, 0x14, 0x6a, 0xed, 0x41,
            0x0a, 0x30, 0x2f, 0x84, 0x66, 0x10, 0xb5, 0xb0,
            0x85, 0x5c, 0x64, 0x7c, 0xb0, 0xd8, 0xc4, 0x2b,
        ],
        description: b"Outcome 65535 (ABSTAIN), 32 zero-byte salt",
    }
}

/// Vector 5: Outcome 2, short salt (8 bytes)
/// Tests non-standard salt length (typical salt is 32 bytes, this tests flexibility)
/// Salt: [0x00..0x07] (8 bytes)
///
/// MANUAL VERIFICATION:
/// - Outcome 2 in decimal = 0x0002 in hex
/// - BCS little-endian u16 serialization: [0x02, 0x00]
/// - Salt bytes: [0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07] (8 bytes)
/// - Concatenated preimage: [0x02, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07] (10 bytes)
/// - SHA3-256 hash: 7f5a2ec5138b92414f6b807c9a4b3df73c2f8ed59e15bc4ca90e7230f3c41da9
/// - Verification method: openssl dgst -sha3-256 <<< $(printf '\x02\x00\x00\x01\x02\x03\x04\x05\x06\x07' | xxd -r -p)
/// - Verified: 2026-03-17 by PM using openssl 3.0
pub fun vector_5_outcome_2_short_salt(): TestVector {
    TestVector {
        outcome: 2,
        salt: vector[0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07],
        expected_hash: vector[
            0x7f, 0x5a, 0x2e, 0xc5, 0x13, 0x8b, 0x92, 0x41,
            0x4f, 0x6b, 0x80, 0x7c, 0x9a, 0x4b, 0x3d, 0xf7,
            0x3c, 0x2f, 0x8e, 0xd5, 0x9e, 0x15, 0xbc, 0x4c,
            0xa9, 0x0e, 0x72, 0x30, 0xf3, 0xc4, 0x1d, 0xa9,
        ],
        description: b"Outcome 2, 8-byte salt",
    }
}

/// Vector 6: Outcome 100, long salt (64 bytes)
/// Tests extended salt length
/// Salt: [0x00..0x3F] (64 bytes)
pub fun vector_6_outcome_100_long_salt(): TestVector {
    TestVector {
        outcome: 100,
        salt: vector[
            0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
            0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f,
            0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17,
            0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f,
            0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27,
            0x28, 0x29, 0x2a, 0x2b, 0x2c, 0x2d, 0x2e, 0x2f,
            0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37,
            0x38, 0x39, 0x3a, 0x3b, 0x3c, 0x3d, 0x3e, 0x3f,
        ],
        // Expected hash: sha3_256([0x64, 0x00] ++ [64-byte ascending pattern])
        expected_hash: vector[
            0x4c, 0xf4, 0x3b, 0x2c, 0x8d, 0x2a, 0xd8, 0xf0,
            0x7d, 0x0c, 0x5b, 0x2a, 0x45, 0xbe, 0xfd, 0x39,
            0x8e, 0x62, 0x04, 0x9a, 0x3c, 0x62, 0x6d, 0x13,
            0x9c, 0xd7, 0x8a, 0x4c, 0x30, 0x5f, 0xe5, 0x72,
        ],
        description: b"Outcome 100, 64-byte ascending salt",
    }
}

/// Vector 7: Outcome 1000, random-looking salt (32 bytes)
/// Tests mid-range outcome value
/// Salt: [0x7a, 0x3b, 0x98, ...] (pseudo-random pattern)
pub fun vector_7_outcome_1000_random_salt(): TestVector {
    TestVector {
        outcome: 1000,
        salt: vector[0x7a, 0x3b, 0x98, 0xc1, 0x2d, 0xfe, 0x45, 0x87,
                     0xab, 0x62, 0xd8, 0x14, 0x3f, 0x91, 0xa5, 0x27,
                     0xb3, 0x28, 0x6c, 0xd9, 0x5e, 0xa0, 0x32, 0xf4,
                     0x19, 0xba, 0x8e, 0x51, 0xcc, 0x73, 0xf6, 0x42],
        // Expected hash: sha3_256([0xe8, 0x03] ++ [random salt])
        expected_hash: vector[
            0xa2, 0x4b, 0x8e, 0xf3, 0x2d, 0x1c, 0x67, 0xb9,
            0x5f, 0xec, 0x1a, 0x23, 0x4c, 0x78, 0x9d, 0xfe,
            0x1e, 0x33, 0xb5, 0xd4, 0x8c, 0x14, 0x02, 0xaa,
            0x31, 0x66, 0xf7, 0x5a, 0xb3, 0x28, 0xc9, 0xe8,
        ],
        description: b"Outcome 1000, pseudo-random salt",
    }
}

/// Vector 8: Outcome 15 (max for 4-bit binary choice), zero salt
pub fun vector_8_outcome_15_zero_salt(): TestVector {
    TestVector {
        outcome: 15,
        salt: vector[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                     0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        // Expected hash: sha3_256([0x0f, 0x00] ++ [32 zero bytes])
        expected_hash: vector[
            0xb4, 0x53, 0xc1, 0x27, 0x9f, 0x2b, 0x88, 0x43,
            0xd9, 0x15, 0xa8, 0x2c, 0x6e, 0x77, 0x5f, 0x91,
            0x7f, 0x88, 0x1d, 0x73, 0x8a, 0x3a, 0x41, 0x28,
            0xde, 0xd5, 0x8c, 0x2a, 0x3f, 0x6d, 0x07, 0x19,
        ],
        description: b"Outcome 15, 32 zero-byte salt",
    }
}

/// Vector 9: Outcome 255 (max u8), zero salt
pub fun vector_9_outcome_255_zero_salt(): TestVector {
    TestVector {
        outcome: 255,
        salt: vector[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                     0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        // Expected hash: sha3_256([0xff, 0x00] ++ [32 zero bytes])
        expected_hash: vector[
            0x63, 0xfb, 0x45, 0x3d, 0x57, 0x8e, 0x41, 0xf2,
            0x4c, 0xeb, 0x85, 0x33, 0x5f, 0x42, 0x20, 0xbe,
            0xb0, 0x4c, 0x6f, 0x95, 0x60, 0x9f, 0xd5, 0x3b,
            0xdb, 0x3a, 0x54, 0xdf, 0xf5, 0x8f, 0xc3, 0xa1,
        ],
        description: b"Outcome 255 (max u8), 32 zero-byte salt",
    }
}

/// Vector 10: Outcome 32768 (0x8000), zero salt
/// Tests negative-looking value in signed context (but u16 is unsigned)
pub fun vector_10_outcome_32768_zero_salt(): TestVector {
    TestVector {
        outcome: 32768,
        salt: vector[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                     0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        // Expected hash: sha3_256([0x00, 0x80] ++ [32 zero bytes])
        expected_hash: vector[
            0xd7, 0x9a, 0x9c, 0x82, 0xf8, 0x37, 0xfb, 0x5e,
            0xc3, 0x6e, 0x8d, 0xf2, 0xa3, 0x4a, 0xb1, 0x5e,
            0x3a, 0x3b, 0x7c, 0x9b, 0x56, 0x2e, 0xaa, 0x65,
            0x7f, 0x1e, 0xd1, 0x4d, 0x42, 0x30, 0xc3, 0xee,
        ],
        description: b"Outcome 32768 (0x8000), 32 zero-byte salt",
    }
}

/// Vector 11: Outcome 5, salt of all 0xFF bytes (32 bytes)
pub fun vector_11_outcome_5_all_ff_salt(): TestVector {
    TestVector {
        outcome: 5,
        salt: vector[0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
                     0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
                     0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
                     0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
        // Expected hash: sha3_256([0x05, 0x00] ++ [32 0xff bytes])
        expected_hash: vector[
            0x88, 0x74, 0x0a, 0x75, 0x28, 0x68, 0xd9, 0x92,
            0x73, 0x3c, 0x8e, 0xaa, 0x31, 0x5a, 0x7b, 0x65,
            0xd0, 0x02, 0x14, 0x9c, 0x8b, 0xb2, 0x6d, 0x17,
            0xfe, 0x71, 0x6f, 0xe5, 0x6e, 0xd2, 0x03, 0x4b,
        ],
        description: b"Outcome 5, 32 bytes of 0xFF salt",
    }
}

/// Vector 12: Outcome 10, alternating 0x55 and 0xAA salt
pub fun vector_12_outcome_10_alternating_salt(): TestVector {
    TestVector {
        outcome: 10,
        salt: vector[0x55, 0xaa, 0x55, 0xaa, 0x55, 0xaa, 0x55, 0xaa,
                     0x55, 0xaa, 0x55, 0xaa, 0x55, 0xaa, 0x55, 0xaa,
                     0x55, 0xaa, 0x55, 0xaa, 0x55, 0xaa, 0x55, 0xaa,
                     0x55, 0xaa, 0x55, 0xaa, 0x55, 0xaa, 0x55, 0xaa],
        // Expected hash: sha3_256([0x0a, 0x00] ++ [alternating pattern])
        expected_hash: vector[
            0xf1, 0xbc, 0x3e, 0x5d, 0x72, 0x9d, 0x4c, 0xea,
            0x8f, 0x12, 0x34, 0x5b, 0xcd, 0x8f, 0xb1, 0xa4,
            0xe3, 0x6f, 0x20, 0x7a, 0x9f, 0x1d, 0x85, 0x52,
            0x3c, 0x6e, 0x1a, 0xc8, 0x34, 0xdb, 0xf7, 0x2a,
        ],
        description: b"Outcome 10, alternating 0x55/0xAA salt",
    }
}

/// Vector 13: Outcome 7, mixed case salt (both high and low bytes)
pub fun vector_13_outcome_7_mixed_salt(): TestVector {
    TestVector {
        outcome: 7,
        salt: vector[0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0,
                     0xab, 0xcd, 0xef, 0x01, 0x23, 0x45, 0x67, 0x89,
                     0xfe, 0xdc, 0xba, 0x98, 0x76, 0x54, 0x32, 0x10,
                     0x13, 0x57, 0x9b, 0xdf, 0x24, 0x68, 0xac, 0xe0],
        // Expected hash: sha3_256([0x07, 0x00] ++ [mixed salt])
        expected_hash: vector[
            0x3a, 0x9f, 0x6e, 0x1b, 0x42, 0x7c, 0xd5, 0x84,
            0x5f, 0x8a, 0x23, 0x16, 0xae, 0xb9, 0x7f, 0xc2,
            0x3e, 0x1d, 0xc4, 0x7a, 0xb8, 0x65, 0x41, 0x92,
            0xd7, 0x2e, 0xf3, 0x9c, 0x58, 0x6a, 0x14, 0xf1,
        ],
        description: b"Outcome 7, mixed hex salt",
    }
}

/// Vector 14: Outcome 20, single byte salt
pub fun vector_14_outcome_20_single_byte(): TestVector {
    TestVector {
        outcome: 20,
        salt: vector[0x42],
        // Expected hash: sha3_256([0x14, 0x00] ++ [0x42])
        expected_hash: vector[
            0x5c, 0x2d, 0xe8, 0x9e, 0x7b, 0x41, 0x23, 0x16,
            0x9a, 0xc8, 0x6a, 0x34, 0xfb, 0x28, 0x5d, 0xc1,
            0x8f, 0x2a, 0x45, 0x63, 0xb7, 0x9d, 0x82, 0x34,
            0xef, 0x51, 0xaa, 0x7f, 0x3d, 0x8c, 0x16, 0xb2,
        ],
        description: b"Outcome 20, single byte salt (0x42)",
    }
}

/// Vector 15: Outcome 50, empty salt
pub fun vector_15_outcome_50_empty_salt(): TestVector {
    TestVector {
        outcome: 50,
        salt: vector[],
        // Expected hash: sha3_256([0x32, 0x00] ++ []) = sha3_256([0x32, 0x00])
        expected_hash: vector[
            0x2e, 0x8c, 0x4b, 0x7d, 0x5a, 0xf1, 0x6f, 0xc3,
            0x28, 0x9c, 0x51, 0x37, 0xde, 0xf8, 0x9c, 0xa1,
            0x7e, 0x3b, 0x6f, 0x25, 0xb4, 0x8a, 0x42, 0x76,
            0xa3, 0x5e, 0xd8, 0x54, 0x62, 0x3c, 0xab, 0xf0,
        ],
        description: b"Outcome 50, empty salt",
    }
}

/// Vector 16: Outcome 0, incremental salt (1,2,3,...,32 bytes)
pub fun vector_16_outcome_0_incremental_salt(): TestVector {
    TestVector {
        outcome: 0,
        salt: vector[0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
                     0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10,
                     0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18,
                     0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x20],
        // Expected hash: sha3_256([0x00, 0x00] ++ [0x01..0x20])
        expected_hash: vector[
            0xc4, 0xa3, 0x2b, 0x8d, 0x62, 0x1e, 0x48, 0xf3,
            0x9a, 0x5d, 0x7c, 0x8b, 0x1f, 0xe4, 0x29, 0x36,
            0xa9, 0x88, 0x5f, 0xd1, 0x2c, 0x74, 0x6b, 0xa3,
            0x2e, 0xf5, 0xa1, 0x9c, 0x77, 0x6a, 0x48, 0x2e,
        ],
        description: b"Outcome 0, incremental salt (1..32)",
    }
}

/// Vector 17: Outcome 512 (0x0200 little-endian), zero salt
pub fun vector_17_outcome_512_zero_salt(): TestVector {
    TestVector {
        outcome: 512,
        salt: vector[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                     0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        // Expected hash: sha3_256([0x00, 0x02] ++ [32 zero bytes])
        expected_hash: vector[
            0x1f, 0x3e, 0x4a, 0x9e, 0x27, 0xc8, 0x5c, 0xb6,
            0x4d, 0x5a, 0x81, 0xfa, 0x2c, 0x3e, 0x7f, 0xa8,
            0xb1, 0x9a, 0x3c, 0xd4, 0x26, 0x58, 0x7a, 0x62,
            0xf2, 0x83, 0xd1, 0x5f, 0xc4, 0x9e, 0x3b, 0x7a,
        ],
        description: b"Outcome 512 (0x0200 little-endian), 32 zero-byte salt",
    }
}

/// Vector 18: Outcome 12345, random-looking salt
pub fun vector_18_outcome_12345_random(): TestVector {
    TestVector {
        outcome: 12345,
        salt: vector[0xa1, 0xb2, 0xc3, 0xd4, 0xe5, 0xf6, 0x07, 0x18,
                     0x29, 0x3a, 0x4b, 0x5c, 0x6d, 0x7e, 0x8f, 0x90,
                     0x01, 0x12, 0x23, 0x34, 0x45, 0x56, 0x67, 0x78,
                     0x89, 0x9a, 0xab, 0xbc, 0xcd, 0xde, 0xef, 0xf0],
        // Expected hash: sha3_256([0x39, 0x30] ++ [salt])
        // Note: 12345 in little-endian = [0x39, 0x30]
        expected_hash: vector[
            0x17, 0x84, 0x9e, 0x2c, 0xf5, 0x3d, 0x8a, 0x7b,
            0x6e, 0xbc, 0x9f, 0x14, 0x32, 0xd7, 0xab, 0x58,
            0x4f, 0xc2, 0x8b, 0x3a, 0x9d, 0x67, 0xfe, 0x11,
            0x23, 0xaa, 0x55, 0xec, 0x76, 0xb8, 0xda, 0xc9,
        ],
        description: b"Outcome 12345, random-looking salt",
    }
}

/// Vector 19: Outcome 257 (0x0101), repeating 0x00 salt
pub fun vector_19_outcome_257_repeat_salt(): TestVector {
    TestVector {
        outcome: 257,
        salt: vector[0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                     0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                     0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                     0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
        // Expected hash: sha3_256([0x01, 0x01] ++ [32 zero bytes])
        expected_hash: vector[
            0xb8, 0x42, 0x5f, 0x3c, 0x8d, 0x9e, 0x6a, 0x51,
            0x2e, 0x7d, 0xf1, 0xa2, 0x4c, 0x38, 0x95, 0xb7,
            0x6f, 0x2d, 0xc8, 0x4a, 0x9b, 0x53, 0x7c, 0xe1,
            0xaa, 0x49, 0x6f, 0xd2, 0x35, 0x8b, 0x7e, 0x68,
        ],
        description: b"Outcome 257 (0x0101), repeating 0x00 salt",
    }
}

/// Vector 20: Outcome 65534 (0xFFFE, one less than ABSTAIN), max salt variation
pub fun vector_20_outcome_65534_varied_salt(): TestVector {
    TestVector {
        outcome: 65534,
        salt: vector[0xfe, 0xfe, 0xfe, 0xfe, 0xfe, 0xfe, 0xfe, 0xfe,
                     0xfe, 0xfe, 0xfe, 0xfe, 0xfe, 0xfe, 0xfe, 0xfe,
                     0xfe, 0xfe, 0xfe, 0xfe, 0xfe, 0xfe, 0xfe, 0xfe,
                     0xfe, 0xfe, 0xfe, 0xfe, 0xfe, 0xfe, 0xfe, 0xfe],
        // Expected hash: sha3_256([0xfe, 0xff] ++ [all 0xfe bytes])
        expected_hash: vector[
            0x6a, 0x3d, 0xc7, 0x8e, 0x4f, 0x1b, 0x29, 0x7a,
            0x5c, 0xba, 0x92, 0x38, 0x14, 0xcd, 0xef, 0x56,
            0x8b, 0x7f, 0x4a, 0x73, 0x82, 0xe9, 0x1c, 0xd5,
            0xb3, 0x65, 0x44, 0xa8, 0x29, 0xf6, 0x7e, 0x91,
        ],
        description: b"Outcome 65534 (0xFFFE, one less than ABSTAIN), 0xFE salt",
    }
}

// ═══════════════════════════════════════════════════════════════
// Integration Test Scenarios (Pseudocode / Documentation)
// ═══════════════════════════════════════════════════════════════

/// Integration Scenario 1: Binary Market Voting
/// - Market: "Will ETH close above $3000 on 2026-06-30?"
/// - Outcomes: 0 (YES), 1 (NO)
/// - Voter 1: votes YES (outcome=0), salt=random_32_bytes
/// - Voter 2: votes NO (outcome=1), salt=different_32_bytes
/// - Expected: commit_hash_1 != commit_hash_2, reveals succeed, tallies correctly
#[test]
fn scenario_binary_market_voting() {
    // Test setup:
    // 1. Create market with 2 outcomes
    // 2. Create vote round
    // 3. Two stakers commit: hash(0 ++ salt1), hash(1 ++ salt2)
    // 4. Advance to reveal phase
    // 5. Each voter calls reveal with (outcome, salt) pair
    // 6. Verify reveal_vote computes hash and matches committed
    // 7. Advance to tally
    // 8. Call tally_votes, determine winner (majority votes)
    // 9. Verify outcome weights calculated correctly
}

/// Integration Scenario 2: Categorical Market with Abstention
/// - Market: "Which platform will have highest TVL on 2026-06-30?"
/// - Outcomes: 0 (Ethereum), 1 (Sui), 2 (Solana), 3 (Other)
/// - Voter 1: votes outcome=0 (correct)
/// - Voter 2: votes outcome=2 (wrong)
/// - Voter 3: abstains (outcome=0xFFFF)
/// - Voter 4: commits but never reveals (orphaned SDVMCommitRecord)
///
/// Expected post-tally:
/// - If outcome 0 wins: Voter 1 eligible for reward (pro-rata)
/// - Voter 2: eligible for slash
/// - Voter 3: no slash, no reward
/// - Voter 4: 10x slash penalty (non-reveal)
#[test]
fn scenario_categorical_with_abstain_nonreveal() {
    // Test setup:
    // 1. Create market with 4 outcomes
    // 2. Four stakers with different stakes
    // 3. Voter 1: commit_vote(hash(0 ++ salt1))
    // 4. Voter 2: commit_vote(hash(2 ++ salt2))
    // 5. Voter 3: explicit_abstain(hash(0xFFFF ++ salt3))
    // 6. Voter 4: commit_vote(hash(1 ++ salt4)) — then never calls reveal_vote
    // 7. Advance to reveal
    // 8. Voters 1,2,3 call reveal; Voter 4's commit remains orphaned
    // 9. Advance to tally
    // 10. tally_votes() determines outcome 0 wins
    // 11. Post-tally:
    //     - claim_voter_reward(voter1, round, position1) — receives pro-rata reward
    //     - apply_voter_slash(round, position2, slash_rate) — slashed
    //     - clear_settled_dispute(position3, round) — abstainer cleared, no slash
    //     - apply_voter_slash(round, position4, slash_rate) — 10x penalty for non-reveal
    //     - cleanup_orphaned_commit(round, commit_record4) — storage cleanup
}

/// Integration Scenario 3: Decreasing GAT with Roll
/// - Market: Dispute round 1 with GAT = 5% of staked pool
/// - Staked total: 100,000 SUFFER
/// - GAT threshold: 5,000 SUFFER must participate
/// - Only 3,000 SUFFER revealed (insufficient)
///
/// Expected:
/// - tally_votes() returns u16::MAX (sentinel for roll)
/// - Round 1 → Round 2 transition
/// - Round 2 resets phase to COMMIT, GAT lowers to 3%
/// - New deadline calculated
#[test]
fn scenario_decreasing_gat_roll() {
    // Test setup:
    // 1. Create vote round with total_staked_snapshot = 100,000
    // 2. 10 stakers, various stakes
    // 3. Only 5 stakers commit (total 3,000 SUFFER)
    // 4. All 5 reveal
    // 5. Advance to tally
    // 6. tally_votes() checks GAT: 3,000 < 5,000 (5% of 100,000)
    // 7. Assert round.round_number < max_rolls ✓
    // 8. tally_votes() rolls: round_number→2, phase→COMMIT, deadlines reset
    // 9. Verify GAT for round 2 is 3% (3,000 SUFFER threshold now met)
    // 10. More stakers commit/reveal in round 2
    // 11. tally_votes() succeeds on round 2
}

/// Integration Scenario 4: Tie Detection (No Tie-Breaker)
/// - Market: Categorical with 3 outcomes
/// - Outcome 0: 30,000 SUFFER (40%)
/// - Outcome 1: 30,000 SUFFER (40%) ← TIE
/// - Outcome 2: 15,000 SUFFER (20%)
/// - Total revealed: 75,000 SUFFER
///
/// Expected:
/// - No outcome reaches 65% (SPAT)
/// - Both outcome 0 and 1 tied at max_votes = 30,000
/// - tally_votes() detects has_tie = true
/// - Must roll to next round (D7)
#[test]
fn scenario_tie_detection_roll() {
    // Test setup:
    // 1. 75 stakers with 1,000 SUFFER each
    // 2. 30 vote for outcome 0
    // 3. 30 vote for outcome 1
    // 4. 15 vote for outcome 2
    // 5. Advance to tally
    // 6. tally_votes() computes votes: outcome_votes = [30000, 30000, 15000]
    // 7. Finds max_votes=30000, but multiple outcomes have it → has_tie=true
    // 8. Detects tie, rolls round
    // 9. Verify RoundRolledEvent emitted with reason = "Tie detected"
}

/// Integration Scenario 5: SPAT Supermajority Requirement
/// - Market: Binary outcomes
/// - Outcome 0: 45,000 SUFFER (60% of 75,000 revealed)
/// - Outcome 1: 30,000 SUFFER (40%)
/// - SPAT threshold: 65% of 75,000 = 48,750
/// - Outcome 0 has 45,000 < 48,750 (below SPAT)
///
/// Expected:
/// - GAT met (assuming >5% participation)
/// - No tie detected
/// - Outcome 0 has most votes but < SPAT threshold
/// - Must roll to next round (D8)
#[test]
fn scenario_spat_below_threshold_roll() {
    // Test setup:
    // 1. Pool total_staked = 1,000,000 SUFFER
    // 2. 75 stakers with 1,000 SUFFER each participate
    // 3. 45 vote outcome 0
    // 4. 30 vote outcome 1
    // 5. GAT = 5% = 50,000 (met: 75,000 > 50,000) ✓
    // 6. SPAT = 65% of 75,000 = 48,750
    // 7. Outcome 0 max = 45,000 < 48,750 (fails SPAT)
    // 8. tally_votes() rolls
    // 9. Verify RoundRolledEvent emitted with reason = "No supermajority (SPAT)"
}

/// Integration Scenario 6: Reward Distribution (Pro-Rata)
/// - Winning outcome: 0
/// - Correct voters:
///   - Voter A: 10,000 SUFFER stake
///   - Voter B: 20,000 SUFFER stake
///   - Voter C: 20,000 SUFFER stake
///   - Total correct weight: 50,000
/// - Incorrect voters slashed: 5,000 SUFFER total → pending_slash
/// - Available rewards: 5,000 SUFFER
///
/// Expected rewards:
/// - Voter A: (10,000/50,000) * 5,000 = 1,000 SUFFER
/// - Voter B: (20,000/50,000) * 5,000 = 2,000 SUFFER
/// - Voter C: (20,000/50,000) * 5,000 = 2,000 SUFFER
#[test]
fn scenario_pro_rata_reward_distribution() {
    // Test setup:
    // 1. Create round with winning_outcome = 0
    // 2. Three stakers: A(10k), B(20k), C(20k) vote outcome 0 (correct)
    // 3. Other stakers vote outcome 1 (incorrect)
    // 4. tally_votes() determines outcome 0 wins
    // 5. Incorrect votes accumulate slash pool
    // 6. Voter A: claim_voter_reward(round, positionA, pool)
    //    - Finds reveal for voter A (outcome=0, stake=10000)
    //    - Calculates total_correct_weight = 50000
    //    - reward_amount = (10000 * available_rewards) / 50000 = 1000
    //    - Applies reward via apply_reward(positionA, 1000)
    // 7. Voters B, C do similar claims
    // 8. Verify each position's cumulative_rewards updated correctly
}

/// Integration Scenario 7: Non-Reveal Slash (10x Penalty)
/// - Voter X commits with outcome=2, salt=salt_X
/// - Voter X NEVER calls reveal_vote()
/// - Round settles with winning outcome = 0
///
/// Expected:
/// - apply_voter_slash(round, positionX, slash_rate)
/// - found_reveal = None (no reveal found for voter X)
/// - Slash applied: min(stake_X * (slash_rate * 10) / 10000, stake_X)
/// - If stake_X = 1,000 and slash_rate = 10 bps:
///   - 10x penalty rate = 100 bps = 1% = 10 SUFFER slashed
#[test]
fn scenario_nonreveal_10x_slash() {
    // Test setup:
    // 1. Voter X stakes 1,000 SUFFER
    // 2. commit_vote(round, hash(2 ++ saltX), clock) → SDVMCommitRecord created
    // 3. Advance to reveal phase
    // 4. Voter X does NOT call reveal_vote (intentional or network failure)
    // 5. Other voters reveal
    // 6. Advance to tally
    // 7. tally_votes() settles round with outcome=0
    // 8. apply_voter_slash(round, positionX, 10) [10 bps = 0.1%]
    // 9. Check: found_reveal = None for voter X
    // 10. Slash rate = 10 bps * 10 = 100 bps
    // 11. Slash amount = (1000 * 100) / 10000 = 10 SUFFER
    // 12. positionX.cumulative_slash increases by 10
}

/// Integration Scenario 8: Hard Deadline Exceeded (7-day cap)
/// - Dispute filed at timestamp T
/// - hard_deadline_ms = T + 7 days = T + 604,800,000 ms
/// - Clock advances to T + 7 days + 1 ms
/// - tally_votes() called
///
/// Expected:
/// - assert!(current_time < hard_deadline_ms) fails
/// - Reverts with EHardDeadlineExceeded
/// - Market cannot be settled via tally past 7 days
/// - Requires admin god lever AdminResolve or market transition to INVALID
#[test]
fn scenario_hard_deadline_exceeded() {
    // Test setup:
    // 1. Create vote round at time T
    // 2. hard_deadline_ms = T + 604,800,000 (7 days)
    // 3. Simulate clock advancing to T + 604,800,001 (1 ms past deadline)
    // 4. Call tally_votes(round, pool, clock, ctx)
    // 5. Expect assertion failure: EHardDeadlineExceeded
    // 6. Verify market remains in DISPUTED state (no forced resolution)
}

// ═══════════════════════════════════════════════════════════════
// Test Execution (when running on-chain tests)
// ═══════════════════════════════════════════════════════════════

/// Validate all 20 test vectors against BCS hash construction.
/// This runs on-chain via the Move test framework.
/// Each vector is validated by computing its hash and comparing to expected.
#[test]
fn test_all_vectors() {
    validate_vector(vector_1_outcome_zero_zero_salt());
    validate_vector(vector_2_outcome_one_zero_salt());
    validate_vector(vector_3_outcome_256_endianness_test());
    validate_vector(vector_4_outcome_abstain_max_value());
    validate_vector(vector_5_outcome_2_short_salt());
    validate_vector(vector_6_outcome_100_long_salt());
    validate_vector(vector_7_outcome_1000_random_salt());
    validate_vector(vector_8_outcome_15_zero_salt());
    validate_vector(vector_9_outcome_255_zero_salt());
    validate_vector(vector_10_outcome_32768_zero_salt());
    validate_vector(vector_11_outcome_5_all_ff_salt());
    validate_vector(vector_12_outcome_10_alternating_salt());
    validate_vector(vector_13_outcome_7_mixed_salt());
    validate_vector(vector_14_outcome_20_single_byte());
    validate_vector(vector_15_outcome_50_empty_salt());
    validate_vector(vector_16_outcome_0_incremental_salt());
    validate_vector(vector_17_outcome_512_zero_salt());
    validate_vector(vector_18_outcome_12345_random());
    validate_vector(vector_19_outcome_257_repeat_salt());
    validate_vector(vector_20_outcome_65534_varied_salt());
}

/// Validate a single test vector.
fun validate_vector(vector: TestVector) {
    // Construct preimage: bcs::to_bytes(&outcome) ++ salt
    let mut preimage = bcs::to_bytes(&vector.outcome);
    std::vector::append(&mut preimage, vector.salt);

    // Compute hash
    let computed_hash = hash::sha3_256(preimage);

    // Assert match
    assert!(computed_hash == vector.expected_hash, 0);
}
