/**
 * Rate limiter unit tests.
 *
 * @module rate-limiter.test
 */

import { RateLimiter, extractDisputeRoundId } from "./rate-limiter.js";

/**
 * Test: Basic dispute rate limiting.
 */
export function testDisputeRateLimit(): void {
  const limiter = new RateLimiter({ disputeRateLimit: 3, windowMs: 1000 });

  const disputeId = "0x1234";
  const sender = "0x5678";

  // First 3 calls should succeed
  console.assert(limiter.checkRateLimit(disputeId, sender) === true, "Call 1 should pass");
  limiter.recordRequest(disputeId, sender);

  console.assert(limiter.checkRateLimit(disputeId, sender) === true, "Call 2 should pass");
  limiter.recordRequest(disputeId, sender);

  console.assert(limiter.checkRateLimit(disputeId, sender) === true, "Call 3 should pass");
  limiter.recordRequest(disputeId, sender);

  // 4th call should fail (dispute limit exceeded)
  console.assert(
    limiter.checkRateLimit(disputeId, sender) === false,
    "Call 4 should fail (dispute limit)"
  );

  // But the same sender can still call other disputes
  const disputeId2 = "0xabcd";
  console.assert(
    limiter.checkRateLimit(disputeId2, sender) === true,
    "Different dispute should pass"
  );

  console.log("✓ testDisputeRateLimit passed");
}

/**
 * Test: Per-sender rate limiting.
 */
export function testSenderRateLimit(): void {
  const limiter = new RateLimiter({ senderRateLimit: 2, windowMs: 1000 });

  const sender = "0x5678";
  const dispute1 = "0x1111";
  const dispute2 = "0x2222";

  // First 2 calls from sender should succeed
  console.assert(
    limiter.checkRateLimit(dispute1, sender) === true,
    "Sender call 1 should pass"
  );
  limiter.recordRequest(dispute1, sender);

  console.assert(
    limiter.checkRateLimit(dispute2, sender) === true,
    "Sender call 2 should pass"
  );
  limiter.recordRequest(dispute2, sender);

  // 3rd call from same sender should fail (sender limit)
  const dispute3 = "0x3333";
  console.assert(
    limiter.checkRateLimit(dispute3, sender) === false,
    "Sender call 3 should fail (sender limit)"
  );

  // But other senders should still be able to call
  const otherSender = "0xabcd";
  console.assert(
    limiter.checkRateLimit(dispute1, otherSender) === true,
    "Different sender should pass"
  );

  console.log("✓ testSenderRateLimit passed");
}

/**
 * Test: Window expiration and reset.
 */
export function testWindowExpiration(): void {
  const limiter = new RateLimiter({ disputeRateLimit: 1, senderRateLimit: 1, windowMs: 50 });

  const disputeId = "0x1234";
  const sender = "0x5678";

  // First call succeeds
  console.assert(limiter.checkRateLimit(disputeId, sender) === true, "First call should pass");
  limiter.recordRequest(disputeId, sender);

  // Second call fails (limit reached)
  console.assert(
    limiter.checkRateLimit(disputeId, sender) === false,
    "Second call should fail (limit)"
  );

  // Wait for window to expire
  setTimeout(() => {
    // After window expires, new call should succeed (new window)
    console.assert(
      limiter.checkRateLimit(disputeId, sender) === true,
      "Call after window expiry should pass"
    );

    console.log("✓ testWindowExpiration passed");
  }, 60);
}

/**
 * Test: Independent limits (both must be checked).
 */
export function testIndependentLimits(): void {
  const limiter = new RateLimiter({
    disputeRateLimit: 10,
    senderRateLimit: 2,
    windowMs: 1000,
  });

  const sender = "0xsender";
  const disputes = ["0xd1", "0xd2", "0xd3"];

  // Can make 2 calls from sender across different disputes
  for (let i = 0; i < 2; i++) {
    const disputeId = disputes[i];
    console.assert(
      limiter.checkRateLimit(disputeId, sender) === true,
      `Sender call ${i + 1} should pass`
    );
    limiter.recordRequest(disputeId, sender);
  }

  // 3rd call should fail even though disputes[2] hasn't hit its limit
  console.assert(
    limiter.checkRateLimit(disputes[2], sender) === false,
    "Sender call 3 should fail (sender limit)"
  );

  console.log("✓ testIndependentLimits passed");
}

/**
 * Test: Cleanup removes expired buckets.
 */
export function testCleanup(): void {
  const limiter = new RateLimiter({ windowMs: 50 });

  const dispute = "0x1234";
  const sender1 = "0x5678";
  const sender2 = "0x9999";

  // Create some buckets
  limiter.recordRequest(dispute, sender1);
  limiter.recordRequest(dispute, sender2);

  let stats = limiter.getStats();
  console.assert(stats.activeDisputeBuckets >= 1, "Should have active dispute bucket");

  // Wait for window to expire
  setTimeout(() => {
    limiter.cleanup();

    stats = limiter.getStats();
    console.assert(
      stats.activeDisputeBuckets === 0,
      "Expired dispute buckets should be cleaned"
    );

    console.log("✓ testCleanup passed");
  }, 60);
}

/**
 * Test: extractDisputeRoundId extracts from transaction data.
 */
export function testExtractDisputeRoundId(): void {
  const pmPackageId = "0x1234";
  const disputeRoundId = "0xabcd5678";

  // Mock transaction with commit_vote call
  const txData = {
    commands: [
      {
        $kind: "MoveCall",
        MoveCall: {
          package: pmPackageId,
          module: "pm_sdvm",
          function: "commit_vote",
          target: `${pmPackageId}::pm_sdvm::commit_vote`,
          arguments: [
            { Object: disputeRoundId }, // First arg: vote_round object
            { Pure: "salt_bytes" }, // Second arg: salt
          ],
        },
      },
    ],
  };

  const extracted = extractDisputeRoundId(txData, pmPackageId);
  console.assert(extracted === disputeRoundId, `Should extract ${disputeRoundId}, got ${extracted}`);

  console.log("✓ testExtractDisputeRoundId passed");
}

/**
 * Run all tests.
 */
export function runAllTests(): void {
  console.log("[rate-limiter.test] Running unit tests...\n");

  testDisputeRateLimit();
  testSenderRateLimit();
  testIndependentLimits();
  testExtractDisputeRoundId();

  // Async tests (use setTimeout)
  testWindowExpiration();
  testCleanup();

  console.log("\n[rate-limiter.test] Tests completed");
}

// Run if invoked directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests();
}
